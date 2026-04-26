"""Tool-call → AgentResponse normalization.

The Gemini SDK returns MapComposite/RepeatedComposite types;
`_normalize_args` converts those into plain Python primitives.
`_normalize_call_to_result` then maps the canonical (name, args) pair
into the public AgentResponse shape — the same shape the FastAPI route
serializes to JSON.

Suggested answers go through dedupe + cap-at-4 here. The schema
mandates 2-4 suggestions on every question (min_items=2 enforced by
Vertex Gemini's tool calling). If the model still drops below the
floor we surface what it returned — we do NOT fabricate canned chips,
because mood-bucketed filler ("Darker direction", "Hopeful direction")
reads as obvious AI nonsense and degrades trust. The right place to
fix a too-quiet model is the prompt + schema, not code.
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

    Suggested answers are mandated 2-4 by the schema; we dedupe and cap
    at 4 here. We do NOT pad below the floor — Vertex's tool schema
    already enforces min_items=2, and a model that ignores that under
    load is better surfaced as "no suggestions" (UI shows the input
    field) than papered over with mood-bucketed filler that reads as
    obvious AI nonsense. `openEnded` is honored when explicit;
    otherwise inferred from suggestion count."""
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
        explicit_open = args.get("openEnded")
        # Treat as open-ended whenever count drops below 2 OR the model
        # explicitly flagged it. The text input always remains the
        # primary affordance; pills are nudges.
        open_ended = (
            True
            if explicit_open is None
            else bool(explicit_open)
        )
        if len(suggestions) < 2:
            open_ended = True
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


