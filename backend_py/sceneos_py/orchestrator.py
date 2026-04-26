"""
Deterministic per-beat orchestration. Module C in STATE.md.

Reads `beatFacts` (the structured handoff from the agent's markSufficient call)
and dispatches everything downstream WITHOUT an LLM in the loop:

  1. Motion preset lookup (mood → preset table)
  2. chainFromPrevious decision (from manifest)
  3. Reference images: project-level multi-keyframe sets (character +
     location, 3 variants each). Generated once per project at session
     start (see session.py / vertex_imagen.generate_project_keyframes)
     and passed in here as `project_keyframes`. Each beat picks the
     keyframe that best matches its framing intent — wide beats grab
     the location wide-shot, intimate beats grab the character front
     portrait, kinetic beats grab the action stance. The protagonist's
     identity stays locked across all 7 beats; the framing changes.
  4. Movie-plan ingestion: when the manifest carries a `moviePlan`
     (the holistic story coordinator from movie_plan.py), the
     orchestrator feeds beat-specific motif + character-arc beats into
     the clip prompt so each generation honors the global story.
  5. clipPrompt composition (image prompt + motion prompt)
  6. Provider.generate() submission, with startImageUrl seeded from
     keyframe → previous beat's lastFrameUrl → fresh per-beat ref.

The point of the boundary: the agent decides the *story*, the orchestrator
executes the *production*. Reliability lives here. No silent stubs — when
a ref is `degraded` or `stub`, the orchestrator falls back to chaining or
a hard-cut. Old code path silently fed sample.jpg to Veo I2V and produced
nonsense; that path is gone.

Demo mode: when a session was started via /api/session/start with mode=demo,
all 7 beats were already kicked off speculatively at T=0 using curated
beatFacts (see session.py) and the SHARED keyframe set. The agent
conversation runs in parallel as theatre. When the frontend hits
/api/orchestrate after markSufficient, we return the existing speculative
job — NO new work is done.
"""
from __future__ import annotations

import asyncio
from typing import Any

from . import vertex_imagen
from .motion_presets import pick_motion_preset
from .provider import dispatch_with_fallback, encode_job_id, poll_after_ms_for


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


# ── Movie-plan integration ─────────────────────────────────────────────────


def _movie_plan_for_beat(manifest: dict, beat: dict) -> dict:
    """Pull the per-beat slice of the movie plan, if one is stamped on the
    manifest. Returns an empty dict when there's no plan — every caller
    must accept the no-plan path so movie-plan is opt-in.
    """
    plan = manifest.get("moviePlan") or {}
    beats = plan.get("beats") or []
    for entry in beats:
        if entry.get("beatId") == beat.get("beatId") or entry.get("template") == beat.get("template"):
            return entry
    return {}


def _movie_plan_motif(manifest: dict) -> str:
    """The global visual motif from the movie plan, if present."""
    plan = manifest.get("moviePlan") or {}
    return (plan.get("visualMotif") or "").strip()


# ── Prompt composition ────────────────────────────────────────────────────


