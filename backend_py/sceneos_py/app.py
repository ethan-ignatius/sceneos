from __future__ import annotations

import uuid

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .agent_graph import run_agent_turn
from .cloudinary import build_splice_url, build_thumbnail_url, color_grade_for, cutos_payload, sign_upload
from .config import env, mock_mode
from . import higgsfield


app = FastAPI(title="sceneos-backend-py")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[env("ALLOWED_ORIGIN", "http://localhost:5173") or "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
)


MOCK_TICKS: dict[str, int] = {}


@app.get("/")
def root():
    return {"name": "sceneos-backend-py", "status": "ok", "mock": mock_mode()}


@app.get("/api/health")
def health():
    return {"status": "ok", "mockMode": mock_mode()}


@app.post("/api/agent")
def agent(body: dict):
    try:
        return run_agent_turn(body)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/decompose")
def decompose(body: dict):
    clips = []
    aspect = "9:16" if body.get("videoType") == "short" else "16:9"
    for beat in body.get("beats", []):
        refined = f"{body['masterPrompt']} — {beat['beatName']}: {beat['archetype']['intent']}"
        clips.append(
            {
                "beatId": beat["beatId"],
                "sceneSummary": f"{beat['beatName']}: {beat['archetype']['intent']}"[:180],
                "refinedPrompt": refined,
                "clipPrompt": {
                    "imagePrompt": f"Cinematic keyframe for {refined}. Lighting, lens, composition, production design, color grade.",
                    "motionPrompt": f"Five-second camera move for {refined}. Specify subject motion, atmosphere, and pacing.",
                    "aspectRatio": aspect,
                    "resolution": "1080p",
                    "durationSeconds": beat["archetype"].get("suggestedDuration", 5),
                    "preferredModel": "higgsfield-ai/dop/standard",
                },
            }
        )
    return {"clips": clips, "continuityBible": f"Carry visual continuity for: {body.get('masterPrompt', '')}"}


@app.post("/api/generate")
async def generate(body: dict):
    if not body.get("refinedPrompt") or len(body["refinedPrompt"]) < 40:
        raise HTTPException(status_code=400, detail="Generation requires a sufficient refinedPrompt.")
    provider = env("GENERATION_PROVIDER", "higgsfield") or "higgsfield"
    if mock_mode() or provider == "cached":
        job_id = f"cached::{body.get('beatTemplate', body['beatId'])}-{body['sceneId']}-{uuid.uuid4().hex[:6]}"
        return {"jobId": job_id, "provider": "cached", "pollAfterMs": 800}
    if provider == "higgsfield":
        job_id = await higgsfield.generate(body)
        return {"jobId": f"higgsfield::{job_id}", "provider": "higgsfield", "pollAfterMs": 5000}
    raise HTTPException(status_code=501, detail=f"Provider {provider} is not implemented in Python backend yet.")


@app.get("/api/status/{job_id:path}")
async def status(job_id: str):
    if job_id.startswith("cached::"):
        ticks = MOCK_TICKS.get(job_id, 0) + 1
        MOCK_TICKS[job_id] = ticks
        if ticks < 2:
            return {"jobId": job_id, "provider": "cached", "status": "running", "pollAfterMs": 800}
        return {
            "jobId": job_id,
            "provider": "cached",
            "status": "succeeded",
            "clipUrl": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
            "clipPublicId": "dog",
        }
    provider, _, provider_job_id = job_id.partition("::")
    if provider == "higgsfield":
        result = await higgsfield.status(provider_job_id)
        return {"jobId": job_id, "provider": "higgsfield", "pollAfterMs": 5000, **result}
    raise HTTPException(status_code=400, detail=f"Unknown provider in jobId: {job_id}")


@app.post("/api/stitch/url")
def stitch(body: dict):
    manifest = body.get("manifest") or {}
    approved = []
    for beat in manifest.get("beats", []):
        if beat.get("status") != "approved":
            continue
        for scene in beat.get("scenes", []):
            if scene.get("clipPublicId"):
                approved.append({"beat": beat, "scene": scene})
    if not approved:
        raise HTTPException(status_code=400, detail="No approved scenes with clipPublicId")
    clips = [
        {
            "publicId": item["scene"]["clipPublicId"],
            "colorGrade": color_grade_for(item["beat"]["archetype"]["mood"]) if body.get("colorGrade") else None,
        }
        for item in approved
    ]
    final_url = build_splice_url(clips, body.get("audioPublicId"))
    return {
        "finalUrl": final_url,
        "thumbnailUrl": build_thumbnail_url(clips[0]["publicId"]),
        "durationSeconds": sum(item["scene"].get("durationSeconds", 0) for item in approved),
    }


@app.post("/api/cloudinary/sign")
def cloudinary_sign(body: dict | None = None):
    try:
        return sign_upload((body or {}).get("folder", "sceneos/user-media"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/cutos/import")
async def cutos_import(body: dict):
    payload = cutos_payload(body.get("manifest") or {})
    if not payload["beats"]:
        raise HTTPException(status_code=400, detail="No approved clips with clipUrl available for CutOS import")
    base_url = env("CUTOS_BASE_URL", "http://localhost:3000") or "http://localhost:3000"
    headers = {"content-type": "application/json"}
    token = env("CUTOS_API_TOKEN")
    if token:
        headers["authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(f"{base_url}/api/projects/import-manifest", json=payload, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"CutOS import failed: {res.status_code} {res.text[:300]}")
    data = res.json()
    project_id = data.get("projectId")
    if not project_id:
        raise HTTPException(status_code=502, detail="CutOS import response missing projectId")
    return {"projectId": project_id, "editUrl": data.get("editUrl") or f"{base_url}/projects/{project_id}"}
