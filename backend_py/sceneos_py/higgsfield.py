"""
Higgsfield AI provider — supports BOTH documented auth shapes.

  Public API (higgsfieldapi.com):
      HIGGSFIELD_API_KEY=<single bearer token>
    → Authorization: Bearer {key}
    → POST https://higgsfieldapi.com/api/v1/generate
    → GET  https://higgsfieldapi.com/api/v1/status/{generation_id}

  Legacy platform (platform.higgsfield.ai / cloud.higgsfield.ai):
      HIGGSFIELD_API_KEY=<UUID key id>
      HIGGSFIELD_API_SECRET=<64-hex secret>
    → Authorization: Key {key_id}:{secret}
    → POST https://platform.higgsfield.ai/{model_id}
    → GET  https://platform.higgsfield.ai/requests/{request_id}/status

The provider auto-detects mode based on whether SECRET is set.

Auto-mode dispatch (which generation type to run):
  - Text-to-video:   prompt only.
  - Image-to-video:  prompt + image_url (single seed image).
  - Soul mode:       prompt + reference_image_urls (1-5 character/location refs).

Soul mode is the killer feature — we feed character + location reference
images we already generated via Imagen, and Higgsfield uses them as
cross-frame consistency anchors. That keeps the protagonist's face the
same across all beats without us having to chain last-frames.

Status flow:
  - generate() POSTs, gets back a request/generation id
  - we wrap that in our local Job and return jobId="hf-<uuid>"
  - status(jobId) polls the right status endpoint for the active mode
  - on COMPLETED, we re-upload the resulting MP4 to our Cloudinary cloud
    (so the editor's fl_splice path stays inside one CDN) and return
    clipUrl + clipPublicId
"""
from __future__ import annotations

import logging
import uuid

import httpx

from .cloudinary import public_id_for_scene, upload_video_from_url
from .config import env
from .jobs import Job, get, put


logger = logging.getLogger(__name__)

PUBLIC_BASE_URL = "https://higgsfieldapi.com/api/v1"
LEGACY_BASE_URL = "https://platform.higgsfield.ai"
LEGACY_T2I_MODEL = "higgsfield-ai/soul/standard"
LEGACY_I2V_MODEL = "higgsfield-ai/dop/standard"
DEFAULT_DURATION = 5
DEFAULT_RESOLUTION = "720p"
DEFAULT_ASPECT_RATIO = "16:9"


def _is_legacy() -> bool:
    """Use the legacy platform.higgsfield.ai surface when both KEY + SECRET
    are set. Otherwise use the public bearer-token API."""
    return bool(env("HIGGSFIELD_API_KEY") and env("HIGGSFIELD_API_SECRET"))


def _base_url() -> str:
    explicit = env("HIGGSFIELD_BASE_URL")
    if explicit:
        return explicit
    return LEGACY_BASE_URL if _is_legacy() else PUBLIC_BASE_URL


def _auth_header() -> dict[str, str]:
    key = env("HIGGSFIELD_API_KEY")
    if not key:
        raise RuntimeError(
            "HIGGSFIELD_API_KEY is not set. Get a key from cloud.higgsfield.ai "
            "(or higgsfieldapi.com) and set it in backend_py/.env."
        )
    secret = env("HIGGSFIELD_API_SECRET")
    if secret:
        # Legacy platform — `Authorization: Key {id}:{secret}`.
        return {"Authorization": f"Key {key}:{secret}"}
    # Public API — bearer token.
    return {"Authorization": f"Bearer {key}"}


def _generation_id(body: dict) -> str | None:
    """The public API returns `generation_id`; older Pixazo/Segmind responses
    used `request_id`. Accept both for forward compatibility."""
    for key in ("generation_id", "request_id", "id", "generationId", "requestId"):
        v = body.get(key)
        if isinstance(v, str) and v:
            return v
    return None


def _media_url(body: dict) -> str | None:
    """Pull a video URL out of any of the documented response shapes."""
    # Public API shape: { result: { video_url: "..." } } or { video_url: "..." }
    for key in ("video_url", "media_url", "output_url", "result_url", "url"):
        v = body.get(key)
        if isinstance(v, str) and v:
            return v
    # Pixazo/Segmind: { output: { media_url: ["..."] } }
    output = body.get("output")
    if isinstance(output, dict):
        media = output.get("media_url")
        if isinstance(media, list) and media:
            first = media[0]
            return first if isinstance(first, str) else None
        for key in ("video_url", "url"):
            v = output.get(key)
            if isinstance(v, str) and v:
                return v
    # Some shapes nest under result.
    result = body.get("result")
    if isinstance(result, dict):
        for key in ("video_url", "media_url", "url"):
            v = result.get(key)
            if isinstance(v, str) and v:
                return v
    return None


