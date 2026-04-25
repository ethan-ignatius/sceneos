"""
Mock backend implementations.
- Beat-template-specific questions WITH 3 suggestedAnswers each (matching the agent voice spec)
- Per-template canned Cloudinary clips (varied URLs, varied durations)
- Deterministic mock jobIds
- Mock CutOS handoff
- Mock beatFacts emission for the markSufficient handoff
"""
from __future__ import annotations

import time
import uuid as _uuid
from typing import Any

from .beat_templates import find_template
from .config import env
from .sufficiency import MAX_QUESTIONS, MIN_USER_TURNS


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
_STORY = {
    "story.hook": _make_clip("dog", 5),
    "story.exposition": _make_clip("elephants", 8),
    "story.inciting": _make_clip("dog", 6),
    "story.rising": _make_clip("elephants", 10),
    "story.climax": _make_clip("dog", 8),
    "story.falling": _make_clip("elephants", 6),
    "story.resolution": _make_clip("dog", 5),
}
_ALL = {**_TRAILER, **_SHORT, **_FEATURE, **_STORY}


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


def _q(question: str, *suggestions: str) -> dict:
    """Helper: build a single mock question dict with 3 suggested answers."""
    if len(suggestions) != 3:
        raise ValueError(f"_q expects exactly 3 suggestions, got {len(suggestions)}")
    return {"question": question, "suggestedAnswers": list(suggestions)}


