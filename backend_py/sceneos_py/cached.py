"""
Cached demo-project provider — on-stage safety net.

Mirrors backend/src/services/cached-demo.ts. When GENERATION_PROVIDER=cached
the live demo replays pre-rendered clips uploaded to Cloudinary instead of
calling any model.

These clips were baked end-to-end with Veo 3 (native synced audio at 1080p)
+ Lyria 2 music bed + l_text captions. See `STATE.md` Module D for the bake
log. To re-bake (e.g. if the cloud rotates), see `backend_py/smoke_pipeline.py`
or run a fresh demo session and copy the publicIds from the response.
"""
from __future__ import annotations

import time

from .provider import GenerateClipParams, StatusResult


class _Clip:
    __slots__ = ("public_id", "clip_url", "duration_seconds")

    def __init__(self, public_id: str, clip_url: str, duration_seconds: int):
        self.public_id = public_id
        self.clip_url = clip_url
        self.duration_seconds = duration_seconds


# ── lighthouse-ship demo (baked 2026-04-25, project lighthouse31) ──────────
# 7 beats, ALL Veo 3.1 GA (`veo-3.1-generate-001`, released Nov 17 2025) at
# 1080p with native synced audio (dialogue + ambient + SFX). Same shared
# Imagen 3 character + location refs reused as the I2V seed for every beat
# — that's where character consistency comes from (the keeper's face stays
# the SAME person across all 7 beats, not seven similar people, which was
# the single biggest "no flow" complaint about the Veo 3 bake).
#
# Total runtime: 48 seconds. Music bed reused from the prior bake (Lyria 2
# piano + strings, ducked to -28 dB so dialogue stays primary).
_LIGHTHOUSE_CLOUD = "https://res.cloudinary.com/dghelx0al/video/upload"

LIGHTHOUSE_SHIP_CLIPS: dict[str, _Clip] = {
    "story.hook": _Clip(
        "sceneos/lighthouse31/beat-1/beat-1-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-1/beat-1-scene-1.mp4",
        5,
    ),
    "story.exposition": _Clip(
        "sceneos/lighthouse31/beat-2/beat-2-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-2/beat-2-scene-1.mp4",
        8,
    ),
    "story.inciting": _Clip(
        "sceneos/lighthouse31/beat-3/beat-3-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-3/beat-3-scene-1.mp4",
        6,
    ),
    "story.rising": _Clip(
        "sceneos/lighthouse31/beat-4/beat-4-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-4/beat-4-scene-1.mp4",
        10,
    ),
    "story.climax": _Clip(
        "sceneos/lighthouse31/beat-5/beat-5-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-5/beat-5-scene-1.mp4",
        8,
    ),
    "story.falling": _Clip(
        "sceneos/lighthouse31/beat-6/beat-6-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-6/beat-6-scene-1.mp4",
        6,
    ),
    "story.resolution": _Clip(
        "sceneos/lighthouse31/beat-7/beat-7-scene-1",
        f"{_LIGHTHOUSE_CLOUD}/sceneos/lighthouse31/beat-7/beat-7-scene-1.mp4",
        5,
    ),
}

# Music bed reused from the original bake. The Lyria 2 piano-and-strings
# piece works regardless of which Veo generation produced the visuals.
LIGHTHOUSE_SHIP_AUDIO_PUBLIC_ID = "sceneos/8dbb956c76a7/audio/music"

