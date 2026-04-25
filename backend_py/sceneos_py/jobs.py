from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Literal


JobStage = Literal["t2i_running", "i2v_running", "succeeded", "failed", "running"]


@dataclass
class Job:
    job_id: str
    provider: str
    stage: JobStage
    clip_prompt: dict | None = None
    t2i_request_id: str | None = None
    i2v_request_id: str | None = None
    image_url: str | None = None
    video_url: str | None = None
    cloudinary_url: str | None = None
    cloudinary_public_id: str | None = None
    error: str | None = None
    project_id: str | None = None
    beat_id: str | None = None
    scene_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


JOBS: dict[str, Job] = {}


def put(job: Job) -> Job:
    job.updated_at = datetime.now(UTC).isoformat()
    JOBS[job.job_id] = job
    return job


def get(job_id: str) -> Job | None:
    return JOBS.get(job_id)
