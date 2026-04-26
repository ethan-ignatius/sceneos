"""Conversation → Gemini-shaped messages, plus Gemini config builder.

The canonical SceneOS conversation shape uses 'agent'/'user' role tags;
this module converts that into Gemini's 'model'/'user' contents. Also
builds the GenerateContentConfig (mode-aware tool restriction +
temperature + thinking budget).
"""
from __future__ import annotations

from typing import Any

from ._constants import (
    THINKING_BUDGET_DEMO,
    THINKING_BUDGET_NORMAL,
    max_questions_for_manifest,
)
from .context import _mode_of
from .prompt import _system_prompt
from .tools import _AGENT_TOOLS


def _to_gemini_contents(conversation: list[dict], opening_master_prompt: str) -> list[dict]:
    """SceneOS-style 'agent'/'user' turns → Gemini 'model'/'user' contents."""
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


def _build_request_config(
    beat: dict,
    manifest: dict,
    with_thinking: bool,
    user_turn_count: int = 0,
):
    """Build (system_prompt, GenerateContentConfig). Tier-aware:
    once the user has answered `max_questions_for_manifest(manifest)`
    times for this beat, we restrict the tool surface to markSufficient
    ONLY — a hard ceiling that scales with the chosen video tier
    (trailer=2, short film=3, movie=5). Demo mode keeps its smaller
    thinking budget regardless."""
    from google.genai import types

    system = _system_prompt(beat, manifest)
    mode = _mode_of(manifest)
    cap = max_questions_for_manifest(manifest)
    must_finalize = user_turn_count >= cap
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