# Pre-built stitched URL — captions + music ducked at -28dB.
#
# URL-syntax notes (both load-bearing):
#   1. Text-overlay positioning (`g_south`, `y_140`) lives in the
#      `fl_layer_apply` segment, NOT the `l_text:` opener. Inline positioning
#      silently centers the caption mid-frame — that bug shipped with the
#      first lighthouse bake (text covering the keeper's chest for 6s).
#   2. Caption styling: WHITE (`co_white`), not cream + 4px-stroke. Cream
#      with a heavy stroke renders as muddy gray on dark frames AND bleeds
#      adjacent letters into each other (what users described as "letters
#      overlap and look gray"). Pure white + 2px stroke at 52pt is sharp.
#   3. `fl_splice` lives in the `l_video:` opener segment, NOT the
#      `fl_layer_apply` closer — otherwise Cloudinary silently drops every
#      overlay clip and renders only the base, producing a 6s "cut" instead
#      of a 48s one. Already fixed and pinned by tests; included here as a
#      reminder when copy-pasting future bakes.
LIGHTHOUSE_SHIP_FINAL_URL = (
    f"{_LIGHTHOUSE_CLOUD}/c_fill,w_1920,h_1080"
    "/l_text:Arial_52_bold:Cape%20Disappointment%20Light.%20November%201957.,"
    "co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140"
    "/l_video:sceneos:lighthouse31:beat-2:beat-2-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080/fl_layer_apply"
    "/l_video:sceneos:lighthouse31:beat-3:beat-3-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080"
    "/l_text:Arial_52_bold:23%3A42%20hours.,"
    "co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140"
    "/fl_layer_apply"
    "/l_video:sceneos:lighthouse31:beat-4:beat-4-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080/fl_layer_apply"
    "/l_video:sceneos:lighthouse31:beat-5:beat-5-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080"
    "/l_text:Arial_52_bold:The%20Astoria.%20Lost%3A%20October%2031%20%201922.,"
    "co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140"
    "/fl_layer_apply"
    "/l_video:sceneos:lighthouse31:beat-6:beat-6-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080/fl_layer_apply"
    "/l_video:sceneos:lighthouse31:beat-7:beat-7-scene-1,fl_splice"
    "/c_fill,w_1920,h_1080"
    "/l_text:Arial_52_bold:From%20Logbook%2041.,"
    "co_white,e_outline:2:000000/fl_layer_apply,g_south,y_140"
    "/fl_layer_apply"
    "/l_audio:sceneos:8dbb956c76a7:audio:music,e_volume:-28/fl_layer_apply"
    "/sceneos/lighthouse31/beat-1/beat-1-scene-1.mp4"
)


# ── trailer fallback (legacy) ──────────────────────────────────────────────
# Older demo path. Kept for the GENERATION_PROVIDER=cached fallback wiring.
DEMO_TRAILER_CLIPS: dict[str, _Clip | None] = {
    "trailer.establishing": None,
    "trailer.hook": None,
    "trailer.rising": None,
    "trailer.climax-tease": None,
    "trailer.sting": None,
}


# Active provider table — extended/swapped per demo prompt id.
_ACTIVE_JOBS: dict[str, _Clip] = {}


# Currently-active demo set. Switch this to `LIGHTHOUSE_SHIP_CLIPS` for the
# lighthouse demo or to a different table when you bake a new prompt.
_ACTIVE_TABLE: dict[str, _Clip | None] = {**LIGHTHOUSE_SHIP_CLIPS, **DEMO_TRAILER_CLIPS}


async def generate(params: GenerateClipParams) -> dict:
    template = params.get("beatTemplate") or "story.hook"
    clip = _ACTIVE_TABLE.get(template)
    if not clip:
        # Best-effort fallback: when this provider is reached as the
        # FALLBACK from a failing primary provider, the requested template
        # might not match the table we baked (e.g. caller is in a "trailer"
        # video type but we only have lighthouse "story.*" clips). Pick
        # any non-None clip so the live demo still ships pixels rather
        # than hard-failing the whole pipeline.
        clip = next((c for c in _ACTIVE_TABLE.values() if c is not None), None)
    if not clip:
        raise RuntimeError(
            f"cached.py: no cached clip for template \"{template}\" and "
            "no usable fallback. Re-bake a demo and populate `_ACTIVE_TABLE` "
            "before flipping GENERATION_PROVIDER=cached."
        )
    job_id = f"{params['beatId']}-{params['sceneId']}-{int(time.time() * 1000)}"
    _ACTIVE_JOBS[job_id] = clip
    return {"jobId": job_id}


async def status(provider_job_id: str) -> StatusResult:
    clip = _ACTIVE_JOBS.get(provider_job_id)
    if not clip:
        return {"status": "failed", "error": "Unknown cached job"}
    return {
        "status": "succeeded",
        "clipUrl": clip.clip_url,
        "clipPublicId": clip.public_id,
    }


def demo_ordered_public_ids() -> list[str]:
    """Return clip public_ids in story order. Defaults to the lighthouse
    bake; falls back to the legacy trailer template order when only the
    trailer table is populated."""
    if all(_ACTIVE_TABLE.get(k) for k in (
        "story.hook", "story.exposition", "story.inciting",
        "story.rising", "story.climax", "story.falling", "story.resolution",
    )):
        keys = (
            "story.hook", "story.exposition", "story.inciting",
            "story.rising", "story.climax", "story.falling", "story.resolution",
        )
    else:
        keys = (
            "trailer.establishing",
            "trailer.hook",
            "trailer.rising",
            "trailer.climax-tease",
            "trailer.sting",
        )
    return [_ACTIVE_TABLE[k].public_id for k in keys if _ACTIVE_TABLE.get(k)]