def _build_payload(params: dict) -> dict:
    """Compose the request body the public API expects.

    Mode is auto-detected by what fields we send:
      - reference_image_urls present → Soul mode (character+location consistency)
      - image_url present (and no refs) → image-to-video
      - prompt only → text-to-video
    """
    clip_prompt = params.get("clipPrompt") or {}
    refined = params.get("refinedPrompt") or ""
    motion_prompt = clip_prompt.get("motionPrompt") or refined or ""

    payload: dict = {
        "prompt": (motion_prompt or refined)[:1000],
        "duration": int(clip_prompt.get("durationSeconds") or params.get("durationSeconds") or DEFAULT_DURATION),
        "resolution": clip_prompt.get("resolution") or DEFAULT_RESOLUTION,
        "aspect_ratio": clip_prompt.get("aspectRatio") or DEFAULT_ASPECT_RATIO,
    }

    # Reference image URLs win over a single seed (Soul mode > image-to-video).
    # Cap at 5 — that's the API ceiling.
    refs = params.get("referenceImageUrls") or []
    if isinstance(refs, list):
        refs = [u for u in refs if isinstance(u, str) and u][:5]
    if refs:
        payload["reference_image_urls"] = refs
    else:
        seed = params.get("startImageUrl")
        if isinstance(seed, str) and seed:
            payload["image_url"] = seed

    return payload


def _generate_url() -> str:
    """Public API: /generate. Legacy: /{model_id} (we pick I2V vs T2I based on
    whether the payload has reference_image_urls or image_url)."""
    return (
        f"{_base_url()}/generate"
        if not _is_legacy()
        else f"{_base_url()}/{LEGACY_I2V_MODEL}"
    )


def _status_url(request_id: str) -> str:
    return (
        f"{_base_url()}/status/{request_id}"
        if not _is_legacy()
        else f"{_base_url()}/requests/{request_id}/status"
    )


async def _post_generate(payload: dict) -> dict:
    headers = {**_auth_header(), "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(_generate_url(), json=payload, headers=headers)
        res.raise_for_status()
        return res.json()


async def _poll_status(request_id: str) -> dict:
    """Returns one of:
      {"status": "running"}                          — still queued/processing
      {"status": "succeeded", "assetUrl": "https://..."}
      {"status": "failed", "error": "..."}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(_status_url(request_id), headers=_auth_header())
        res.raise_for_status()
        body = res.json()
    raw = str(body.get("status") or body.get("state") or "").lower()
    if raw in {"failed", "error", "errored", "cancelled", "canceled", "rejected"}:
        return {"status": "failed", "error": body.get("error") or body.get("message") or raw}
    if raw in {"completed", "succeeded", "success", "complete", "ready", "done"}:
        asset = _media_url(body)
        if not asset:
            return {"status": "failed", "error": "Higgsfield reported success but no media URL"}
        return {"status": "succeeded", "assetUrl": asset}
    return {"status": "running"}


# ── Public provider surface ────────────────────────────────────────────────


async def generate(params: dict) -> dict:
    """Submit a Higgsfield generation. The mode (text-to-video, image-to-video,
    or Soul) is picked from the params shape inside `_build_payload`."""
    payload = _build_payload(params)
    body = await _post_generate(payload)
    gen_id = _generation_id(body)
    if not gen_id:
        raise RuntimeError(f"Higgsfield response missing generation_id: {body}")

    job_id = f"hf-{uuid.uuid4()}"
    put(
        Job(
            job_id=job_id,
            provider="higgsfield",
            stage="i2v_running",  # generic "remote running" — single-stage now
            clip_prompt=params.get("clipPrompt"),
            i2v_request_id=gen_id,
            image_url=payload.get("image_url"),
            project_id=params.get("projectId"),
            beat_id=params.get("beatId"),
            scene_id=params.get("sceneId"),
        )
    )
    logger.info(
        "[higgsfield] submitted generation_id=%s mode=%s job_id=%s",
        gen_id,
        "soul" if "reference_image_urls" in payload
        else "i2v" if "image_url" in payload else "t2v",
        job_id,
    )
    return {"jobId": job_id}


async def status(job_id: str) -> dict:
    job = get(job_id)
    if not job:
        return {"status": "failed", "error": f"unknown job {job_id}"}
    if job.stage == "succeeded":
        return {
            "status": "succeeded",
            "clipUrl": job.cloudinary_url or job.video_url,
            "clipPublicId": job.cloudinary_public_id,
        }
    if job.stage == "failed":
        return {"status": "failed", "error": job.error}

    if job.stage == "i2v_running" and job.i2v_request_id:
        remote = await _poll_status(job.i2v_request_id)
        if remote["status"] == "running":
            return {"status": "running", "imageUrl": job.image_url}
        if remote["status"] == "failed" or not remote.get("assetUrl"):
            job.stage = "failed"
            job.error = remote.get("error") or "Higgsfield succeeded without asset URL"
            put(job)
            return {"status": "failed", "error": job.error}

        job.video_url = remote["assetUrl"]
        # Re-upload to our Cloudinary cloud so the editor's fl_splice URL bake
        # works inside a single CDN. R2-hosted Higgsfield outputs would force
        # cross-origin video composition, which Cloudinary doesn't support.
        try:
            uploaded = await upload_video_from_url(
                job.video_url,
                public_id_for_scene(
                    job.project_id, job.beat_id, job.scene_id, job.job_id
                ),
            )
            job.cloudinary_url = uploaded["url"]
            job.cloudinary_public_id = uploaded["publicId"]
        except Exception as exc:
            logger.warning(
                "[higgsfield] Cloudinary re-upload failed; falling back to R2 URL: %s",
                exc,
            )
            job.cloudinary_url = job.video_url
            job.cloudinary_public_id = None

        job.stage = "succeeded"
        put(job)
        return {
            "status": "succeeded",
            "clipUrl": job.cloudinary_url,
            "clipPublicId": job.cloudinary_public_id,
        }

    return {"status": "queued"}
