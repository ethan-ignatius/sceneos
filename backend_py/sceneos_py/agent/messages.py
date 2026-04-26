"""Conversation → Gemini-shaped messages, plus Gemini config builder.

The canonical SceneOS conversation shape uses 'agent'/'user' role tags;
this module converts that into Gemini's 'model'/'user' contents. Also
builds the GenerateContentConfig (mode-aware tool restriction +
temperature + thinking budget).

Cross-beat continuity is duplicated into the user channel on the seed
turn (no conversation yet) because Gemini 2.5 weights `system_instruction`
much less than user content for in-context recall — even a rich prior
beats block in the system prompt gets ignored when the user message is
the generic "ask me your first question" seed. Putting a compact recap
+ exact instruction "use these details, do not start fresh" in the user
turn fixes the amnesia symptom at the source.
"""
from __future__ import annotations

from typing import Any

from ..continuity import memory_scene
from ._constants import (
    THINKING_BUDGET_DEMO,
    THINKING_BUDGET_NORMAL,
    max_questions_for_manifest,
)
from .context import _mode_of
from .prompt import _system_prompt
from .tools import _AGENT_TOOLS


def _prior_beats_recap(beat: dict, manifest: dict) -> str:
    """Compact recap of every prior beat, suitable for embedding in the
    user message channel. Different from `_earlier_beats_block` (which
    targets the system instruction): this is shorter, conversational,
    and uses the agent/user voice so it reads as natural context rather
    than instructions."""
    beats = manifest.get("beats") or []
    idx = next((i for i, b in enumerate(beats) if b.get("beatId") == beat.get("beatId")), 0)
    if idx == 0:
        return ""

    lines: list[str] = []
    for i, b in enumerate(beats[:idx]):
        scene = memory_scene(b)
        if not scene:
            continue
        facts = scene.get("beatFacts") or {}
        summary = scene.get("sceneSummary") or scene.get("refinedPrompt") or ""
        bits: list[str] = []
        for k in ("subject", "characterDescription", "setting", "locationDescription", "action", "voiceLine"):
            v = (facts.get(k) or "").strip() if isinstance(facts.get(k), str) else ""
            if v:
                bits.append(f"{k}: {v}")
        # Pull the user's last 2 verbatim turns so the agent re-uses
        # phrases the user actually said, not paraphrases.
        user_turns = [
            str(t.get("content", "")).strip()
            for t in (scene.get("conversation") or [])
            if t.get("role") == "user" and str(t.get("content", "")).strip()
        ][-2:]
        beat_name = b.get("beatName") or f"beat {i + 1}"
        chunk = [f"  • {beat_name}:"]
        if bits:
            chunk.append("    - " + " | ".join(bits))
        if summary:
            chunk.append(f"    - summary: {summary[:300]}")
        if user_turns:
            chunk.append("    - the user said: " + " // ".join(f'"{t[:160]}"' for t in user_turns))
        lines.append("\n".join(chunk))
    if not lines:
        return ""
    return "\n".join(lines)


def _to_gemini_contents(
    conversation: list[dict],
    opening_master_prompt: str,
    *,
    beat: dict | None = None,
    manifest: dict | None = None,
) -> list[dict]:
    """SceneOS-style 'agent'/'user' turns → Gemini 'model'/'user' contents.

    On the SEED turn for a beat (empty conversation), if there are
    earlier beats with established facts we pre-load them into the
    user message + add a synthetic agent acknowledgment. This routes
    the cross-beat context through the channel Gemini actually attends
    to, instead of relying solely on `system_instruction`.
    """
    if conversation:
        contents: list[dict] = []
        for t in conversation:
            role = "model" if t.get("role") == "agent" else "user"
            text = t.get("content", "") or ""
            contents.append({"role": role, "parts": [{"text": text}]})
        return contents

    recap = _prior_beats_recap(beat, manifest) if (beat and manifest) else ""
    beat_name = (beat.get("beatName") if beat else None) or "this part of the story"

    if recap:
        # Two-turn warm-up: the user reminds the agent of the established
        # canon (so prior facts arrive via the high-attention user
        # channel), the agent silently acknowledges, then the user asks
        # for the next question. The model now has no excuse to start
        # fresh — the established world is in the immediate context.
        warmup_user = (
            f"Reminder: this is one continuous film, not a new story. "
            f"Master idea: {opening_master_prompt}.\n\n"
            f"Here is what we have already established in earlier beats — "
            f"reuse these exact details (same protagonist, same world, same voice):\n\n"
            f"{recap}\n\n"
            f"Now ask me one natural next question for the {beat_name} beat. "
            f"It MUST build directly on what is above — reference at least one "
            f"specific detail (a character trait, the setting, an object, "
            f"or the user's own words). Do not re-establish things we already know."
        )
        return [
            {"role": "user", "parts": [{"text": warmup_user}]},
        ]

    # No prior beats — the original first-turn seed.
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


def _build_request_config(
    beat: dict,
    manifest: dict,
    with_thinking: bool,
    user_turn_count: int = 0,
    *,
    force_mark_sufficient: bool = False,
):
    """Build (system_prompt, GenerateContentConfig). Tier-aware:
    once the user has answered `max_questions_for_manifest(manifest)`
    times for this beat, we restrict the tool surface to markSufficient
    ONLY — a hard ceiling that scales with the chosen video tier
    (trailer=2, short film=3, movie=5). Demo mode keeps its smaller
    thinking budget regardless.

    `force_mark_sufficient` is set by the frontend "I have enough —
    generate" affordance: when the user explicitly opts out of more
    questioning, we must still emit a real markSufficient (with
    beatFacts) instead of skipping the agent entirely — otherwise
    the next beat sees no prior facts and continuity breaks.
    """
    from google.genai import types

    system = _system_prompt(beat, manifest)
    mode = _mode_of(manifest)
    cap = max_questions_for_manifest(manifest)
    must_finalize = force_mark_sufficient or user_turn_count >= cap
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
