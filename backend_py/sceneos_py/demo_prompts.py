"""
Curated master prompts for the two session modes.

DEMO_PROMPTS — short, visually punchy, designed to render fast and look
good in 3-4 minutes on stage. Each entry ships with pre-curated
`beatFactsByTemplate` so the orchestrator can run all 7 beats
SPECULATIVELY at session-start, in parallel, while the agent
conversation plays in parallel as theatre.

NORMAL_PROMPTS — richer, more open-ended. Good Q&A drives the visuals.
The agent's actual `beatFacts` extraction matters here. No speculative
prefetch.

Both pools are auto-selected by the system; the user picks the mode,
not the prompt. (Override is allowed via `masterPromptOverride` for
power-user testing.)
"""
from __future__ import annotations

import random
from typing import TypedDict


class CuratedBeatFacts(TypedDict):
    subject: str
    action: str
    setting: str
    framing: str
    mood: str
    characterDescription: str
    locationDescription: str


class DemoPromptDef(TypedDict):
    id: str
    masterPrompt: str
    videoType: str  # "story" | "trailer" | "short"
    # Per-template canned facts. Keys must match the template's beats.
    beatFactsByTemplate: dict[str, CuratedBeatFacts]


# ── Shared character/location continuity strings ─────────────────────────
# We carry a single character + location descriptor across all 7 beats
# so Imagen produces a consistent protagonist + world. The fields differ
# beat-by-beat in subject/action/framing/mood — but character + location
# are constant.

_MONKEY_CHAR = (
    "Small chimpanzee, scuffed dark fur with a copper tinge, intelligent amber eyes, "
    "one ear slightly nicked. About 1.2 meters tall. No clothing. Determined posture."
)
_MONKEY_LOC = (
    "An outdoor primate enclosure at a city zoo at golden hour: weathered concrete walls, "
    "rusted iron bars, a stout climbing log, bright marigold-yellow banana cart visible "
    "just beyond the bars, faint traffic sounds, dust motes in low light."
)

_LIGHTHOUSE_CHAR = (
    "Aged Pacific-Northwest lighthouse keeper, late 60s, weathered face with a salt-and-pepper "
    "beard, deep-set blue eyes, navy wool turtleneck under an oil-soaked yellow slicker, "
    "dented brass key ring on his belt. Tall but stoop-shouldered."
)
_LIGHTHOUSE_LOC = (
    "Headland lighthouse interior at storm-blue twilight: cast-iron spiral stair, brass-fitted "
    "rotating fresnel lens, rain-streaked windows, exterior view of jagged cliffs and a black ocean "
    "below, distant ship-light pulsing where there should be none."
)

_DRONE_CHAR = (
    "Decommissioned delivery drone, palm-sized, matte-charcoal carbon body, two rotors, faded "
    "yellow logistics decal half-peeled off, a single amber LED pulsing faintly. Looks tired."
)
_DRONE_LOC = (
    "Abandoned multi-level shopping mall at noon, skylights cracked open: shafts of dust-laden "
    "sunlight, dead escalator, overgrown planters, vending machines glowing faintly, marble floor "
    "littered with flyers, the food court fountain still running improbably."
)


# ── DEMO POOL — fast, visually punchy, all 7 beats pre-curated ──────────

