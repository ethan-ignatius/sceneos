"""
Audio for SceneOS — music selection + (optional) ElevenLabs voice narration.

This is the audio layer the user wired into Stage 6 (`/api/stitch/url`).
Cloudinary's `l_audio:<publicId>` overlay is what carries the music + VO
into the final stitched video — NO server-side ffmpeg required.

Two surfaces:
  1. `pick_music(video_type, mood)` — deterministic selection from a small
     curated library of mood-tagged Cloudinary public_ids. Set the env var
     `SCENEOS_MUSIC_LIBRARY` to a JSON array of overrides if you bring
     your own catalog (the hackathon ships with safe defaults).
  2. `synthesize_narration(text)` — ElevenLabs TTS. Optional. Returns a
     Cloudinary public_id you can pass alongside the music as a second
     `l_audio:` layer. When ElevenLabs creds are missing we return None
     and the caller skips the VO layer.

Music selection is intentionally deterministic per (videoType, mood) so
the same input plays the same track every time. That's good for demo
reliability.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from .config import env, mock_mode

logger = logging.getLogger(__name__)


# ── Music library ───────────────────────────────────────────────────────
# Each entry maps (video_type, mood) → Cloudinary public_id of an audio
# asset. The "auto" mood is the default selection per video type.
#
# How to bring your own: upload an audio file to Cloudinary at the
# returned public_id (or override via SCENEOS_MUSIC_LIBRARY env). The
# defaults below point at Cloudinary's `samples/` corpus when available
# and degrade to None when not — `cloudinary.build_splice_url` skips the
# l_audio layer in that case so the final video still renders silently.

# Cloudinary's demo cloud doesn't ship audio in `samples/`, but every
# customer cloud has the standard `samples/` namespace. We use the safe
# convention: <cloud>/raw/upload/sceneos/audio/<id>. Customers who want
# audio in the demo can upload one file with public_id "sceneos/audio/
# default" and it works for every prompt.
_DEFAULT_PUBLIC_ID = "sceneos/audio/default"

_MUSIC_BY_VIDEOTYPE: dict[str, dict[str, str]] = {
    "story": {
        "auto": _DEFAULT_PUBLIC_ID,
        "intimate-hook": _DEFAULT_PUBLIC_ID,
        "wide-establish": _DEFAULT_PUBLIC_ID,
        "kinetic-rising": _DEFAULT_PUBLIC_ID,
        "tense-climax": _DEFAULT_PUBLIC_ID,
        "still-resolve": _DEFAULT_PUBLIC_ID,
        "punchy-sting": _DEFAULT_PUBLIC_ID,
    },
    "trailer": {
        "auto": _DEFAULT_PUBLIC_ID,
    },
    "short": {
        "auto": _DEFAULT_PUBLIC_ID,
    },
}


def _load_overrides() -> dict[str, dict[str, str]]:
    """Read SCENEOS_MUSIC_LIBRARY env. Format: JSON object keyed by
    videoType, e.g.:
      { "story": { "auto": "sceneos/audio/cinematic-strings",
                   "tense-climax": "sceneos/audio/heartbeat-build" } }
    Missing keys fall through to the defaults."""
    raw = env("SCENEOS_MUSIC_LIBRARY")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {str(k): {str(kk): str(vv) for kk, vv in v.items()} for k, v in parsed.items()}
    except Exception:
        logger.warning("[audio] invalid SCENEOS_MUSIC_LIBRARY JSON — ignoring")
    return {}


def pick_music(video_type: str, mood: str = "auto") -> str | None:
    """Pick a music public_id for a given (videoType, mood).

    Returns the configured public_id or None if both the override env and
    the defaults produce nothing. None signals to /api/stitch/url that
    no l_audio: layer should be added.
    """
    overrides = _load_overrides()
    library = {**_MUSIC_BY_VIDEOTYPE.get(video_type, {}), **overrides.get(video_type, {})}
    if not library:
        return None
    return library.get(mood) or library.get("auto")


# ── Narration (optional) ─────────────────────────────────────────────────


async def synthesize_narration(
    *,
    project_id: str,
    text: str,
    voice_id: str | None = None,
) -> dict | None:
    """
    ElevenLabs TTS → Cloudinary upload. Returns:
      { publicId, url, durationSeconds } or None when the feature isn't
      configured (no ELEVEN_LABS_API_KEY).

    Mock mode short-circuits to a deterministic stub for testing.
    """
    if mock_mode():
        cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
        return {
            "publicId": f"sceneos/{project_id}/audio/narration",
            "url": f"https://res.cloudinary.com/{cloud}/raw/upload/sceneos/audio/default",
            "durationSeconds": max(2, min(40, len(text.split()) // 2)),
            "stub": True,
        }

    api_key = env("ELEVEN_LABS_API_KEY") or env("ELEVENLABS_API_KEY")
    if not api_key:
        logger.info("[audio] no ElevenLabs API key — skipping narration")
        return None

    voice = voice_id or env("ELEVEN_LABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM"  # Rachel default
    try:
        import httpx
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
                headers={"xi-api-key": api_key, "accept": "audio/mpeg"},
                json={
                    "text": text,
                    "model_id": "eleven_turbo_v2_5",
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
                },
            )
            r.raise_for_status()
            audio_bytes: bytes = r.content
    except Exception as exc:
        logger.warning("[audio] ElevenLabs synthesis failed: %s", exc)
        return None

    from .cloudinary import upload_image_from_bytes  # generic raw upload helper
    target_public_id = f"sceneos/{project_id}/audio/narration"
    try:
        # Cloudinary's image/upload endpoint accepts audio when the file
        # is a data URI with audio MIME — the `resource_type=raw` route
        # is fussier. The image upload helper happens to work for audio
        # because Cloudinary auto-detects and stores. (We re-route via a
        # raw upload here to keep this honest — see implementation in
        # cloudinary.py below.)
        from .cloudinary import upload_audio_from_bytes
        uploaded = await upload_audio_from_bytes(audio_bytes, target_public_id)
    except Exception as exc:
        logger.warning("[audio] Cloudinary upload failed: %s", exc)
        return None

    return {
        "publicId": uploaded["publicId"],
        "url": uploaded.get("url"),
        "durationSeconds": uploaded.get("durationSeconds", 0),
    }


__all__ = ["pick_music", "synthesize_narration"]
