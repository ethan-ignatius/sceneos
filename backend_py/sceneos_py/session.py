"""
Session manager. The mode-aware boot sequence.

Two modes:
- normal: agent fully drives. orchestrator runs per beat after markSufficient.
          A single character + location reference image is generated lazily
          on first markSufficient and cached project-wide so the protagonist
          + world stay consistent across all 7 beats.
- demo:   speculative kickoff. all 7 beats start rendering at session-start
          using pre-curated beatFacts from demo_prompts.DEMO_PROMPTS, in
          parallel, while the agent conversation runs in parallel as
          theatre. when the agent calls markSufficient for a beat, the
          frontend hits /api/orchestrate which finds the speculative job
          and returns it immediately — no new work.

Continuity (BOTH modes): we generate ONE character ref + ONE location
ref per project. Every beat reuses those as the I2V seed. This is the
correctness anchor — without it, each beat regenerates its own ref and
the protagonist drifts beat-to-beat (the most-noticed-by-humans failure
mode). See vertex_imagen.generate_project_refs() and orchestrator
priority order.

Why pre-curated facts in demo mode? Two reasons:
  1. Wallclock budget. With demo prompts, refs + all video calls fire
     at T=0 and overlap. Even the slowest providers hit 2-3 minutes.
     Adding agent serialization on top would push past 4 minutes.
  2. Description quality. The shared character + location strings are
     hand-tuned for Imagen — agent-extracted strings in a
     1-question-per-beat speed-mode loop can't reliably match that bar.

The agent's actual `beatFacts` extraction in demo mode is preserved in
the manifest for diagnostics, but the canned facts are what drive the
pipeline.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Literal

from . import demo_prompts
from .beat_templates import SHORT, STORY, TRAILER, BeatTemplateDef
from .config import env, mock_mode


logger = logging.getLogger(__name__)


SessionMode = Literal["demo", "normal"]


# Hard ceiling on the speculative-kickoff phase of /api/session/start. Demo
# mode fans out 7 video submissions in parallel; in real mode each
# submission is a Veo predictLongRunning call (~3-10s each, so ~10s aggregate
# expected). 90s gives 9x headroom for slow auth + Imagen + 7 submits, and
# bounds the worst case so a hung provider can't strand the session/start
# request indefinitely.
_KICKOFF_TIMEOUT_SECONDS = 90


# In-memory store: { projectId → { beatId → speculative job dict } }
_SPECULATIVE: dict[str, dict[str, dict[str, Any]]] = {}

# In-memory store: { projectId → { mode, masterPrompt, videoType, createdAt, demoPromptId } }
_SESSIONS: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _templates_for(video_type: str) -> list[BeatTemplateDef]:
    return {"story": STORY, "trailer": TRAILER, "short": SHORT}.get(video_type, STORY)


def build_manifest(
    *,
    project_id: str,
    master_prompt: str,
    video_type: str,
    mode: SessionMode,
) -> dict:
    """Build a manifest with empty scenes ready for the agent loop."""
    tmpls = _templates_for(video_type)
    return {
        "projectId": project_id,
        "videoType": video_type,
        "masterPrompt": master_prompt,
        "mode": mode,  # NEW: read by agent.py + orchestrator.py + the visualizer
        "createdAt": _now_iso(),
        "beats": [
            {
                "beatId": f"beat-{i + 1}",
                "beatName": t["beatName"],
                "template": t["template"],
                "status": "questioning" if i == 0 else "pending",
                "archetype": {
                    "intent": t["intent"],
                    "mood": t["mood"],
                    "suggestedDuration": t["suggestedDuration"],
                    "directorNotes": t["directorNotes"],
                },
                "scenes": [
                    {
                        "sceneId": f"beat-{i + 1}-scene-1",
                        "conversation": [],
                        "approved": False,
                    }
                ],
            }
            for i, t in enumerate(tmpls)
        ],
    }


def get_session(project_id: str) -> dict | None:
    return _SESSIONS.get(project_id)


def get_speculative_job(project_id: str, beat_id: str) -> dict | None:
    return (_SPECULATIVE.get(project_id) or {}).get(beat_id)


def set_speculative_job(project_id: str, beat_id: str, job: dict) -> None:
    _SPECULATIVE.setdefault(project_id, {})[beat_id] = job


def all_speculative_jobs(project_id: str) -> dict[str, dict]:
    return dict(_SPECULATIVE.get(project_id) or {})


def reset_session(project_id: str) -> None:
    _SESSIONS.pop(project_id, None)
    _SPECULATIVE.pop(project_id, None)


# ── Speculative kickoff ───────────────────────────────────────────────────


async def _kickoff_one_beat(
    *,
    manifest: dict,
    beat: dict,
    canned_facts: dict,
    aspect_ratio: str,
    project_refs: dict | None = None,
    project_keyframes: dict | None = None,
) -> tuple[str, dict]:
    """Run the deterministic pipeline for one beat using canned facts.
    Used only on demo speculative kickoff. Always non-chained (no prior
    frame at T=0) so the 7 beats can fan out in parallel — but every
    beat reuses the SAME character + location project_keyframes as its
    I2V seed so the protagonist + world stay consistent across the cut.
    Each beat picks the keyframe variant best matching its framing.

    Returns (beatId, job_summary). Job_summary is the same shape returned
    by /api/orchestrate so the frontend has a single consumer."""
    from . import orchestrator

    try:
        result = await orchestrator.run_beat_pipeline(
            manifest=manifest,
            beat_id=beat["beatId"],
            beat_facts=canned_facts,
            previous_last_frame_url=None,  # parallel fan-out, no chain
            aspect_ratio=aspect_ratio,
            project_refs=project_refs,
            project_keyframes=project_keyframes,
        )
        result["speculative"] = True
        result["startedAt"] = _now_iso()
        return beat["beatId"], result
    except Exception as exc:
        logger.exception("[session] speculative kickoff failed for beat %s", beat["beatId"])
        return beat["beatId"], {
            "speculative": True,
            "error": str(exc),
            "beatId": beat["beatId"],
            "startedAt": _now_iso(),
        }


def _mock_speculative_job(beat: dict, canned_facts: dict, project_refs: dict | None = None) -> dict:
    """Mock-mode speculative job. Mirrors the live shape returned by
    orchestrator.run_beat_pipeline and the /api/orchestrate mock branch.
    Avoids any provider call so tests stay deterministic.

    `project_refs` is the SAME object shared across all 7 beats — that's
    what we need to assert in tests (same publicId per kind across every
    beat). When None, falls back to a per-beat synthetic ref so older
    callers still work."""
    from . import mock as mock_service
    from .motion_presets import pick_motion_preset
    from . import orchestrator as orch

    motion = pick_motion_preset(canned_facts.get("mood") or beat["archetype"]["mood"])
    clip_prompt = orch.compose_clip_prompt(beat, canned_facts, motion, "16:9")
    refined = f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"
    scenes = beat.get("scenes") or []
    scene_id = (scenes[0] or {}).get("sceneId") if scenes else f"{beat['beatId']}-scene-1"
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"

    if project_refs:
        character_ref = project_refs.get("character")
        location_ref = project_refs.get("location")
    else:
        character_ref = {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg",
            "publicId": f"speculative::character-{beat['beatId']}",
            "kind": "character",
            "prompt": "[mock] cinematic character reference",
        }
        location_ref = {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/couple.jpg",
            "publicId": f"speculative::location-{beat['beatId']}",
            "kind": "location",
            "prompt": "[mock] cinematic location reference",
        }

    # Mirror the orchestrator's framing-based seed pick so the visualizer
    # shows the same "wide → location, close → character" routing in mock
    # mode that real mode produces.
    framing = (canned_facts.get("framing") or motion.get("composition") or "").lower()
    prefer_location = any(kw in framing for kw in ("wide", "establish", "static", "locked off", "locked-off", "24mm", "god view", "pull-back", "pull back"))
    seed = None
    if prefer_location and location_ref:
        seed = location_ref["imageUrl"]
    elif character_ref:
        seed = character_ref["imageUrl"]
    elif location_ref:
        seed = location_ref["imageUrl"]

    return {
        "speculative": True,
        "startedAt": _now_iso(),
        "sceneId": scene_id,
        "jobId": mock_service.deterministic_job_id("mock", f"{beat['template']}-{scene_id}"),
        "provider": "cached",
        "pollAfterMs": 800,
        "chainFromPrevious": False,
        "seedImageUrl": seed,
        "characterRef": character_ref,
        "locationRef": location_ref,
        "sharedRefs": project_refs is not None,
        "motionPreset": motion,
        "clipPrompt": clip_prompt,
        "refinedPrompt": refined,
    }


def _shared_descriptions(facts_by_template: dict[str, dict]) -> tuple[str | None, str | None]:
    """Pull the shared character + location description from a curated demo
    prompt. The demo_prompts.py file uses the same string for every beat
    (see _MONKEY_CHAR / _LIGHTHOUSE_CHAR / _DRONE_CHAR), so any beat works
    as the source. We pick beat-1 by convention."""
    first = next(iter(facts_by_template.values()), {})
    return first.get("characterDescription"), first.get("locationDescription")


def _mock_project_refs(character_desc: str | None, location_desc: str | None) -> dict:
    """Mock single-keyframe project refs (back-compat shape).

    For the new multi-keyframe shape see `_mock_project_keyframes` below.
    The session stores both: keyframes is canonical, refs is derived (the
    `Primary` slot of each kind) for back-compat consumers.
    """
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
    refs: dict[str, dict | None] = {"character": None, "location": None}
    if character_desc:
        refs["character"] = {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg",
            "publicId": "shared::character",
            "kind": "character",
            "prompt": "[mock] shared cinematic character reference",
        }
    if location_desc:
        refs["location"] = {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/couple.jpg",
            "publicId": "shared::location",
            "kind": "location",
            "prompt": "[mock] shared cinematic location reference",
        }
    return refs


def _mock_project_keyframes(character_desc: str | None, location_desc: str | None) -> dict:
    """Mock multi-keyframe project refs.

    Mirrors the live `vertex_imagen.generate_project_keyframes` shape so
    tests + visualizer see the same structure in both modes. Each variant
    has its own publicId so the visualizer can render them as a strip.
    Real Imagen produces three different stills here; mock points all
    three at the same Cloudinary sample asset because we can't render
    new images, but the publicIds stay distinct and the variant field
    is populated."""
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
    char_url = f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg"
    loc_url = f"https://res.cloudinary.com/{cloud}/image/upload/couple.jpg"

    character: list[dict] = []
    if character_desc:
        from .vertex_imagen import KEYFRAME_VARIANTS
        for variant_id, variant_clause in KEYFRAME_VARIANTS["character"]:
            character.append({
                "imageUrl": char_url,
                "publicId": f"shared::character-{variant_id}",
                "kind": "character",
                "variant": variant_id,
                "prompt": f"[mock] {variant_clause}",
            })

    location: list[dict] = []
    if location_desc:
        from .vertex_imagen import KEYFRAME_VARIANTS
        for variant_id, variant_clause in KEYFRAME_VARIANTS["location"]:
            location.append({
                "imageUrl": loc_url,
                "publicId": f"shared::location-{variant_id}",
                "kind": "location",
                "variant": variant_id,
                "prompt": f"[mock] {variant_clause}",
            })

    return {
        "character": character,
        "location": location,
        "characterPrimary": character[0] if character else None,
        "locationPrimary": location[0] if location else None,
    }


def _refs_from_keyframes(keyframes: dict | None) -> dict:
    """Derive the back-compat single-ref shape from a keyframes dict.

    Picks the FIRST non-degraded variant per kind. Used so that callers
    expecting `projectRefs` (legacy shape) continue to work after we
    upgrade session to multi-keyframe storage.
    """
    if not keyframes:
        return {"character": None, "location": None}

    def _first_real(refs: list[dict] | None) -> dict | None:
        for ref in refs or []:
            if not ref.get("degraded") and not ref.get("stub") and ref.get("imageUrl"):
                return ref
        # Fall back to the first ref even if degraded — better to surface
        # something with a `degraded` flag than to silently null out.
        return (refs or [None])[0] if refs else None

    return {
        "character": keyframes.get("characterPrimary") or _first_real(keyframes.get("character")),
        "location": keyframes.get("locationPrimary") or _first_real(keyframes.get("location")),
    }


async def kickoff_speculative_pipelines(
    *,
    manifest: dict,
    demo_prompt: demo_prompts.DemoPromptDef,
    aspect_ratio: str = "16:9",
) -> tuple[dict[str, dict], dict, dict]:
    """
    Fire all 7 beat pipelines IN PARALLEL using the demo prompt's canned
    beatFacts and a SHARED multi-keyframe set (character + location, 3
    variants each).

    Returns (jobs_by_beat_id, project_refs, project_keyframes).
    `project_refs` is the back-compat single-ref shape; `project_keyframes`
    is the new multi-variant shape that the orchestrator prefers.

    Sequence:
      1. Generate keyframe sets via Imagen (3 character + 3 location, all
         in parallel — typically ~5-12s).
      2. Fan out 7 beat pipelines in parallel. Each beat picks the
         keyframe variant best matching its framing intent — wide beats
         grab the location wide-shot, intimate beats grab the character
         front portrait, kinetic beats grab the action stance.

    In mock mode we synthesize keyframes and the orchestrator results.
    """
    project_id = manifest["projectId"]
    facts_by_template = demo_prompt["beatFactsByTemplate"]
    character_desc, location_desc = _shared_descriptions(facts_by_template)

    if mock_mode():
        project_keyframes = _mock_project_keyframes(character_desc, location_desc)
        project_refs = _refs_from_keyframes(project_keyframes)
        results: dict[str, dict] = {}
        for beat in manifest["beats"]:
            canned = facts_by_template.get(beat["template"]) or {
                "subject": "the protagonist",
                "action": "the action of this beat",
                "setting": "the established location",
                "mood": beat["archetype"]["mood"],
            }
            job = _mock_speculative_job(beat, canned, project_refs)
            # Surface keyframe metadata in the mock job too, so the
            # visualizer behaves the same in mock + real mode.
            job["keyframeSets"] = {
                "character": project_keyframes.get("character") or [],
                "location": project_keyframes.get("location") or [],
            }
            set_speculative_job(project_id, beat["beatId"], job)
            results[beat["beatId"]] = job
        return results, project_refs, project_keyframes

    # Real mode: keyframes first, then beats. Multi-keyframe gen runs the
    # 6 Imagen calls (3 character + 3 location) in parallel, typically
    # ~10-15s end-to-end. Beats then fan out concurrently.
    from . import vertex_imagen
    project_keyframes = await vertex_imagen.generate_project_keyframes(
        project_id=project_id,
        character_description=character_desc,
        location_description=location_desc,
        aspect_ratio=aspect_ratio,
    )
    project_refs = _refs_from_keyframes(project_keyframes)

    tasks = []
    for beat in manifest["beats"]:
        canned = facts_by_template.get(beat["template"])
        if not canned:
            canned = {
                "subject": "the protagonist",
                "action": beat["archetype"]["intent"],
                "setting": "the established location",
                "framing": "cinematic",
                "mood": beat["archetype"]["mood"],
                "characterDescription": character_desc or "the protagonist as established",
                "locationDescription": location_desc or "the established setting",
            }
        tasks.append(_kickoff_one_beat(
            manifest=manifest,
            beat=beat,
            canned_facts=canned,
            aspect_ratio=aspect_ratio,
            project_refs=project_refs,
            project_keyframes=project_keyframes,
        ))

    pairs = await asyncio.gather(*tasks)
    results = {beat_id: job for beat_id, job in pairs}
    for beat_id, job in results.items():
        set_speculative_job(project_id, beat_id, job)
    return results, project_refs, project_keyframes


# ── Public entry: start_session ───────────────────────────────────────────


async def start_session(
    *,
    mode: SessionMode,
    master_prompt_override: str | None = None,
    prompt_id: str | None = None,
    aspect_ratio: str = "16:9",
) -> dict:
    """
    Start a new session.

    Returns:
      {
        projectId,
        mode,
        masterPrompt,
        videoType,
        manifest,
        speculativeJobs?: { beatId → orchestrator-result }   # demo only
      }
    """
    project_id = uuid.uuid4().hex[:12]

    if mode == "demo":
        demo = demo_prompts.pick_demo_prompt(prompt_id)
        master_prompt = master_prompt_override or demo["masterPrompt"]
        video_type = demo["videoType"]
        manifest = build_manifest(
            project_id=project_id,
            master_prompt=master_prompt,
            video_type=video_type,
            mode=mode,
        )
        # Stamp the static music_library fallback on the manifest. This is
        # diagnostic / optimistic — the stitch endpoint will OVERRIDE this
        # with a per-project Lyria 2 score when no explicit `body.audioPublicId`
        # is provided, because the static default is usually a placeholder
        # that points at an unuploaded asset.
        from . import audio as audio_service
        manifest["audioPublicId"] = audio_service.pick_music(video_type, mood="auto")

        # Movie plan generation: runs concurrently with speculative kickoff
        # in the gather() below. The plan is stamped on the manifest before
        # any agent turn fires so beat-1's first question already lives
        # inside the plan's voice + motif.
        beat_template_defs = [
            {
                "template": b["template"],
                "beatName": b["beatName"],
                "intent": b["archetype"]["intent"],
                "mood": b["archetype"]["mood"],
                "suggestedDuration": b["archetype"]["suggestedDuration"],
            }
            for b in manifest["beats"]
        ]
        from . import movie_plan as movie_plan_service

        _SESSIONS[project_id] = {
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "createdAt": _now_iso(),
            "manifest": manifest,
        }
        try:
            (speculative, project_refs, project_keyframes), plan = await asyncio.wait_for(
                asyncio.gather(
                    kickoff_speculative_pipelines(
                        manifest=manifest,
                        demo_prompt=demo,
                        aspect_ratio=aspect_ratio,
                    ),
                    movie_plan_service.generate_movie_plan(
                        master_prompt=master_prompt,
                        video_type=video_type,
                        beat_templates=beat_template_defs,
                    ),
                ),
                timeout=_KICKOFF_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            # Bound the worst case: return what we have (refs may be in
            # flight, beats may be partially submitted). The visualizer
            # gets a clean error per beat and the agent loop can still
            # run; subsequent /api/orchestrate calls will retry per beat.
            logger.warning(
                "[session] speculative kickoff timed out after %ss for project %s",
                _KICKOFF_TIMEOUT_SECONDS, project_id,
            )
            speculative = all_speculative_jobs(project_id)
            for beat in manifest["beats"]:
                speculative.setdefault(beat["beatId"], {
                    "speculative": True,
                    "beatId": beat["beatId"],
                    "error": "timeout",
                    "startedAt": _now_iso(),
                })
            project_refs = None
            project_keyframes = None
            plan = None

        # Stamp plan on the manifest itself so the agent + orchestrator
        # see it without needing a session lookup.
        if plan:
            manifest["moviePlan"] = plan
        # Cache refs + keyframes + plan on the session so /api/orchestrate
        # (when the agent eventually calls markSufficient) and any retries
        # pull from the same anchors.
        _SESSIONS[project_id]["projectRefs"] = project_refs
        _SESSIONS[project_id]["projectKeyframes"] = project_keyframes
        _SESSIONS[project_id]["moviePlan"] = plan
        return {
            "projectId": project_id,
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "manifest": manifest,
            "projectRefs": project_refs,
            "projectKeyframes": project_keyframes,
            "moviePlan": plan,
            "speculativeJobs": speculative,
        }

    # Normal mode — no speculation. Just pick a master prompt + return
    # an empty manifest. The agent loop then fills it in beat-by-beat.
    # Project refs are generated lazily on the first markSufficient call
    # that ships characterDescription / locationDescription (see
    # ensure_project_refs() below) and reused for every subsequent beat.
    #
    # Movie plan IS generated up front in normal mode too — it's cheap
    # (one LLM call ~5s) and the agent reads it from beat-1 onwards so
    # questions stay inside one coherent story instead of drifting
    # genre-by-genre across beats.
    nrm = demo_prompts.pick_normal_prompt(prompt_id)
    master_prompt = master_prompt_override or nrm["masterPrompt"]
    video_type = nrm["videoType"]
    manifest = build_manifest(
        project_id=project_id,
        master_prompt=master_prompt,
        video_type=video_type,
        mode=mode,
    )
    from . import audio as audio_service
    from . import movie_plan as movie_plan_service
    manifest["audioPublicId"] = audio_service.pick_music(video_type, mood="auto")

    beat_template_defs = [
        {
            "template": b["template"],
            "beatName": b["beatName"],
            "intent": b["archetype"]["intent"],
            "mood": b["archetype"]["mood"],
            "suggestedDuration": b["archetype"]["suggestedDuration"],
        }
        for b in manifest["beats"]
    ]
    try:
        plan = await asyncio.wait_for(
            movie_plan_service.generate_movie_plan(
                master_prompt=master_prompt,
                video_type=video_type,
                beat_templates=beat_template_defs,
            ),
            timeout=30.0,  # plan is on the critical path; bound it tight
        )
    except asyncio.TimeoutError:
        logger.warning("[session] movie plan timed out for normal-mode project %s", project_id)
        plan = None

    if plan:
        manifest["moviePlan"] = plan

    _SESSIONS[project_id] = {
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "createdAt": _now_iso(),
        "projectRefs": None,  # lazy
        "projectKeyframes": None,  # lazy
        "moviePlan": plan,
        "manifest": manifest,
    }
    return {
        "projectId": project_id,
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "manifest": manifest,
        "moviePlan": plan,
    }


# ── Lazy refs for normal mode ──────────────────────────────────────────────


async def ensure_project_refs(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = "16:9",
) -> dict | None:
    """Back-compat single-keyframe accessor. Prefer
    `ensure_project_keyframes` for new callers.

    Returns the back-compat shape `{character, location}` (single ref per
    kind) derived from the multi-keyframe set. Cached at the session level
    so subsequent beats reuse without re-calling Imagen.
    """
    keyframes = await ensure_project_keyframes(
        project_id=project_id,
        character_description=character_description,
        location_description=location_description,
        aspect_ratio=aspect_ratio,
    )
    if keyframes is None:
        return None
    return _refs_from_keyframes(keyframes)


async def ensure_project_keyframes(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = "16:9",
) -> dict | None:
    """
    Return cached multi-keyframe project refs, generating them on the
    first call that has descriptions to work from.

    Called by /api/orchestrate in normal mode: the FIRST beat's
    markSufficient lands character + location descriptions, and we
    generate the full keyframe set once. Subsequent beats reuse — same
    character variants, same location variants, every clip.

    Returns None if there's no project_id (ad-hoc orchestrate) or if
    neither description is provided AND no cached keyframes exist.
    """
    started = time.perf_counter()
    if not project_id:
        return None
    sess = _SESSIONS.get(project_id)
    if sess is None:
        # No session record. Generate ad-hoc, don't cache.
        if not (character_description or location_description):
            return None
        if mock_mode():
            return _mock_project_keyframes(character_description, location_description)
        from . import vertex_imagen
        keyframes = await vertex_imagen.generate_project_keyframes(
            project_id=project_id,
            character_description=character_description,
            location_description=location_description,
            aspect_ratio=aspect_ratio,
        )
        logger.info(
            "[session] keyframes generated ad-hoc project=%s ms=%s",
            project_id,
            int((time.perf_counter() - started) * 1000),
        )
        return keyframes

    cached = sess.get("projectKeyframes")
    if cached:
        logger.info(
            "[session] keyframes cache hit project=%s ms=%s",
            project_id,
            int((time.perf_counter() - started) * 1000),
        )
        return cached
    if not (character_description or location_description):
        return None

    if mock_mode():
        keyframes = _mock_project_keyframes(character_description, location_description)
    else:
        from . import vertex_imagen
        keyframes = await vertex_imagen.generate_project_keyframes(
            project_id=project_id,
            character_description=character_description,
            location_description=location_description,
            aspect_ratio=aspect_ratio,
        )
    sess["projectKeyframes"] = keyframes
    sess["projectRefs"] = _refs_from_keyframes(keyframes)
    sess["projectKeyframesMeta"] = {
        "generatedAt": _now_iso(),
        "durationMs": int((time.perf_counter() - started) * 1000),
        "characterProvided": bool(character_description),
        "locationProvided": bool(location_description),
    }
    logger.info(
        "[session] keyframes generated project=%s ms=%s character=%s location=%s",
        project_id,
        sess["projectKeyframesMeta"]["durationMs"],
        bool(character_description),
        bool(location_description),
    )
    return keyframes
