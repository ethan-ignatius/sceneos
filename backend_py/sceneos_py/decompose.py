"""
Prompt-decomposition service. One-shot Gemini call that produces a
Higgsfield-ready clip prompt for every beat. Falls back to a deterministic
stub when no Vertex client is configured.

Vertex Gemini is the only LLM SceneOS uses — Anthropic was removed.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from .genai_client import default_gemini_model_for, make_genai_client
from .motion_presets import MOTION_PRESETS


logger = logging.getLogger(__name__)


_ASPECT_BY_VIDEO_TYPE = {"trailer": "16:9", "feature": "16:9", "short": "9:16"}
_DEFAULT_MODEL = "higgsfield-ai/dop/standard"


# Mood cues live in motion_presets.MOTION_PRESETS; alias for back-compat.
_MOOD_CUES = MOTION_PRESETS


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


async def _gemini_continuity_bible(master_prompt: str, beats: list[dict]) -> str | None:
    """
    One-shot Gemini call to produce a cross-beat continuity bible.
    Returns None on any failure (caller falls back to a deterministic stub).

    The bible is consumed by the per-beat orchestrator + frontend to keep the
    protagonist, location, palette, and time-of-day consistent across the
    7-beat arc. Without it, beat 1 might be a sunlit market and beat 4 a
    midnight alley — same character, but the eye reads them as different
    films. Gemini 2.5 Pro is good at this kind of structured-prose synthesis.
    """
    client = make_genai_client()
    if client is None:
        return None
    beat_summaries = "\n".join(
        f"  {i + 1}. {b['beatName']} — intent: {b['archetype']['intent']} "
        f"(mood: {b['archetype']['mood']})"
        for i, b in enumerate(beats)
    )
    user = (
        f"Master prompt: {master_prompt}\n\n"
        f"Beat arc:\n{beat_summaries}\n\n"
        "Write a CONTINUITY BIBLE in 4-6 short sentences (≤ 600 chars total). "
        "Lock the protagonist's appearance, the location's signature feature, "
        "the time-of-day arc, and the palette. Cinematic register; no bullet "
        "points; no preamble. This bible is read by every beat's image-prompt "
        "step, so be specific enough to constrain image generation."
    )

    def _call_sync() -> Any:
        from google.genai import types
        return client.models.generate_content(
            model=default_gemini_model_for("decompose"),
            contents=[{"role": "user", "parts": [{"text": user}]}],
            config=types.GenerateContentConfig(temperature=0.7, max_output_tokens=400),
        )

    try:
        response = await asyncio.wait_for(asyncio.to_thread(_call_sync), timeout=20.0)
    except Exception as exc:
        logger.warning("[decompose.bible] Gemini call failed: %s", exc)
        return None
    text = getattr(response, "text", None)
    if not text:
        return None
    return text.strip()[:1200]


def stub_decomposition(params: dict, bible: str | None = None) -> dict:
    aspect = _ASPECT_BY_VIDEO_TYPE.get(params["videoType"], "16:9")
    return {
        "continuityBible": bible or (
            "Reuse the master-prompt subject across beats. "
            "Lock palette, time-of-day, and protagonist appearance to maintain "
            "cross-beat continuity."
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
    client = make_genai_client()
    if client is None:
        # No Vertex client → deterministic stub for the clip prompts. Mood
        # presets are good enough to keep the canvas usable in dev without
        # creds, and there's no second LLM to reach for.
        bible = await _gemini_continuity_bible(params["masterPrompt"], params["beats"])
        return stub_decomposition(params, bible=bible)

    aspect_ratio = _ASPECT_BY_VIDEO_TYPE.get(params["videoType"], "16:9")
    n = len(params["beats"])

    # Gemini function-call schema. Matches the previous Anthropic input_schema
    # one-for-one; google.genai accepts the same JSON Schema vocabulary.
    from google.genai import types

    emit_clips_tool = types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="emit_clips",
                description="Emit one Higgsfield-ready clip per input beat, in the same order, with matching beatIds.",
                parameters=types.Schema(
                    type="OBJECT",
                    required=["clips"],
                    properties={
                        "continuityBible": types.Schema(type="STRING"),
                        "clips": types.Schema(
                            type="ARRAY",
                            min_items=n,
                            max_items=n,
                            items=types.Schema(
                                type="OBJECT",
                                required=["beatId", "sceneSummary", "refinedPrompt", "clipPrompt"],
                                properties={
                                    "beatId": types.Schema(type="STRING"),
                                    "sceneSummary": types.Schema(type="STRING"),
                                    "refinedPrompt": types.Schema(type="STRING"),
                                    "clipPrompt": types.Schema(
                                        type="OBJECT",
                                        required=[
                                            "imagePrompt",
                                            "motionPrompt",
                                            "aspectRatio",
                                            "resolution",
                                            "durationSeconds",
                                            "preferredModel",
                                        ],
                                        properties={
                                            "imagePrompt": types.Schema(type="STRING"),
                                            "motionPrompt": types.Schema(type="STRING"),
                                            "aspectRatio": types.Schema(
                                                type="STRING", enum=["16:9", "9:16", "1:1"]
                                            ),
                                            "resolution": types.Schema(
                                                type="STRING", enum=["720p", "1080p"]
                                            ),
                                            "durationSeconds": types.Schema(type="NUMBER"),
                                            "preferredModel": types.Schema(type="STRING"),
                                        },
                                    ),
                                },
                            ),
                        ),
                    },
                ),
            )
        ]
    )

    config = types.GenerateContentConfig(
        system_instruction=_SYSTEM_PROMPT,
        tools=[emit_clips_tool],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode="ANY",
                allowed_function_names=["emit_clips"],
            ),
        ),
        max_output_tokens=8192,
        temperature=0.6,
    )

    user_prompt = _build_user_prompt(params, aspect_ratio)

    def _call_sync() -> Any:
        return client.models.generate_content(
            model=default_gemini_model_for("decompose"),
            contents=[{"role": "user", "parts": [{"text": user_prompt}]}],
            config=config,
        )

    response = await asyncio.to_thread(_call_sync)

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        logger.warning("[decompose] Gemini returned no candidates; using stub.")
        bible = await _gemini_continuity_bible(params["masterPrompt"], params["beats"])
        return stub_decomposition(params, bible=bible)
    parts = getattr(candidates[0].content, "parts", None) or []
    fc = next(
        (getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)),
        None,
    )
    if fc is None:
        raise RuntimeError(
            f"decompose_master_prompt: Gemini did not call emit_clips "
            f"(finish_reason={getattr(candidates[0], 'finish_reason', '?')})"
        )
    args = fc.args
    raw = dict(args) if hasattr(args, "__iter__") else json.loads(json.dumps(args))
    out = _ensure_coverage(raw, params)
    # Bible is optional in the emit_clips tool schema, and Gemini sometimes
    # ships clips-only. If we didn't get one, do a lightweight follow-up
    # call to fill it in — the canvas + orchestrator both consume it for
    # cross-beat continuity, so an empty bible is a regression worth
    # eating one extra LLM call for.
    if not out.get("continuityBible"):
        bible = await _gemini_continuity_bible(params["masterPrompt"], params["beats"])
        if bible:
            out["continuityBible"] = bible
    return out
