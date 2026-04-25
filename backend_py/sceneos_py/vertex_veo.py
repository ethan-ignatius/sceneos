"""
Google Cloud Vertex AI Veo provider.

Mirrors backend/src/services/vertex-veo.ts. Two-stage REST flow:
  1. POST .../{model}:predictLongRunning -> operation name
  2. POST .../{model}:fetchPredictOperation until done

Veo returns base64 video; we decode + upload to Cloudinary so downstream
fl_splice can reference a stable public_id.
"""
from __future__ import annotations

import asyncio
import base64
import uuid
from typing import Any

import httpx

from .cloudinary import public_id_for_scene, upload_video_from_url
from .config import env
from .provider import GenerateClipParams, StatusResult


_POLL_INTERVAL_SECONDS = 5
_MAX_POLL_ATTEMPTS = 120


_JOBS: dict[str, dict[str, Any]] = {}


def _read_config() -> dict[str, str]:
    # Accept either GOOGLE_PROJECT_ID (matches gcloud + Vertex docs) or the
    # legacy GCP_PROJECT_ID alias used by the original TS backend. Same for
    # location: GOOGLE_CLOUD_LOCATION is the canonical name; GCP_VEO_LOCATION
    # is the legacy alias.
    project_id = env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")
    if not project_id:
        raise RuntimeError(
            "vertex-veo: GOOGLE_PROJECT_ID (or legacy GCP_PROJECT_ID) is not set."
        )
    location = (
        env("GOOGLE_CLOUD_LOCATION")
        or env("GCP_VEO_LOCATION")
        or env("GCP_LOCATION")
        or "us-central1"
    )
    model_id = env("VEO_MODEL_ID", "veo-2.0-generate-001") or "veo-2.0-generate-001"
    return {"projectId": project_id, "location": location, "modelId": model_id}


def _predict_url() -> str:
    cfg = _read_config()
    return (
        f"https://{cfg['location']}-aiplatform.googleapis.com/v1/projects/{cfg['projectId']}"
        f"/locations/{cfg['location']}/publishers/google/models/{cfg['modelId']}:predictLongRunning"
    )


def _fetch_op_url() -> str:
    cfg = _read_config()
    return (
        f"https://{cfg['location']}-aiplatform.googleapis.com/v1/projects/{cfg['projectId']}"
        f"/locations/{cfg['location']}/publishers/google/models/{cfg['modelId']}:fetchPredictOperation"
    )