def compose_clip_prompt(beat: dict, beat_facts: dict, motion_preset: dict, aspect_ratio: str = "16:9", manifest: dict | None = None) -> dict:
    archetype = beat.get("archetype", {})
    duration = int(archetype.get("suggestedDuration", 5))

    subject = beat_facts.get("subject") or "the protagonist"
    action = beat_facts.get("action") or archetype.get("intent", "")
    setting = beat_facts.get("setting") or "the established location"
    mood = beat_facts.get("mood") or archetype.get("mood", "cinematic")
    framing = beat_facts.get("framing") or motion_preset.get("composition", "")
    character = beat_facts.get("characterDescription") or ""
    location = beat_facts.get("locationDescription") or ""
    voice_line = (beat_facts.get("voiceLine") or "").strip()
    caption_line = (beat_facts.get("captionLine") or "").strip()

    # Movie plan (if stamped) injects global motif + per-beat continuity
    # cues. This is what makes seven independently-generated clips feel
    # like one movie instead of seven postcards.
    plan_beat = _movie_plan_for_beat(manifest or {}, beat) if manifest else {}
    motif = _movie_plan_motif(manifest or {}) if manifest else ""
    plan_continuity = (plan_beat.get("visualContinuity") or "").strip()
    plan_emotional_state = (plan_beat.get("emotionalState") or "").strip()

    image_prompt_parts = [
        f"Cinematic still of {subject} {action}.",
        f"Setting: {setting}.",
        f"{motion_preset['lighting']}; {motion_preset['lens']};",
        f"{motion_preset['composition']}; {motion_preset['atmosphere']}.",
        f"Mood: {mood}.",
        "35mm film grain, shallow depth of field.",
    ]
    if motif:
        image_prompt_parts.append(f"Visual motif (carry through every beat): {motif}.")
    if plan_continuity:
        image_prompt_parts.append(f"Continuity cue: {plan_continuity}.")
    if character:
        image_prompt_parts.append(f"Character: {character}.")
    if location:
        image_prompt_parts.append(f"Location detail: {location}.")
    image_prompt = " ".join(image_prompt_parts).strip()

    motion_prompt_parts = [
        f"{motion_preset['cameraMove']}, {motion_preset['pace']}.",
        f"Subject motion supports the {mood} mood.",
        f"Atmosphere: {motion_preset['atmosphere']}.",
        f"Framing: {framing}.",
    ]
    if plan_emotional_state:
        motion_prompt_parts.append(f"Emotional register: {plan_emotional_state}.")
    motion_prompt = " ".join(motion_prompt_parts).strip()

    return {
        "imagePrompt": image_prompt,
        "motionPrompt": motion_prompt,
        # voiceLine + captionLine ride along on the clipPrompt so:
        # 1. vertex_veo.generate() can append the dialogue to the prompt
        #    (Veo 3 will lip-sync it natively when it sounds like dialogue,
        #    or generate matching ambient audio when it reads as VO).
        # 2. The post-stitch step uses the same line for narration TTS +
        #    on-screen captions, so the audio + captions match what's
        #    embedded in the clip.
        "voiceLine": voice_line,
        "captionLine": caption_line,
        "aspectRatio": aspect_ratio,
        "resolution": "1080p",
        "durationSeconds": duration,
        "preferredModel": "veo-3.1-generate-001",
    }


# ── Pipeline entry point ──────────────────────────────────────────────────


def _ref_is_real(ref: dict | None) -> bool:
    """A ref is "real" if it has an imageUrl AND no stub/degraded flag.

    Stub refs (no GCP creds) and degraded refs (Imagen safety, upload
    failure) MUST NOT be fed to Veo I2V — Veo will dutifully animate
    sample.jpg into nonsense, which is the silent-failure mode the user
    flagged. Use chaining or a fresh ref instead.
    """
    if not ref:
        return False
    if ref.get("stub") or ref.get("degraded"):
        return False
    return bool(ref.get("imageUrl"))


def _pick_seed_for_framing(framing: str | None, project_refs: dict | None) -> tuple[dict | None, dict | None, str | None]:
    """Single-ref seed picker — back-compat path. See _pick_keyframe_seed
    for the multi-keyframe path (preferred).

    Returns (character_ref, location_ref, seed_image_url).
    """
    refs = project_refs or {}
    char = refs.get("character") if _ref_is_real(refs.get("character")) else None
    loc = refs.get("location") if _ref_is_real(refs.get("location")) else None
    f = (framing or "").lower()
    prefer_location = any(kw in f for kw in ("wide", "establish", "static", "locked off", "locked-off", "24mm", "god view", "pull-back", "pull back"))
    if prefer_location and loc:
        return char, loc, loc.get("imageUrl")
    if char:
        return char, loc, char.get("imageUrl")
    if loc:
        return char, loc, loc.get("imageUrl")
    return char, loc, None


def _pick_keyframe_seed(
    *,
    framing: str | None,
    mood: str | None,
    project_keyframes: dict | None,
) -> tuple[dict | None, dict | None, str | None, list[dict], list[dict]]:
    """Multi-keyframe seed picker.

    Returns (character_ref, location_ref, seed_image_url, character_set, location_set).
    `character_set` and `location_set` are the FULL keyframe arrays for the
    visualizer — every beat's response surfaces all variants so the UI can
    show "this beat used the [profile] character + [wide] location" context.
    """
    if not project_keyframes:
        return None, None, None, [], []

    character_set = project_keyframes.get("character") or []
    location_set = project_keyframes.get("location") or []

    f = (framing or "").lower()
    prefer_location = any(kw in f for kw in (
        "wide", "establish", "static", "locked off", "locked-off",
        "24mm", "god view", "pull-back", "pull back", "vista",
    ))

    char_pick = vertex_imagen.pick_keyframe_for_framing(refs=character_set, framing=framing, mood=mood)
    loc_pick = vertex_imagen.pick_keyframe_for_framing(refs=location_set, framing=framing, mood=mood)

    seed = None
    if prefer_location and _ref_is_real(loc_pick):
        seed = loc_pick.get("imageUrl")
    elif _ref_is_real(char_pick):
        seed = char_pick.get("imageUrl")
    elif _ref_is_real(loc_pick):
        seed = loc_pick.get("imageUrl")

    return char_pick, loc_pick, seed, character_set, location_set


