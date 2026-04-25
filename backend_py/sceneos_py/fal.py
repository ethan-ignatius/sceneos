"""
fal.ai LTX-Video provider — fast/cheap tier.

Mirrors backend/src/services/fal.ts. fal.subscribe blocks until the queue
finishes, so we wrap it in a fire-and-forget background task and surface
state through a local in-memory job map.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from .config import env
from .provider import GenerateClipParams, StatusResult


_MODEL_ID = "fal-ai/ltx-video"
_JOBS: dict[str, dict[str, Any]] = {}
_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    key = env("FAL_API_KEY")
    if not key:
        raise RuntimeError(
            "fal.py: FAL_API_KEY is not set. Get a free key at https://fal.ai (signup includes credit)."
        )
    import os
    os.environ["FAL_KEY"] = key
    _configured = True


async def _run(provider_job_id: str, prompt: str, duration_seconds: float, image_url: str | None) -> None:
    try:
        import fal_client

        input_payload: dict[str, Any] = {
            "prompt": prompt,
            "duration_seconds": duration_seconds,
        }
        if image_url:
            input_payload["image_url"] = image_url

        # Run the blocking subscribe in a thread.
        result = await asyncio.to_thread(
            fal_client.subscribe,
            _MODEL_ID,
            arguments=input_payload,
            with_logs=False,
        )
        url = None
        if isinstance(result, dict):
            video = result.get("video")
            if isinstance(video, dict):
                url = video.get("url")
        if not url:
            _JOBS[provider_job_id] = {
                "status": "failed",
                "error": f"fal returned no video url. Raw: {str(result)[:200]}",
            }
            return
        _JOBS[provider_job_id] = {"status": "succeeded", "clipUrl": url}
    except Exception as exc:
        _JOBS[provider_job_id] = {"status": "failed", "error": str(exc)}


async def generate(params: GenerateClipParams) -> dict:
    _ensure_configured()
    provider_job_id = str(uuid.uuid4())
    _JOBS[provider_job_id] = {"status": "running"}

    asyncio.create_task(
        _run(
            provider_job_id,
            params["refinedPrompt"],
            params["durationSeconds"],
            params.get("startImageUrl"),
        )
    )
    return {"jobId": provider_job_id}


async def status(provider_job_id: str) -> StatusResult:
    job = _JOBS.get(provider_job_id)
    if not job:
        return {"status": "failed", "error": f"Unknown fal jobId: {provider_job_id}"}
    if job["status"] == "running":
        return {"status": "running"}
    if job["status"] == "failed":
        return {"status": "failed", "error": job.get("error", "fal failed")}
    return {"status": "succeeded", "clipUrl": job["clipUrl"]}
