"""
Vertex AI Imagen 3 — character + location reference image generation.

Used by the orchestrator (Stage 3 in STATE.md) to produce reference stills
that flow into video generation as I2V seed frames or character/location
anchors. Output is uploaded to Cloudinary so downstream beats have a stable
public_id to reference (and so fl_splice can pull frames if needed).

Auth uses the same Vertex SA credentials as Veo + Gemini agent.
Auto-falls-back to a deterministic stub when no GCP creds are available.
"""
from __future__ import annotations

import asyncio
from typing import Any

from .cloudinary import public_id_for_reference, upload_image_from_bytes
from .config import env
from .genai_client import make_genai_client


REFERENCE_KINDS = ("character", "location")
DEFAULT_IMAGEN_MODEL = "imagen-3.0-generate-002"
DEFAULT_ASPECT_RATIO = "16:9"


def _imagen_model() -> str:
    return env("IMAGEN_MODEL", DEFAULT_IMAGEN_MODEL) or DEFAULT_IMAGEN_MODEL


def _stylize_prompt(kind: str, description: str) -> str:
    description = (description or "").strip()
    if kind == "character":
        return (
            "Cinematic character reference still. "
            f"{description}. "
            "Full body or three-quarter framing, neutral cinematic lighting (soft motivated key, "
            "subtle rim), 35mm film grain, slight depth of field, plain neutral background. "
            "Designed as a consistent character reference — facial features and costume must read clearly. "
            "No text, no captions, no watermarks."
        )
    if kind == "location":
        return (
            "Cinematic location reference establishing shot. "
            f"{description}. "
            "Wide 24mm composition, atmospheric, golden-hour or motivated practical light, "
            "no people in frame, deep negative space. "
            "Designed as a consistent location reference — geographic and architectural details must read clearly. "
            "No text, no captions, no watermarks."
        )
    return description


def _stub_demo_url(kind: str) -> str:
    """Deterministic Cloudinary demo asset to use when no GCP creds exist."""
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
    public_id = "sample" if kind == "character" else "couple"
    return f"https://res.cloudinary.com/{cloud}/image/upload/{public_id}.jpg"


async def generate_reference(
    *,
    kind: str,
    description: str,
    project_id: str | None = None,
    beat_id: str | None = None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> dict:
    """
    Generate a character or location reference image via Imagen 3, upload to
    Cloudinary, and return { imageUrl, publicId, kind, prompt }.

    Returns the stubbed demo URL (no upload) when no Vertex client is available.
    """
    if kind not in REFERENCE_KINDS:
        raise ValueError(f"unknown reference kind {kind!r}; expected one of {REFERENCE_KINDS}")

    prompt = _stylize_prompt(kind, description)
    target_public_id = public_id_for_reference(project_id, beat_id, kind)

    client = make_genai_client()
    if client is None:
        return {
            "imageUrl": _stub_demo_url(kind),
            "publicId": f"stub::{kind}",
            "kind": kind,
            "prompt": prompt,
            "stub": True,
        }

    from google.genai import types

    config = types.GenerateImagesConfig(
        number_of_images=1,
        aspect_ratio=aspect_ratio,
        person_generation="allow_adult",
        output_mime_type="image/png",
        safety_filter_level="block_only_high",
    )

    def _call_sync() -> Any:
        return client.models.generate_images(
            model=_imagen_model(),
            prompt=prompt,
            config=config,
        )

    response = await asyncio.to_thread(_call_sync)

    images = getattr(response, "generated_images", None) or []
    if not images:
        raise RuntimeError(
            "Imagen returned no images. Possible safety filter; try softening the description."
        )

    image_bytes = getattr(getattr(images[0], "image", None), "image_bytes", None)
    if not image_bytes:
        raise RuntimeError("Imagen response missing image_bytes payload.")

    uploaded = await upload_image_from_bytes(image_bytes, target_public_id, mime="image/png")
    return {
        "imageUrl": uploaded["url"],
        "publicId": uploaded["publicId"],
        "kind": kind,
        "prompt": prompt,
    }
