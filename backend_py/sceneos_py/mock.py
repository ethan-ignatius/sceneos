"""
Mock backend implementations. Mirror of backend/src/mock/*.
- Beat-template-specific question lists for the questionnaire agent
- Per-template canned Cloudinary clips (varied URLs, varied durations)
- Deterministic mock jobIds
- Mock CutOS handoff
"""
from __future__ import annotations

import time
import uuid as _uuid
from typing import Any

from .beat_templates import find_template
from .config import env


# ── Mock clips ──────────────────────────────────────────────────────────────

_DEMO_CLOUD = "demo"


def _make_clip(public_id: str, duration: int) -> dict:
    return {
        "publicId": public_id,
        "url": f"https://res.cloudinary.com/{_DEMO_CLOUD}/video/upload/{public_id}.mp4",
        "durationSeconds": duration,
    }


_TRAILER = {
    "trailer.establishing": _make_clip("dog", 8),
    "trailer.hook": _make_clip("elephants", 12),
    "trailer.rising": _make_clip("dog", 18),
    "trailer.climax-tease": _make_clip("elephants", 14),
    "trailer.sting": _make_clip("dog", 8),
}
_SHORT = {
    "short.hook": _make_clip("dog", 5),
    "short.turn": _make_clip("elephants", 10),
    "short.payoff": _make_clip("dog", 5),
}
_FEATURE = {
    "feature.setup": _make_clip("elephants", 20),
    "feature.inciting": _make_clip("dog", 25),
    "feature.rising": _make_clip("elephants", 35),
    "feature.midpoint": _make_clip("dog", 25),
    "feature.crisis": _make_clip("elephants", 30),
    "feature.climax": _make_clip("dog", 25),
    "feature.denouement": _make_clip("elephants", 20),
}
_ALL = {**_TRAILER, **_SHORT, **_FEATURE}


def get_mock_clip(template: str) -> dict:
    return _ALL.get(template, _make_clip("dog", 8))


# ── Deterministic mock jobIds ───────────────────────────────────────────────


def deterministic_job_id(prefix: str, seed: str) -> str:
    return f"{prefix}::{seed}-{int(time.time() * 1000):x}"


# ── Mock CutOS handoff ──────────────────────────────────────────────────────


def mock_cutos_import() -> dict:
    project_id = f"mock-{_uuid.uuid4().hex[:8]}"
    base = env("CUTOS_BASE_URL", "http://localhost:3000") or "http://localhost:3000"
    return {"projectId": project_id, "editUrl": f"{base}/projects/{project_id}"}


# ── Mock questionnaire agent ────────────────────────────────────────────────


_QUESTIONS_BY_TEMPLATE: dict[str, list[str]] = {
    "trailer.establishing": [
        "For this opening wide, do you want a 24mm sweep across a full vista, or an 85mm compression on a single distant figure dwarfed by environment?",
        "Cool blue palette (isolation, scale, gravitas) or warm gold (hope, wonder)? This sets the LUT for the whole trailer.",
    ],
    "trailer.hook": [
        "What specific micro-action defines the protagonist in three seconds — a glance, a hand reaching, a held breath, a hesitation?",
        "35mm soft-key intimacy, or 50mm with a harder catch-light suggesting they have already been changed by something?",
    ],
    "trailer.rising": [
        "Three escalating obstacles in this beat — what's the first, second, third? Keep it specific (a person, an object, a place).",
        "Music-driven cut pacing (1-2s shots) or dialogue-driven (longer, conversation-led)?",
    ],
    "trailer.climax-tease": [
        "One held image of the highest stakes — what is it? An impact mid-air, a silhouette, a frozen face, an embrace?",
        "Backlit silhouette permitted? Or do we keep the protagonist's face fully readable for emotional weight?",
    ],
    "trailer.sting": [
        "Title card or single iconic frame? If title — what's the single line?",
        "Fade to black or hard cut to black after the held moment?",
    ],
    "short.hook": [
        "What is the one frame that stops the scroll in 1.5 seconds? Concrete subject and one action.",
        "Frontal eye-level (intimate) or low-angle hero shot (dramatic)?",
    ],
    "short.turn": [
        "What expectation set in the hook are we subverting? Be specific — wrong location, wrong scale, wrong tone?",
        "Pull-back reveal, whip pan, or rack focus to deliver the turn?",
    ],
    "short.payoff": [
        "What is the final visual that lands the emotion or punchline? Tighter than the hook.",
        "Branded sting (logo + tagline) or unbranded held frame?",
    ],
    "feature.setup": [
        "Show me the protagonist's everyday — what one routine action establishes their world?",
        "What is the world's 'normal' palette — natural daylight, tungsten interior, neon street, candle warmth?",
    ],
    "feature.inciting": [
        "What disrupts the everyday? Be physical and specific.",
        "Does the protagonist witness the disruption from a distance, or are they confronted by it directly?",
    ],
    "feature.rising": [
        "Three beats of escalation — first obstacle, second, third. What does each cost the protagonist?",
        "Average shot length should drop. Music or no music underneath?",
    ],
    "feature.midpoint": [
        "What is the reversal or revelation? What does the protagonist learn that recontextualizes everything?",
        "Composed wide or held tight close-up to mark the midpoint visually?",
    ],
    "feature.crisis": [
        "Lowest point — protagonist alone or stripped of allies/tools. What's the image of that loneliness?",
        "Negative space or claustrophobia? Open void or trapped frame?",
    ],
    "feature.climax": [
        "What is the dramatic question being answered, and what is the image of that answer?",
        "Major motion (chase, fight, sacrifice) or held heroic stillness?",
    ],
    "feature.denouement": [
        "What is the new normal? Echoes of the setup, but changed how?",
        "Final shot — does the camera linger on the protagonist or pull away to the world?",
    ],
}


