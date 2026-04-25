"""
Prompt-decomposition service. One-shot LLM call that produces a Higgsfield-ready
clip prompt for every beat. Falls back to a deterministic stub when no Claude
client is configured (no ANTHROPIC_API_KEY and no Vertex SA).

Mirrors backend/src/services/prompt-decomposer.ts.
"""
from __future__ import annotations

import json
from typing import Any

from .anthropic_client import default_model_for, make_claude_client


_ASPECT_BY_VIDEO_TYPE = {"trailer": "16:9", "feature": "16:9", "short": "9:16"}
_DEFAULT_MODEL = "higgsfield-ai/dop/standard"


_MOOD_CUES: dict[str, dict[str, str]] = {
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


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")


def _stub_clip_for_beat(master_prompt: str, beat: dict, aspect_ratio: str) -> dict:
    mood = beat["archetype"]["mood"]
    cue = _MOOD_CUES.get(mood, _MOOD_CUES["wide-establish"])
    image_prompt = (
        f"Cinematic still — {beat['beatName'].lower()} beat of: {master_prompt}. "
        f"{beat['archetype']['intent']} "
        f"{cue['lighting']}, {cue['lens']}, shallow depth of field, 35mm film grain, "
        f"composition: {cue['composition']}."
    )
    motion_prompt = (
        f"{cue['cameraMove']}, {cue['pace']}. "
        f"Subject motion supports the {mood} mood. "
        f"Atmosphere: {cue['atmosphere']}."
    )
    clip_prompt = {
        "imagePrompt": image_prompt,
        "motionPrompt": motion_prompt,
        "aspectRatio": aspect_ratio,
        "resolution": "1080p",
        "durationSeconds": beat["archetype"]["suggestedDuration"],
        "preferredModel": _DEFAULT_MODEL,
    }
    return {
        "beatId": beat["beatId"],
        "sceneSummary": f"{beat['beatName']}: {_truncate(beat['archetype']['intent'], 110)}",
        "refinedPrompt": f"{image_prompt} {motion_prompt}",
        "clipPrompt": clip_prompt,
    }


def stub_decomposition(params: dict) -> dict:
    aspect = _ASPECT_BY_VIDEO_TYPE.get(params["videoType"], "16:9")
    return {
        "continuityBible": (
            "Stub bible (no ANTHROPIC_API_KEY). "
            "Reuse master-prompt subject across beats for continuity."
        ),
        "clips": [
            _stub_clip_for_beat(params["masterPrompt"], beat, aspect)
            for beat in params["beats"]
        ],
    }


# Backwards-compat alias for internal callers.
_stub_decomposition = stub_decomposition


_SYSTEM_PROMPT = "\n".join(
    [
        "You are SceneOS's director — an AI cinematographer that turns a non-expert's idea",
        "into a beat-by-beat shot list ready for the Higgsfield video API.",
        "",
        "For each beat in the BEATS list, you must emit ONE clip with:",
        "  • imagePrompt    — a self-contained text-to-image prompt for the beat's keyframe",
        "  • motionPrompt   — a self-contained image-to-video motion prompt",
        "  • durationSeconds — honor the beat's suggestedDuration",
        "  • aspectRatio    — use the value provided in DEFAULT_ASPECT",
        "  • resolution     — '1080p' unless social",
        "  • preferredModel — 'higgsfield-ai/dop/standard' by default",
        "",
        "Hard rules:",
        "  • Return exactly one clip per beat, IN THE ORDER PROVIDED, beatId matching.",
        "  • Carry character + world descriptors verbatim across beats.",
        "  • Each motionPrompt must specify a camera movement and a pace word.",
        "",
        "Always call the `emit_clips` tool exactly once.",
    ]
)


def _build_user_prompt(params: dict, aspect_ratio: str) -> str:
    beats_block = "\n\n".join(
        "\n".join(
            [
                f"{i + 1}. beatId: {b['beatId']}",
                f"   template: {b['template']}",
                f"   beatName: {b['beatName']}",
                f"   intent:   {b['archetype']['intent']}",
                f"   mood:     {b['archetype']['mood']}",
                f"   suggestedDuration: {b['archetype']['suggestedDuration']}s",
            ]
        )
        for i, b in enumerate(params["beats"])
    )
    return "\n".join(
        [
            f"MASTER_PROMPT: {params['masterPrompt']}",
            f"VIDEO_TYPE:    {params['videoType']}",
            f"DEFAULT_ASPECT: {aspect_ratio}",
            "",
            "BEATS (return one clip per beat, in order, with matching beatIds):",
            "",
            beats_block,
        ]
    )


def _ensure_coverage(resp: dict, params: dict) -> dict:
    by_id = {c["beatId"]: c for c in resp.get("clips", [])}
    aspect = _ASPECT_BY_VIDEO_TYPE.get(params["videoType"], "16:9")
    clips = []
    for beat in params["beats"]:
        found = by_id.get(beat["beatId"])
        clips.append(found if found else _stub_clip_for_beat(params["masterPrompt"], beat, aspect))
    return {"clips": clips, "continuityBible": resp.get("continuityBible")}


async def decompose_master_prompt(params: dict) -> dict:
    client = make_claude_client()
    if client is None:
        return stub_decomposition(params)

    aspect_ratio = _ASPECT_BY_VIDEO_TYPE.get(params["videoType"], "16:9")
    n = len(params["beats"])

    tool: dict[str, Any] = {
        "name": "emit_clips",
        "description": "Emit one Higgsfield-ready clip per input beat, in the same order, with matching beatIds.",
        "input_schema": {
            "type": "object",
            "required": ["clips"],
            "properties": {
                "continuityBible": {"type": "string"},
                "clips": {
                    "type": "array",
                    "minItems": n,
                    "maxItems": n,
                    "items": {
                        "type": "object",
                        "required": ["beatId", "sceneSummary", "refinedPrompt", "clipPrompt"],
                        "properties": {
                            "beatId": {"type": "string"},
                            "sceneSummary": {"type": "string"},
                            "refinedPrompt": {"type": "string"},
                            "clipPrompt": {
                                "type": "object",
                                "required": [
                                    "imagePrompt",
                                    "motionPrompt",
                                    "aspectRatio",
                                    "resolution",
                                    "durationSeconds",
                                    "preferredModel",
                                ],
                                "properties": {
                                    "imagePrompt": {"type": "string"},
                                    "motionPrompt": {"type": "string"},
                                    "aspectRatio": {"type": "string", "enum": ["16:9", "9:16", "1:1"]},
                                    "resolution": {"type": "string", "enum": ["720p", "1080p"]},
                                    "durationSeconds": {"type": "number"},
                                    "preferredModel": {"type": "string"},
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    import asyncio

    def _call_sync() -> Any:
        return client.messages.create(
            model=default_model_for("decompose"),
            max_tokens=8192,
            system=_SYSTEM_PROMPT,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit_clips"},
            messages=[{"role": "user", "content": _build_user_prompt(params, aspect_ratio)}],
        )

    response = await asyncio.to_thread(_call_sync)

    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError(
            f"decompose_master_prompt: model did not call emit_clips (stop_reason={getattr(response, 'stop_reason', '?')})"
        )
    raw = dict(tool_use.input) if hasattr(tool_use, "input") else json.loads(json.dumps(tool_use))
    return _ensure_coverage(raw, params)