_QUESTIONS_BY_TEMPLATE: dict[str, list[dict]] = {
    # ── story.* — the canonical 7-beat dramatic arc ────────────────────────
    "story.hook": [
        _q(
            "Tell me what we open on, the very first image of this movie.",
            "A lone figure mid-action, the thing they do without thinking",
            "Two people in conflict, you can read the whole movie in their body language",
            "A specific object or place, no people in frame yet, but it tells us everything",
        ),
        _q(
            "And what is happening in that first frame, what is the small action that defines this person or place?",
            "Something so ordinary it almost reads as boring, on purpose",
            "A held moment of waiting, you can feel them about to move",
            "Mid-action already, we are dropping into the middle of something",
        ),
        _q(
            "What feeling should the audience be carrying out of this opening into the rest of the movie?",
            "Quiet curiosity, like we are being invited into something",
            "Tension, something is already wrong but the protagonist does not know it yet",
            "Pure forward momentum, we cannot wait to see what happens next",
        ),
    ],
    "story.exposition": [
        _q(
            "Show me their everyday. What is the routine action that tells us who they are when no one is watching?",
            "Something physical and repeated, the thing they do every morning",
            "A specific interaction with another person who knows them well",
            "Alone in their space, doing the one thing they actually love",
        ),
        _q(
            "What do they want, the thing they would say if you asked them directly?",
            "Something concrete and small, almost embarrassingly so",
            "Something huge and aspirational, more than they will admit out loud",
            "They do not know what they want yet, that is part of the story",
        ),
        _q(
            "What does the camera do here, observe patiently from a distance or move through their world with them?",
            "Patient and composed, wide and steady, the world is bigger than them",
            "Close and intimate, we are with them in every frame",
            "Drifting handheld, slightly detached, like a memory",
        ),
    ],
    "story.inciting": [
        _q(
            "What is the thing that breaks the everyday, the disruption they cannot ignore?",
            "Someone arrives, a specific person who changes the math of their life",
            "An event happens, something physical and undeniable",
            "Information surfaces, a discovery they cannot un-know",
        ),
        _q(
            "Do they witness this from a distance or does it land directly on them?",
            "From a distance, they see it happen and have to choose to engage",
            "Directly, no choice, it lands on them and they have to react",
            "They cause it themselves, this is on them",
        ),
        _q(
            "How does the camera react, does it hold steady or does it move with the moment?",
            "Steady and patient, letting the audience do the reacting",
            "Tilts and follows, the camera is in shock with them",
            "Sudden cut from wide to ECU, the world snaps in",
        ),
    ],
    "story.rising": [
        _q(
            "What is the first obstacle they hit after they decide to act, the thing that tells them this is bigger than they thought?",
            "Another person who is in their way",
            "A practical problem they cannot solve alone",
            "An internal limit, the thing they did not know about themselves",
        ),
        _q(
            "What is the second escalation after that, what compounds?",
            "The first obstacle gets worse, no relief",
            "A new front opens, something they did not see coming",
            "An ally turns or proves unreliable",
        ),
        _q(
            "Pace-wise, does the camera get more kinetic here or do you want a deceptive calm before the climax?",
            "More kinetic, faster cuts, building velocity",
            "Deceptive calm, the audience knows the storm is coming",
            "Mixed, the camera is alive but the protagonist is the still point",
        ),
    ],
    "story.climax": [
        _q(
            "What is the image of the highest stakes, the one frame a trailer would use?",
            "A held confrontation, two faces or two forces meeting",
            "A single physical moment, an impact, a leap, a fall",
            "An emotional revelation, the truth coming out, no action needed",
        ),
        _q(
            "Is there one big motion in this beat or is everything suspended?",
            "One enormous move, kinetic and dominant",
            "Total stillness, the world holds its breath",
            "Both, stillness then a single hard move",
        ),
        _q(
            "Do we need their face fully readable here or is a backlit silhouette stronger?",
            "Face fully readable, every micro-expression matters",
            "Silhouette, withholding their face is the choice",
            "Profile, half-lit, we see them but not all of them",
        ),
    ],
    "story.falling": [
        _q(
            "What does the world look like right after the climax lands, who is left standing and where?",
            "The protagonist alone in the wreckage, internal",
            "The protagonist with whoever survived, looking at each other",
            "The world has moved on already, no one paying attention to them",
        ),
        _q(
            "How does the air feel in this beat, settled or still vibrating from what just happened?",
            "Settled, almost too quiet",
            "Vibrating, the consequences are still arriving",
            "Mixed, calm on the surface and chaos underneath",
        ),
        _q(
            "Does the camera stay close to them or does it pull back to show the larger world?",
            "Stays close, intimate, we feel what they feel",
            "Pulls back, they become small in the frame, the world dwarfs them",
            "Locks off, observes them from across the room, almost cold",
        ),
    ],
    "story.resolution": [
        _q(
            "What is the very last image, the frame the audience walks out remembering?",
            "The protagonist alone, settled, the new normal",
            "The protagonist with someone, a small specific gesture",
            "The world without them, the place they used to be",
        ),
        _q(
            "Has the protagonist changed, and how does the frame show that?",
            "Visibly different, the costume or body language has shifted",
            "Looks the same but everything around them is different",
            "Cannot tell yet, ambiguous on purpose",
        ),
        _q(
            "Final-beat technique, locked-off and held, or a slow pull-back to god view?",
            "Locked-off, the camera does not move, the held moment is the ending",
            "Slow pull-back, we are leaving them, the world reasserts",
            "Slow push-in to one detail, the last thing we see is small and specific",
        ),
    ],
    # ── trailer.* ──────────────────────────────────────────────────────────
    "trailer.establishing": [
        _q(
            "For this opening wide, do you want a 24mm sweep across a full vista, or an 85mm compression on a single distant figure dwarfed by environment?",
            "24mm sweep, full vista, the world is the protagonist",
            "85mm compression, lone figure, isolated and small",
            "Locked-off composed wide, no movement, let the audience read it",
        ),
        _q(
            "Cool blue palette (isolation, scale, gravitas) or warm gold (hope, wonder)? This sets the LUT for the whole trailer.",
            "Cool blue, isolation, scale, slight dread",
            "Warm gold, hope, wonder, pulling us in",
            "High-contrast monochrome, withhold color until later",
        ),
    ],
    "trailer.hook": [
        _q(
            "What specific micro-action defines the protagonist in three seconds, a glance, a hand reaching, a held breath, a hesitation?",
            "A glance, eyes finding something off-screen",
            "A hand reaching, mid-motion, paused",
            "A held breath, total stillness with internal tension",
        ),
        _q(
            "35mm soft-key intimacy, or 50mm with a harder catch-light suggesting they have already been changed by something?",
            "35mm soft-key, intimate, vulnerable",
            "50mm hard catch-light, already changed, harder edges",
            "85mm compressed background, isolating their face",
        ),
    ],
    "trailer.rising": [
        _q(
            "Three escalating obstacles in this beat, what is the first, second, third? Keep it specific, a person, an object, a place.",
            "A person who blocks them, an object they cannot get past, a place they cannot enter",
            "Three versions of the same problem at increasing scale",
            "A person, then a betrayal by an ally, then an internal limit",
        ),
        _q(
            "Music-driven cut pacing (1-2s shots) or dialogue-driven (longer, conversation-led)?",
            "Music-driven, fast cuts, building velocity",
            "Dialogue-driven, longer takes, conversation carries it",
            "Mixed, fast under wide shots, slow on close-ups",
        ),
    ],
    "trailer.climax-tease": [
        _q(
            "One held image of the highest stakes, what is it? An impact mid-air, a silhouette, a frozen face, an embrace?",
            "An impact mid-air, suspended motion",
            "A silhouette, withholding identity for emotional weight",
            "A frozen face, eyes telling everything",
        ),
        _q(
            "Backlit silhouette permitted? Or do we keep the protagonist's face fully readable for emotional weight?",
            "Backlit silhouette, withhold their face",
            "Face fully readable, this is an emotional shot",
            "Half-lit profile, half and half",
        ),
    ],
    "trailer.sting": [
        _q(
            "Title card or single iconic frame? If title, what is the single line?",
            "Title card with one short line of text",
            "Single iconic frame, no text, let the image do it",
            "Title card with date or release window only",
        ),
        _q(
            "Fade to black or hard cut to black after the held moment?",
            "Fade to black, slow, contemplative",
            "Hard cut to black, percussive, abrupt",
            "Cut to title, no black frame",
        ),
    ],
    "short.hook": [
        _q(
            "What is the one frame that stops the scroll in 1.5 seconds? Concrete subject and one action.",
            "A face mid-reaction, eyes telling the whole story",
            "A specific object doing something unexpected",
            "A dynamic body in motion, mid-jump or mid-fall",
        ),
        _q(
            "Frontal eye-level (intimate) or low-angle hero shot (dramatic)?",
            "Frontal eye-level, intimate, vulnerable",
            "Low-angle hero shot, dramatic, larger than life",
            "Top-down or unusual angle, graphic and surprising",
        ),
    ],
    "short.turn": [
        _q(
            "What expectation set in the hook are we subverting? Be specific, wrong location, wrong scale, wrong tone?",
            "Wrong location, the place reveals to be somewhere else",
            "Wrong scale, the thing is much bigger or smaller than implied",
            "Wrong tone, what felt funny becomes serious or vice versa",
        ),
        _q(
            "Pull-back reveal, whip pan, or rack focus to deliver the turn?",
            "Pull-back reveal, the frame opens up to show context",
            "Whip pan to a new subject, kinetic and surprising",
            "Rack focus, the foreground becomes the story",
        ),
    ],
    "short.payoff": [
        _q(
            "What is the final visual that lands the emotion or punchline? Tighter than the hook.",
            "An ECU on a face, the smallest reaction",
            "A static graphic frame, almost a still",
            "A small physical action that resolves the setup",
        ),
        _q(
            "Branded sting (logo plus tagline) or unbranded held frame?",
            "Branded, logo and tagline",
            "Unbranded held frame, let the image do it",
            "Brand mark in-corner only, minimal",
        ),
    ],
    "feature.setup": [
        _q(
            "Show me the protagonist's everyday, what one routine action establishes their world?",
            "Something physical they do every morning, ritualized",
            "An interaction with someone who knows them well",
            "Alone in their space, doing the one thing they love",
        ),
        _q(
            "What is the world's normal palette, natural daylight, tungsten interior, neon street, candle warmth?",
            "Natural daylight, soft and unforced",
            "Tungsten interior, warm, lived-in",
            "Neon street, urban, a bit cold",
        ),
    ],
    "feature.inciting": [
        _q(
            "What disrupts the everyday? Be physical and specific.",
            "A person arriving, a specific stranger or returnee",
            "An event, something physical and undeniable",
            "A discovery, information that cannot be un-known",
        ),
        _q(
            "Does the protagonist witness the disruption from a distance, or are they confronted by it directly?",
            "From a distance, they have to choose to engage",
            "Directly, no choice, it lands on them",
            "They cause it themselves, this is on them",
        ),
    ],
    "feature.rising": [
        _q(
            "Three beats of escalation, first obstacle, second, third. What does each cost the protagonist?",
            "Each costs them something material — money, time, an ally",
            "Each costs them something internal — confidence, hope, a belief",
            "Mixed, one external loss, one internal, one relational",
        ),
        _q(
            "Average shot length should drop. Music or no music underneath?",
            "Music, building energy, a single track that carries the whole beat",
            "No music, ambient sound only, let the cuts do the work",
            "Music starts halfway, when the protagonist commits",
        ),
    ],
    "feature.midpoint": [
        _q(
            "What is the reversal or revelation? What does the protagonist learn that recontextualizes everything?",
            "They learn an ally is not who they thought",
            "They learn the goal they were chasing is not the real goal",
            "They learn something about themselves they had been avoiding",
        ),
        _q(
            "Composed wide or held tight close-up to mark the midpoint visually?",
            "Composed wide, the world has reorganized around them",
            "Held tight close-up, internal moment, dawning realization",
            "Slow rack focus from one to the other, the shift visible in the frame",
        ),
    ],
    "feature.crisis": [
        _q(
            "Lowest point, protagonist alone or stripped of allies/tools. What is the image of that loneliness?",
            "Physically alone in a space, no one in frame",
            "Surrounded by people but invisible, no one looking at them",
            "With one ally only, the smallest possible support",
        ),
        _q(
            "Negative space or claustrophobia? Open void or trapped frame?",
            "Negative space, vast emptiness around them",
            "Claustrophobic, frame closes in, walls and ceilings",
            "Both, alternating shots of openness and confinement",
        ),
    ],
    "feature.climax": [
        _q(
            "What is the dramatic question being answered, and what is the image of that answer?",
            "Whether they can do the impossible thing — and the image is the attempt itself",
            "Whether they will choose right — and the image is the choice on their face",
            "Whether they will survive — and the image is the moment of survival or sacrifice",
        ),
        _q(
            "Major motion (chase, fight, sacrifice) or held heroic stillness?",
            "Major motion, kinetic, climactic action",
            "Held heroic stillness, one moment that contains everything",
            "Both, motion building to a final stillness",
        ),
    ],
    "feature.denouement": [
        _q(
            "What is the new normal? Echoes of the setup, but changed how?",
            "The same routine but they are visibly different inside it",
            "A new routine entirely, the old life is gone",
            "Ambiguous, we are not sure what they choose",
        ),
        _q(
            "Final shot, does the camera linger on the protagonist or pull away to the world?",
            "Linger on the protagonist, hold their face",
            "Pull away to the world, they become part of it",
            "Cut to a specific detail, an object or place that carries the final meaning",
        ),
    ],
}


