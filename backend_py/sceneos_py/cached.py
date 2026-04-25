"""
Cached demo-project provider — on-stage safety net.

Mirrors backend/src/services/cached-demo.ts. When GENERATION_PROVIDER=cached
the live demo replays pre-rendered clips uploaded to Cloudinary instead of
calling any model.
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


# TODO(saturday-night): replace placeholders with real Cloudinary data.
DEMO_TRAILER_CLIPS: dict[str, _Clip | None] = {
    "trailer.establishing": None,
    "trailer.hook": None,
    "trailer.rising": None,
    "trailer.climax-tease": None,
    "trailer.sting": None,
}


_ACTIVE_JOBS: dict[str, _Clip] = {}


async def generate(params: GenerateClipParams) -> dict:
    template = params.get("beatTemplate") or "trailer.establishing"
    clip = DEMO_TRAILER_CLIPS.get(template)
    if not clip:
        raise RuntimeError(
            f"cached.py: no cached clip for template \"{template}\". "
            f"Render and populate DEMO_TRAILER_CLIPS before flipping GENERATION_PROVIDER=cached."
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
    return [
        clip.public_id
        for key in (
            "trailer.establishing",
            "trailer.hook",
            "trailer.rising",
            "trailer.climax-tease",
            "trailer.sting",
        )
        if (clip := DEMO_TRAILER_CLIPS.get(key))
    ]
