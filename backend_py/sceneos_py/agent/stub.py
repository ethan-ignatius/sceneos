"""No-LLM stub fallback.

Runs in MOCK_MODE or whenever there are no Gemini / Anthropic credentials.
The stub can't reason about texture, so it walks a deterministic question
bank gated by `_has_facet_coverage` + MIN_USER_TURNS — once those clear,
it marks sufficient. Lets dev / tests exercise the full pipeline shape
without provider calls.
"""
from __future__ import annotations

from ..sufficiency import MAX_QUESTIONS, MIN_USER_TURNS, score
from ._constants import TARGET_CLIP_SECONDS
from .context import _truncate
from .prompt import _has_facet_coverage


_STUB_QUESTION_BANK: list[tuple[str, list[str]]] = [
    (
        "Tell me what is happening in this part of the story. Who is on screen and what are they doing?",
        [
            "The main character is alone, doing the thing that defines them",
            "Two characters in conflict, the difference between them is the whole movie",
            "A single object or place tells us the situation without anyone speaking",
        ],
    ),
    (
        "Where does this happen, exactly? Interior or exterior, and what does the place tell us?",
        [
            "Somewhere ordinary that is about to become anything but",
            "A specific charged location that is doing emotional work just by being in frame",
            "An open landscape that dwarfs the character",
        ],
    ),
    (
        "How should the camera see this moment, close and intimate or wide and observed?",
        [
            "Tight close-up so we feel what they feel",
            "Wide and patient so the world dwarfs the moment",
            "Handheld and kinetic so we are inside the chaos with them",
        ],
    ),
    (
        "What is the dominant feeling, what should the audience be carrying when this beat ends?",
        [
            "Tension that has nowhere to go yet",
            "Quiet, contemplative, almost sad",
            "Pure kinetic momentum into whatever comes next",
        ],
    ),
    (
        "And the light, what is the dominant source and what does it say about the moment?",
        [
            "Warm motivated practical light, intimate",
            "Cool overcast daylight, emotionally flat by design",
            "Hard backlight, silhouette, withholding their face",
        ],
    ),
]


def _last_user_answer(conversation: list[dict]) -> str:
    for turn in reversed(conversation):
        if turn.get("role") == "user" and str(turn.get("content", "")).strip():
            return str(turn.get("content", "")).strip()
    return ""


def _missing_facet_question(beat: dict, conversation: list[dict], idx: int) -> tuple[str, list[str], str]:
    """Pick a fallback question from what is actually missing, not turn count.

    This keeps the no-LLM path coherent. If the user says "the astronaut runs
    around the desert", subject/action/setting are already covered, so the
    next question should deepen stakes or feeling instead of asking where.
    """
    report = score(conversation)
    last = _last_user_answer(conversation)
    echo_text = (last[:1].lower() + last[1:]).rstrip(".") if last else ""
    echo = f"So, {echo_text}." if echo_text else ""
    missing_facets = list(report.missing)
    if "framing" in missing_facets and "mood" in missing_facets:
        # A story/stakes question is more natural than asking about lenses.
        missing_facets.remove("mood")
        missing_facets.insert(0, "mood")
    missing = missing_facets[0] if missing_facets else "mood"

    if missing == "subject":
        return (
            "Tell me who is on screen in this moment. Who are we following?",
            [
                "One person alone, carrying the whole scene",
                "Two people whose conflict defines the moment",
                "A place or object tells the story before anyone appears",
            ],
            "subject",
        )
    if missing == "action":
        return (
            f"{echo} What is the main thing they are doing in frame?",
            [
                "They move with purpose toward something specific",
                "They freeze because they have seen something",
                "They are trying to escape before anyone notices",
            ],
            "action",
        )
    if missing == "setting":
        return (
            f"{echo} Where exactly does this happen?",
            [
                "An ordinary place that suddenly feels wrong",
                "A vast exterior landscape that dwarfs them",
                "A tight interior space with no easy way out",
            ],
            "setting",
        )
    if missing == "framing":
        return (
            f"{echo} Are we close enough to feel their panic, or wide enough to see what they are up against?",
            [
                "Close on their body and breath",
                "Wide, with the landscape swallowing them",
                "Tracking beside them, urgent and unstable",
            ],
            "framing",
        )
    if missing == "mood":
        return (
            f"{echo} Why are they doing it, fear, discovery, play, or survival?",
            [
                "They are running from something they barely understand",
                "They are chasing a signal only they can see",
                "They are testing the limits of a strange new world",
            ],
            "mood",
        )

    question, suggestions = _STUB_QUESTION_BANK[idx % len(_STUB_QUESTION_BANK)]
    return question, suggestions, "fallback"


def _stub_question_turn(beat: dict, master: str, conversation: list[dict], idx: int) -> dict:
    question, suggestions, target = _missing_facet_question(beat, conversation, idx)
    return {
        "kind": "question",
        "question": question,
        "reasoning": (
            f"Stub agent (no Vertex AI client): targeting {target} for the {beat['beatName'].lower()} "
            f"beat for \"{_truncate(master, 80)}\"."
        ),
        "suggestedAnswers": suggestions,
        "estimatedRemaining": max(0, MIN_USER_TURNS - idx - 1),
    }


def _stub_beat_facts(beat: dict, conversation: list[dict]) -> dict:
    user_answers = " ".join(t.get("content", "") for t in conversation if t.get("role") == "user")
    archetype = beat.get("archetype", {})
    return {
        "subject": _truncate(user_answers, 80) or "the protagonist",
        "action": "the action drawn from the user's answers",
        "setting": "the location described by the user",
        "framing": "cinematic, motivated camera",
        "mood": archetype.get("mood", "cinematic"),
        "characterDescription": _truncate(user_answers, 200),
        "locationDescription": _truncate(user_answers, 200),
    }


def _stub_sufficient_turn(beat: dict, master: str, conversation: list[dict]) -> dict:
    archetype = beat["archetype"]
    intent = archetype.get("intent", "")
    user_answers = " ".join(t.get("content", "") for t in conversation if t.get("role") == "user")
    return {
        "kind": "sufficient",
        "refinedPrompt": (
            f"Stub agent ({TARGET_CLIP_SECONDS}-second {beat['beatName'].lower()} clip "
            f"for \"{master}\"). {intent} "
            f"User-locked details: {_truncate(user_answers, 240)}. "
            f"Mood {archetype.get('mood', 'cinematic')}; cinematic 35mm, motivated practical light, "
            f"controlled motion, {TARGET_CLIP_SECONDS}-second sustained moment."
        ),
        "sceneSummary": f"{beat['beatName']}: {_truncate(intent, 120)}",
        "suggestedDuration": archetype.get("suggestedDuration", TARGET_CLIP_SECONDS),
        "beatFacts": _stub_beat_facts(beat, conversation),
    }


def _stub_agent_turn(beat: dict, master: str, conversation: list[dict], user_turn_count: int) -> dict:
    if user_turn_count >= MIN_USER_TURNS and (_has_facet_coverage(conversation) or user_turn_count >= MAX_QUESTIONS):
        return _stub_sufficient_turn(beat, master, conversation)
    return _stub_question_turn(beat, master, conversation, user_turn_count)
