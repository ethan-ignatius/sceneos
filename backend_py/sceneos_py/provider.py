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
    # 1-5 reference image URLs for cross-frame consistency. Higgsfield
    # treats this as Soul mode (multi-character/location ref); Vertex Veo
    # currently ignores it (single-frame seed only). Providers that don't
    # support it just drop the field.
    referenceImageUrls: list[str] | None


class StatusResult(TypedDict, total=False):
    status: JobStatusValue
    stage: str
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

    Preference order (Higgsfield-prominent — see SceneOS submission story):
      1. Higgsfield if HIGGSFIELD_API_KEY is present. Soul mode is the
         architectural moat — character + location reference URLs flow
         through every beat to keep identity stable across the cut.
         The legacy key+secret pair routes to platform.higgsfield.ai;
         a lone bearer key routes to higgsfieldapi.com.
      2. Vertex if GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS
         are present. Veo is the no-Higgsfield alternate lane.
      3. cached as a no-credential fallback so unsupervised real-mode
         boots can never crash on the first generate() call — the
         orchestrator's provider-fallback logic will surface a clean
         "fallbackReason" to the frontend.
    """
    if env("HIGGSFIELD_API_KEY"):
        return "higgsfield"
    project_id = env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")
    if project_id and env("GOOGLE_APPLICATION_CREDENTIALS"):
        return "vertex"
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
    Try the active provider, then a sibling tier, then `cached`. Returns
    (provider_name_used, generate_result, original_provider, fallback_reason).

    Cascade rules:
      - Higgsfield primary → Vertex sibling → cached
      - Vertex primary    → Higgsfield sibling (if creds) → cached
      - Anything else     → cached
      - Already cached    → no fallback, raise

    Live-demo guarantee: a single provider 5xx never dead-ends the user.
    The caller MUST use the RETURNED provider name (not
    active_provider_name()) when encoding the jobId so /api/status routes
    to the right tier.

    On total cascade failure (every tier raised), a RuntimeError is raised
    whose message includes a per-tier breakdown — so the frontend's 502
    detail surfaces "Higgsfield: 422 ... | Vertex: quota ... | cached: ..."
    instead of an opaque single error.
    """
    import logging
    log = logging.getLogger(__name__)

    primary, primary_impl = get_provider()
    cascade_errors: list[str] = []
    try:
        result = await primary_impl.generate(params)
        return primary, result, None, None
    except Exception as primary_exc:
        log.warning("[provider] primary=%s failed: %s", primary, primary_exc)
        cascade_errors.append(f"{primary}: {primary_exc}")
        if primary == "cached":
            raise RuntimeError(f"cached provider failed: {primary_exc}") from primary_exc

        # Sibling tier: try the OTHER real provider before falling back to
        # cached. Higgsfield ↔ Vertex; the rest go straight to cached.
        sibling: GenerationProvider | None = None
        if primary == "higgsfield":
            project_id = env("GOOGLE_PROJECT_ID") or env("GCP_PROJECT_ID")
            if project_id and env("GOOGLE_APPLICATION_CREDENTIALS"):
                sibling = "vertex"
        elif primary == "vertex":
            if env("HIGGSFIELD_API_KEY"):
                sibling = "higgsfield"

        if sibling:
            try:
                result = await get_named_provider(sibling).generate(params)
                return sibling, result, primary, str(primary_exc)
            except Exception as sib_exc:
                log.warning("[provider] sibling=%s failed: %s", sibling, sib_exc)
                cascade_errors.append(f"{sibling}: {sib_exc}")

        # Cached fallback — must always succeed for live-demo safety.
        # If even cached blows up, raise with the FULL cascade trace so
        # the operator can see every tier's reason at once.
        try:
            result = await get_named_provider("cached").generate(params)
        except Exception as cached_exc:
            log.error("[provider] cached fallback failed: %s", cached_exc)
            cascade_errors.append(f"cached: {cached_exc}")
            raise RuntimeError(
                "All providers failed: " + " | ".join(cascade_errors)
            ) from primary_exc
        return "cached", result, primary, str(primary_exc)


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
