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
) -> tuple[str, dict]:
    """Run the deterministic pipeline for one beat using canned facts.
    Used only on demo speculative kickoff. Always non-chained (no prior
    frame at T=0) so the 7 beats can fan out in parallel — but every
    beat reuses the SAME character + location project_refs as its I2V
    seed so the protagonist + world stay consistent across the cut.

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
    """Mock project refs — same shape as vertex_imagen.generate_project_refs
    but synthesized without any provider call. Used in mock mode + tests."""
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


async def kickoff_speculative_pipelines(
    *,
    manifest: dict,
    demo_prompt: demo_prompts.DemoPromptDef,
    aspect_ratio: str = "16:9",
) -> tuple[dict[str, dict], dict]:
    """
    Fire all 7 beat pipelines IN PARALLEL using the demo prompt's canned
    beatFacts and a SHARED character + location ref.

    Returns (jobs_by_beat_id, project_refs).

    Sequence:
      1. Generate ONE character ref + ONE location ref via Imagen (parallel).
      2. Fan out 7 beat pipelines in parallel; every one uses the same
         project refs as its I2V seed. The variation comes from the
         per-beat clipPrompt + framing — the IDENTITY stays locked.

    In mock mode we synthesize both the refs and the orchestrator results.
    The /api/status mock branch then flips each job to succeeded on the
    second poll so the visualizer experience matches real mode.
    """
    project_id = manifest["projectId"]
    facts_by_template = demo_prompt["beatFactsByTemplate"]
    character_desc, location_desc = _shared_descriptions(facts_by_template)

    if mock_mode():
        project_refs = _mock_project_refs(character_desc, location_desc)
        results: dict[str, dict] = {}
        for beat in manifest["beats"]:
            canned = facts_by_template.get(beat["template"]) or {
                "subject": "the protagonist",
                "action": "the action of this beat",
                "setting": "the established location",
                "mood": beat["archetype"]["mood"],
            }
            job = _mock_speculative_job(beat, canned, project_refs)
            set_speculative_job(project_id, beat["beatId"], job)
            results[beat["beatId"]] = job
        return results, project_refs

    # Real mode: refs first, then beats. Refs typically take 5-10s; we
    # need the imageUrls before kicking off video gens that use them as
    # I2V seed. Beats then fan out concurrently.
    from . import vertex_imagen
    project_refs = await vertex_imagen.generate_project_refs(
        project_id=project_id,
        character_description=character_desc,
        location_description=location_desc,
        aspect_ratio=aspect_ratio,
    )

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
        ))

    pairs = await asyncio.gather(*tasks)
    results = {beat_id: job for beat_id, job in pairs}
    for beat_id, job in results.items():
        set_speculative_job(project_id, beat_id, job)
    return results, project_refs


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
        # Stamp the picked music + (eventually) audio narration on the
        # manifest. /api/stitch/url reads this when building the final
        # splice URL — l_audio: overlay is what makes it feel like a film.
        from . import audio as audio_service
        manifest["audioPublicId"] = audio_service.pick_music(video_type, mood="auto")
        _SESSIONS[project_id] = {
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "createdAt": _now_iso(),
        }
        speculative, project_refs = await kickoff_speculative_pipelines(
            manifest=manifest,
            demo_prompt=demo,
            aspect_ratio=aspect_ratio,
        )
        # Cache project refs on the session so /api/orchestrate (when the
        # agent eventually calls markSufficient) and any retries pull
        # from the same character + location anchor.
        _SESSIONS[project_id]["projectRefs"] = project_refs
        return {
            "projectId": project_id,
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "manifest": manifest,
            "projectRefs": project_refs,
            "speculativeJobs": speculative,
        }

    # Normal mode — no speculation. Just pick a master prompt + return
    # an empty manifest. The agent loop then fills it in beat-by-beat.
    # Project refs are generated lazily on the first markSufficient call
    # that ships characterDescription / locationDescription (see
    # ensure_project_refs() below) and reused for every subsequent beat.
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
    manifest["audioPublicId"] = audio_service.pick_music(video_type, mood="auto")
    _SESSIONS[project_id] = {
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "createdAt": _now_iso(),
        "projectRefs": None,  # lazy
    }
    return {
        "projectId": project_id,
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "manifest": manifest,
    }


# ── Lazy refs for normal mode ──────────────────────────────────────────────


async def ensure_project_refs(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = "16:9",
) -> dict | None:
    """
    Return cached project refs for `project_id`, generating them on the
    first call that has descriptions to work from.

    Called by /api/orchestrate in normal mode: the FIRST beat's
    markSufficient lands character + location descriptions, and we
    generate refs once. Subsequent beats reuse — same character, same
    world, every clip.

    Returns None if there's no project_id (ad-hoc orchestrate) or if
    neither description is provided AND no cached refs exist.
    """
    if not project_id:
        return None
    sess = _SESSIONS.get(project_id)
    if sess is None:
        # No session record (caller hit /api/orchestrate without
        # /api/session/start). Generate refs ad-hoc and return them
        # without caching, so we don't accumulate stray state.
        if not (character_description or location_description):
            return None
        if mock_mode():
            return _mock_project_refs(character_description, location_description)
        from . import vertex_imagen
        return await vertex_imagen.generate_project_refs(
            project_id=project_id,
            character_description=character_description,
            location_description=location_description,
            aspect_ratio=aspect_ratio,
        )

    cached = sess.get("projectRefs")
    if cached:
        return cached
    if not (character_description or location_description):
        return None

    if mock_mode():
        refs = _mock_project_refs(character_description, location_description)
    else:
        from . import vertex_imagen
        refs = await vertex_imagen.generate_project_refs(
            project_id=project_id,
            character_description=character_description,
            location_description=location_description,
            aspect_ratio=aspect_ratio,
        )
    sess["projectRefs"] = refs
    return refs
