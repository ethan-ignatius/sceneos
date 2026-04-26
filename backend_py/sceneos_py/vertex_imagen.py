"""
Vertex AI Imagen 3 — character + location reference image generation.

Used by the orchestrator (Stage 3 in STATE.md) to produce reference stills
that flow into video generation as I2V seed frames or character/location
anchors. Output is uploaded to Cloudinary so downstream beats have a stable
public_id to reference (and so fl_splice can pull frames if needed).

This module does three things, in order of importance:

  1. Multi-keyframe generation (`generate_keyframe_set`). Instead of a
     single character ref + single location ref, we generate N stylistic
     variants per kind so the orchestrator can pick the most appropriate
     keyframe for each beat's framing intent. Default: 3 character variants
     (front / three-quarter / profile) + 3 location variants (wide /
     medium / detail).

  2. Fail-loud. Imagen's safety filter occasionally returns 0 images for
     prompts that mention people in distress, nudity, weapons, etc. The
     old code silently degraded to `sample.jpg` — a generic Cloudinary
     demo asset — which then fed Veo I2V and produced garbage. Now we
     return a `degraded:true` payload that the orchestrator MUST handle
     by falling back to chaining or hard-cutting, never by feeding a
     stub asset to a real video model.

  3. Reliability skin. Every Imagen call goes through `with_reliability`:
     30s per-attempt timeout, 3 attempts with 1s/2s/4s+jitter backoff,
     idempotency key keyed by (project, beat, kind, variant). A circuit
     breaker on "vertex.imagen" short-circuits when Imagen is dead.

Auth uses the same Vertex SA credentials as Veo + Gemini agent.
Auto-falls-back to a deterministic stub when no GCP creds are available
(tests + local dev), with `stub:True` so callers know not to feed it to Veo.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from .cloudinary import public_id_for_reference, upload_image_from_bytes
from .config import env
from .genai_client import make_genai_client
from .retry import with_reliability


logger = logging.getLogger(__name__)


REFERENCE_KINDS = ("character", "location")
DEFAULT_IMAGEN_MODEL = "imagen-3.0-generate-002"
DEFAULT_ASPECT_RATIO = "16:9"


# Per-kind keyframe variants. Each entry is (variant_id, framing_clause).
# The variant_id is woven into the publicId so each variant has its own
# stable Cloudinary slot — important for the visualizer to display all
# keyframes side-by-side and for retries to be idempotent per variant.
KEYFRAME_VARIANTS: dict[str, tuple[tuple[str, str], ...]] = {
    "character": (
        ("front", "front-facing three-quarter framing, eyes to camera, neutral expression, full upper body in frame"),
        ("profile", "side profile portrait, looking off-frame, full upper body in frame, single light source raking across the face"),
        ("action", "in-character action stance, mid-movement, full body in frame, kinetic but legible silhouette"),
    ),
    "location": (
        ("wide", "wide 24mm establishing shot, deep negative space, atmospheric, no people in frame"),
        ("medium", "medium 50mm composition, mid-distance into the location, motivated practical light, no people in frame"),
        ("detail", "tight detail shot, 85mm, surface texture and signature object, shallow depth of field, no people in frame"),
    ),
}


def _imagen_model() -> str:
    return env("IMAGEN_MODEL", DEFAULT_IMAGEN_MODEL) or DEFAULT_IMAGEN_MODEL


def _stylize_prompt(kind: str, description: str, variant_clause: str | None = None) -> str:
    """Compose the final Imagen prompt for a (kind, description, variant).

    The variant_clause is the key ingredient for multi-keyframe generation:
    it fixes the framing/lens so the same character description renders as
    three usefully-different stills (front / profile / action) rather than
    three near-duplicates.
    """
    description = (description or "").strip()
    base = (
        "Cinematic character reference still." if kind == "character"
        else "Cinematic location reference establishing shot." if kind == "location"
        else ""
    )
    framing = variant_clause or (
        "Full body or three-quarter framing, neutral cinematic lighting (soft motivated key, subtle rim), 35mm film grain, slight depth of field, plain neutral background."
        if kind == "character"
        else "Wide 24mm composition, atmospheric, golden-hour or motivated practical light, no people in frame, deep negative space."
        if kind == "location"
        else ""
    )
    purpose = (
        "Designed as a consistent character reference — facial features and costume must read clearly. No text, no captions, no watermarks."
        if kind == "character"
        else "Designed as a consistent location reference — geographic and architectural details must read clearly. No text, no captions, no watermarks."
        if kind == "location"
        else ""
    )
    return " ".join(p for p in (base, description + ".", framing + ".", purpose) if p).strip()


def _stub_demo_url(kind: str) -> str:
    """Deterministic Cloudinary demo asset for stub/no-creds path. Marked
    `stub:True` so orchestrator never feeds it to Veo as if it were real."""
    cloud = env("CLOUDINARY_CLOUD_NAME") or "demo"
    public_id = "sample" if kind == "character" else "couple"
    return f"https://res.cloudinary.com/{cloud}/image/upload/{public_id}.jpg"


def _public_id_for_variant(project_id: str | None, beat_id: str | None, kind: str, variant: str | None) -> str:
    base = public_id_for_reference(project_id, beat_id, kind)
    return f"{base}-{variant}" if variant else base


# ── Single-image generation (used by /api/references/generate + by the
# multi-keyframe driver below) ───────────────────────────────────────────────


async def _imagen_call(
    *,
    prompt: str,
    aspect_ratio: str,
) -> Any:
    """Wrap the synchronous SDK call in a thread; raise on no-creds.

    `with_reliability` retries this on transient failures. It is NOT
    idempotent on the provider side (Imagen will charge per call), but
    successful results are cached by the retry layer's idempotency key.
    """
    client = make_genai_client()
    if client is None:
        # Caller must catch this and degrade; we don't silently stub here
        # because the no-client path is handled at the call site (it's
        # a different code path than "Imagen returned 0 images").
        raise RuntimeError("vertex_imagen: no genai client (missing creds)")

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

    return await asyncio.to_thread(_call_sync)


async def generate_reference(
    *,
    kind: str,
    description: str,
    project_id: str | None = None,
    beat_id: str | None = None,
    variant: str | None = None,
    variant_clause: str | None = None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> dict:
    """
    Generate ONE reference image via Imagen 3, upload to Cloudinary, return:
      { imageUrl, publicId, kind, prompt, variant?, stub?: bool, degraded?: str }

    `degraded` is set when Imagen's safety filter or quota produced 0 images
    or the call exhausted retries. `stub` is set when there are no GCP
    credentials available at all (local dev, tests). The orchestrator MUST
    treat either flag as "no real ref" — never feed degraded/stub refs to
    Veo I2V.
    """
    if kind not in REFERENCE_KINDS:
        raise ValueError(f"unknown reference kind {kind!r}; expected one of {REFERENCE_KINDS}")

    prompt = _stylize_prompt(kind, description, variant_clause)
    target_public_id = _public_id_for_variant(project_id, beat_id, kind, variant)

    client = make_genai_client()
    if client is None:
        # No creds → return a stub asset so dev / tests still work, but
        # MARKED so the orchestrator skips I2V seeding.
        return {
            "imageUrl": _stub_demo_url(kind),
            "publicId": f"stub::{kind}{':' + variant if variant else ''}",
            "kind": kind,
            "variant": variant,
            "prompt": prompt,
            "stub": True,
        }

    idempotency_key = f"imagen:{project_id or '-'}:{beat_id or '-'}:{kind}:{variant or '-'}"

    try:
        response = await with_reliability(
            "vertex.imagen",
            lambda: _imagen_call(prompt=prompt, aspect_ratio=aspect_ratio),
            timeout_seconds=45.0,
            max_attempts=3,
            base_backoff=1.0,
            idempotency_key=idempotency_key,
            breaker_name="vertex.imagen",
        )
    except Exception as exc:
        logger.warning(
            "[imagen] generate_reference exhausted retries for %s/%s (%s): %s",
            kind, variant or "default", target_public_id, exc,
        )
        return {
            "imageUrl": _stub_demo_url(kind),
            "publicId": f"stub::{kind}{':' + variant if variant else ''}",
            "kind": kind,
            "variant": variant,
            "prompt": prompt,
            "stub": True,
            "degraded": f"imagen_call_failed:{type(exc).__name__}",
        }

    images = getattr(response, "generated_images", None) or []
    if not images:
        # Imagen returned 0 images — almost always means the safety filter
        # killed the prompt. Return a clearly-flagged degraded payload.
        # The orchestrator treats `degraded` as "no ref" — it falls back
        # to chaining or to a sibling variant. The old code silently
        # degraded to sample.jpg, which then fed Veo I2V and produced
        # nonsense; that path is gone.
        logger.warning(
            "[imagen] 0 images for kind=%s variant=%s prompt=%r — flagging degraded",
            kind, variant or "default", prompt[:160],
        )
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "variant": variant,
            "prompt": prompt,
            "degraded": "imagen_no_images_safety_filter",
        }

    image_bytes = getattr(getattr(images[0], "image", None), "image_bytes", None)
    if not image_bytes:
        logger.warning("[imagen] response missing image_bytes for %s/%s", kind, variant or "default")
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "variant": variant,
            "prompt": prompt,
            "degraded": "imagen_no_image_bytes",
        }

    try:
        uploaded = await with_reliability(
            "cloudinary.upload_image",
            lambda: upload_image_from_bytes(image_bytes, target_public_id, mime="image/png"),
            timeout_seconds=30.0,
            max_attempts=3,
            base_backoff=1.0,
            idempotency_key=f"upload_image:{target_public_id}",
            breaker_name="cloudinary.upload_image",
        )
    except Exception as exc:
        logger.warning("[imagen] cloudinary upload failed for %s: %s", target_public_id, exc)
        return {
            "imageUrl": None,
            "publicId": None,
            "kind": kind,
            "variant": variant,
            "prompt": prompt,
            "degraded": f"cloudinary_upload_failed:{type(exc).__name__}",
        }

    return {
        "imageUrl": uploaded["url"],
        "publicId": uploaded["publicId"],
        "kind": kind,
        "variant": variant,
        "prompt": prompt,
    }


# ── Multi-keyframe generation ──────────────────────────────────────────────


async def generate_keyframe_set(
    *,
    kind: str,
    description: str,
    project_id: str | None = None,
    beat_id: str | None = "shared",
    variants: tuple[str, ...] | None = None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> list[dict]:
    """
    Generate the full set of keyframe variants for one (kind, description).

    Returns a list of refs, one per variant. Each ref is the same shape as
    `generate_reference()` plus a `variant` field. Variants that fail to
    generate carry a `degraded` flag — the orchestrator selects from the
    NON-degraded subset.

    `variants` lets callers narrow the set (e.g. to just "wide" + "detail"
    when budget-constrained). When None, uses the full default set from
    KEYFRAME_VARIANTS.
    """
    if kind not in REFERENCE_KINDS:
        raise ValueError(f"unknown reference kind {kind!r}")

    available = KEYFRAME_VARIANTS[kind]
    if variants:
        wanted = set(variants)
        available = tuple(v for v in available if v[0] in wanted) or available

    coros = [
        generate_reference(
            kind=kind,
            description=description,
            project_id=project_id,
            beat_id=beat_id,
            variant=variant_id,
            variant_clause=variant_clause,
            aspect_ratio=aspect_ratio,
        )
        for variant_id, variant_clause in available
    ]
    results = await asyncio.gather(*coros, return_exceptions=True)
    refs: list[dict] = []
    for (variant_id, _), result in zip(available, results):
        if isinstance(result, Exception):
            refs.append({
                "imageUrl": None,
                "publicId": None,
                "kind": kind,
                "variant": variant_id,
                "prompt": _stylize_prompt(kind, description, _),
                "degraded": f"unexpected:{type(result).__name__}",
            })
        else:
            refs.append(result)
    return refs


# ── Project refs (back-compat shape: single character + single location) ────


async def generate_project_refs(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> dict:
    """
    Back-compat single-keyframe generator. Returns:
      { "character": ref|None, "location": ref|None }

    Existing code paths (the hot lighthouse demo) continue to call this and
    get the same shape. New callers should use `generate_project_keyframes`
    below.
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
            refs[kind] = None
            continue
        # Don't surface degraded refs as the project ref — caller wants the
        # clean "best available" view here. Multi-keyframe callers see
        # the full set including degraded entries.
        if isinstance(res, dict) and (res.get("degraded") or not res.get("imageUrl")):
            refs[kind] = None
            continue
        refs[kind] = res
    return refs


