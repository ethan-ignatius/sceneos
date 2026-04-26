"""
Beat-template archetype data. Mirror of backend/src/lib/beat-templates.ts and
the canonical frontend/src/lib/beat-templates.ts. Used by the mock agent's
question lists and stub decomposer.
"""
from __future__ import annotations

from typing import TypedDict


class BeatTemplateDef(TypedDict):
    template: str
    beatName: str
    intent: str
    mood: str
    suggestedDuration: int
    directorNotes: str


def _notes(*lines: str) -> str:
    return "\n".join(lines)


TRAILER: list[BeatTemplateDef] = [
    {
        "template": "trailer.establishing",
        "beatName": "Establishing",
        "intent": "Place the viewer in the world. Stakes implied, not stated.",
        "mood": "wide-establish",
        "suggestedDuration": 8,
        "directorNotes": _notes(
            "FRAME: Establishing shot. Open wide and atmospheric.",
            "LENS: 24mm or wider for grand scale; OR 85mm + heavy compression for an isolated subject.",
            "MOVEMENT: Slow push-in or static. Never handheld.",
            "LIGHT: Single dominant key, large soft source.",
            "BLOCKING: Subject (if any) in lower third or off-center; landscape dominates.",
            "PACE: One shot, breathing.",
        ),
    },
    {
        "template": "trailer.hook",
        "beatName": "Hook",
        "intent": "First close-up of the protagonist. Make us care in three seconds.",
        "mood": "intimate-hook",
        "suggestedDuration": 12,
        "directorNotes": _notes(
            "FRAME: Intimate close-up of the protagonist. The 'connect' moment.",
            "LENS: 35mm or 50mm at f/1.8-2.0. Shallow depth of field.",
            "MOVEMENT: Slight handheld breath - NOT static.",
            "LIGHT: Soft key on the eyes; let the rest of the frame go dark.",
            "BLOCKING: Subject slightly off-center, looking toward action.",
            "BEHAVIOR: One specific micro-action.",
            "PACE: Hold the shot.",
        ),
    },
    {
        "template": "trailer.rising",
        "beatName": "Rising",
        "intent": "Stakes escalate. Pace quickens. Conflict reveals itself.",
        "mood": "kinetic-rising",
        "suggestedDuration": 18,
        "directorNotes": _notes(
            "FRAME: Variety. Avoid eye-level for too long.",
            "LENS: Mix focal lengths.",
            "MOVEMENT: Camera is alive - dolly, drone, handheld, crane.",
            "LIGHT: Hard light, increased contrast.",
            "BLOCKING: Each shot must add a new piece of the conflict.",
            "PACE: 1-2 second cuts.",
        ),
    },
    {
        "template": "trailer.climax-tease",
        "beatName": "Climax Tease",
        "intent": "Promise the apex without delivering it.",
        "mood": "tense-climax",
        "suggestedDuration": 14,
        "directorNotes": _notes(
            "FRAME: One held image of the highest stakes.",
            "LENS: Wide for scale, OR ECU for emotional impact.",
            "MOVEMENT: One enormous move, or total stillness.",
            "LIGHT: Backlit silhouette permitted; high-contrast palette.",
            "BLOCKING: Subject dominates frame.",
            "PACE: One held moment, then a HARD cut.",
        ),
    },
    {
        "template": "trailer.sting",
        "beatName": "Sting",
        "intent": "One image. One line. The audience exhales and remembers.",
        "mood": "punchy-sting",
        "suggestedDuration": 8,
        "directorNotes": _notes(
            "FRAME: Title card or single iconic frame.",
            "LENS: Match the emotional center.",
            "MOVEMENT: Static, OR a slow pull-back.",
            "LIGHT: Clean. Negative space is the canvas.",
            "PACE: 3-5 seconds.",
        ),
    },
]

