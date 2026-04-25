"""
Deterministic mood → motion-preset map.

Used by the orchestrator (Module C) to translate a beat's mood into concrete
cinematographic instructions (lens, lighting, composition, camera move, pace).
Also used by decompose.py for the stub-mode prompt composer.

This is the moat referenced in CONTEXT.md §3 — directorial language baked
into the system, not a generic LLM wrapper.
"""
from __future__ import annotations


MOTION_PRESETS: dict[str, dict[str, str]] = {
    "wide-establish": {
        "lighting": "soft golden-hour key light from camera-left",
        "lens": "anamorphic 24mm",
        "composition": "rule-of-thirds horizon, deep negative space above subject",
        "cameraMove": "slow aerial drone descent, gently tracking forward",
        "pace": "lingering, contemplative",
        "atmosphere": "drifting volumetric haze, faint distant motion",
    },
    "intimate-hook": {
        "lighting": "warm practical key, eyes catchlit",
        "lens": "85mm portrait",
        "composition": "tight close-up, eyeline above center, negative headroom",
        "cameraMove": "subtle dolly-in, almost imperceptible",
        "pace": "slow, breath-held",
        "atmosphere": "dust motes drifting through key light",
    },
    "kinetic-rising": {
        "lighting": "high-contrast hard light, hard shadows",
        "lens": "35mm",
        "composition": "Dutch tilt, leading lines pointing forward",
        "cameraMove": "handheld tracking, snap whip-pan into action",
        "pace": "quickly, escalating",
        "atmosphere": "wind-driven debris, flickering light sources",
    },
    "tense-climax": {
        "lighting": "low-key chiaroscuro, single hard backlight",
        "lens": "50mm",
        "composition": "centered subject, oppressive negative space",
        "cameraMove": "slow push-in to extreme close-up",
        "pace": "tightening, deliberate",
        "atmosphere": "smoke curling, distant rumble in the air",
    },
    "still-resolve": {
        "lighting": "pale ambient daylight, no key",
        "lens": "40mm",
        "composition": "static wide, subject small in frame",
        "cameraMove": "locked-off frame with the slightest float",
        "pace": "stilled, exhaled",
        "atmosphere": "soft wind, settled dust",
    },
    "punchy-sting": {
        "lighting": "single hard rim light, deep blacks",
        "lens": "50mm",
        "composition": "graphic silhouette, single dominant shape",
        "cameraMove": "snap zoom and hard cut beat",
        "pace": "instant, percussive",
        "atmosphere": "abrupt silence then sudden detail",
    },
}


def pick_motion_preset(mood: str) -> dict[str, str]:
    """Returns the preset for a mood, falling back to wide-establish."""
    return MOTION_PRESETS.get(mood, MOTION_PRESETS["wide-establish"])
