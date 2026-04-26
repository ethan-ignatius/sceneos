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
    # ISO-8601 timestamp captured when the provider job was first dispatched.
    # Surfaced in the /api/status response so the frontend GenerationPanel
    # can compute REAL elapsed time (Date.now() - new Date(startedAt))
    # instead of restarting its local clock when the user closes/reopens
    # the drawer mid-generation. Optional: providers that don't track it
    # may omit; the frontend falls back to its local mount-time clock.
    startedAt: str


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


def _autodetect_default_provider() -> GenerationProvider:
    """
    Pick a sane default provider when GENERATION_PROVIDER is unset.

    Preference order:
      1. Vertex if GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS are
         present (the user's setup as of 2026-04-25).
      2. Higgsfield if HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET are set.
      3. cached as a no-credential fallback so unsupervised real-mode
         boots can never crash on the first generate() call — the
         orchestrator's provider-fallback logic will surface a clean
         "fallbackReason" to the frontend.
    """
    project_id = env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")
    if project_id and env("GOOGLE_APPLICATION_CREDENTIALS"):
        return "vertex"
    if env("HIGGSFIELD_API_KEY") and env("HIGGSFIELD_API_SECRET"):
        return "higgsfield"
    return "cached"


def active_provider_name() -> GenerationProvider:
    raw = (env("GENERATION_PROVIDER") or "").strip().lower()
    if not raw:
        return _autodetect_default_provider()
    if raw in {"higgsfield", "kling", "fal", "vertex", "replicate", "cached"}:
        return raw  # type: ignore[return-value]
    return _autodetect_default_provider()


def get_provider() -> tuple[GenerationProvider, ProviderModule]:
    name = active_provider_name()
    return name, _registry()[name]


def get_named_provider(name: GenerationProvider) -> ProviderModule:
    return _registry()[name]


async def dispatch_with_fallback(
    params: GenerateClipParams,
) -> tuple[GenerationProvider, dict, GenerationProvider | None, str | None]:
    """
    Try the active provider, fall back to `cached` on submission failure.

    Returns (provider_name_used, generate_result, original_provider_or_None, fallback_reason_or_None).

    Live demo guarantee: if Veo / Higgsfield rejects the request (quota,
    safety, network), the orchestrator and `/api/generate` automatically
    swap in the cached tier and surface the reason. The caller should
    use the RETURNED provider name (not active_provider_name()) when
    encoding the jobId so /api/status routes to the right tier.

    No-op for an active provider that is already `cached`.
    """
    primary, primary_impl = get_provider()
    try:
        result = await primary_impl.generate(params)
        return primary, result, None, None
    except Exception as exc:
        if primary == "cached":
            raise
        cached_impl = get_named_provider("cached")
        try:
            result = await cached_impl.generate(params)
        except Exception:
            raise exc
        return "cached", result, primary, str(exc)


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