SHORT: list[BeatTemplateDef] = [
    {
        "template": "short.hook",
        "beatName": "Hook",
        "intent": "Stop the scroll in 1.5 seconds.",
        "mood": "intimate-hook",
        "suggestedDuration": 5,
        "directorNotes": _notes(
            "FRAME: Instantly readable. One clear focal point.",
            "LENS: 35mm or 50mm, frontal, eye-level.",
            "MOVEMENT: Static or one small move.",
            "LIGHT: Bright, high-contrast.",
            "PACE: 1-3 seconds.",
        ),
    },
    {
        "template": "short.turn",
        "beatName": "Turn",
        "intent": "Subvert the expectation set in the hook.",
        "mood": "kinetic-rising",
        "suggestedDuration": 10,
        "directorNotes": _notes(
            "FRAME: Recontextualize what came before.",
            "LENS: Switch focal length from the hook.",
            "MOVEMENT: Camera reveal - pull back, push in, whip pan, rack focus.",
            "LIGHT: Different palette from hook.",
            "PACE: 4-6 seconds; turn lands at the midpoint.",
        ),
    },
    {
        "template": "short.payoff",
        "beatName": "Payoff",
        "intent": "Land the emotion or punchline in under 5 seconds.",
        "mood": "punchy-sting",
        "suggestedDuration": 5,
        "directorNotes": _notes(
            "FRAME: Tighter than the hook.",
            "LENS: Mid-shot to ECU.",
            "MOVEMENT: Often static.",
            "LIGHT: Bold, branded.",
            "PACE: 3 seconds. Hard stop.",
        ),
    },
]

FEATURE: list[BeatTemplateDef] = [
    {
        "template": "feature.setup",
        "beatName": "Setup",
        "intent": "Establish the world, the protagonist, and the everyday.",
        "mood": "wide-establish",
        "suggestedDuration": 20,
        "directorNotes": _notes("Build the ordinary world. Composed and patient. Soft natural light."),
    },
    {
        "template": "feature.inciting",
        "beatName": "Inciting",
        "intent": "The disruption pulls the protagonist out of the ordinary.",
        "mood": "intimate-hook",
        "suggestedDuration": 25,
        "directorNotes": _notes("The break. Camera responds to event - tilts, jolts, follows."),
    },
    {
        "template": "feature.rising",
        "beatName": "Rising",
        "intent": "Escalating obstacles. New rules emerge.",
        "mood": "kinetic-rising",
        "suggestedDuration": 35,
        "directorNotes": _notes("Variety of locations and angles. Build velocity."),
    },
    {
        "template": "feature.midpoint",
        "beatName": "Midpoint",
        "intent": "Reversal or revelation. Stakes redefined.",
        "mood": "kinetic-rising",
        "suggestedDuration": 25,
        "directorNotes": _notes("Pivot. One slow, intentional move. New palette begins."),
    },
    {
        "template": "feature.crisis",
        "beatName": "Crisis",
        "intent": "Lowest point. The dark night.",
        "mood": "tense-climax",
        "suggestedDuration": 30,
        "directorNotes": _notes("Isolation. Tighter, claustrophobic. Slowest beat."),
    },
    {
        "template": "feature.climax",
        "beatName": "Climax",
        "intent": "The apex. The dramatic question is answered.",
        "mood": "tense-climax",
        "suggestedDuration": 25,
        "directorNotes": _notes("Maximum stakes. Major motion or held heroic stillness."),
    },
    {
        "template": "feature.aftermath",
        "beatName": "Aftermath",
        "intent": "The dust settles. The cost of the apex is felt before the world resolves.",
        "mood": "still-resolve",
        "suggestedDuration": 18,
        "directorNotes": _notes(
            "Quiet immediately after the climax. Mediums + tight close-ups; almost no movement. "
            "Warm twilight cooling toward the new normal. Long takes, 5-8s. The audience earns the silence."
        ),
    },
    {
        "template": "feature.denouement",
        "beatName": "Denouement",
        "intent": "Resolution. The new normal.",
        "mood": "still-resolve",
        "suggestedDuration": 20,
        "directorNotes": _notes("The world after. Slow. Often static. Settled palette."),
    },
]


