from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any, Literal

from . import db as _db

JobStage = Literal["t2i_running", "i2v_running", "succeeded", "failed", "running"]
OrchestrateStatus = Literal["queued", "running", "submitted", "succeeded", "failed"]


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


def _job_to_mongo(job: Job) -> dict:
    return {
        "project_id": job.project_id,
        "beat_id": job.beat_id,
        "scene_id": job.scene_id,
        "provider": job.provider,
        "stage": job.stage,
        "clip_prompt": job.clip_prompt,
        "image_url": job.image_url,
        "video_url": job.video_url,
        "cloudinary_url": job.cloudinary_url,
        "cloudinary_public_id": job.cloudinary_public_id,
        "error": job.error,
    }


def put(job: Job) -> Job:
    job.updated_at = datetime.now(UTC).isoformat()
    JOBS[job.job_id] = job
    _db.fire_and_forget(_db.upsert_generation(job.job_id, _job_to_mongo(job)))
    return job


def get(job_id: str) -> Job | None:
    return JOBS.get(job_id)


@dataclass
class OrchestrateJob:
    job_id: str
    project_id: str | None
    beat_id: str
    scene_id: str | None = None
    status: OrchestrateStatus = "queued"
    stage: str = "queued"
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    # Provider submission details (set once run_beat_pipeline returns).
    provider: str | None = None
    provider_job_id: str | None = None
    submission: dict[str, Any] | None = None
    # Observability payload (timings, trace IDs, etc.)
    observability: dict[str, Any] = field(default_factory=dict)


ORCH_JOBS: dict[str, OrchestrateJob] = {}


def _orch_to_mongo(job: OrchestrateJob) -> dict:
    return {
        "project_id": job.project_id,
        "beat_id": job.beat_id,
        "scene_id": job.scene_id,
        "provider": job.provider,
        "stage": job.stage,
        "status": job.status,
        "error": job.error,
    }


def put_orchestrate(job: OrchestrateJob) -> OrchestrateJob:
    job.updated_at = datetime.now(UTC).isoformat()
    ORCH_JOBS[job.job_id] = job
    _db.fire_and_forget(_db.upsert_generation(job.job_id, _orch_to_mongo(job)))
    return job


def get_orchestrate(job_id: str) -> OrchestrateJob | None:
    return ORCH_JOBS.get(job_id)


def update_orchestrate(
    job_id: str,
    *,
    status: OrchestrateStatus | None = None,
    stage: str | None = None,
    error: str | None = None,
    provider: str | None = None,
    provider_job_id: str | None = None,
    submission: dict[str, Any] | None = None,
    observability: dict[str, Any] | None = None,
) -> OrchestrateJob | None:
    job = ORCH_JOBS.get(job_id)
    if not job:
        return None
    if status is not None:
        job.status = status
    if stage is not None:
        job.stage = stage
    if error is not None:
        job.error = error
    if provider is not None:
        job.provider = provider
    if provider_job_id is not None:
        job.provider_job_id = provider_job_id
    if submission is not None:
        job.submission = submission
    if observability:
        job.observability.update(observability)
    if job.status in {"running", "submitted"} and not job.started_at:
        job.started_at = datetime.now(UTC).isoformat()
    if job.status in {"succeeded", "failed"}:
        job.finished_at = datetime.now(UTC).isoformat()
    job.updated_at = datetime.now(UTC).isoformat()
    _db.fire_and_forget(_db.upsert_generation(job.job_id, _orch_to_mongo(job)))
    return job
