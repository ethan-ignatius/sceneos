"""Tool-call → AgentResponse normalization.

The Gemini SDK returns MapComposite/RepeatedComposite types, the
Anthropic SDK returns plain dicts. `_normalize_args` converts both into
plain Python primitives. `_normalize_call_to_result` then maps the
canonical (name, args) pair into the public AgentResponse shape — the
same shape the FastAPI route serializes to JSON.

Suggested answers go through dedupe + cap-at-4 here. We do NOT pad with
filler because the user explicitly hates the "tell me more in your own
words" placeholder. When the agent returns 0 suggestions we surface
openEnded=true so the UI puts the text input front and center.
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

    Suggested answers are non-deterministic (0-4). No filler padding.
    `openEnded` is honored explicitly when the model emits it; otherwise
    inferred from emptiness."""
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
        if explicit_open is None:
            open_ended = len(suggestions) == 0
        else:
            open_ended = bool(explicit_open)
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