DEMO_PROMPTS: list[DemoPromptDef] = [
    {
        "id": "monkey-banana",
        "masterPrompt": "A monkey steals a banana from a zoo and escapes the city",
        "videoType": "story",
        "beatFactsByTemplate": {
            "story.hook": {
                "subject": "the chimpanzee",
                "action": "reaches one paw through the iron bars toward a banana cart",
                "setting": "the primate enclosure at golden hour, just beyond the bars",
                "framing": "85mm intimate close-up, slight handheld breath, shallow depth of field",
                "mood": "intimate-hook",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": _MONKEY_LOC,
            },
            "story.exposition": {
                "subject": "the chimpanzee",
                "action": "watches a zookeeper push the banana cart past, head tracking left to right",
                "setting": "wider view of the enclosure with the cart rolling beyond the bars",
                "framing": "24mm wide composed static, subject lower third",
                "mood": "wide-establish",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": _MONKEY_LOC,
            },
            "story.inciting": {
                "subject": "the chimpanzee",
                "action": "snatches a banana through the bars in one fluid movement",
                "setting": "the bars of the primate enclosure, banana cart at the edge of frame",
                "framing": "50mm medium, snap whip-pan as the banana clears the bars",
                "mood": "intimate-hook",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": _MONKEY_LOC,
            },
            "story.rising": {
                "subject": "the chimpanzee",
                "action": "sprints across the zoo path clutching the banana, dodging visitors",
                "setting": "a wide zoo walkway lined with crowds at golden hour",
                "framing": "35mm handheld tracking, Dutch tilt, leading lines",
                "mood": "kinetic-rising",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": (
                    "A wide zoo walkway with food carts, scattered visitors with cameras, "
                    "tropical foliage backdrop, the city skyline visible in the haze."
                ),
            },
            "story.climax": {
                "subject": "the chimpanzee",
                "action": "leaps from a low wall onto a passing city bus roof, banana raised",
                "setting": "the zoo's exit gates with a city bus rolling past beneath",
                "framing": "50mm slow-motion push-in, single hard backlight, silhouette",
                "mood": "tense-climax",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": (
                    "Zoo gates at the threshold of the urban street, late afternoon sun behind, "
                    "long shadows, a city bus mid-frame with route number 42 lit above the windshield."
                ),
            },
            "story.falling": {
                "subject": "the chimpanzee",
                "action": "rides the bus roof down a quiet residential street, peeling the banana",
                "setting": "tree-lined suburban street, dusk light, bus rolling at low speed",
                "framing": "40mm static wide, locked off, subject small in frame",
                "mood": "still-resolve",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": (
                    "Quiet tree-lined suburban street at dusk, magnolia trees in bloom, "
                    "a few parked cars, warm porch lights coming on, no traffic."
                ),
            },
            "story.resolution": {
                "subject": "the chimpanzee",
                "action": "perched atop a city water tower, eats the last bite of the banana, looks at the skyline",
                "setting": "rooftop water tower silhouetted against a deep blue twilight sky",
                "framing": "40mm locked off, slow pull-back to god view, the city below",
                "mood": "still-resolve",
                "characterDescription": _MONKEY_CHAR,
                "locationDescription": (
                    "A weathered cylindrical wooden water tower atop a brick apartment building, "
                    "the city skyline glittering below, the moon rising on the right of frame."
                ),
            },
        },
    },
    {
        "id": "lighthouse-ship",
        "masterPrompt": "An old lighthouse keeper sees a ship that shouldn't exist",
        "videoType": "story",
        "beatFactsByTemplate": {
            "story.hook": {
                "subject": "the lighthouse keeper",
                "action": "stands at the rain-streaked window, eyes narrowing at the horizon",
                "setting": "lantern room of the lighthouse during a storm",
                "framing": "50mm tight close-up on his face, breath fogging the glass",
                "mood": "intimate-hook",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": _LIGHTHOUSE_LOC,
            },
            "story.exposition": {
                "subject": "the lighthouse keeper",
                "action": "polishes the brass fresnel lens with a slow practiced rhythm",
                "setting": "the lantern room, fresnel lens dominating the frame",
                "framing": "24mm wide composed static, subject lower third",
                "mood": "wide-establish",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": _LIGHTHOUSE_LOC,
            },
            "story.inciting": {
                "subject": "the lighthouse keeper",
                "action": "freezes mid-polish as a ghostly green ship-light pulses through the rain",
                "setting": "the lantern room window, storm visible beyond",
                "framing": "85mm close-up, rack focus from his face to the distant green pulse",
                "mood": "intimate-hook",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": _LIGHTHOUSE_LOC,
            },
            "story.rising": {
                "subject": "the lighthouse keeper",
                "action": "rushes down the cast-iron spiral stair, key ring jangling, lantern in hand",
                "setting": "the lighthouse stairwell, single oil lantern lighting the way",
                "framing": "35mm handheld tracking, vertigo angles, hard contrast",
                "mood": "kinetic-rising",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": (
                    "Cast-iron spiral stairwell of the lighthouse, single oil lantern casting hard moving "
                    "shadows on whitewashed brick walls, distant storm wind audible."
                ),
            },
            "story.climax": {
                "subject": "the lighthouse keeper",
                "action": "stands on the cliff edge in the rain, watches a luminous ghost ship pass through the rocks",
                "setting": "the cliff base below the lighthouse, jagged rocks, storm raging",
                "framing": "50mm low-angle, single hard backlight from the ship-glow, silhouette",
                "mood": "tense-climax",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": (
                    "Storm-lashed cliff base below the lighthouse, jagged black rocks, foaming waves, "
                    "a luminous schooner-shaped silhouette gliding impossibly through the rocks, "
                    "trailing pale green phosphor light."
                ),
            },
            "story.falling": {
                "subject": "the lighthouse keeper",
                "action": "stands silent on the cliff, rain easing, watching the ship vanish into mist",
                "setting": "the cliff edge as the storm settles, sky turning pale before dawn",
                "framing": "40mm static wide, locked off, subject small in frame",
                "mood": "still-resolve",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": (
                    "The cliff at storm's end, settling fog, pale pre-dawn light, the ocean calming, "
                    "no ship visible, only the mist."
                ),
            },
            "story.resolution": {
                "subject": "the lighthouse keeper",
                "action": "back in the lantern room, opens an old leather logbook and writes a single line",
                "setting": "the lantern room at dawn, fresnel lens still slowly rotating",
                "framing": "40mm locked off, slow pull-back, top-down to reveal the page",
                "mood": "still-resolve",
                "characterDescription": _LIGHTHOUSE_CHAR,
                "locationDescription": _LIGHTHOUSE_LOC,
            },
        },
    },
    {
        "id": "drone-mall",
        "masterPrompt": "A forgotten delivery drone wakes up alone in an abandoned mall and tries to find its last customer",
        "videoType": "story",
        "beatFactsByTemplate": {
            "story.hook": {
                "subject": "the delivery drone",
                "action": "the amber LED flickers on for the first time in years, rotors twitching",
                "setting": "atop a dusty kiosk in the abandoned mall food court, noon light",
                "framing": "85mm macro close-up on the LED and decals, dust motes",
                "mood": "intimate-hook",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": _DRONE_LOC,
            },
            "story.exposition": {
                "subject": "the delivery drone",
                "action": "lifts off slowly, hovers, takes in the empty mall around it",
                "setting": "central atrium of the abandoned mall, three levels visible",
                "framing": "24mm wide composed static, subject centered low in frame",
                "mood": "wide-establish",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": _DRONE_LOC,
            },
            "story.inciting": {
                "subject": "the delivery drone",
                "action": "its display flickers up an old delivery address: '4F, 4127, Apt B'",
                "setting": "hovering near a dead escalator, soft sun through the skylight",
                "framing": "50mm medium, rack focus from the drone to the projected address",
                "mood": "intimate-hook",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": _DRONE_LOC,
            },
            "story.rising": {
                "subject": "the delivery drone",
                "action": "weaves rapidly through dead escalators and overgrown planters, dodging falling debris",
                "setting": "navigating multiple levels of the abandoned mall",
                "framing": "35mm handheld tracking, low-angle, kinetic Dutch tilt",
                "mood": "kinetic-rising",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": _DRONE_LOC,
            },
            "story.climax": {
                "subject": "the delivery drone",
                "action": "arrives at apartment 4127 above the mall, hovers at a closed door, rings the bell",
                "setting": "outside a residential apartment door above the mall, late afternoon",
                "framing": "50mm slow push-in to the door's peephole, deep negative space",
                "mood": "tense-climax",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": (
                    "A narrow residential corridor above the mall, peeling green wallpaper, single bare "
                    "bulb, brass apartment number 4127 mounted on a chipped wood door."
                ),
            },
            "story.falling": {
                "subject": "the delivery drone",
                "action": "the door creaks open. The hallway beyond is empty. Drone hovers, alone.",
                "setting": "the open doorway revealing an empty dust-covered apartment",
                "framing": "40mm static wide, locked off, drone small in the doorway",
                "mood": "still-resolve",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": (
                    "An empty apartment behind the door: dust-sheeted furniture, sunlight slanting in, "
                    "no occupants, time-frozen."
                ),
            },
            "story.resolution": {
                "subject": "the delivery drone",
                "action": "places its tiny package on the welcome mat and quietly powers down",
                "setting": "the welcome mat at the threshold, fading sunlight",
                "framing": "40mm locked off, slow pull-back to god view of the empty hallway",
                "mood": "still-resolve",
                "characterDescription": _DRONE_CHAR,
                "locationDescription": (
                    "The threshold of the apartment doorway with a small brown-paper package on the mat, "
                    "the corridor behind it long and empty."
                ),
            },
        },
    },
]


