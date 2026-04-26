"""Tool-call → AgentResponse normalization.

The Gemini SDK returns MapComposite/RepeatedComposite types;
`_normalize_args` converts those into plain Python primitives.
`_normalize_call_to_result` then maps the canonical (name, args) pair
into the public AgentResponse shape — the same shape the FastAPI route
serializes to JSON.

Suggested answers go through dedupe + cap-at-4 here. The schema
mandates 2-4 suggestions on every question; if the model drops below
that floor we backfill with two beat-archetype-aware fallbacks so the
UI's universal pill row always has something to render.
"""
from __future__ import annotations

from typing import Any

from ..continuity import merge_beat_facts_for_continuity
from ._constants import TARGET_CLIP_SECONDS


def _normalize_args(value: Any) -> Any:
    """Recursively turn google.genai's MapComposite/RepeatedComposite into plain dicts/lists."""
    if isinstance(value, dict):
        return {k: _normalize_args(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_args(v) for v in value]
    try:
        from collections.abc import Mapping, Sequence
        if isinstance(value, Mapping):
            return {k: _normalize_args(v) for k, v in value.items()}
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            return [_normalize_args(v) for v in value]
    except Exception:
        pass
    return value


def _normalize_call_to_result(
    name: str, args: dict, beat: dict, *, manifest: dict | None = None
) -> dict:
    """Convert a raw tool call into the public AgentResponse shape.

    Suggested answers are mandated 2-4 by the schema; if the model drops
    below the floor we backfill with two beat-archetype-aware nudges so
    the UI's universal pill row always renders. `openEnded` is honored
    when explicit; otherwise inferred from suggestion count."""
    if name == "askQuestion":
        raw_suggestions = list(args.get("suggestedAnswers") or [])
        seen: set[str] = set()
        suggestions: list[str] = []
        for s in raw_suggestions:
            text = str(s).strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(text)
            if len(suggestions) >= 4:
                break
        # Universal-pill backfill: never let the UI see fewer than 2.
        # The fallbacks are mood-aware so they don't read as canned filler;
        # they're invitations the user can click or override by typing.
        if len(suggestions) < 2:
            suggestions = _backfill_suggestions(suggestions, beat)
        explicit_open = args.get("openEnded")
        # Always treat as open-ended — pills are nudges, the input is
        # the primary affordance regardless of count.
        open_ended = True if explicit_open is None else bool(explicit_open)
        return {
            "kind": "question",
            "question": str(args.get("question", "")),
            "reasoning": str(args.get("reasoning", "")),
            "suggestedAnswers": suggestions,
            "openEnded": open_ended,
            "estimatedRemaining": int(args.get("estimatedRemaining", 1)),
        }
    if name == "markSufficient":
        beat_facts = dict(args.get("beatFacts") or {})
        beat_facts.setdefault("subject", "the protagonist")
        beat_facts.setdefault("action", "the action of this beat")
        beat_facts.setdefault("setting", "the established location")
        beat_facts.setdefault("mood", beat["archetype"]["mood"])
        if manifest is not None and beat.get("beatId"):
            beat_facts = merge_beat_facts_for_continuity(manifest, beat["beatId"], beat_facts)
        return {
            "kind": "sufficient",
            "refinedPrompt": str(args.get("refinedPrompt", "")),
            "sceneSummary": str(args.get("sceneSummary", beat["beatName"])),
            "suggestedDuration": int(args.get("suggestedDuration", TARGET_CLIP_SECONDS)),
            "beatFacts": beat_facts,
        }
    raise RuntimeError(f"unknown tool {name}")


# Mood-bucketed nudges. Picked to imply different movies, not minor
# variations on the same answer. The agent should rarely fall through
# to these — they exist so the universal pill row never goes empty
# even if the model drops below the schema's min_items=2.
_BACKFILL_BY_MOOD: dict[str, tuple[str, str]] = {
    "wide-establish": (
        "Set it at first light, the world hasn't woken up.",
        "Set it at dusk, that warm ache before night.",
    ),
    "intimate-hook": (
        "Stay tight on the eyes — let me read what they want.",
        "Pull back so I see the whole room around them.",
    ),
    "kinetic-rising": (
        "Things go wrong in a way they choose, not by accident.",
        "Things go wrong because someone else makes a move.",
    ),
    "tense-climax": (
        "They commit to it — body language says yes.",
        "They hesitate — something in them says no.",
    ),
    "still-resolve": (
        "Ends quiet — the new normal is barely different.",
        "Ends with a held look — they know it changed them.",
    ),
    "punchy-sting": (
        "One iconic image, no text.",
        "A title card with one line of bite.",
    ),
}


def _backfill_suggestions(existing: list[str], beat: dict) -> list[str]:
    """Pad suggestions to 2 with mood-aware nudges. Dedupe-aware."""
    seen = {s.lower() for s in existing}
    mood = (beat.get("archetype") or {}).get("mood", "wide-establish")
    bucket = _BACKFILL_BY_MOOD.get(mood) or _BACKFILL_BY_MOOD["wide-establish"]
    out = list(existing)
    for s in bucket:
        if len(out) >= 2:
            break
        if s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
    return out