STORY: list[BeatTemplateDef] = [
    {
        "template": "story.hook",
        "beatName": "Hook",
        "intent": "Establish the false equilibrium. Stop the audience from looking away.",
        "mood": "intimate-hook",
        "suggestedDuration": 5,
        "directorNotes": _notes(
            "FRAME: One image that contains the premise.",
            "LENS: 35mm or 50mm. Close enough to read intent.",
            "MOVEMENT: Static or breath-only handheld.",
            "LIGHT: Single motivated source. Catch the eyes.",
            "PACE: Hold one moment that tells us what kind of movie this is.",
        ),
    },
    {
        "template": "story.exposition",
        "beatName": "Exposition",
        "intent": "Establish the world, the protagonist, and what they want.",
        "mood": "wide-establish",
        "suggestedDuration": 8,
        "directorNotes": _notes(
            "FRAME: Wider. Show the protagonist in their world.",
            "LENS: 24mm scale OR 85mm compression to isolate them in it.",
            "MOVEMENT: Slow push-in or composed static. Patient.",
            "LIGHT: Soft, motivated, normal. The everyday.",
            "PACE: Breathing. One or two shots, no cut frenzy.",
        ),
    },
    {
        "template": "story.inciting",
        "beatName": "Inciting Incident",
        "intent": "The disruption. The protagonist must act.",
        "mood": "intimate-hook",
        "suggestedDuration": 6,
        "directorNotes": _notes(
            "FRAME: The break. A specific physical moment.",
            "LENS: Switch focal length from exposition.",
            "MOVEMENT: Camera reacts. Tilt, jolt, follow.",
            "LIGHT: Palette shifts. Something is wrong.",
            "PACE: Faster cuts begin here. The world changes.",
        ),
    },
    {
        "template": "story.rising",
        "beatName": "Rising Action",
        "intent": "Stakes escalate. Obstacles compound. The protagonist commits.",
        "mood": "kinetic-rising",
        "suggestedDuration": 10,
        "directorNotes": _notes(
            "FRAME: Variety. Avoid eye-level for too long.",
            "LENS: Mix focal lengths.",
            "MOVEMENT: Camera is alive. Dolly, drone, handheld, crane.",
            "LIGHT: Hard light, rising contrast.",
            "PACE: 1-2 second cuts. Build velocity.",
        ),
    },
    {
        "template": "story.climax",
        "beatName": "Climax",
        "intent": "The apex. The dramatic question is answered.",
        "mood": "tense-climax",
        "suggestedDuration": 8,
        "directorNotes": _notes(
            "FRAME: One held image of the highest stakes OR maximum motion.",
            "LENS: Wide for scale OR ECU for emotional impact.",
            "MOVEMENT: One enormous move OR total stillness.",
            "LIGHT: Backlit silhouette permitted. High contrast.",
            "PACE: Held moment, then a hard cut.",
        ),
    },
    {
        "template": "story.falling",
        "beatName": "Falling Action",
        "intent": "The aftermath. Consequences land.",
        "mood": "still-resolve",
        "suggestedDuration": 6,
        "directorNotes": _notes(
            "FRAME: The world after. Echo the exposition.",
            "LENS: Match or mirror exposition lens.",
            "MOVEMENT: Slowed. Often static.",
            "LIGHT: Settled. Soft.",
            "PACE: Long takes. Let the audience exhale.",
        ),
    },
    {
        "template": "story.resolution",
        "beatName": "Resolution",
        "intent": "The new normal. The last frame is the emotional register.",
        "mood": "still-resolve",
        "suggestedDuration": 5,
        "directorNotes": _notes(
            "FRAME: Final image. The thing they remember.",
            "LENS: Match the emotional center.",
            "MOVEMENT: Locked-off, OR a slow pull-back to god view.",
            "LIGHT: Negative space is the canvas.",
            "PACE: One held moment. End.",
        ),
    },
]


_ALL: list[BeatTemplateDef] = [*TRAILER, *SHORT, *FEATURE, *STORY]


def find_template(template: str) -> BeatTemplateDef | None:
    for t in _ALL:
        if t["template"] == template:
            return t
    return None
