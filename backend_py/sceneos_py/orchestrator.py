"""
Deterministic per-beat orchestration. Module C in STATE.md.

Reads `beatFacts` (the structured handoff from the agent's markSufficient call)
and dispatches everything downstream WITHOUT an LLM in the loop:

  1. Motion preset lookup (mood → preset table)
  2. chainFromPrevious decision (from manifest)
  3. Reference images (Imagen 3) when not chained or first beat
     — character + location are generated CONCURRENTLY via asyncio.gather
  4. clipPrompt composition (image prompt + motion prompt)
  5. Provider.generate() submission, with startImageUrl seeded from either
     the previous beat's lastFrameUrl OR the freshly generated character ref

The point of the boundary: the agent decides the *story*, the orchestrator
executes the *production*. Reliability lives here.

Demo mode: when a session was started via /api/session/start with mode=demo,
all 7 beats were already kicked off speculatively at T=0 using curated
beatFacts (see session.py). The agent conversation runs in parallel as
theatre. When the frontend hits /api/orchestrate after markSufficient, we
return the existing speculative job — NO new work is done.
"""
from __future__ import annotations

import asyncio
from typing import Any

from . import vertex_imagen
from .motion_presets import pick_motion_preset
from .provider import encode_job_id, get_provider, poll_after_ms_for


# ── Decisions ──────────────────────────────────────────────────────────────


def _beat_index(manifest: dict, beat: dict) -> int:
    return next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )


def _is_first_beat(manifest: dict, beat: dict) -> bool:
    return _beat_index(manifest, beat) == 0


def decide_chain(manifest: dict, beat: dict, previous_last_frame_url: str | None) -> bool:
    """First beat: never chain. Otherwise: chain unless explicitly disabled."""
    if _is_first_beat(manifest, beat):
        return False
    if not previous_last_frame_url:
        return False
    if beat.get("chainFromPrevious") is False:
        return False
    return True


# ── Prompt composition ────────────────────────────────────────────────────


def compose_clip_prompt(beat: dict, beat_facts: dict, motion_preset: dict, aspect_ratio: str = "16:9") -> dict:
    archetype = beat.get("archetype", {})
    duration = int(archetype.get("suggestedDuration", 5))

    subject = beat_facts.get("subject") or "the protagonist"
    action = beat_facts.get("action") or archetype.get("intent", "")
    setting = beat_facts.get("setting") or "the established location"
    mood = beat_facts.get("mood") or archetype.get("mood", "cinematic")
    framing = beat_facts.get("framing") or motion_preset.get("composition", "")
    character = beat_facts.get("characterDescription") or ""
    location = beat_facts.get("locationDescription") or ""

    image_prompt = (
        f"Cinematic still of {subject} {action}. Setting: {setting}. "
        f"{motion_preset['lighting']}; {motion_preset['lens']}; "
        f"{motion_preset['composition']}; {motion_preset['atmosphere']}. "
        f"Mood: {mood}. 35mm film grain, shallow depth of field. "
        + (f"Character: {character}. " if character else "")
        + (f"Location detail: {location}." if location else "")
    ).strip()
    motion_prompt = (
        f"{motion_preset['cameraMove']}, {motion_preset['pace']}. "
        f"Subject motion supports the {mood} mood. "
        f"Atmosphere: {motion_preset['atmosphere']}. "
        f"Framing: {framing}."
    ).strip()
    return {
        "imagePrompt": image_prompt,
        "motionPrompt": motion_prompt,
        "aspectRatio": aspect_ratio,
        "resolution": "1080p",
        "durationSeconds": duration,
        "preferredModel": "higgsfield-ai/dop/standard",
    }


# ── Pipeline entry point ──────────────────────────────────────────────────


