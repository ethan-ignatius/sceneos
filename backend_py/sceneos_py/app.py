"""
SceneOS Python backend. FastAPI surface, mirrors the TS Hono backend
in `backend/`. Provider dispatch, mock-mode branches, real Anthropic
agent + decomposer, Cloudinary fl_splice URL builder, CutOS handoff.
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import agent as agent_service
from . import decompose as decompose_service
from . import mock as mock_service
from .cloudinary import build_splice_url, build_thumbnail_url, color_grade_for, cutos_payload, sign_upload
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[env("ALLOWED_ORIGIN", "http://localhost:5173") or "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


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
        "mock": mock_mode(),
        "docs": "see docs/BACKEND_ARCHITECTURE.md",
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "mockMode": mock_mode()}


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

    name, impl = get_provider()
    try:
        result = await impl.generate(body)
        provider_job_id = result["jobId"]
        return {
            "jobId": encode_job_id(name, provider_job_id),
            "provider": name,
            "pollAfterMs": poll_after_ms_for(name),
        }
    except Exception as exc:
        logger.exception("[generate] provider %s failed", name)
        raise HTTPException(
            status_code=502,
            detail={
                "error": f"Provider \"{name}\" submission failed",
                "details": str(exc),
                "hint": "Set MOCK_MODE=true for instant canned data, or GENERATION_PROVIDER=cached.",
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
    if poll_after is not None:
        response["pollAfterMs"] = poll_after
    if result.get("clipUrl"):
        response["clipUrl"] = result["clipUrl"]
    if result.get("clipPublicId"):
        response["clipPublicId"] = result["clipPublicId"]
    if result.get("error"):
        response["error"] = result["error"]
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
def stitch(body: dict):
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
    clips = [
        {
            "publicId": item["scene"]["clipPublicId"],
            "colorGrade": color_grade_for(item["beat"]["archetype"]["mood"]) if apply_grade else None,
        }
        for item in approved
    ]
    final_url = build_splice_url(clips, body.get("audioPublicId"))
    if not final_url:
        raise HTTPException(status_code=500, detail="Failed to build splice URL")

    duration_seconds = sum(item["scene"].get("durationSeconds", 0) for item in approved)
    return {
        "finalUrl": final_url,
        "thumbnailUrl": build_thumbnail_url(clips[0]["publicId"]),
        "durationSeconds": duration_seconds,
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