def _user_turn_count(req: dict, beat: dict) -> int:
    scenes = beat.get("scenes") or []
    convo = (scenes[0] or {}).get("conversation", []) if scenes else []
    base = sum(1 for t in convo if t.get("role") == "user")
    return base + (1 if req.get("userMessage") else 0)


def _is_demo_mode(req: dict) -> bool:
    return (req.get("manifest", {}).get("mode") or "").lower() == "demo"


# In demo mode the mock agent caps to 1 user answer per beat, mirroring
# the live demo speed-mode constraint (DEMO_MAX_QUESTIONS in agent.py).
DEMO_MOCK_MAX_USER_TURNS = 1


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


def _build_beat_facts(req: dict, beat: dict) -> dict:
    """Synthesize a plausible beatFacts object from the conversation. Mock-only."""
    archetype = beat["archetype"]
    scenes = beat.get("scenes") or []
    convo = (scenes[0] or {}).get("conversation", []) if scenes else []
    user_answers_list = [t.get("content", "") for t in convo if t.get("role") == "user"]
    if req.get("userMessage"):
        user_answers_list.append(req["userMessage"])
    user_answers = " | ".join(user_answers_list) or "the protagonist as established"

    master = req["manifest"]["masterPrompt"]
    return {
        "subject": _truncate(user_answers_list[0] if user_answers_list else master, 80),
        "action": _truncate(user_answers_list[1] if len(user_answers_list) > 1 else archetype["intent"], 120),
        "setting": _truncate(user_answers_list[-1] if user_answers_list else "the established location", 120),
        "framing": archetype.get("directorNotes", "").split("\n", 1)[0] or "cinematic motivated frame",
        "mood": archetype["mood"],
        "characterDescription": _truncate(
            f"{master}. Carrying forward: {user_answers}", 240
        ),
        "locationDescription": _truncate(
            f"Setting for {beat['beatName']}: {user_answers}", 240
        ),
    }


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else (s[: n - 1].rstrip() + "...")


