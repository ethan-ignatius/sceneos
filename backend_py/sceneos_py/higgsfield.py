from __future__ import annotations

import uuid

import httpx

from .cloudinary import public_id_for_scene, upload_video_from_url
from .config import env
from .jobs import Job, get, put


BASE_URL = "https://platform.higgsfield.ai"
DEFAULT_T2I_MODEL = "higgsfield-ai/soul/standard"
DEFAULT_I2V_MODEL = "higgsfield-ai/dop/standard"


def _auth() -> str:
    key = env("HIGGSFIELD_API_KEY")
    secret = env("HIGGSFIELD_API_SECRET")
    if not key or not secret:
        raise RuntimeError("missing HIGGSFIELD_API_KEY/HIGGSFIELD_API_SECRET")
    return f"Key {key}:{secret}"


def _submit_url(model_id: str) -> str:
    return f"{env('HIGGSFIELD_BASE_URL', BASE_URL)}/{model_id}"


def _status_url(request_id: str) -> str:
    return f"{env('HIGGSFIELD_BASE_URL', BASE_URL)}/requests/{request_id}/status"


def _request_id(body: dict) -> str | None:
    for key in ("request_id", "id", "requestId", "job_id", "jobId"):
        if isinstance(body.get(key), str):
            return body[key]
    for key in ("data", "result"):
        if isinstance(body.get(key), dict):
            nested = _request_id(body[key])
            if nested:
                return nested
    return None


def _asset_url(body: dict) -> str | None:
    for key in ("output_url", "result_url", "video_url", "image_url", "url", "asset_url"):
        if isinstance(body.get(key), str):
            return body[key]
    for key in ("result", "output", "data"):
        inner = body.get(key)
        if isinstance(inner, dict):
            nested = _asset_url(inner)
            if nested:
                return nested
    for key in ("media", "assets", "files", "outputs"):
        arr = body.get(key)
        if isinstance(arr, list) and arr and isinstance(arr[0], dict):
            nested = _asset_url(arr[0])
            if nested:
                return nested
    return None


async def _post(model_id: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            _submit_url(model_id),
            json=payload,
            headers={"Authorization": _auth(), "Content-Type": "application/json"},
        )
        res.raise_for_status()
        return res.json()


async def _poll(request_id: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(_status_url(request_id), headers={"Authorization": _auth()})
        res.raise_for_status()
        body = res.json()
    raw = str(body.get("status") or body.get("state") or "").lower()
    if raw in {"failed", "error", "errored", "cancelled", "canceled", "rejected"}:
        return {"status": "failed", "error": body.get("error") or body.get("message") or raw}
    if raw in {"succeeded", "success", "completed", "complete", "ready", "done"}:
        return {"status": "succeeded", "assetUrl": _asset_url(body)}
    return {"status": "running"}


async def generate(params: dict) -> str:
    prompt = params.get("clipPrompt") or {
        "imagePrompt": params["refinedPrompt"],
        "motionPrompt": params["refinedPrompt"],
        "aspectRatio": "16:9",
        "resolution": "1080p",
        "durationSeconds": params["durationSeconds"],
        "preferredModel": DEFAULT_I2V_MODEL,
    }
    body = await _post(
        DEFAULT_T2I_MODEL,
        {
            "prompt": prompt["imagePrompt"],
            "aspect_ratio": prompt.get("aspectRatio", "16:9"),
            "resolution": prompt.get("resolution", "1080p"),
        },
    )
    request_id = _request_id(body)
    if not request_id:
        raise RuntimeError(f"Higgsfield T2I response missing request_id: {body}")
    job_id = f"hf-{uuid.uuid4()}"
    put(
        Job(
            job_id=job_id,
            provider="higgsfield",
            stage="t2i_running",
            clip_prompt=prompt,
            t2i_request_id=request_id,
            project_id=params.get("projectId"),
            beat_id=params.get("beatId"),
            scene_id=params.get("sceneId"),
        )
    )
    return job_id


async def status(job_id: str) -> dict:
    job = get(job_id)
    if not job:
        return {"status": "failed", "error": f"unknown job {job_id}"}
    if job.stage == "succeeded":
        return {"status": "succeeded", "clipUrl": job.cloudinary_url or job.video_url, "clipPublicId": job.cloudinary_public_id}
    if job.stage == "failed":
        return {"status": "failed", "error": job.error}
    if job.stage == "t2i_running" and job.t2i_request_id:
        remote = await _poll(job.t2i_request_id)
        if remote["status"] == "running":
            return {"status": "running"}
        if remote["status"] == "failed" or not remote.get("assetUrl"):
            job.stage = "failed"
            job.error = remote.get("error") or "T2I succeeded without asset URL"
            put(job)
            return {"status": "failed", "error": job.error}
        job.image_url = remote["assetUrl"]
        prompt = job.clip_prompt or {}
        body = await _post(
            prompt.get("preferredModel", DEFAULT_I2V_MODEL),
            {
                "image_url": job.image_url,
                "prompt": prompt.get("motionPrompt", ""),
                "duration": prompt.get("durationSeconds", 5),
                "aspect_ratio": prompt.get("aspectRatio", "16:9"),
                "resolution": prompt.get("resolution", "1080p"),
            },
        )
        request_id = _request_id(body)
        if not request_id:
            job.stage = "failed"
            job.error = f"Higgsfield I2V response missing request_id: {body}"
            put(job)
            return {"status": "failed", "error": job.error}
        job.i2v_request_id = request_id
        job.stage = "i2v_running"
        put(job)
        return {"status": "running", "imageUrl": job.image_url}
    if job.stage == "i2v_running" and job.i2v_request_id:
        remote = await _poll(job.i2v_request_id)
        if remote["status"] == "running":
            return {"status": "running", "imageUrl": job.image_url}
        if remote["status"] == "failed" or not remote.get("assetUrl"):
            job.stage = "failed"
            job.error = remote.get("error") or "I2V succeeded without asset URL"
            put(job)
            return {"status": "failed", "error": job.error}
        job.video_url = remote["assetUrl"]
        uploaded = await upload_video_from_url(
            job.video_url,
            public_id_for_scene(job.project_id, job.beat_id, job.scene_id, job.job_id),
        )
        job.cloudinary_url = uploaded["url"]
        job.cloudinary_public_id = uploaded["publicId"]
        job.stage = "succeeded"
        put(job)
        return {"status": "succeeded", "clipUrl": job.cloudinary_url, "clipPublicId": job.cloudinary_public_id}
    return {"status": "queued"}