async def run_beat_pipeline(
    *,
    manifest: dict,
    beat_id: str,
    beat_facts: dict,
    previous_last_frame_url: str | None = None,
    aspect_ratio: str = "16:9",
) -> dict:
    """
    Orchestrate one beat from beatFacts → submitted video job.

    Returns:
      {
        sceneId, jobId, provider, pollAfterMs,
        chainFromPrevious: bool,
        seedImageUrl: str | None,
        characterRef: { imageUrl, publicId, kind, prompt } | None,
        locationRef:  { imageUrl, publicId, kind, prompt } | None,
        motionPreset: { ... },
        clipPrompt:   { imagePrompt, motionPrompt, ... },
        refinedPrompt: str,
      }
    """
    beat = next((b for b in manifest["beats"] if b["beatId"] == beat_id), None)
    if beat is None:
        raise ValueError(f"orchestrator: beatId not found ({beat_id})")

    mood = beat_facts.get("mood") or beat.get("archetype", {}).get("mood", "cinematic")
    motion_preset = pick_motion_preset(mood)
    chain = decide_chain(manifest, beat, previous_last_frame_url)

    character_ref: dict | None = None
    location_ref: dict | None = None
    seed_image_url: str | None = None

    if chain:
        seed_image_url = previous_last_frame_url
    else:
        # First beat or hard cut — generate fresh reference frames.
        # Run character + location concurrently. Imagen is ~3-6s per call;
        # parallelizing halves the per-beat cost. In demo mode, all 7 beats
        # also run in parallel (kickoff_speculative_pipelines), so total
        # Imagen wallclock is ~5-8s for 14 calls instead of ~70-100s serial.
        coros = []
        kinds = []
        if beat_facts.get("characterDescription"):
            kinds.append("character")
            coros.append(vertex_imagen.generate_reference(
                kind="character",
                description=beat_facts["characterDescription"],
                project_id=manifest.get("projectId"),
                beat_id=beat_id,
                aspect_ratio=aspect_ratio,
            ))
        if beat_facts.get("locationDescription"):
            kinds.append("location")
            coros.append(vertex_imagen.generate_reference(
                kind="location",
                description=beat_facts["locationDescription"],
                project_id=manifest.get("projectId"),
                beat_id=beat_id,
                aspect_ratio=aspect_ratio,
            ))
        if coros:
            results = await asyncio.gather(*coros, return_exceptions=True)
            for kind, ref in zip(kinds, results):
                if isinstance(ref, Exception):
                    # Don't tear down the whole pipeline if one ref fails —
                    # the other ref or the chain seed can carry the I2V step.
                    continue
                if kind == "character":
                    character_ref = ref
                elif kind == "location":
                    location_ref = ref
        # Prefer the character reference as the I2V seed for character continuity;
        # fall back to the location ref if no character was described.
        seed_image_url = (character_ref or {}).get("imageUrl") or (location_ref or {}).get("imageUrl")

    clip_prompt = compose_clip_prompt(beat, beat_facts, motion_preset, aspect_ratio)
    refined_prompt = f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"

    scenes = beat.get("scenes") or []
    scene_id = (scenes[0] or {}).get("sceneId") if scenes else None
    if not scene_id:
        scene_id = f"{beat_id}-scene-1"

    provider_name, provider_impl = get_provider()
    gen_params: dict[str, Any] = {
        "projectId": manifest.get("projectId"),
        "beatId": beat_id,
        "sceneId": scene_id,
        "refinedPrompt": refined_prompt,
        "durationSeconds": clip_prompt["durationSeconds"],
        "clipPrompt": clip_prompt,
        "beatTemplate": beat.get("template"),
    }
    if seed_image_url:
        gen_params["startImageUrl"] = seed_image_url

    result = await provider_impl.generate(gen_params)
    provider_job_id = result["jobId"]

    return {
        "sceneId": scene_id,
        "jobId": encode_job_id(provider_name, provider_job_id),
        "provider": provider_name,
        "pollAfterMs": poll_after_ms_for(provider_name),
        "chainFromPrevious": chain,
        "seedImageUrl": seed_image_url,
        "characterRef": character_ref,
        "locationRef": location_ref,
        "motionPreset": motion_preset,
        "clipPrompt": clip_prompt,
        "refinedPrompt": refined_prompt,
    }
