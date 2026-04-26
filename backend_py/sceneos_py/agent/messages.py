"""Conversation → SDK-shaped messages, plus Gemini config builder.

Anthropic-style 'agent'/'user' turns are the canonical SceneOS shape.
This module converts that into Gemini's 'model'/'user' contents and
Anthropic's messages format. Also builds the GenerateContentConfig for
the Gemini path (mode-aware tool restriction + temperature + thinking).
"""
from __future__ import annotations

from typing import Any

from ._constants import (
    DEMO_MAX_QUESTIONS,
    THINKING_BUDGET_DEMO,
    THINKING_BUDGET_NORMAL,
)
from .context import _mode_of
from .prompt import _system_prompt
from .tools import _AGENT_TOOLS


def _to_gemini_contents(conversation: list[dict], opening_master_prompt: str) -> list[dict]:
    """Anthropic-style 'agent'/'user' turns → Gemini 'model'/'user' contents."""
    if not conversation:
        return [
            {
                "role": "user",
                "parts": [{
                    "text": (
                        f"My idea: {opening_master_prompt}. "
                        f"Ask me your first question about this part of the story."
                    )
                }],
            }
        ]
    contents: list[dict] = []
    for t in conversation:
        role = "model" if t.get("role") == "agent" else "user"
        text = t.get("content", "") or ""
        contents.append({"role": role, "parts": [{"text": text}]})
    return contents


def _to_anthropic_messages(conversation: list[dict], opening_master_prompt: str) -> list[dict]:
    if not conversation:
        return [
            {
                "role": "user",
                "content": (
                    f"My idea: {opening_master_prompt}. "
                    "Ask me your first question about this part of the story."
                ),
            }
        ]
    messages: list[dict] = []
    for turn in conversation:
        role = "assistant" if turn.get("role") == "agent" else "user"
        text = str(turn.get("content", "") or "").strip()
        if text:
            messages.append({"role": role, "content": text})
    return messages or _to_anthropic_messages([], opening_master_prompt)


def _build_request_config(
    beat: dict,
    manifest: dict,
    with_thinking: bool,
    user_turn_count: int = 0,
):
    """Build (system_prompt, GenerateContentConfig). Mode-aware:
    demo uses a smaller thinking budget for faster turn-around. In demo
    mode, once the user has answered DEMO_MAX_QUESTIONS times we restrict
    the tool surface to markSufficient ONLY — a hard ceiling that protects
    the demo timer even if the model wants to keep asking."""
    from google.genai import types

    system = _system_prompt(beat, manifest)
    mode = _mode_of(manifest)
    must_finalize = mode == "demo" and user_turn_count >= DEMO_MAX_QUESTIONS
    allowed = ["markSufficient"] if must_finalize else ["askQuestion", "markSufficient"]

    # Normal mode runs hotter so the question pool genuinely varies
    # across sessions — the user explicitly does not want a deterministic
    # script. Demo mode is colder because the timer matters more than
    # variety on stage.
    temperature = 0.6 if mode == "demo" else 0.85
    config_kwargs: dict[str, Any] = dict(
        system_instruction=system,
        tools=[types.Tool(function_declarations=_AGENT_TOOLS)],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.ANY,
                allowed_function_names=allowed,
            )
        ),
        temperature=temperature,
        max_output_tokens=768 if mode == "demo" else 1024,
    )
    if with_thinking:
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            include_thoughts=True,
            thinking_budget=THINKING_BUDGET_DEMO if mode == "demo" else THINKING_BUDGET_NORMAL,
        )
    return system, types.GenerateContentConfig(**config_kwargs)