async def _access_token() -> str:
    key_file = env("GOOGLE_APPLICATION_CREDENTIALS")
    if not key_file:
        raise RuntimeError(
            "vertex-veo: GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at the service-account JSON."
        )

    def _refresh() -> str:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        creds = service_account.Credentials.from_service_account_file(
            key_file, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        creds.refresh(Request())
        if not creds.token:
            raise RuntimeError("vertex-veo: failed to obtain access token from service account.")
        return creds.token  # type: ignore[return-value]

    return await asyncio.to_thread(_refresh)


async def _authed_post(url: str, body: dict) -> dict:
    token = await _access_token()
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if res.status_code >= 400:
        raise RuntimeError(f"Vertex POST {url} -> {res.status_code}: {res.text[:600]}")
    return res.json()


async def _fetch_image_b64(url: str) -> tuple[str, str]:
    """Fetch a remote image and return (base64-encoded bytes, mimeType)."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        res = await client.get(url)
    if res.status_code >= 400:
        raise RuntimeError(f"Could not fetch startImageUrl: {res.status_code} {url}")
    mime = (res.headers.get("content-type") or "image/jpeg").split(";", 1)[0].strip() or "image/jpeg"
    encoded = base64.b64encode(res.content).decode("ascii")
    return encoded, mime


async def generate(params: GenerateClipParams) -> dict:
    provider_job_id = str(uuid.uuid4())
    pid = public_id_for_scene(
        params.get("projectId"), params.get("beatId"), params.get("sceneId"), provider_job_id
    )

    clip_prompt = params.get("clipPrompt") or {}
    aspect_ratio = clip_prompt.get("aspectRatio") or "16:9"
    requested = clip_prompt.get("durationSeconds") or params["durationSeconds"]
    # Veo 3.x text-to-video only accepts {4, 6, 8} seconds. Snap the caller's
    # requested duration to the nearest allowed value; on ties, prefer the
    # longer clip so a "5s" request produces 6s rather than 4s.
    requested_int = round(float(requested))
    allowed = (4, 6, 8)
    duration_seconds = min(allowed, key=lambda d: (abs(d - requested_int), -d))
    prompt = clip_prompt.get("motionPrompt") or params["refinedPrompt"]

    instance: dict[str, Any] = {"prompt": prompt}

    # Chained generation: when the previous beat's last frame is provided,
    # seed Veo's I2V mode with it. Veo accepts inline base64 OR gcsUri.
    start_image_url = params.get("startImageUrl")
    if start_image_url:
        try:
            b64, mime = await _fetch_image_b64(start_image_url)
            instance["image"] = {"bytesBase64Encoded": b64, "mimeType": mime}
        except Exception as exc:
            _JOBS[provider_job_id] = {
                "status": "failed",
                "error": f"failed to fetch startImageUrl: {exc}",
            }
            return {"jobId": provider_job_id}

    body = {
        "instances": [instance],
        "parameters": {
            "aspectRatio": aspect_ratio,
            "durationSeconds": duration_seconds,
            "sampleCount": 1,
            "personGeneration": "allow_adult",
        },
    }

    try:
        op = await _authed_post(_predict_url(), body)
    except Exception as exc:
        _JOBS[provider_job_id] = {"status": "failed", "error": str(exc)}
        return {"jobId": provider_job_id}

    op_name = op.get("name") if isinstance(op, dict) else None
    if not op_name:
        _JOBS[provider_job_id] = {
            "status": "failed",
            "error": f"Vertex predictLongRunning returned no operation name: {str(op)[:300]}",
        }
        return {"jobId": provider_job_id}

    _JOBS[provider_job_id] = {
        "status": "running",
        "operationName": op_name,
        "publicId": pid,
    }
    asyncio.create_task(_poll_until_done(provider_job_id))
    return {"jobId": provider_job_id}


async def _poll_until_done(provider_job_id: str) -> None:
    job = _JOBS.get(provider_job_id)
    if not job or job.get("status") != "running":
        return
    op_name = job["operationName"]
    pid = job["publicId"]

    for _ in range(_MAX_POLL_ATTEMPTS):
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        try:
            result = await _authed_post(_fetch_op_url(), {"operationName": op_name})
        except Exception as exc:
            _JOBS[provider_job_id] = {"status": "failed", "error": f"poll error: {exc}"}
            return

        if isinstance(result.get("error"), dict):
            err = result["error"]
            _JOBS[provider_job_id] = {
                "status": "failed",
                "error": f"Veo error {err.get('code', '?')}: {err.get('message', 'unknown')}",
            }
            return

        if not result.get("done"):
            continue

        response = result.get("response") or {}
        videos = response.get("videos") or []
        if not videos:
            filtered = response.get("raiMediaFilteredCount", 0)
            reasons = "; ".join(response.get("raiMediaFilteredReasons") or []) or "no videos"
            _JOBS[provider_job_id] = {
                "status": "failed",
                "error": (
                    f"Veo filtered the output ({reasons}). Try softening the prompt."
                    if filtered
                    else f"Veo returned no video. Raw: {str(response)[:300]}"
                ),
            }
            return

        video = videos[0]
        try:
            clip_url, clip_public_id = await _persist(video, pid)
            _JOBS[provider_job_id] = {
                "status": "succeeded",
                "clipUrl": clip_url,
                "clipPublicId": clip_public_id,
            }
        except Exception as exc:
            _JOBS[provider_job_id] = {"status": "failed", "error": f"persist error: {exc}"}
        return

    _JOBS[provider_job_id] = {
        "status": "failed",
        "error": f"Veo timed out after {_MAX_POLL_ATTEMPTS * _POLL_INTERVAL_SECONDS}s",
    }


async def _persist(video: dict, public_id: str) -> tuple[str, str]:
    if video.get("bytesBase64Encoded"):
        # Cloudinary's uploader accepts data: URIs directly.
        mime = video.get("mimeType") or "video/mp4"
        data_uri = f"data:{mime};base64,{video['bytesBase64Encoded']}"
        # Validate decodable; raise early if corrupt.
        base64.b64decode(video["bytesBase64Encoded"], validate=False)
        result = await upload_video_from_url(data_uri, public_id)
        return result["url"], result["publicId"]
    if video.get("gcsUri"):
        raise RuntimeError(
            f"Veo returned a gs:// URI ({video['gcsUri']}) but no base64 payload. "
            "Either omit storageUri to get base64, or wire a GCS signed-URL step."
        )
    raise RuntimeError("Veo response had neither bytesBase64Encoded nor gcsUri.")


async def status(provider_job_id: str) -> StatusResult:
    job = _JOBS.get(provider_job_id)
    if not job:
        return {"status": "failed", "error": f"Unknown vertex jobId: {provider_job_id}"}
    if job["status"] == "running":
        return {"status": "running"}
    if job["status"] == "failed":
        return {"status": "failed", "error": job.get("error", "vertex failed")}
    return {
        "status": "succeeded",
        "clipUrl": job["clipUrl"],
        "clipPublicId": job["clipPublicId"],
    }
