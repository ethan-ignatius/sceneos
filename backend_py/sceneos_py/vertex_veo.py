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
import logging
import os
import time
import uuid
from datetime import datetime, UTC
from typing import Any

import httpx

from .cloudinary import public_id_for_scene, upload_video_from_url
from .config import env
from .provider import GenerateClipParams, StatusResult


logger = logging.getLogger(__name__)

_JOBS: dict[str, dict[str, Any]] = {}
# Job start timestamps live in a parallel dict so the existing dict-replacement
# pattern in _poll_until_done (which overwrites _JOBS[id] on each transition)
# doesn't lose them. Captured ONCE when the job is first dispatched; surfaced
# via status() so the frontend can compute true elapsed across drawer
# close/reopen cycles.
_JOB_STARTED_AT: dict[str, str] = {}
# The prompt that was sent to Veo for each job. Kept so we can log the
# exact text when a job is rejected by the safety filter.
_JOB_PROMPTS: dict[str, str] = {}
# perf_counter milestones per job: start, submit, veo_done, upload_done (for logging).
_VEO_TIMINGS: dict[str, dict[str, float]] = {}

_SAFETY_KEYWORDS = ("sensitive words", "responsible ai", "violat", "safety", "blocked")

def _is_safety_error(msg: str) -> bool:
    low = msg.lower()
    return any(kw in low for kw in _SAFETY_KEYWORDS)


def _veo_speed_mode() -> bool:
    v = (os.environ.get("VEO_SPEED_MODE") or "").strip().lower()
    return v in ("1", "true", "yes", "on", "fast")


def _poll_interval_seconds() -> float:
    raw = env("VEO_POLL_INTERVAL_SECONDS", "2") or "2"
    try:
        return max(0.5, min(30.0, float(raw)))
    except ValueError:
        return 2.0


def _max_poll_attempts() -> int:
    # ~10 minute safety window regardless of interval.
    return max(60, int(600 / _poll_interval_seconds()))


def _veo_resolution() -> str:
    if "VEO_RESOLUTION" in os.environ:
        return (env("VEO_RESOLUTION") or "1080p") or "1080p"
    if _veo_speed_mode():
        return "720p"
    return "1080p"


def _veo_generate_audio() -> bool:
    if "VEO_GENERATE_AUDIO" in os.environ:
        return (env("VEO_GENERATE_AUDIO", "true") or "true").lower() != "false"
    if _veo_speed_mode():
        return False
    return True


def _log_veo_timings(job_id: str, *, outcome: str = "ok") -> None:
    row = _VEO_TIMINGS.pop(job_id, None)
    if not row:
        return
    t0 = row.get("start")
    if t0 is None:
        return

    def _ms(t: float | None) -> float:
        return (t - t0) * 1000.0 if t is not None else -1.0

    v_done = row.get("veo_done")
    u_done = row.get("upload_done")
    upload_ms = (u_done - v_done) * 1000.0 if (v_done is not None and u_done is not None) else -1.0
    last_t = u_done or v_done or row.get("submit")
    total_wall_ms = (last_t - t0) * 1000.0 if last_t is not None else 0.0
    logger.info(
        "[vertex.veo.timing] job=%s outcome=%s total_ms=%.0f start_to_submit_ms=%.0f "
        "first_poll_ms=%.0f veo_done_ms=%.0f cloudinary_ms=%.0f",
        job_id,
        outcome,
        total_wall_ms,
        _ms(row.get("submit")),
        _ms(row.get("first_poll")),
        _ms(v_done),
        upload_ms,
    )


