from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


REQUIRED_FACETS = ("subject", "action", "setting", "framing", "mood")
MIN_USER_TURNS = 3
MAX_QUESTIONS = 5

FACET_HINTS: dict[str, tuple[str, ...]] = {
    "subject": (
        "he ",
        "she ",
        "they ",
        "person",
        "man",
        "woman",
        "child",
        "figure",
        "character",
        "robot",
        "astronaut",
        "creature",
        "object",
    ),
    "action": (
        "walk",
        "run",
        "turn",
        "look",
        "hold",
        "fall",
        "fight",
        "drive",
        "open",
        "reach",
        "move",
        "stare",
        "enter",
    ),
    "setting": (
        "street",
        "room",
        "forest",
        "city",
        "house",
        "field",
        "ocean",
        "desert",
        "mountain",
        "interior",
        "exterior",
        "station",
        "ship",
    ),
    "framing": (
        "close",
        "wide",
        "medium",
        "shot",
        "angle",
        "lens",
        "mm",
        "tracking",
        "handheld",
        "drone",
        "push",
        "pan",
        "dolly",
    ),
    "mood": (
        "tense",
        "warm",
        "cold",
        "soft",
        "harsh",
        "kinetic",
        "still",
        "intimate",
        "epic",
        "moody",
        "bright",
        "dark",
        "eerie",
        "hopeful",
    ),
}


@dataclass(frozen=True)
class SufficiencyReport:
    user_turn_count: int
    covered: tuple[str, ...]
    missing: tuple[str, ...]

    @property
    def sufficient(self) -> bool:
        return self.user_turn_count >= MIN_USER_TURNS and not self.missing


def user_text(turns: Iterable[dict]) -> str:
    return " ".join(
        str(t.get("content", "")).lower()
        for t in turns
        if t.get("role") == "user"
    )


def score(turns: list[dict]) -> SufficiencyReport:
    text = user_text(turns)
    covered = tuple(
        facet
        for facet in REQUIRED_FACETS
        if any(keyword in text for keyword in FACET_HINTS[facet])
    )
    return SufficiencyReport(
        user_turn_count=sum(1 for t in turns if t.get("role") == "user"),
        covered=covered,
        missing=tuple(f for f in REQUIRED_FACETS if f not in covered),
    )


def next_question(beat: dict, master_prompt: str, report: SufficiencyReport) -> str:
    missing = report.missing[0] if report.missing else "framing"
    beat_name = str(beat.get("beatName", "this beat")).lower()
    if missing == "subject":
        return f"We're still inside \"{master_prompt[:80]}\" for {beat_name}: who or what is the camera holding on? Pick a lone figure, a group, or one story-carrying object."
    if missing == "action":
        return f"For {beat_name}, what is the single action in frame? Choose a slow turn, a sudden reach, or a held stillness under pressure."
    if missing == "setting":
        return f"Where does {beat_name} happen exactly? Give me one concrete place: interior room, exterior street, landscape, vehicle, or something stranger."
    if missing == "framing":
        return f"How should the camera read {beat_name}: tight close-up, medium handheld, wide establishing, or a slow dolly/push?"
    return f"What emotional register should {beat_name} carry? Choose tense, intimate, eerie, hopeful, kinetic, or tell me your own."


def refined_prompt_from_history(beat: dict, master_prompt: str, turns: list[dict]) -> str:
    answers = " ".join(t.get("content", "") for t in turns if t.get("role") == "user")
    mood = beat.get("archetype", {}).get("mood", "cinematic")
    intent = beat.get("archetype", {}).get("intent", "")
    return (
        f"Five-second cinematic shot for \"{master_prompt}\": {intent}. "
        f"Use the user's locked details: {answers}. "
        f"Frame as a precise film moment with subject, action, setting, camera lens/framing, "
        f"motivated lighting, controlled motion, and a {mood} emotional register."
    )
