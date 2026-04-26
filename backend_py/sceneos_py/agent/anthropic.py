"""Anthropic Claude fallback path.

Used when the Gemini call fails (quota, MALFORMED_FUNCTION_CALL,
network) or returns no candidates. Haiku is fast + reliable for the
short questionnaire turn. Wrapped in `with_reliability` so the fallback
itself has retry semantics — if Anthropic is also having a bad minute
we fail loudly to the caller instead of looping.
"""
from __future__ import annotations

import asyncio
from typing import Any

from ..anthropic_client import make_claude_client
from ..config import env
from ..retry import with_reliability
from .messages import _to_anthropic_messages
from .normalizer import _normalize_args, _normalize_call_to_result
from .prompt import _system_prompt
from .repair import _repair_question_if_redundant
from .tools import _ANTHROPIC_AGENT_TOOLS


def _claude_agent_model() -> str:
    return env("ANTHROPIC_AGENT_MODEL", "claude-3-5-haiku-latest") or "claude-3-5-haiku-latest"


async def _run_anthropic_agent_turn(
    *,
    beat: dict,
    manifest: dict,
    conversation: list[dict],
) -> dict:
    client = make_claude_client()
    if client is None:
        raise RuntimeError("Anthropic fallback unavailable: ANTHROPIC_API_KEY is not configured.")

    system = _system_prompt(beat, manifest)
    messages = _to_anthropic_messages(conversation, manifest["masterPrompt"])

    def _call_sync() -> Any:
        return client.messages.create(
            model=_claude_agent_model(),
            max_tokens=768,
            temperature=0.65,
            system=system,
            tools=_ANTHROPIC_AGENT_TOOLS,
            tool_choice={"type": "any"},
            messages=messages,
        )

    response = await with_reliability(
        "anthropic.agent",
        lambda: asyncio.to_thread(_call_sync),
        timeout_seconds=30.0,
        max_attempts=2,
        base_backoff=1.0,
        breaker_name="anthropic.agent",
    )
    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError(
            f"Anthropic fallback did not call a tool (stop_reason={getattr(response, 'stop_reason', '?')})"
        )
    return _repair_question_if_redundant(
        _normalize_call_to_result(tool_use.name, _normalize_args(tool_use.input), beat),
        beat,
        conversation,
    )