def _soften_prompt(prompt: str) -> str:
    """Reduce wording that frequently triggers Veo safety filters."""
    p = (prompt or "").strip()
    if not p:
        return p
    replacements = {
        "ancient weapons": "ancient artifacts",
        "weapon": "artifact",
        "martial arts": "disciplined training",
        "deadly": "dangerous",
        "kill": "defeat",
        "blood": "dust",
        "violence": "conflict",
        "fight": "confrontation",
        "battle": "trial",
    }
    out = p
    for src, dst in replacements.items():
        out = out.replace(src, dst).replace(src.title(), dst.title())
    if "non-graphic" not in out.lower():
        out = f"{out} Keep depiction non-graphic, PG-13, and focused on atmosphere and discovery."
    return out


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
    # Veo 3.1 GA (released Nov 17, 2025). The current SOTA on Vertex AI for
    # text-to-video. Over Veo 3:
    #   - Better cinematic-style adherence (i.e. the prompt's framing, lens,
    #     and lighting language actually shows up on screen).
    #   - Better character consistency across image-to-video: when seeded
    #     with the project's character/location ref, the protagonist looks
    #     like the SAME person across all 7 beats, not seven similar people.
    #     This is the single biggest contributor to "the video has flow".
    #   - Richer native audio (synchronized SFX + dialogue at 1080p).
    #   - Same predictLongRunning + fetchPredictOperation transport, no
    #     wire-format change vs. Veo 3 — drop-in upgrade.
    # Default: Veo 3.1 Fast (5x the per-minute quota of the quality tier; some
    # fidelity trade-off). Override with VEO_MODEL_ID, e.g. veo-3.1-generate-001
    # for full quality, or veo-3.0-generate-001 for regression.
    model_id = env("VEO_MODEL_ID", "veo-3.1-fast-generate-001") or "veo-3.1-fast-generate-001"
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
    t_start = time.perf_counter()
    # Capture the dispatch timestamp NOW so even fail-fast paths (image
    # fetch errors, predictLongRunning rejections) still expose a startedAt
    # to status callers. The frontend uses this to compute true elapsed.
    _JOB_STARTED_AT[provider_job_id] = datetime.now(UTC).isoformat()
    _VEO_TIMINGS[provider_job_id] = {"start": t_start}
    pid = public_id_for_scene(
        params.get("projectId"), params.get("beatId"), params.get("sceneId"), provider_job_id
    )

    clip_prompt = params.get("clipPrompt") or {}
    aspect_ratio = clip_prompt.get("aspectRatio") or "16:9"
    requested = clip_prompt.get("durationSeconds") or params["durationSeconds"]
    # Veo 3.x only accepts {4, 6, 8}s. Nearest value wins; on ties, default to
    # the shorter clip for wall-clock (set VEO_PREFER_LONGER_ON_TIE=1 for
    # the old "5 → 6s" behavior).
    requested_int = round(float(requested))
    allowed = (4, 6, 8)
    prefer_longer = (env("VEO_PREFER_LONGER_ON_TIE", "false") or "false").lower() in (
        "1", "true", "yes", "on"
    )
    duration_seconds = min(
        allowed,
        key=lambda d: (abs(d - requested_int), -d if prefer_longer else d),
    )

    # CRITICAL: send Veo the FULL cinematic prompt (subject + action + setting
    # + framing + lighting + mood), not just the camera-motion fragment. The
    # earlier code preferred motionPrompt — which is a 25-word string with no
    # subject — and that's why output looked generic. Veo 3 rewards specificity.
    full_prompt = (
        params.get("refinedPrompt")
        or (
            f"{clip_prompt.get('imagePrompt', '')} {clip_prompt.get('motionPrompt', '')}".strip()
        )
        or clip_prompt.get("motionPrompt")
        or ""
    )
    # Optional voice line — Veo 3 will lip-sync dialogue when included in the
    # prompt as direct speech. Keep this short; Veo handles ~10 words of
    # spoken dialogue cleanly per 8s clip.
    voice_line = (clip_prompt.get("voiceLine") or "").strip()
    if voice_line:
        full_prompt = f"{full_prompt} The narrator says: \"{voice_line}\"."
    softened_prompt = _soften_prompt(full_prompt)

    # Log the actual prompt being sent to Veo. This is the source-of-truth
    # for "is the user's idea reaching the model" — print the full string
    # at WARNING level (above the uvicorn default) so any operator can
    # grep the backend log and see what Veo is actually rendering for
    # the given job. WARNING used because uvicorn's --log-level INFO
    # gates only its own loggers; application loggers default to WARN.
    logger.warning(
        "[vertex.PROMPT] job=%s len=%d → %s",
        provider_job_id, len(full_prompt), full_prompt[:800],
    )
    _JOB_PROMPTS[provider_job_id] = full_prompt
    instance: dict[str, Any] = {"prompt": full_prompt}

    # Chained generation: when the previous beat's last frame is provided,
    # seed Veo's I2V mode with it. Veo accepts inline base64 OR gcsUri.
    start_image_url = params.get("startImageUrl")
    if start_image_url:
        try:
            b64, mime = await _fetch_image_b64(start_image_url)
            instance["image"] = {"bytesBase64Encoded": b64, "mimeType": mime}
        except Exception as exc:
            _VEO_TIMINGS.pop(provider_job_id, None)
            _JOBS[provider_job_id] = {
                "status": "failed",
                "error": f"failed to fetch startImageUrl: {exc}",
            }
            return {"jobId": provider_job_id}

    # Audio + resolution: VEO_SPEED_MODE=fast → 720p + no native audio when
    # those env vars are not explicitly set (see _veo_resolution / _veo_generate_audio).
    generate_audio = _veo_generate_audio()
    resolution = _veo_resolution()
    body = {
        "instances": [instance],
        "parameters": {
            "aspectRatio": aspect_ratio,
            "durationSeconds": duration_seconds,
            "sampleCount": 1,
            "personGeneration": "allow_adult",
            "generateAudio": generate_audio,
            "resolution": resolution,
        },
    }

    try:
        logger.info(
            "[vertex] submitting Veo job %s publicId=%s duration=%ss res=%s audio=%s speed_mode=%s",
            provider_job_id,
            pid,
            duration_seconds,
            resolution,
            generate_audio,
            _veo_speed_mode(),
        )
        # Idempotency key tied to our pre-generated job id: if Veo accepts
        # the predict-long-running call but the response parse blows up,
        # the retry returns the cached LRO name instead of re-submitting
        # (Veo charges per submission).
        from .retry import with_reliability
        op = await with_reliability(
            "vertex.veo.submit",
            lambda: _authed_post(_predict_url(), body),
            timeout_seconds=120.0,
            max_attempts=3,
            base_backoff=2.0,
            idempotency_key=f"veo.submit:{provider_job_id}",
            breaker_name="vertex.veo",
        )
    except Exception as exc:
        _VEO_TIMINGS.pop(provider_job_id, None)
        _JOBS[provider_job_id] = {"status": "failed", "error": str(exc)}
        logger.exception("[vertex] submit failed job=%s", provider_job_id)
        return {"jobId": provider_job_id}

    _VEO_TIMINGS[provider_job_id]["submit"] = time.perf_counter()
    op_name = op.get("name") if isinstance(op, dict) else None
    if not op_name:
        _log_veo_timings(provider_job_id, outcome="no_operation_name")
        _JOBS[provider_job_id] = {
            "status": "failed",
            "error": f"Vertex predictLongRunning returned no operation name: {str(op)[:300]}",
        }
        return {"jobId": provider_job_id}
    _JOBS[provider_job_id] = {
        "status": "running",
        "stage": "veo_running",
        "operationName": op_name,
        "publicId": pid,
        "requestBody": body,
        "softenedPrompt": softened_prompt,
        "safetyRetryUsed": False,
    }
    logger.info("[vertex] Veo operation started job=%s operation=%s", provider_job_id, op_name)
    asyncio.create_task(_poll_until_done(provider_job_id))
    return {"jobId": provider_job_id}


