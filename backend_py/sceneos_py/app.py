"""
SceneOS Python backend. FastAPI surface, mirrors the TS Hono backend
in `backend/`. Provider dispatch, mock-mode branches, real Anthropic
agent + decomposer, Cloudinary fl_splice URL builder, CutOS handoff.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import agent as agent_service
from . import decompose as decompose_service
from . import editor as editor_service
from . import mock as mock_service
from .cloudinary import build_splice_url, build_thumbnail_url, color_grade_for, cutos_payload, last_frame_url, sign_upload
from .config import env, mock_mode
from .provider import (
    GenerationProvider,
    decode_job_id,
    encode_job_id,
    get_provider,
    poll_after_ms_for,
)


logger = logging.getLogger(__name__)

app = FastAPI(title="sceneos-backend-py")

# CORS — allow any origin in dev. Hackathon scope; tighten post-deploy.
_origins_raw = env("ALLOWED_ORIGIN", "*") or "*"
_allow_origins = [o.strip() for o in _origins_raw.split(",")] if _origins_raw != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


# /mock mount removed (Tier 3): the mock_frontend visualization was a
# dev artifact tied to the deprecated mock layer. Real backend only.


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    """Match the TS Hono error envelope: { error, details? } on errors."""
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(status_code=exc.status_code, content={"error": str(detail)})


_MOCK_TICKS: dict[str, int] = {}


@app.get("/")
def root():
    return {
        "name": "sceneos-backend-py",
        "status": "ok",
        "docs": "see docs/BACKEND_ARCHITECTURE.md",
    }


@app.get("/api/health")
def health():
    # mockMode field intentionally removed — Tier 3 deprecated the mock
    # layer; the frontend chip that read this field is gone too.
    return {"status": "ok"}


# ── /api/agent ──────────────────────────────────────────────────────────────


@app.post("/api/agent")
async def agent(body: dict):
    if mock_mode():
        return mock_service.run_mock_agent_turn(body)
    try:
        return await agent_service.run_agent_turn(body)
    except Exception as exc:
        logger.exception("[agent] failed")
        raise HTTPException(
            status_code=502,
            detail={"error": "Agent turn failed", "details": str(exc)},
        ) from exc


# ── /api/agent/stream — SSE: live thinking + tool call ─────────────────────


@app.post("/api/agent/stream")
async def agent_stream(body: dict):
    """
    Server-Sent Events stream of the agent's turn.

    Emits incremental events:
      data: {"type":"ready"}
      data: {"type":"thought","chunk":"..."}    (live Gemini thinking tokens)
      data: {"type":"tool_call","name":"...","args":{...}}
      data: {"type":"result", ...AgentResponse}
      data: {"type":"done"}
      data: {"type":"error","message":"..."}    (on failure)

    Frontend consumes via fetch + ReadableStream (POST → no EventSource).
    """
    if mock_mode():
        events = mock_service.run_mock_agent_streaming(body)
    else:
        events = agent_service.run_agent_turn_streaming(body)

    async def gen():
        try:
            async for event in events:
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.exception("[agent/stream] failed")
            yield f"data: {json.dumps({'type': 'error', 'message': f'{type(exc).__name__}: {exc}'})}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── /api/session/start — mode-aware boot (demo vs normal) ────────────────


@app.post("/api/session/start")
async def session_start(body: dict | None = None):
    """
    Start a new SceneOS session in either 'demo' or 'normal' mode.

    Request:
      {
        mode: "demo" | "normal",                  // required
        masterPromptOverride?: string,            // optional power-user override
        promptId?: string,                        // optional pin to a specific curated prompt
        aspectRatio?: "16:9" | "9:16" | "1:1"     // default "16:9"
      }

    Response (normal):
      { projectId, mode: "normal", masterPrompt, videoType, manifest, normalPromptId }

    Response (demo):
      { projectId, mode: "demo", masterPrompt, videoType, manifest, demoPromptId,
        speculativeJobs: { beatId: {jobId, provider, pollAfterMs, motionPreset, ...} } }

    In demo mode the response is large because the backend has already
    fanned out all 7 beat pipelines in parallel. The frontend can poll
    /api/status/<jobId> for each immediately. When the agent eventually
    calls markSufficient for a beat, /api/orchestrate/<beatId> returns
    the pre-warmed job — no new work happens.
    """
    from . import session as session_service

    body = body or {}
    raw_mode = (body.get("mode") or "demo").strip().lower()
    if raw_mode not in {"demo", "normal"}:
        raise HTTPException(
            status_code=400,
            detail=f'mode must be "demo" or "normal" (got {raw_mode!r})',
        )
    aspect_ratio = body.get("aspectRatio") or "16:9"

    try:
        return await session_service.start_session(
            mode=raw_mode,  # type: ignore[arg-type]
            master_prompt_override=body.get("masterPromptOverride"),
            prompt_id=body.get("promptId"),
            aspect_ratio=aspect_ratio,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[session/start] failed")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Session start failed",
                "details": str(exc),
                "hint": "Set MOCK_MODE=true to skip provider calls. In demo mode the speculative kickoff exercises Imagen + the active provider.",
            },
        ) from exc


# ── /api/session/{project_id} — reconcile state on refresh ─────────────────


@app.get("/api/session/{project_id}")
async def session_get(project_id: str):
    """
    Reconcile a frontend's in-memory state with the backend's session cache.

    Returns the cached manifest, projectRefs, and speculative jobs for a
    known projectId. The frontend uses this on refresh / late-join so it
    can pick up the agent loop without re-priming /api/session/start
    (which would burn another Imagen call + 7 video submissions in demo
    mode).

    Status codes:
      200: { projectId, mode, masterPrompt, videoType, manifest,
             projectRefs?, speculativeJobs? }
      404: { error: "Unknown projectId" }
    """
    from . import session as session_service
    sess = session_service.get_session(project_id)
    if sess is None:
        raise HTTPException(status_code=404, detail={"error": "Unknown projectId"})
    response = {
        "projectId": project_id,
        "mode": sess.get("mode"),
        "masterPrompt": sess.get("masterPrompt"),
        "videoType": sess.get("videoType"),
        "createdAt": sess.get("createdAt"),
        "manifest": sess.get("manifest"),
    }
    if sess.get("demoPromptId"):
        response["demoPromptId"] = sess["demoPromptId"]
    if sess.get("normalPromptId"):
        response["normalPromptId"] = sess["normalPromptId"]
    if sess.get("projectRefs") is not None:
        response["projectRefs"] = sess["projectRefs"]
    spec = session_service.all_speculative_jobs(project_id)
    if spec:
        response["speculativeJobs"] = spec
    return response


# ── /api/orchestrate/{beat_id} — deterministic per-beat pipeline ──────────


@app.post("/api/orchestrate/{beat_id}")
async def orchestrate(beat_id: str, body: dict):
    """
    Run the deterministic pipeline for one beat:
      beatFacts → motion preset → reference images (when not chained) →
      clipPrompt composition → provider.generate() → jobId

    Request body:
      {
        manifest: Manifest,
        beatFacts: { subject, action, setting, framing?, mood, characterDescription?, locationDescription? },
        previousLastFrameUrl?: string,
        aspectRatio?: "16:9" | "9:16" | "1:1"
      }

    Response: see orchestrator.run_beat_pipeline().
    """
    from . import orchestrator
    from .motion_presets import pick_motion_preset

    manifest = body.get("manifest")
    beat_facts = body.get("beatFacts")
    previous_last_frame_url = body.get("previousLastFrameUrl")
    aspect_ratio = body.get("aspectRatio") or "16:9"

    if not isinstance(manifest, dict) or not isinstance(beat_facts, dict):
        raise HTTPException(status_code=400, detail="manifest (object) and beatFacts (object) are required")

    beat = next((b for b in manifest.get("beats", []) if b.get("beatId") == beat_id), None)
    if beat is None:
        raise HTTPException(status_code=404, detail=f"beatId {beat_id} not found in manifest")

    # ── Speculative-job lookup (demo mode) ──────────────────────────────
    # If this manifest came from /api/session/start with mode=demo, the
    # beat was already kicked off at session-start. Return that job
    # immediately and skip all new work — this is what makes demo mode
    # hit the 3-4 minute budget.
    from . import session as session_service
    project_id = manifest.get("projectId")
    if project_id:
        existing = session_service.get_speculative_job(project_id, beat_id)
        if existing and not existing.get("error"):
            # Mark the response so the visualizer can show a "pre-warmed"
            # badge instead of a fresh-render badge.
            return {**existing, "speculativeReused": True}

    if mock_mode():
        # Mock branch: skip Imagen + provider, return deterministic stub mirroring the live shape.
        # We honor the same project-refs contract as the live branch so
        # tests + the visualizer see identical shapes between mock and
        # real mode. Project refs come from ensure_project_refs() —
        # which itself uses the mock-refs synth when MOCK_MODE=true.
        project_refs = await session_service.ensure_project_refs(
            project_id=project_id,
            character_description=beat_facts.get("characterDescription"),
            location_description=beat_facts.get("locationDescription"),
            aspect_ratio=aspect_ratio,
        )
        chain = orchestrator.decide_chain(manifest, beat, previous_last_frame_url)
        motion_preset = pick_motion_preset(beat_facts.get("mood") or beat.get("archetype", {}).get("mood", "cinematic"))
        clip_prompt = orchestrator.compose_clip_prompt(beat, beat_facts, motion_preset, aspect_ratio)
        refined_prompt = f"{clip_prompt['imagePrompt']} {clip_prompt['motionPrompt']}"
        scenes = beat.get("scenes") or []
        scene_id = (scenes[0] or {}).get("sceneId") if scenes else f"{beat_id}-scene-1"
        cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"

        if project_refs and (project_refs.get("character") or project_refs.get("location")):
            # Project refs win over chaining (same priority as the live
            # orchestrator). The framing-based pick keeps wide framings
            # routed to the location ref.
            character_ref, location_ref, seed = orchestrator._pick_seed_for_framing(
                beat_facts.get("framing") or motion_preset.get("composition"),
                project_refs,
            )
            shared_refs = True
        else:
            shared_refs = False
            seed = previous_last_frame_url if chain else f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg"
            character_ref = None if chain else {
                "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/sample.jpg",
                "publicId": f"mock::character-{beat_id}",
                "kind": "character",
                "prompt": "[mock] cinematic character reference",
            }
            location_ref = None if chain else {
                "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/couple.jpg",
                "publicId": f"mock::location-{beat_id}",
                "kind": "location",
                "prompt": "[mock] cinematic location reference",
            }
        return {
            "sceneId": scene_id,
            "jobId": mock_service.deterministic_job_id("mock", f"{beat['template']}-{scene_id}"),
            "provider": "cached",
            "pollAfterMs": 800,
            "chainFromPrevious": chain,
            "seedImageUrl": seed,
            "characterRef": character_ref,
            "locationRef": location_ref,
            "sharedRefs": shared_refs,
            "motionPreset": motion_preset,
            "clipPrompt": clip_prompt,
            "refinedPrompt": refined_prompt,
        }

    try:
        # Look up (or generate-and-cache) the project-level multi-keyframe
        # set. In demo mode this was already populated at
        # /api/session/start. In normal mode this is the lazy first-time
        # generation triggered by the first markSufficient that ships
        # characterDescription / locationDescription. Each beat picks the
        # keyframe variant best matching its framing.
        project_keyframes = await session_service.ensure_project_keyframes(
            project_id=project_id,
            character_description=beat_facts.get("characterDescription"),
            location_description=beat_facts.get("locationDescription"),
            aspect_ratio=aspect_ratio,
        )
        # Back-compat single-ref shape for any caller that still reads it.
        project_refs = (
            session_service._refs_from_keyframes(project_keyframes)
            if project_keyframes
            else None
        )
        result = await orchestrator.run_beat_pipeline(
            manifest=manifest,
            beat_id=beat_id,
            beat_facts=beat_facts,
            previous_last_frame_url=previous_last_frame_url,
            aspect_ratio=aspect_ratio,
            project_refs=project_refs,
            project_keyframes=project_keyframes,
        )
        # Cache it under the projectId so subsequent calls (e.g. retries)
        # hit the same job without re-submitting.
        if project_id:
            session_service.set_speculative_job(project_id, beat_id, result)
        return result
    except Exception as exc:
        logger.exception("[orchestrate] failed for beat %s", beat_id)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Orchestration failed",
                "details": str(exc),
                "hint": "Set MOCK_MODE=true for canned data, or check Imagen + provider quotas.",
            },
        ) from exc


# ── /api/references/generate — Imagen 3 character + location refs ─────────


@app.post("/api/references/generate")
async def references_generate(body: dict):
    """
    Generate a reference still (character or location) via Vertex Imagen 3.

    Request:
      {
        kind: "character" | "location",
        description: string,
        projectId?: string,
        beatId?: string,
        aspectRatio?: "16:9" | "9:16" | "1:1"
      }

    Response: { imageUrl, publicId, kind, prompt }

    Mock-mode short-circuits to a Cloudinary demo asset (no Imagen call).
    """
    from . import vertex_imagen as vi

    kind = (body.get("kind") or "").strip()
    description = (body.get("description") or "").strip()
    if kind not in vi.REFERENCE_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind must be one of {list(vi.REFERENCE_KINDS)}",
        )
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    if mock_mode():
        cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
        public_id = "sample" if kind == "character" else "couple"
        return {
            "imageUrl": f"https://res.cloudinary.com/{cloud}/image/upload/{public_id}.jpg",
            "publicId": f"mock::{kind}",
            "kind": kind,
            "prompt": vi._stylize_prompt(kind, description),
            "stub": True,
        }

    try:
        return await vi.generate_reference(
            kind=kind,
            description=description,
            project_id=body.get("projectId"),
            beat_id=body.get("beatId"),
            aspect_ratio=body.get("aspectRatio") or vi.DEFAULT_ASPECT_RATIO,
        )
    except Exception as exc:
        logger.exception("[references/generate] failed")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Reference image generation failed",
                "details": str(exc),
                "hint": "Set MOCK_MODE=true for a stubbed demo asset, or check Vertex Imagen quota.",
            },
        ) from exc


# ── /api/movie-plan — holistic story coordinator ──────────────────────────


@app.post("/api/movie-plan")
async def movie_plan(body: dict):
    """
    Generate a movie-level plan for a master prompt + beat structure.

    Request:
      {
        masterPrompt: string,                     // required
        videoType?: "story" | "trailer" | "short", // default "story"
        beats?: [ { template, beatName, intent, mood, suggestedDuration } ]
                                                   // default: STORY (7-beat arc)
      }

    Response: see movie_plan.generate_movie_plan() — logline,
    protagonistArc, visualMotif, toneAndGenre, dramaticQuestion, beats[].
    Falls back to a deterministic stub if the LLM is unavailable.

    The frontend / agent typically does NOT call this directly — the plan
    is auto-generated by /api/session/start and stamped on the manifest as
    `manifest.moviePlan`. This endpoint exists for re-rolls and for ad-hoc
    diagnostic use.
    """
    from . import movie_plan as movie_plan_service
    from .beat_templates import STORY, TRAILER, SHORT

    master_prompt = (body.get("masterPrompt") or "").strip()
    if not master_prompt:
        raise HTTPException(status_code=400, detail="masterPrompt is required")

    video_type = (body.get("videoType") or "story").strip().lower()
    if "beats" in body and isinstance(body["beats"], list):
        beat_templates = body["beats"]
    else:
        tmpls = {"story": STORY, "trailer": TRAILER, "short": SHORT}.get(video_type, STORY)
        beat_templates = [
            {
                "template": t["template"],
                "beatName": t["beatName"],
                "intent": t["intent"],
                "mood": t["mood"],
                "suggestedDuration": t["suggestedDuration"],
            }
            for t in tmpls
        ]

    try:
        plan = await movie_plan_service.generate_movie_plan(
            master_prompt=master_prompt,
            video_type=video_type,
            beat_templates=beat_templates,
        )
        return plan
    except Exception as exc:
        logger.exception("[movie-plan] failed")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Movie plan generation failed",
                "details": str(exc),
                "hint": "The endpoint also returns a stub plan when the LLM is unavailable; this 502 means even the stub path raised, which is unusual.",
            },
        ) from exc


# ── /api/decompose ──────────────────────────────────────────────────────────


@app.post("/api/decompose")
async def decompose(body: dict):
    try:
        result = await decompose_service.decompose_master_prompt(body)
        return result
    except Exception as exc:
        logger.exception("[decompose] failed")
        raise HTTPException(
            status_code=502,
            detail={"error": "Decomposition failed", "details": str(exc)},
        ) from exc


# ── /api/generate ───────────────────────────────────────────────────────────


@app.post("/api/generate")
async def generate(body: dict):
    if not body.get("refinedPrompt") or len(body["refinedPrompt"]) < 1:
        raise HTTPException(status_code=400, detail="Generation requires a refinedPrompt.")

    if mock_mode():
        seed = f"{body.get('beatTemplate') or body.get('beatId')}-{body['sceneId']}"
        return {
            "jobId": mock_service.deterministic_job_id("mock", seed),
            "provider": "cached",
            "pollAfterMs": 800,
        }

    from .provider import dispatch_with_fallback
    try:
        name, result, original, reason = await dispatch_with_fallback(body)
        provider_job_id = result["jobId"]
        response: dict = {
            "jobId": encode_job_id(name, provider_job_id),
            "provider": name,
            "pollAfterMs": poll_after_ms_for(name),
        }
        if original:
            response["originalProvider"] = original
            response["fallbackReason"] = reason
        return response
    except Exception as exc:
        logger.exception("[generate] all providers failed")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Generation submission failed (primary + cached fallback)",
                "details": str(exc),
                "hint": "Set MOCK_MODE=true for instant canned data, or populate cached.DEMO_TRAILER_CLIPS.",
            },
        ) from exc


# ── /api/status/{jobId} ─────────────────────────────────────────────────────


@app.get("/api/status/{job_id:path}")
async def status(job_id: str):
    if mock_mode() or job_id.startswith("mock::") or job_id.startswith("cached::"):
        ticks = _MOCK_TICKS.get(job_id, 0) + 1
        _MOCK_TICKS[job_id] = ticks
        if ticks < 2:
            return {
                "jobId": job_id,
                "provider": "cached",
                "status": "running",
                "pollAfterMs": 800,
            }
        seed = job_id.split("::", 1)[-1]
        beat_template = seed.split("-", 1)[0] or "trailer.establishing"
        clip = mock_service.get_mock_clip(beat_template)
        return {
            "jobId": job_id,
            "provider": "cached",
            "status": "succeeded",
            "clipUrl": clip["url"],
            "clipPublicId": clip["publicId"],
            # Mock clips live on Cloudinary's public demo cloud — derive last-frame
            # URL from that cloud, not the user's configured one.
            "lastFrameUrl": last_frame_url(clip["publicId"], cloud="demo"),
        }

    try:
        provider, provider_job_id = decode_job_id(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "Bad jobId", "details": str(exc)}) from exc

    _, impl = get_provider() if provider == _active_name() else (provider, _registry_for(provider))
    try:
        result = await impl.status(provider_job_id)
    except Exception as exc:
        logger.exception("[status] provider %s failed", provider)
        raise HTTPException(
            status_code=502,
            detail={"error": f"Provider \"{provider}\" status failed", "details": str(exc)},
        ) from exc

    poll_after = (
        poll_after_ms_for(provider)
        if result.get("status") in {"queued", "running"}
        else None
    )
    response = {
        "jobId": job_id,
        "provider": provider,
        "status": result.get("status"),
    }
    if result.get("stage"):
        response["stage"] = result["stage"]
    if poll_after is not None:
        response["pollAfterMs"] = poll_after
    if result.get("clipUrl"):
        response["clipUrl"] = result["clipUrl"]
    if result.get("clipPublicId"):
        response["clipPublicId"] = result["clipPublicId"]
        # Chain primitive: when a clip succeeds and lives on Cloudinary, expose
        # its near-final frame so the next beat can use it as I2V seed.
        if result.get("status") == "succeeded":
            response["lastFrameUrl"] = last_frame_url(result["clipPublicId"])
    if result.get("error"):
        response["error"] = result["error"]
    # Propagate provider's job-creation timestamp so the frontend's
    # GenerationPanel can compute REAL elapsed time across drawer
    # close/reopen cycles. Only Vertex tracks this today; other providers
    # may add support and the field will flow through transparently.
    if result.get("startedAt"):
        response["startedAt"] = result["startedAt"]
    return response


def _active_name() -> GenerationProvider:
    name, _ = get_provider()
    return name


def _registry_for(provider: GenerationProvider):
    from . import cached, fal, higgsfield, kling, replicate, vertex_veo
    return {
        "higgsfield": higgsfield,
        "kling": kling,
        "fal": fal,
        "vertex": vertex_veo,
        "replicate": replicate,
        "cached": cached,
    }[provider]


# ── /api/stitch/url ─────────────────────────────────────────────────────────


@app.post("/api/stitch/url")
async def stitch(body: dict):
    manifest = body.get("manifest") or {}
    if not isinstance(manifest.get("beats"), list):
        raise HTTPException(
            status_code=400,
            detail="Invalid request body — expected { manifest: { beats: [...] } }",
        )

    approved = [
        {"beat": beat, "scene": scene}
        for beat in manifest["beats"]
        if beat.get("status") == "approved"
        for scene in (beat.get("scenes") or [])
        if scene.get("clipPublicId")
    ]
    if not approved:
        raise HTTPException(
            status_code=400,
            detail=(
                "No approved beats with scene.clipPublicId. "
                "Set beat.status='approved' and scene.clipPublicId on at least one scene."
            ),
        )

    apply_grade = bool(body.get("colorGrade"))
    apply_captions = body.get("captions", True) is not False
    clips = []
    for item in approved:
        scene = item["scene"]
        beat = item["beat"]
        # captionLine lives on the scene's beatFacts (set by the agent's
        # markSufficient). It's an optional 5-10 word phrase — chapter card,
        # not subtitles. If the agent didn't emit one, the clip just renders
        # without a caption layer.
        beat_facts = scene.get("beatFacts") or {}
        caption = (beat_facts.get("captionLine") or "").strip() if apply_captions else ""
        clips.append({
            "publicId": scene["clipPublicId"],
            "colorGrade": color_grade_for(beat["archetype"]["mood"]) if apply_grade else None,
            "caption": caption,
        })
    # Audio resolution order:
    #   1. explicit body.audioPublicId  (caller knows what they want)
    #   2. lazy Lyria generation        (cinematic, per-project, ~30s)
    #   3. manifest.audioPublicId       (static fallback stamped at session-start)
    #   4. None                         (silent stitch — better than a phantom URL)
    #
    # We INTENTIONALLY skip manifest.audioPublicId when no body override is
    # given, and try Lyria first — the manifest value is the placeholder
    # `sceneos/audio/default` which is usually NOT uploaded on customer
    # clouds. Lyria gives us a real, project-tuned cinematic score.
    #
    # If the resolved publicId points at an asset that doesn't exist on
    # this cloud (Lyria failed, static fallback missing, etc), we drop the
    # audio layer entirely — a silent splice still renders, a 404'd
    # `l_audio:` ref makes Cloudinary refuse the whole transformation.
    audio_public_id = body.get("audioPublicId")
    if not audio_public_id:
        from . import audio as audio_service
        # First beat's mood seeds the music — the score covers the WHOLE
        # film, so we want it tuned to where the story OPENS, not where
        # it climaxes (climax music over the establishing shot reads as
        # melodramatic).
        first_mood = (
            (manifest["beats"][0].get("archetype") or {}).get("mood")
            if manifest.get("beats") else None
        ) or "intimate-hook"
        project_id = manifest.get("projectId") or "anon"
        audio_public_id = await audio_service.ensure_music_bed(
            project_id=project_id,
            video_type=manifest.get("videoType", "story"),
            mood=first_mood,
        )
        if not audio_public_id:
            audio_public_id = manifest.get("audioPublicId")
        # Verify the audio actually exists on the cloud. If it's the
        # placeholder `sceneos/audio/default` that nobody uploaded, drop
        # it. Skipped in mock mode (cheap probe would still fire and we
        # don't want network in tests).
        if audio_public_id and not mock_mode():
            from . import audio as audio_service
            ok = await audio_service.audio_publicid_exists(audio_public_id)
            if not ok:
                logger.warning(
                    "[stitch] audio publicId %r does not resolve on Cloudinary — "
                    "rendering silent",
                    audio_public_id,
                )
                audio_public_id = None
    final_url = build_splice_url(clips, audio_public_id)
    if not final_url:
        raise HTTPException(status_code=500, detail="Failed to build splice URL")

    duration_seconds = sum(item["scene"].get("durationSeconds", 0) for item in approved)
    return {
        "finalUrl": final_url,
        "thumbnailUrl": build_thumbnail_url(clips[0]["publicId"]),
        "durationSeconds": duration_seconds,
        "audioPublicId": audio_public_id,
    }


# ── /api/editor/* — Stage 7 agentic editor ─────────────────────────────────


@app.post("/api/editor/init")
def editor_init(body: dict):
    """
    Seed the editor with the opening cut — same shape as a /api/stitch/url
    output, expressed as EditDecisions. The frontend uses this to populate
    the timeline before the first agent turn.
    """
    manifest = body.get("manifest") or {}
    if not isinstance(manifest.get("beats"), list):
        raise HTTPException(status_code=400, detail="manifest.beats[] is required")
    decisions = editor_service.initial_decisions(manifest)
    if not decisions["clips"]:
        raise HTTPException(
            status_code=400,
            detail="No approved beats with scene.clipPublicId — nothing to edit yet.",
        )
    baked = editor_service.apply_edit_decisions(manifest, decisions)
    return {"decisions": baked["decisions"], **{k: v for k, v in baked.items() if k != "decisions"}}


@app.post("/api/editor/turn")
async def editor_turn(body: dict):
    """
    One agent turn in the editor session.

    Request:
      {
        manifest: Manifest,
        decisions?: EditDecisions,             # current state; if omitted, initial_decisions(manifest)
        conversation?: [{role, content, ts}],  # editor-session history (separate from beat questionnaire)
        userMessage?: string,
      }

    Response: { kind: "propose"|"commit", decisions, rationale, suggestedFollowups?, summary? }
    """
    if mock_mode():
        return mock_service.run_mock_editor_turn(body)
    try:
        return await editor_service.run_editor_turn(body)
    except Exception as exc:
        logger.exception("[editor/turn] failed")
        raise HTTPException(
            status_code=502,
            detail={"error": "Editor turn failed", "details": str(exc)},
        ) from exc


@app.post("/api/editor/stream")
async def editor_stream(body: dict):
    """
    SSE stream of an editor agent turn. Same event shape as /api/agent/stream.
    """
    if mock_mode():
        events = mock_service.run_mock_editor_streaming(body)
    else:
        events = editor_service.run_editor_turn_streaming(body)

    async def gen():
        try:
            async for event in events:
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.exception("[editor/stream] failed")
            yield f"data: {json.dumps({'type': 'error', 'message': f'{type(exc).__name__}: {exc}'})}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/editor/apply")
def editor_apply(body: dict):
    """
    Deterministic. Bake EditDecisions into a Cloudinary delivery URL.

    Request: { manifest, decisions, cloudName? }
    Response: { finalUrl, thumbnailUrl, durationSeconds, decisions }

    The optional `cloudName` override targets a specific Cloudinary cloud —
    used by the baked-demo path so the URL points at the cloud where the
    assets actually live (e.g. `dghelx0al`), not the backend's default.
    """
    manifest = body.get("manifest") or {}
    decisions = body.get("decisions") or {}
    cloud_name = body.get("cloudName") or None
    if not isinstance(manifest.get("beats"), list):
        raise HTTPException(status_code=400, detail="manifest.beats[] is required")
    try:
        return editor_service.apply_edit_decisions(manifest, decisions, cloud_name=cloud_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[editor/apply] failed")
        raise HTTPException(
            status_code=500,
            detail={"error": "Editor apply failed", "details": str(exc)},
        ) from exc


# ── /api/cached/lighthouse — pre-baked demo for instant playback ────────────


@app.get("/api/cached/lighthouse")
def cached_lighthouse():
    """
    Return the pre-baked lighthouse-ship demo so the mock frontend can play
    the full film inline with one click — no live generation, no waiting.

    This is the on-stage safety net + the "let me show you what shipped"
    button. The URLs reference Cloudinary assets baked end-to-end with:
      - Veo 3 (1080p, native synced audio + voice acting)
      - Lyria 2 (instrumental music bed, ducked at -28dB)
      - Cloudinary fl_splice + l_text captions

    Response shape mirrors `/api/stitch/url` so the frontend can render it
    through the same component path.
    """
    from . import cached as cached_module

    clips_in_order = [
        ("story.hook", "Hook", 1),
        ("story.exposition", "Exposition", 2),
        ("story.inciting", "Inciting Incident", 3),
        ("story.rising", "Rising Action", 4),
        ("story.climax", "Climax", 5),
        ("story.falling", "Falling Action", 6),
        ("story.resolution", "Resolution", 7),
    ]
    beats_payload = []
    total_duration = 0.0
    for template, beat_name, idx in clips_in_order:
        clip = cached_module.LIGHTHOUSE_SHIP_CLIPS.get(template)
        if not clip:
            continue
        total_duration += float(clip.duration_seconds)
        beats_payload.append({
            "index": idx,
            "beatName": beat_name,
            "template": template,
            "publicId": clip.public_id,
            "clipUrl": clip.clip_url,
            "durationSeconds": clip.duration_seconds,
            "thumbnailUrl": build_thumbnail_url(clip.public_id),
        })
    if not beats_payload:
        raise HTTPException(
            status_code=503,
            detail="Lighthouse demo is not baked on this build. Run smoke_pipeline.py and re-populate cached.py.",
        )
    # The bake lives on a fixed cloud (the team's project cloud). Surface
    # it explicitly so the editor route can target the same cloud when the
    # frontend asks to apply a counter-edit, instead of defaulting to
    # whatever cloud the backend was booted against.
    bake_cloud = "dghelx0al"
    return {
        "demoId": "lighthouse-ship",
        "title": "The lost lighthouse keeper",
        "masterPrompt": (
            "A lighthouse keeper at Cape Disappointment receives a distress signal "
            "from a ship that vanished four decades ago."
        ),
        "finalUrl": cached_module.LIGHTHOUSE_SHIP_FINAL_URL,
        "thumbnailUrl": f"https://res.cloudinary.com/{bake_cloud}/video/upload/so_auto/{beats_payload[0]['publicId']}.jpg",
        "audioPublicId": cached_module.LIGHTHOUSE_SHIP_AUDIO_PUBLIC_ID,
        "cloudName": bake_cloud,
        "durationSeconds": round(total_duration, 1),
        "beats": beats_payload,
        "bake": {
            "videoModel": "veo-3.1-generate-001",
            "musicModel": "lyria-002",
            "resolution": "1920x1080",
            "captions": True,
            "nativeAudio": True,
            "musicDuckDb": -28,
        },
    }


# ── /api/cloudinary/sign ────────────────────────────────────────────────────


@app.post("/api/cloudinary/sign")
def cloudinary_sign(body: dict | None = None):
    try:
        return sign_upload((body or {}).get("folder", "sceneos/user-media"))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"error": "Cloudinary signing failed", "details": str(exc)},
        ) from exc


# ── /api/cutos/import ───────────────────────────────────────────────────────


@app.post("/api/cutos/import")
async def cutos_import(body: dict):
    if mock_mode():
        return mock_service.mock_cutos_import()

    payload = cutos_payload(body.get("manifest") or {})
    if not payload["beats"]:
        raise HTTPException(
            status_code=400,
            detail="No approved clips with clipUrl available for CutOS import",
        )
    base_url = env("CUTOS_BASE_URL", "http://localhost:3000") or "http://localhost:3000"
    headers = {"content-type": "application/json"}
    token = env("CUTOS_API_TOKEN")
    if token:
        headers["authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(f"{base_url}/api/projects/import-manifest", json=payload, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"CutOS import failed: {res.status_code} {res.text[:300]}",
        )
    data = res.json()
    project_id = data.get("projectId")
    if not project_id:
        raise HTTPException(status_code=502, detail="CutOS import response missing projectId")
    return {
        "projectId": project_id,
        "editUrl": data.get("editUrl") or f"{base_url}/projects/{project_id}",
    }