async def run_beat_pipeline(
    *,
    manifest: dict,
    beat_id: str,
    beat_facts: dict,
    previous_last_frame_url: str | None = None,
    aspect_ratio: str = "16:9",
    project_refs: dict | None = None,
    project_keyframes: dict | None = None,
) -> dict:
    """
    Orchestrate one beat from beatFacts → submitted video job.

    Args:
      project_refs: legacy single-keyframe shape {character, location}.
      project_keyframes: new multi-keyframe shape {character: [...], location: [...]}.
        When present, takes priority over project_refs. Each beat picks the
        keyframe that best matches its framing intent.

    Returns: see implementation. Adds `keyframeSets`, `selectedKeyframe`
    fields when project_keyframes was used.
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
    shared_refs = False
    character_set: list[dict] = []
    location_set: list[dict] = []

    # Priority order for the I2V seed:
    #   1. Project-level keyframes (multi-variant, framing-aware). NEW.
    #   2. Project-level single refs (legacy back-compat).
    #   3. Previous beat's lastFrameUrl (chain — narrative continuity).
    #   4. Fresh per-beat Imagen (fallback when neither exists).
    #
    # We deliberately put project-level refs above chaining: a 5s clip that
    # picks up from the previous frame but doesn't show the same character
    # + world is a worse failure mode than a hard cut between beats.

    if project_keyframes and (project_keyframes.get("character") or project_keyframes.get("location")):
        character_ref, location_ref, seed_image_url, character_set, location_set = _pick_keyframe_seed(
            framing=beat_facts.get("framing") or motion_preset.get("composition"),
            mood=mood,
            project_keyframes=project_keyframes,
        )
        shared_refs = bool(seed_image_url)
    elif project_refs and (project_refs.get("character") or project_refs.get("location")):
        character_ref, location_ref, seed_image_url = _pick_seed_for_framing(
            beat_facts.get("framing") or motion_preset.get("composition"),
            project_refs,
        )
        shared_refs = bool(seed_image_url)

    if not seed_image_url and chain:
        # Fall back to chaining if project refs failed to produce a real
        # seed. This is the "degraded refs → use last frame" path.
        seed_image_url = previous_last_frame_url

    if not seed_image_url and not chain:
        # Last-resort fallback: no project refs, no chain. Generate per-beat
        # refs concurrently. Older callers (tests, ad-hoc /api/orchestrate
        # without /api/session/start) take this path.
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
                    continue
                if kind == "character":
                    character_ref = ref
                elif kind == "location":
                    location_ref = ref
        # Only feed real (non-stub, non-degraded) refs to Veo.
        seed_image_url = (
            (character_ref.get("imageUrl") if _ref_is_real(character_ref) else None)
            or (location_ref.get("imageUrl") if _ref_is_real(location_ref) else None)
        )

    clip_prompt = compose_clip_prompt(beat, beat_facts, motion_preset, aspect_ratio, manifest=manifest)
    refined_prompt = f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"

    scenes = beat.get("scenes") or []
    scene_id = (scenes[0] or {}).get("sceneId") if scenes else None
    if not scene_id:
        scene_id = f"{beat_id}-scene-1"

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

    # Live-demo safety net: if the active provider rejects the request
    # (quota, network, safety), auto-fall-back to the cached tier and
    # surface fallbackReason to the frontend so the visualizer can show
    # a clean "Veo unavailable, replaying baked clip" badge instead of
    # a hard error.
    provider_name, result, original_provider, fallback_reason = (
        await dispatch_with_fallback(gen_params)
    )
    provider_job_id = result["jobId"]

    response = {
        "sceneId": scene_id,
        "jobId": encode_job_id(provider_name, provider_job_id),
        "provider": provider_name,
        "pollAfterMs": poll_after_ms_for(provider_name),
        "chainFromPrevious": chain,
        "seedImageUrl": seed_image_url,
        "characterRef": character_ref,
        "locationRef": location_ref,
        "sharedRefs": shared_refs,
        "motionPreset": motion_preset,
        "clipPrompt": clip_prompt,
        "refinedPrompt": refined_prompt,
    }
    if character_set or location_set:
        response["keyframeSets"] = {
            "character": character_set,
            "location": location_set,
        }
        response["selectedKeyframe"] = {
            "character": character_ref.get("variant") if character_ref else None,
            "location": location_ref.get("variant") if location_ref else None,
        }
    if original_provider:
        response["originalProvider"] = original_provider
        response["fallbackReason"] = fallback_reason
    return response