async def _poll_until_done(provider_job_id: str) -> None:
    job = _JOBS.get(provider_job_id)
    if not job or job.get("status") != "running":
        return
    op_name = job["operationName"]
    pid = job["publicId"]

    from .retry import with_reliability
    import time as _t
    poll_start = _t.monotonic()

    poll_iv = _poll_interval_seconds()
    n_max = _max_poll_attempts()
    saw_first_poll = False
    for _ in range(n_max):
        await asyncio.sleep(poll_iv)
        try:
            # Poll is a pure read; safe to retry. We do NOT use an
            # idempotency key because each poll observes fresh state and
            # caching would mask "done=true" transitions.
            result = await with_reliability(
                "vertex.veo.poll",
                lambda: _authed_post(_fetch_op_url(), {"operationName": op_name}),
                timeout_seconds=30.0,
                max_attempts=3,
                base_backoff=1.0,
                breaker_name="vertex.veo",
            )
        except Exception as exc:
            _log_veo_timings(provider_job_id, outcome="poll_ex")
            _JOBS[provider_job_id] = {"status": "failed", "error": f"poll error: {exc}"}
            logger.exception("[vertex] poll failed job=%s", provider_job_id)
            return

        if not saw_first_poll:
            _VEO_TIMINGS.setdefault(provider_job_id, {})["first_poll"] = time.perf_counter()
            saw_first_poll = True

        if isinstance(result.get("error"), dict):
            err = result["error"]
            raw_msg = err.get("message", "unknown")
            safety = _is_safety_error(raw_msg)
            _log_veo_timings(provider_job_id, outcome="veo_safety_block" if safety else "veo_api_error")
            if safety:
                offending = _JOB_PROMPTS.get(provider_job_id, "<not captured>")
                logger.error(
                    "[vertex.SAFETY] job=%s BLOCKED by Veo safety filter.\n"
                    "  Veo message: %s\n"
                    "  Prompt that caused it (%d chars):\n%s",
                    provider_job_id, raw_msg, len(offending), offending,
                )
            _JOBS[provider_job_id] = {
                "status": "failed",
                "safety": safety,
                "error": (
                    "Veo's safety filter blocked this prompt. Try rephrasing — "
                    "avoid words related to violence, weapons, or real public figures."
                ) if safety else f"Veo error {err.get('code', '?')}: {raw_msg}",
            }
            return

        if not result.get("done"):
            continue

        response = result.get("response") or {}
        videos = response.get("videos") or []
        if not videos:
            filtered = response.get("raiMediaFilteredCount", 0)
            reasons = "; ".join(response.get("raiMediaFilteredReasons") or []) or "no videos"
            safety = bool(filtered)
            _VEO_TIMINGS.setdefault(provider_job_id, {})["veo_done"] = time.perf_counter()

            # Safety-filter auto-retry: resubmit with the softened prompt once.
            if filtered and not job.get("safetyRetryUsed"):
                try:
                    body = dict(job.get("requestBody") or {})
                    instances = list(body.get("instances") or [])
                    if instances:
                        first = dict(instances[0] or {})
                        first["prompt"] = job.get("softenedPrompt") or first.get("prompt", "")
                        instances[0] = first
                        body["instances"] = instances
                        op2 = await _authed_post(_predict_url(), body)
                        op2_name = op2.get("name") if isinstance(op2, dict) else None
                        if op2_name:
                            _JOBS[provider_job_id] = {
                                **job,
                                "status": "running",
                                "stage": "veo_running",
                                "operationName": op2_name,
                                "requestBody": body,
                                "safetyRetryUsed": True,
                                "safetyRetryReason": reasons,
                            }
                            logger.warning(
                                "[vertex] safety filtered; retried softened prompt job=%s reasons=%s",
                                provider_job_id,
                                reasons,
                            )
                            job = _JOBS[provider_job_id]
                            op_name = op2_name
                            continue
                except Exception:
                    logger.exception("[vertex] softened retry submit failed job=%s", provider_job_id)

            _log_veo_timings(
                provider_job_id,
                outcome="filtered" if filtered else "no_video_payload",
            )
            if safety:
                offending = _JOB_PROMPTS.get(provider_job_id, "<not captured>")
                logger.error(
                    "[vertex.SAFETY] job=%s output FILTERED (%s).\n"
                    "  Prompt (%d chars):\n%s",
                    provider_job_id, reasons, len(offending), offending,
                )
            _JOBS[provider_job_id] = {
                "status": "failed",
                "safety": safety,
                "error": (
                    "Veo's safety filter blocked this prompt. Try rephrasing — "
                    "avoid words related to violence, weapons, or real public figures."
                ) if safety else f"Veo returned no video. Raw: {str(response)[:300]}",
            }
            return

        video = videos[0]
        veo_seconds = _t.monotonic() - poll_start
        # Approx payload size — Veo response is base64-encoded video.
        b64_len = len(video.get("bytesBase64Encoded", "")) if isinstance(video, dict) else 0
        approx_mb = b64_len / 1_048_576
        _VEO_TIMINGS.setdefault(provider_job_id, {})["veo_done"] = time.perf_counter()
        try:
            _JOBS[provider_job_id] = {
                **_JOBS.get(provider_job_id, {}),
                "status": "running",
                "stage": "cloudinary_uploading",
            }
            logger.info(
                "[vertex] Veo done in %.1fs; payload ~%.1fMB; uploading to Cloudinary job=%s publicId=%s",
                veo_seconds, approx_mb, provider_job_id, pid,
            )
            upload_start = _t.monotonic()
            clip_url, clip_public_id = await _persist(video, pid)
            upload_seconds = _t.monotonic() - upload_start
            _VEO_TIMINGS[provider_job_id]["upload_done"] = time.perf_counter()
            _log_veo_timings(provider_job_id, outcome="ok")
            _JOBS[provider_job_id] = {
                "status": "succeeded",
                "stage": "cloudinary_uploaded",
                "clipUrl": clip_url,
                "clipPublicId": clip_public_id,
            }
            total_seconds = _t.monotonic() - poll_start
            logger.info(
                "[vertex] DONE job=%s · veo=%.1fs · upload=%.1fs · total=%.1fs · publicId=%s",
                provider_job_id, veo_seconds, upload_seconds, total_seconds, clip_public_id,
            )
            logger.info(
                "[vertex] Cloudinary upload complete job=%s publicId=%s url=%s",
                provider_job_id,
                clip_public_id,
                clip_url,
            )
        except Exception as exc:
            _log_veo_timings(provider_job_id, outcome="persist_failed")
            # Surface the real cause. Wrapping just `exc` (e.g. an httpx
            # HTTPStatusError with empty args) loses the response body, which
            # is the only thing that tells you whether Cloudinary rejected
            # the data URI for size, format, or auth — all three look the
            # same when stringified.
            import traceback
            detail = repr(exc)
            response = getattr(exc, "response", None)
            if response is not None:
                try:
                    detail = f"{detail} | http {response.status_code}: {response.text[:400]}"
                except Exception:
                    pass
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-800:]
            _JOBS[provider_job_id] = {"status": "failed", "error": f"persist error: {detail}\n{tb}"}
            logger.exception("[vertex] Cloudinary upload failed job=%s", provider_job_id)
        return

    _log_veo_timings(provider_job_id, outcome="poll_timeout")
    _JOBS[provider_job_id] = {
        "status": "failed",
        "error": f"Veo timed out after {n_max * poll_iv:.0f}s ({n_max} polls × {poll_iv}s)",
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
    started_at = _JOB_STARTED_AT.get(provider_job_id)
    if job["status"] == "running":
        out: StatusResult = {"status": "running", "stage": job.get("stage", "veo_running")}
        if started_at:
            out["startedAt"] = started_at
        return out
    if job["status"] == "failed":
        out2: StatusResult = {"status": "failed", "error": job.get("error", "vertex failed")}
        if started_at:
            out2["startedAt"] = started_at
        if job.get("safety"):
            out2["safety"] = True  # type: ignore[typeddict-unknown-key]
        return out2
    out3: StatusResult = {
        "status": "succeeded",
        "stage": job.get("stage", "cloudinary_uploaded"),
        "clipUrl": job["clipUrl"],
        "clipPublicId": job["clipPublicId"],
    }
    if started_at:
        out3["startedAt"] = started_at
    return out3
