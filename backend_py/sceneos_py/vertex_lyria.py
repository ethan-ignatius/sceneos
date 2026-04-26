"""
Vertex AI Lyria 2 — text-to-music generation for the per-project music bed.

Auth shares the same service account as Vertex Veo + Imagen + Gemini.
Same predict pattern as Imagen but the response is a base64 WAV.

Used by `audio.pick_music()` (and indirectly by `session.start_session`)
to produce ONE 32-second instrumental score per project, mood-tagged from
the manifest. The score is uploaded to Cloudinary as an audio asset and
its publicId is stamped on `manifest.audioPublicId` so the stitch step
can `l_audio:` overlay it underneath the Veo 3 native dialogue + ambient.

Lyria specs (lyria-002, GA 2025-10-27):
- Output: 48 kHz mono WAV, base64-encoded
- Length: ~32.8 seconds per clip
- 10 RPM regional quota
- Same auth + REST pattern as Veo's predictLongRunning, but uses sync
  `:predict` (not :predictLongRunning) — the call returns the audio
  directly, no polling.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

import httpx

from .cloudinary import upload_audio_from_bytes
from .config import env

logger = logging.getLogger(__name__)


DEFAULT_MODEL = "lyria-002"
_REQUEST_TIMEOUT_SECONDS = 90


def _read_config() -> dict[str, str]:
    project_id = env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")
    if not project_id:
        raise RuntimeError(
            "vertex-lyria: GOOGLE_PROJECT_ID (or legacy GCP_PROJECT_ID) is not set."
        )
    location = (
        env("GOOGLE_CLOUD_LOCATION")
        or env("GCP_VEO_LOCATION")
        or env("GCP_LOCATION")
        or "us-central1"
    )
    model_id = env("LYRIA_MODEL_ID", DEFAULT_MODEL) or DEFAULT_MODEL
    return {"projectId": project_id, "location": location, "modelId": model_id}


def _predict_url() -> str:
    cfg = _read_config()
    return (
        f"https://{cfg['location']}-aiplatform.googleapis.com/v1/projects/{cfg['projectId']}"
        f"/locations/{cfg['location']}/publishers/google/models/{cfg['modelId']}:predict"
    )


async def _access_token() -> str:
    key_file = env("GOOGLE_APPLICATION_CREDENTIALS")
    if not key_file:
        raise RuntimeError(
            "vertex-lyria: GOOGLE_APPLICATION_CREDENTIALS is not set."
        )

    def _refresh() -> str:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        creds = service_account.Credentials.from_service_account_file(
            key_file, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        creds.refresh(Request())
        if not creds.token:
            raise RuntimeError("vertex-lyria: failed to obtain access token.")
        return creds.token  # type: ignore[return-value]

    return await asyncio.to_thread(_refresh)


# ── Mood → music prompt mapping ─────────────────────────────────────────
# These are the prompts Lyria sees per (videoType, masterMood). Tuned to
# match the cinematic feel of the SceneOS 7-beat arc: introspective,
# atmospheric, instrumental, never on-the-nose. We avoid genre buzzwords
# ("epic", "trailer") that push Lyria toward stock-music territory.

_MOOD_PROMPTS: dict[str, str] = {
    "default": (
        "A slow, contemplative instrumental piece with soft piano and warm strings. "
        "Minor key, gentle and patient, no percussion."
    ),
    "intimate-hook": (
        "A quiet solo piano playing a slow, sad melody with subtle string accompaniment. "
        "Soft and intimate."
    ),
    "wide-establish": (
        "A cinematic instrumental piece with sustained strings and soft horns. "
        "Atmospheric and patient, gentle major key."
    ),
    "kinetic-rising": (
        "An instrumental piece with pizzicato strings and a soft pulsing bass. "
        "Building tension slowly, around 100 BPM."
    ),
    "tense-climax": (
        "A dark instrumental piece with low cello drones and high dissonant strings. "
        "Slow and uneasy, minor key."
    ),
    "still-resolve": (
        "A gentle instrumental piece with warm strings fading slowly and soft piano. "
        "Quiet and reflective."
    ),
    "punchy-sting": (
        "A short cinematic instrumental sting with a deep brass note and atmospheric reverb. "
        "Bold and decisive."
    ),
}


def _prompt_for(video_type: str, mood: str) -> str:
    """Pick a Lyria prompt for the project's overall feel.

    Use the FIRST beat's mood as the project mood (it sets the emotional
    register). Falls back to the catch-all default. Video type ('story' /
    'trailer' / 'short') doesn't currently change the prompt — the mood
    map covers the variation that matters cinematically.
    """
    return _MOOD_PROMPTS.get(mood) or _MOOD_PROMPTS["default"]


async def generate_music_bed(
    *,
    project_id: str,
    video_type: str = "story",
    mood: str = "intimate-hook",
    seed: int | None = None,
) -> dict | None:
    """
    Generate one 32s instrumental music bed via Lyria 2, upload to Cloudinary,
    return { publicId, url, durationSeconds, prompt }.

    Returns None on any failure — callers fall back to silent (or to a
    pre-baked default music asset if one exists). Never raises during a
    project boot; we log + degrade.
    """
    prompt = _prompt_for(video_type, mood)
    target_public_id = f"sceneos/{project_id}/audio/music"

    body: dict[str, Any] = {
        "instances": [
            {
                "prompt": prompt,
                "negative_prompt": "drums, vocals, electronic",
            }
        ],
        "parameters": {},
    }
    if seed is not None:
        body["instances"][0]["seed"] = seed

    try:
        token = await _access_token()
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            res = await client.post(
                _predict_url(),
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        if res.status_code >= 400:
            logger.warning(
                "[lyria] %s -> %s: %s", _predict_url(), res.status_code, res.text[:400]
            )
            return None
        data = res.json()
    except Exception as exc:
        logger.warning("[lyria] request failed: %s", exc)
        return None

    predictions = data.get("predictions") or []
    if not predictions:
        logger.warning("[lyria] no predictions in response: %s", str(data)[:300])
        return None

    audio_b64 = predictions[0].get("audioContent") or predictions[0].get("bytesBase64Encoded")
    if not audio_b64:
        logger.warning("[lyria] missing audioContent in response: %s", str(predictions[0])[:300])
        return None

    try:
        audio_bytes = base64.b64decode(audio_b64, validate=False)
    except Exception as exc:
        logger.warning("[lyria] could not decode base64 audio: %s", exc)
        return None

    try:
        # Cloudinary's video pipeline accepts WAV upload via resource_type=video.
        uploaded = await upload_audio_from_bytes(
            audio_bytes, target_public_id, mime="audio/wav"
        )
    except Exception as exc:
        logger.warning("[lyria] cloudinary upload failed: %s", exc)
        return None

    return {
        "publicId": uploaded["publicId"],
        "url": uploaded.get("url"),
        "durationSeconds": uploaded.get("durationSeconds", 32),
        "prompt": prompt,
    }


__all__ = ["generate_music_bed"]
