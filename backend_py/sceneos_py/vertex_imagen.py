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


async def generate_project_refs(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> dict:
    """
    Generate ONE character ref and ONE location ref per project, in parallel.

    This is the visual-continuity anchor: a single character image + a single
    location image that EVERY beat reuses as its I2V seed. Without this, each
    beat's pipeline calls Imagen independently and gets a different chimp /
    different lighthouse / different drone — the protagonist drifts beat to
    beat, which is the most-noticed-by-humans failure mode.

    Returns:
      {
        "character": {imageUrl, publicId, kind, prompt} | None,
        "location":  {imageUrl, publicId, kind, prompt} | None,
      }

    Either ref may be None if the description was empty or generation failed.
    Callers are expected to fall back gracefully — usually by passing the
    other ref as the seed, or by skipping I2V entirely.
    """
    coros: list[Any] = []
    kinds: list[str] = []
    if character_description:
        coros.append(generate_reference(
            kind="character",
            description=character_description,
            project_id=project_id,
            beat_id="shared",
            aspect_ratio=aspect_ratio,
        ))
        kinds.append("character")
    if location_description:
        coros.append(generate_reference(
            kind="location",
            description=location_description,
            project_id=project_id,
            beat_id="shared",
            aspect_ratio=aspect_ratio,
        ))
        kinds.append("location")

    refs: dict[str, dict | None] = {"character": None, "location": None}
    if not coros:
        return refs

    results = await asyncio.gather(*coros, return_exceptions=True)
    for kind, res in zip(kinds, results):
        if isinstance(res, Exception):
            # Soft failure — caller can fall back to the other ref. The
            # alternative (raise) tears down the whole project boot.
            refs[kind] = None
            continue
        refs[kind] = res
    return refs


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