def _user_turn_count(req: dict, beat: dict) -> int:
    scenes = beat.get("scenes") or []
    convo = (scenes[0] or {}).get("conversation", []) if scenes else []
    base = sum(1 for t in convo if t.get("role") == "user")
    return base + (1 if req.get("userMessage") else 0)


def _build_refined_prompt(req: dict, beat: dict) -> str:
    archetype = beat["archetype"]
    scenes = beat.get("scenes") or []
    convo = (scenes[0] or {}).get("conversation", []) if scenes else []
    user_answers = "; ".join(t.get("content", "") for t in convo if t.get("role") == "user")
    recent = f"; {req['userMessage']}" if req.get("userMessage") else ""
    return ". ".join(
        [
            req["manifest"]["masterPrompt"],
            f"Beat: {beat['beatName']}. {archetype['intent']}",
            f"Director's specifics: {user_answers}{recent}",
            f"Mood: {archetype['mood']}, {archetype['suggestedDuration']}s.",
            archetype.get("directorNotes", ""),
        ]
    )


def _parse_ref_marker(msg: str | None) -> tuple[int, str]:
    if not msg:
        return 0, ""
    import re
    m = re.match(r"^\[refs:(\d+)\]\s*", msg)
    if not m:
        return 0, msg
    return int(m.group(1)), msg[m.end():]


def run_mock_agent_turn(req: dict) -> dict:
    beat = next((b for b in req["manifest"]["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        return {
            "kind": "question",
            "question": "Mock agent: I can't find that beat. Please retry.",
            "reasoning": "Mock fallback — beatId not found in manifest.",
            "estimatedRemaining": 1,
        }

    questions = _QUESTIONS_BY_TEMPLATE.get(
        beat["template"],
        [
            "Tell me one image you'd want as the very first frame of this beat.",
            "What's the dominant emotional color — warm or cool?",
        ],
    )

    ref_count, _ = _parse_ref_marker(req.get("userMessage"))
    turns = _user_turn_count(req, beat)

    if ref_count > 0:
        ack = (
            f"Noted the reference frame — aiming for that mood. "
            if ref_count == 1
            else f"Noted {ref_count} reference frames — aiming for that mood. "
        )
    else:
        ack = ""

    if turns < len(questions):
        tmpl = find_template(beat["template"])
        notes = (tmpl or {}).get("directorNotes", "") if tmpl else ""
        first_line = notes.split("\n", 1)[0] if notes else "Beat archetype"
        return {
            "kind": "question",
            "question": f"{ack}{questions[turns]}",
            "reasoning": first_line,
            "estimatedRemaining": len(questions) - turns,
        }

    return {
        "kind": "sufficient",
        "refinedPrompt": _build_refined_prompt(req, beat),
        "sceneSummary": f"{ack}{beat['beatName']}: {beat['archetype']['intent']}",
        "suggestedDuration": beat["archetype"]["suggestedDuration"],
    }
