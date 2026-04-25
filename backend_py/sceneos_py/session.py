"""
Session manager. The mode-aware boot sequence.

Two modes:
- normal: agent fully drives. orchestrator runs per beat after markSufficient.
- demo:   speculative kickoff. all 7 beats start rendering at session-start
          using pre-curated beatFacts from demo_prompts.DEMO_PROMPTS, in
          parallel, while the agent conversation runs in parallel as
          theatre. when the agent calls markSufficient for a beat, the
          frontend hits /api/orchestrate which finds the speculative job
          and returns it immediately — no new work.

Why pre-curated facts in demo mode? Two reasons:
  1. Wallclock budget. With demo prompts, all Imagen + video calls fire
     at T=0. Even the slowest providers hit 2-3 minutes. Adding the
     agent serialization on top would push past 4 minutes.
  2. Continuity. Pre-curated facts share a single character + location
     description across all 7 beats so the protagonist looks the same
     in every frame. Agent-extracted facts in a 1-question-per-beat
     speed-mode loop can't reliably reproduce that.

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
) -> tuple[str, dict]:
    """Run the deterministic pipeline for one beat using canned facts.
    Used only on demo speculative kickoff. Always non-chained (no prior
    frame at T=0) so the 7 beats can fan out in parallel.

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


def _mock_speculative_job(beat: dict, canned_facts: dict) -> dict:
    """Mock-mode speculative job. Mirrors the live shape returned by
    orchestrator.run_beat_pipeline and the /api/orchestrate mock branch.
    Avoids any provider call so tests stay deterministic."""
    from . import mock as mock_service
    from .motion_presets import pick_motion_preset
    from . import orchestrator as orch

    motion = pick_motion_preset(canned_facts.get("mood") or beat["archetype"]["mood"])
    clip_prompt = orch.compose_clip_prompt(beat, canned_facts, motion, "16:9")
    refined = f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"
    scenes = beat.get("scenes") or []
    scene_id = (scenes[0] or {}).get("sceneId") if scenes else f"{beat['beatId']}-scene-1"
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
    return {
        "speculative": True,
        "startedAt": _now_iso(),
        "sceneId": scene_id,
        "jobId": mock_service.deterministic_job_id("mock", f"{beat['template']}-{scene_id}"),
        "provider": "cached",
        "pollAfterMs": 800,
        "chainFromPrevious": False,
        "seedImageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg",
        "characterRef": {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg",
            "publicId": f"speculative::character-{beat['beatId']}",
            "kind": "character",
            "prompt": "[mock] cinematic character reference",
        },
        "locationRef": {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/couple.jpg",
            "publicId": f"speculative::location-{beat['beatId']}",
            "kind": "location",
            "prompt": "[mock] cinematic location reference",
        },
        "motionPreset": motion,
        "clipPrompt": clip_prompt,
        "refinedPrompt": refined,
    }


async def kickoff_speculative_pipelines(
    *,
    manifest: dict,
    demo_prompt: demo_prompts.DemoPromptDef,
    aspect_ratio: str = "16:9",
) -> dict[str, dict]:
    """
    Fire all 7 beat pipelines IN PARALLEL using the demo prompt's canned
    beatFacts. No chaining. Returns a map { beatId → orchestrator result }.

    In mock mode we don't actually call any provider — we synthesize the
    mock-shape orchestrator result. The /api/status mock branch then
    returns succeeded on the second poll, so the visualizer experience
    is identical.
    """
    project_id = manifest["projectId"]
    facts_by_template = demo_prompt["beatFactsByTemplate"]

    if mock_mode():
        # Synthesize mock results immediately. No async fan-out needed.
        results: dict[str, dict] = {}
        for beat in manifest["beats"]:
            canned = facts_by_template.get(beat["template"]) or {
                "subject": "the protagonist",
                "action": "the action of this beat",
                "setting": "the established location",
                "mood": beat["archetype"]["mood"],
            }
            job = _mock_speculative_job(beat, canned)
            set_speculative_job(project_id, beat["beatId"], job)
            results[beat["beatId"]] = job
        return results

    # Real mode: fan out via asyncio.gather so all 7 (and their nested
    # parallel Imagen calls) overlap.
    tasks = []
    for beat in manifest["beats"]:
        canned = facts_by_template.get(beat["template"])
        if not canned:
            # No canned facts for this template — fall back to a minimal
            # plausible facts shape so the pipeline can still render.
            canned = {
                "subject": "the protagonist",
                "action": beat["archetype"]["intent"],
                "setting": "the established location",
                "framing": "cinematic",
                "mood": beat["archetype"]["mood"],
                "characterDescription": "the protagonist as established",
                "locationDescription": "the established setting",
            }
        tasks.append(_kickoff_one_beat(
            manifest=manifest,
            beat=beat,
            canned_facts=canned,
            aspect_ratio=aspect_ratio,
        ))

    pairs = await asyncio.gather(*tasks)
    results = {beat_id: job for beat_id, job in pairs}
    for beat_id, job in results.items():
        set_speculative_job(project_id, beat_id, job)
    return results


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
        _SESSIONS[project_id] = {
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "createdAt": _now_iso(),
        }
        speculative = await kickoff_speculative_pipelines(
            manifest=manifest,
            demo_prompt=demo,
            aspect_ratio=aspect_ratio,
        )
        return {
            "projectId": project_id,
            "mode": mode,
            "masterPrompt": master_prompt,
            "videoType": video_type,
            "demoPromptId": demo["id"],
            "manifest": manifest,
            "speculativeJobs": speculative,
        }

    # Normal mode — no speculation. Just pick a master prompt + return
    # an empty manifest. The agent loop then fills it in beat-by-beat.
    nrm = demo_prompts.pick_normal_prompt(prompt_id)
    master_prompt = master_prompt_override or nrm["masterPrompt"]
    video_type = nrm["videoType"]
    manifest = build_manifest(
        project_id=project_id,
        master_prompt=master_prompt,
        video_type=video_type,
        mode=mode,
    )
    _SESSIONS[project_id] = {
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "createdAt": _now_iso(),
    }
    return {
        "projectId": project_id,
        "mode": mode,
        "masterPrompt": master_prompt,
        "videoType": video_type,
        "normalPromptId": nrm["id"],
        "manifest": manifest,
    }
