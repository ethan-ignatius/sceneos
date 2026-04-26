"""
Higgsfield Soul T2I — character + location reference image generator.

Mirrors `vertex_imagen.generate_reference` so the orchestrator can swap
between Imagen and Higgsfield Soul without changing the caller. The
generated image URL becomes the project's "soul ID" — a persistent
visual anchor passed as `reference_image_urls` on every per-beat video
generation. Soul mode is what keeps the protagonist's face the same
across all 7 beats.

Endpoints (auto-detected from auth shape, same as higgsfield.py):
  Public API:
    POST https://higgsfieldapi.com/api/v1/generate-soul
    GET  https://higgsfieldapi.com/api/v1/status/{generation_id}
  Legacy platform:
    POST https://platform.higgsfield.ai/higgsfield-ai/soul/standard
    GET  https://platform.higgsfield.ai/requests/{request_id}/status

The function blocks (with a soft timeout) until the soul image is
ready, because per-beat video generation needs the URL up-front. This
is acceptable because soul refs are generated ONCE per project at
session-start time, not per beat.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

import httpx

from . import higgsfield as hf
from .config import env


logger = logging.getLogger(__name__)


SoulKind = Literal["character", "location"]


# Soul T2I model ids on the legacy platform. The public API auto-routes
# /generate-soul, so model selection is a legacy-only concern.
LEGACY_SOUL_MODEL = "higgsfield-ai/soul/standard"

# Soul aspect ratios mapped from the project's video aspect.
_SOUL_RESOLUTION_BY_ASPECT: dict[str, str] = {
    "16:9": "1536x864",
    "9:16": "864x1536",
    "1:1": "1152x1152",
}


def _soul_endpoint() -> str:
    """The Soul T2I generate URL. Public uses /generate-soul; legacy
    posts directly to the soul model."""
    explicit = env("HIGGSFIELD_SOUL_ENDPOINT")
    if explicit:
        return explicit
    base = hf._base_url()  # type: ignore[attr-defined]
    if hf._is_legacy():  # type: ignore[attr-defined]
        return f"{base}/{LEGACY_SOUL_MODEL}"
    return f"{base}/generate-soul"


def _soul_resolution(aspect_ratio: str) -> str:
    return _SOUL_RESOLUTION_BY_ASPECT.get(aspect_ratio, "1536x864")


def _build_soul_payload(*, kind: SoulKind, description: str, aspect_ratio: str) -> dict:
    """Compose the Soul T2I request body. The prompt is shaped to produce
    a clean reference image — full-frame subject for character, full-frame
    setting for location — rather than a finished cinematic shot."""
    if kind == "character":
        prompt = (
            f"Cinematic character portrait. {description}. Plain neutral background, "
            "natural lighting, full-body or three-quarter framing, sharp focus on the "
            "subject. Reference image — no environmental storytelling, no narrative "
            "props, just the character clearly visible for visual consistency."
        )
    else:
        prompt = (
            f"Cinematic location reference. {description}. Wide establishing frame, "
            "natural lighting, no people, no characters in frame. The location's "
            "signature features (architecture, palette, time of day) clearly visible. "
            "Reference image — no narrative storytelling, just the place itself."
        )

    payload: dict[str, Any] = {
        "prompt": prompt[:1000],
        "width_and_height": _soul_resolution(aspect_ratio),
        "quality": "1080p",
        "enhance_prompt": False,
    }
    return payload


async def _post_soul(payload: dict) -> dict:
    headers = {
        **hf._auth_header(),  # type: ignore[attr-defined]
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(_soul_endpoint(), json=payload, headers=headers)
        res.raise_for_status()
        return res.json()


async def _wait_for_soul(request_id: str, *, timeout_seconds: float = 90.0) -> str:
    """Poll the status endpoint until COMPLETED or timeout. Returns the
    media URL on success; raises on failure."""
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    delay = 2.0
    while True:
        if asyncio.get_running_loop().time() > deadline:
            raise RuntimeError(
                f"Higgsfield Soul T2I timed out after {timeout_seconds}s "
                f"(request_id={request_id})"
            )
        # Reuse higgsfield._poll_status — it already handles both the
        # public API and legacy platform response shapes.
        result = await hf._poll_status(request_id)  # type: ignore[attr-defined]
        if result["status"] == "succeeded":
            url = result.get("assetUrl")
            if not url:
                raise RuntimeError(
                    f"Higgsfield Soul T2I COMPLETED with no media URL "
                    f"(request_id={request_id})"
                )
            return url
        if result["status"] == "failed":
            raise RuntimeError(
                f"Higgsfield Soul T2I failed: {result.get('error') or 'unknown'}"
            )
        await asyncio.sleep(delay)
        delay = min(delay * 1.4, 8.0)


async def generate_reference(
    *,
    kind: SoulKind,
    description: str,
    project_id: str | None = None,
    beat_id: str | None = None,
    aspect_ratio: str = "16:9",
) -> dict:
    """Generate a Higgsfield Soul reference image. Returns a dict shaped
    like `vertex_imagen.generate_reference` so callers stay agnostic:

        { imageUrl, publicId, kind, prompt, stub?: bool, degraded?: str }

    On any failure (no creds, network, timeout) returns a degraded result
    with `stub=True` and `degraded="..."` so the orchestrator can decide
    whether to use it or fall through. The orchestrator's `_ref_is_real()`
    treats stub/degraded refs as not-real and skips them.
    """
    if not env("HIGGSFIELD_API_KEY"):
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "prompt": description,
            "stub": True,
            "degraded": "no HIGGSFIELD_API_KEY",
        }

    payload = _build_soul_payload(
        kind=kind, description=description, aspect_ratio=aspect_ratio
    )
    try:
        body = await _post_soul(payload)
    except Exception as exc:
        logger.warning("[higgsfield-soul] submit failed for %s: %s", kind, exc)
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "prompt": payload["prompt"],
            "stub": True,
            "degraded": f"submit failed: {exc}",
        }

    request_id = hf._generation_id(body)  # type: ignore[attr-defined]
    if not request_id:
        logger.warning("[higgsfield-soul] response missing generation_id: %s", body)
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "prompt": payload["prompt"],
            "stub": True,
            "degraded": "response missing generation_id",
        }

    try:
        url = await _wait_for_soul(request_id)
    except Exception as exc:
        logger.warning(
            "[higgsfield-soul] wait failed for %s (request_id=%s): %s",
            kind,
            request_id,
            exc,
        )
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "prompt": payload["prompt"],
            "stub": True,
            "degraded": f"wait failed: {exc}",
        }

    # The publicId here doubles as our local "soul ID" for the project.
    # Format: `soul::{project_id}::{kind}::{request_id}` so we can trace
    # which soul a beat used back to the original Higgsfield generation.
    public_id = f"soul::{project_id or 'p'}::{kind}::{request_id}"

    return {
        "imageUrl": url,
        "publicId": public_id,
        "kind": kind,
        "prompt": payload["prompt"],
        "soulId": public_id,
        "soulRequestId": request_id,
    }