def _parse_ref_marker(msg: str | None) -> tuple[int, str]:
    if not msg:
        return 0, ""
    import re
    m = re.match(r"^\[refs:(\d+)\]\s*", msg)
    if not m:
        return 0, msg
    return int(m.group(1)), msg[m.end():]


def _fallback_questions(beat: dict) -> list[dict]:
    """Generic fallback for templates not in _QUESTIONS_BY_TEMPLATE."""
    return [
        _q(
            f"Tell me what we see in this {beat['beatName'].lower()} beat. Who is on screen and what are they doing?",
            "The protagonist alone, doing the thing that defines the beat",
            "Two people in a charged exchange",
            "A specific object or place that carries the meaning",
        ),
        _q(
            "Where, exactly? Interior or exterior, and what does the place tell us?",
            "Somewhere ordinary that feels charged",
            "A specific iconic location",
            "An open landscape that dwarfs the scene",
        ),
        _q(
            "How should the camera see this, close and intimate or wide and observed?",
            "Tight close-up, intimate",
            "Wide and patient, observed",
            "Handheld and kinetic, inside it",
        ),
    ]


async def run_mock_agent_streaming(req: dict):
    """
    Mock streaming agent. Yields synthetic thinking events for the visualizer
    demo path, then the canned result. Mirrors the live streaming shape so the
    frontend has a single consumer.
    """
    import asyncio as _asyncio

    yield {"type": "ready"}

    beat = next((b for b in req["manifest"]["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        yield {"type": "error", "message": f"Mock: unknown beatId {req['beatId']}"}
        return

    user_turn_count = _user_turn_count(req, beat)
    thoughts = [
        f"working on the {beat['beatName'].lower()} beat for \"{req['manifest']['masterPrompt']}\". ",
        f"the user has answered {user_turn_count} time(s) so far. ",
        "tracing the facets that are still unclear: ",
        "subject, action, setting, framing, mood, character, location. ",
        "deciding whether to ask another question or hand off to the deterministic pipeline. ",
    ]
    for chunk in thoughts:
        yield {"type": "thought", "chunk": chunk}
        await _asyncio.sleep(0.15)

    result = run_mock_agent_turn(req)
    yield {
        "type": "tool_call",
        "name": "markSufficient" if result["kind"] == "sufficient" else "askQuestion",
        "args": result,
    }
    yield {"type": "result", **result}


def run_mock_agent_turn(req: dict) -> dict:
    beat = next((b for b in req["manifest"]["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        return {
            "kind": "question",
            "question": "Mock agent: I can't find that beat. Please retry.",
            "reasoning": "Mock fallback — beatId not found in manifest.",
            "suggestedAnswers": ["retry", "skip", "ignore"],
            "estimatedRemaining": 1,
        }

    questions = _QUESTIONS_BY_TEMPLATE.get(beat["template"]) or _fallback_questions(beat)

    ref_count, _ = _parse_ref_marker(req.get("userMessage"))
    turns = _user_turn_count(req, beat)

    if ref_count > 0:
        ack = (
            "Noted the reference frame — aiming for that mood. "
            if ref_count == 1
            else f"Noted {ref_count} reference frames — aiming for that mood. "
        )
    else:
        ack = ""

    # Demo mode: ask exactly DEMO_MOCK_MAX_USER_TURNS questions then mark
    # sufficient. Normal mode: continue until MIN_USER_TURNS, then ride the
    # bank until we exhaust it or hit MAX_QUESTIONS.
    if _is_demo_mode(req):
        if turns < DEMO_MOCK_MAX_USER_TURNS:
            idx = min(turns, len(questions) - 1)
            entry = questions[idx]
            tmpl = find_template(beat["template"])
            notes = (tmpl or {}).get("directorNotes", "") if tmpl else ""
            first_line = notes.split("\n", 1)[0] if notes else f"{beat['beatName']} beat archetype"
            return {
                "kind": "question",
                "question": f"{ack}{entry['question']}",
                "reasoning": f"[demo mode · {DEMO_MOCK_MAX_USER_TURNS}-question speed cap] " + first_line,
                "suggestedAnswers": entry["suggestedAnswers"],
                "estimatedRemaining": max(0, DEMO_MOCK_MAX_USER_TURNS - turns - 1),
            }
    elif turns < MIN_USER_TURNS or (turns < len(questions) and turns < MAX_QUESTIONS):
        idx = min(turns, len(questions) - 1)
        entry = questions[idx]
        tmpl = find_template(beat["template"])
        notes = (tmpl or {}).get("directorNotes", "") if tmpl else ""
        first_line = notes.split("\n", 1)[0] if notes else f"{beat['beatName']} beat archetype"
        return {
            "kind": "question",
            "question": f"{ack}{entry['question']}",
            "reasoning": first_line,
            "suggestedAnswers": entry["suggestedAnswers"],
            "estimatedRemaining": max(0, len(questions) - turns - 1),
        }

    return {
        "kind": "sufficient",
        "refinedPrompt": _build_refined_prompt(req, beat),
        "sceneSummary": f"{ack}{beat['beatName']}: {beat['archetype']['intent']}",
        "suggestedDuration": beat["archetype"]["suggestedDuration"],
        "beatFacts": _build_beat_facts(req, beat),
    }
