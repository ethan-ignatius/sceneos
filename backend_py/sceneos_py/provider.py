"""
Provider dispatcher.

Mirrors backend/src/services/provider.ts. Routes call get_provider() and
encode_job_id()/decode_job_id() so they don't need to know which engine
is active. Switched via GENERATION_PROVIDER env var.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Literal, Protocol, TypedDict

from .config import env


GenerationProvider = Literal["higgsfield", "kling", "fal", "vertex", "replicate", "cached"]
JobStatusValue = Literal["queued", "running", "succeeded", "failed"]


class GenerateClipParams(TypedDict, total=False):
    refinedPrompt: str
    durationSeconds: float
    beatTemplate: str | None
    clipPrompt: dict | None
    projectId: str
    beatId: str
    sceneId: str
    startImageUrl: str | None


class StatusResult(TypedDict, total=False):
    status: JobStatusValue
    clipUrl: str
    clipPublicId: str
    error: str
    imageUrl: str


class ProviderModule(Protocol):
    async def generate(self, params: GenerateClipParams) -> dict: ...
    async def status(self, provider_job_id: str) -> StatusResult: ...


def _registry() -> dict[GenerationProvider, ProviderModule]:
    # Local import to avoid circulars at module load.
    from . import cached, fal, higgsfield, kling, replicate, vertex_veo
    return {
        "higgsfield": higgsfield,
        "kling": kling,
        "fal": fal,
        "vertex": vertex_veo,
        "replicate": replicate,
        "cached": cached,
    }


def active_provider_name() -> GenerationProvider:
    raw = (env("GENERATION_PROVIDER", "higgsfield") or "higgsfield").strip().lower()
    if raw in {"higgsfield", "kling", "fal", "vertex", "replicate", "cached"}:
        return raw  # type: ignore[return-value]
    return "higgsfield"


def get_provider() -> tuple[GenerationProvider, ProviderModule]:
    name = active_provider_name()
    return name, _registry()[name]


def encode_job_id(provider: GenerationProvider, provider_job_id: str) -> str:
    return f"{provider}::{provider_job_id}"


def decode_job_id(job_id: str) -> tuple[GenerationProvider, str]:
    provider, sep, rest = job_id.partition("::")
    if not sep or provider not in {"higgsfield", "kling", "fal", "vertex", "replicate", "cached", "mock"}:
        raise ValueError(f"Unknown provider in jobId: {job_id}")
    # 'mock' was the TS-side prefix for mock-mode jobs; treat as cached.
    if provider == "mock":
        return "cached", rest
    return provider, rest  # type: ignore[return-value]


def poll_after_ms_for(provider: GenerationProvider) -> int:
    if provider == "cached":
        return 0
    if provider == "kling":
        return 4000
    return 5000
