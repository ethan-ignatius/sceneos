"""Conversation + context aggregation.

Collects the conversation history for a beat (with the latest user
message appended), and builds the "story so far" context blocks that
get spliced into the system prompt: prior beats (full beatFacts + last
user turns), upcoming beats (so the agent doesn't blow the climax on
the inciting incident), and the movie plan when present.

The user's complaint was "doesn't remember context from previous nodes
within the storyboard." The fix here is exhaustive: full beatFacts (all
9 keys) per prior beat, last 4 user turns per prior beat in full, plus
the movie plan injected into every beat's system prompt. Gemini 2.5 has
1M context; we use under 5k.
"""
from __future__ import annotations

from datetime import datetime, timezone


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else (s[: n - 1].rstrip() + "...")


def _active_scene(beat: dict) -> dict | None:
    scenes = beat.get("scenes") or []
    if not scenes:
        return None
    for scene in reversed(scenes):
        if not scene.get("approved"):
            return scene
    return scenes[-1]


def _memory_scene(beat: dict) -> dict | None:
    """Best scene to represent a beat in cross-beat memory.

    Some clients append scenes across retries/edits, so the canonical data
    for a completed beat may not live at scenes[0]. Prefer the newest scene
    that has beatFacts; then newest with summary/refinedPrompt; then newest.
    """
    scenes = beat.get("scenes") or []
    if not scenes:
        return None
    for scene in reversed(scenes):
        if scene.get("beatFacts"):
            return scene
    for scene in reversed(scenes):
        if scene.get("sceneSummary") or scene.get("refinedPrompt"):
            return scene
    return scenes[-1]


def _collect_conversation(beat: dict, user_message: str | None) -> list[dict]:
    scene = _active_scene(beat) or {"conversation": []}
    history = list(scene.get("conversation") or [])
    if user_message and user_message.strip():
        last = history[-1] if history else None
        if not (last and last.get("role") == "user" and (last.get("content") or "").strip() == user_message.strip()):
            history.append(
                {
                    "role": "user",
                    "content": user_message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
    return history


def _earlier_beats_block(beat: dict, manifest: dict) -> str:
    """Full-fidelity prior-beats memory.

    Emits the FULL beatFacts (all 9 keys) per prior beat, plus the prior
    beat's last 4 user turns full-fidelity. Lets the agent reuse exact
    phrases ("she had spent eleven years pretending the language was
    real" — verbatim across beats), not summary keywords.
    """
    beat_idx = next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )
    if beat_idx == 0:
        return ""
    sections: list[str] = []
    for b in manifest["beats"][:beat_idx]:
        scene = _memory_scene(b)
        if not scene:
            continue
        lines: list[str] = [f"## {b['beatName']} (beat {manifest['beats'].index(b) + 1})"]
        facts = scene.get("beatFacts") or {}
        if facts:
            for key in ("subject", "action", "setting", "framing", "mood",
                       "characterDescription", "locationDescription",
                       "voiceLine", "captionLine"):
                value = facts.get(key)
                if isinstance(value, str):
                    value = value.strip()
                if value:
                    lines.append(f"- {key}: {value}")
        summary = scene.get("sceneSummary") or scene.get("refinedPrompt") or ""
        if summary:
            lines.append(f"- summary: {_truncate(summary, 400)}")
        user_turns = [
            str(t.get("content", "")).strip()
            for t in (scene.get("conversation") or [])
            if t.get("role") == "user" and str(t.get("content", "")).strip()
        ][-4:]
        if user_turns:
            lines.append("- user answers: " + " ┆ ".join(user_turns))
        sections.append("\n".join(lines))
    if not sections:
        return ""
    return (
        "# Prior beats (the movie so far)\n"
        "Use these details when reflecting the story back. Reuse specific "
        "phrases the user gave you. Carry character + world descriptors "
        "VERBATIM — the protagonist looks the same in every frame.\n\n"
        + "\n\n".join(sections)
        + "\n"
    )


def _later_beats_block(beat: dict, manifest: dict) -> str:
    """Soft awareness of beats AFTER the current one.

    Lets the agent avoid burning the climax twist on the inciting incident,
    or stranding a setup with no payoff. Only the archetype intent + mood
    are surfaced — the user's specifics for those beats haven't been
    written yet."""
    beat_idx = next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )
    later = manifest["beats"][beat_idx + 1:]
    if not later:
        return ""
    lines: list[str] = []
    for b in later:
        archetype = b.get("archetype", {})
        lines.append(f"- {b['beatName']}: {archetype.get('intent', '')} (mood: {archetype.get('mood', '?')})")
    return (
        "# Beats still to come (do not pre-empt their dramatic role)\n"
        + "\n".join(lines)
        + "\n"
    )


def _movie_plan_block(manifest: dict) -> str:
    """Inject the global story coordinator if a movie plan is stamped on
    the manifest. The plan keeps every beat's question inside one
    coherent movie instead of letting the conversation drift genre by
    genre."""
    plan = manifest.get("moviePlan") or {}
    if not plan:
        return ""
    parts = ["# Movie plan (the holistic story this beat lives inside)"]
    if plan.get("logline"):
        parts.append(f"- Logline: {plan['logline']}")
    if plan.get("protagonistArc"):
        parts.append(f"- Protagonist arc: {plan['protagonistArc']}")
    if plan.get("visualMotif"):
        parts.append(f"- Visual motif (carry through every beat): {plan['visualMotif']}")
    if plan.get("toneAndGenre"):
        parts.append(f"- Tone / genre: {plan['toneAndGenre']}")
    if plan.get("dramaticQuestion"):
        parts.append(f"- Dramatic question: {plan['dramaticQuestion']}")
    return "\n".join(parts) + "\n"


def _mode_of(manifest: dict) -> str:
    """Resolve the session mode from the manifest. Defaults to 'normal' for
    back-compat with manifests that predate the demo/normal split."""
    raw = (manifest.get("mode") or "normal").strip().lower()
    return "demo" if raw == "demo" else "normal"