async def generate_project_keyframes(
    *,
    project_id: str | None,
    character_description: str | None,
    location_description: str | None,
    aspect_ratio: str = DEFAULT_ASPECT_RATIO,
) -> dict:
    """
    Multi-keyframe project refs. Returns:
      {
        "character": [ref, ref, ref],   # one per KEYFRAME_VARIANTS["character"]
        "location":  [ref, ref, ref],
        "characterPrimary": ref|None,   # best non-degraded character ref
        "locationPrimary":  ref|None,
      }

    The orchestrator uses `pick_keyframe_for_framing` (below) to choose
    a per-beat keyframe from the array; `characterPrimary` /
    `locationPrimary` are the fallback when the framing-aware pick has no
    match (e.g. all detail-shots failed safety).
    """
    char_coro = (
        generate_keyframe_set(
            kind="character",
            description=character_description,
            project_id=project_id,
            aspect_ratio=aspect_ratio,
        )
        if character_description
        else asyncio.sleep(0, result=[])
    )
    loc_coro = (
        generate_keyframe_set(
            kind="location",
            description=location_description,
            project_id=project_id,
            aspect_ratio=aspect_ratio,
        )
        if location_description
        else asyncio.sleep(0, result=[])
    )
    character_set, location_set = await asyncio.gather(char_coro, loc_coro)

    def _primary(refs: list[dict]) -> dict | None:
        for ref in refs:
            if not ref.get("degraded") and ref.get("imageUrl"):
                return ref
        return None

    return {
        "character": list(character_set),
        "location": list(location_set),
        "characterPrimary": _primary(character_set),
        "locationPrimary": _primary(location_set),
    }