# ── NORMAL POOL — richer, agent-driven ───────────────────────────────────
# These don't ship pre-curated facts because the agent's conversation
# generates them. The system surfaces the prompt; the user shapes the rest.

class NormalPromptDef(TypedDict):
    id: str
    masterPrompt: str
    videoType: str


NORMAL_PROMPTS: list[NormalPromptDef] = [
    {
        "id": "memory-thief",
        "masterPrompt": "A woman discovers her memories are being slowly replaced by someone else's",
        "videoType": "story",
    },
    {
        "id": "translator",
        "masterPrompt": "A translator at a UN summit realizes the language she's translating doesn't exist",
        "videoType": "story",
    },
    {
        "id": "last-radio-host",
        "masterPrompt": "The last radio host on Earth keeps broadcasting, even though no one has called in for thirty years",
        "videoType": "story",
    },
    {
        "id": "imposter-son",
        "masterPrompt": "A con man pretending to be the long-lost son of a wealthy family begins to genuinely love them",
        "videoType": "story",
    },
    {
        "id": "garden-keeper",
        "masterPrompt": "An immortal gardener tends a garden where every plant is a person they've outlived",
        "videoType": "story",
    },
]


# ── Selection ─────────────────────────────────────────────────────────────


def pick_demo_prompt(prompt_id: str | None = None) -> DemoPromptDef:
    """Select a demo prompt. If `prompt_id` is provided, return that one;
    otherwise pick at random from the pool. Stable for the duration of a
    session — `session.py` caches the chosen prompt by projectId."""
    if prompt_id:
        for p in DEMO_PROMPTS:
            if p["id"] == prompt_id:
                return p
        raise ValueError(f"unknown demo prompt id {prompt_id!r}")
    return random.choice(DEMO_PROMPTS)


def pick_normal_prompt(prompt_id: str | None = None) -> NormalPromptDef:
    if prompt_id:
        for p in NORMAL_PROMPTS:
            if p["id"] == prompt_id:
                return p
        raise ValueError(f"unknown normal prompt id {prompt_id!r}")
    return random.choice(NORMAL_PROMPTS)