# ── Per-beat keyframe selection ─────────────────────────────────────────────


# Map beat archetype mood / framing intent → preferred keyframe variants.
# Earlier in the list = more preferred. Tried in order; first non-degraded
# match wins. This is the brains of "treat the movie holistically": each
# beat picks the keyframe that best matches its dramatic role, instead of
# every beat using the same hero shot.
_FRAMING_PREFERENCES: dict[str, tuple[str, ...]] = {
    # Mood → variant priority for character keyframes
    "wide-establish": ("front", "profile", "action"),
    "intimate-hook": ("front", "profile"),
    "kinetic-rising": ("action", "profile", "front"),
    "tense-climax": ("front", "action"),
    "still-resolve": ("profile", "front"),
    "punchy-sting": ("action", "front"),
}


def pick_keyframe_for_framing(
    *,
    refs: list[dict],
    framing: str | None,
    mood: str | None,
) -> dict | None:
    """
    Pick the best keyframe from `refs` for the beat's framing + mood.

    Priority:
      1. Skip degraded / null refs.
      2. Prefer variants matching mood per `_FRAMING_PREFERENCES`.
      3. Cross-check the framing string for explicit cues
         ("close" → front, "tracking" → action, "establishing" → wide).
      4. Fall back to first non-degraded ref.
    """
    if not refs:
        return None
    healthy = [r for r in refs if not r.get("degraded") and r.get("imageUrl")]
    if not healthy:
        return None

    framing_text = (framing or "").lower()
    cues: list[str] = []
    if any(kw in framing_text for kw in ("close", "intimate", "tight", "macro")):
        cues.append("front")
    if any(kw in framing_text for kw in ("track", "handheld", "kinetic", "push")):
        cues.append("action")
    if any(kw in framing_text for kw in ("profile", "side")):
        cues.append("profile")
    if any(kw in framing_text for kw in ("wide", "establish", "drone", "24mm", "vista")):
        cues.append("wide")
    if any(kw in framing_text for kw in ("medium", "50mm", "midshot")):
        cues.append("medium")
    if any(kw in framing_text for kw in ("detail", "insert", "macro", "object")):
        cues.append("detail")

    by_variant = {r.get("variant"): r for r in healthy if r.get("variant")}

    # Try framing cues first (they are more specific than mood).
    for cue in cues:
        if cue in by_variant:
            return by_variant[cue]

    # Then mood-based preference (only meaningful for character refs since
    # _FRAMING_PREFERENCES variants are character-shaped).
    for variant_id in _FRAMING_PREFERENCES.get(mood or "", ()):
        if variant_id in by_variant:
            return by_variant[variant_id]

    return healthy[0]
