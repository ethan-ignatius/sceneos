"""
Tests for the round-4 resilience + real-mode-boot work:

* `config.mock_mode()` recognizes Vertex creds (the user's setup) as a
  valid real-mode auth path even when Higgsfield keys are absent. Vertex
  is the only LLM SceneOS uses; Anthropic was removed.
* `provider.active_provider_name()` defaults to `vertex` when GOOGLE
  creds are present and `GENERATION_PROVIDER` is unset.
* `provider.dispatch_with_fallback()` swaps in `cached` when the active
  provider's submission raises, and surfaces the failure reason.
* `GET /api/session/{projectId}` returns the cached manifest +
  speculative jobs for a known projectId, 404 for an unknown one.
* `cloudinary.upload_video_from_url` retries WriteTimeout/ReadTimeout
  (the actual failure mode of 7-way parallel data-URI uploads at
  1080p Veo 3.1 size) and gives up cleanly on a 4xx.
"""
from __future__ import annotations

import asyncio
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from sceneos_py import cloudinary as cloudinary_mod
from sceneos_py import config as config_mod
from sceneos_py import provider as provider_mod
from sceneos_py.app import app
from sceneos_py import session as session_service


def _clear_real_mode_envs(monkeypatch):
    for var in (
        "MOCK_MODE",
        "GOOGLE_PROJECT_ID",
        "GCP_PROJECT_ID",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "HIGGSFIELD_API_KEY",
        "HIGGSFIELD_API_SECRET",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "CLOUDINARY_URL",
        "GENERATION_PROVIDER",
    ):
        monkeypatch.delenv(var, raising=False)


def test_mock_mode_recognizes_vertex_plus_cloudinary(monkeypatch):
    """User's actual setup: Vertex + Cloudinary present, no Higgsfield.
    Vertex is the only LLM and the default video provider, so this is real mode.
    """
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("GOOGLE_PROJECT_ID", "my-gcp-project")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/sa.json")
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://k:s@cloudname")
    assert config_mod.mock_mode() is False


def test_mock_mode_true_when_no_video_provider(monkeypatch):
    """Cloudinary present but no Vertex (and no Higgsfield) → mock.
    Without Vertex, there's no agent path AND no default video path."""
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://k:s@cloudname")
    assert config_mod.mock_mode() is True


def test_mock_mode_explicit_override_wins(monkeypatch):
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("MOCK_MODE", "true")
    monkeypatch.setenv("GOOGLE_PROJECT_ID", "p")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/x")
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://k:s@c")
    assert config_mod.mock_mode() is True


def test_active_provider_defaults_to_vertex_when_gcp_present(monkeypatch):
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("GOOGLE_PROJECT_ID", "p")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/x")
    assert provider_mod.active_provider_name() == "vertex"


def test_active_provider_falls_back_to_cached_when_no_creds(monkeypatch):
    _clear_real_mode_envs(monkeypatch)
    assert provider_mod.active_provider_name() == "cached"


def test_active_provider_explicit_override(monkeypatch):
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("GOOGLE_PROJECT_ID", "p")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/x")
    monkeypatch.setenv("GENERATION_PROVIDER", "higgsfield")
    assert provider_mod.active_provider_name() == "higgsfield"


def test_dispatch_with_fallback_swaps_in_cached_on_primary_failure(monkeypatch):
    """When the active provider raises on generate(), dispatch_with_fallback
    auto-swaps in `cached` and surfaces the failure reason."""
    from sceneos_py import cached as cached_mod

    class _BrokenProvider:
        async def generate(self, _params):
            raise RuntimeError("vertex 503")

        async def status(self, _job_id):
            return {"status": "failed"}

    monkeypatch.setattr(provider_mod, "active_provider_name", lambda: "vertex")
    fake_registry = {
        "vertex": _BrokenProvider(),
        "cached": cached_mod,
        "higgsfield": _BrokenProvider(),
        "kling": _BrokenProvider(),
        "fal": _BrokenProvider(),
        "replicate": _BrokenProvider(),
    }
    monkeypatch.setattr(provider_mod, "_registry", lambda: fake_registry)

    cached_mod.DEMO_TRAILER_CLIPS["trailer.establishing"] = cached_mod._Clip(
        public_id="sceneos/demo/establishing",
        clip_url="https://res.cloudinary.com/demo/video/upload/dog.mp4",
        duration_seconds=5,
    )
    try:
        name, result, original, reason = asyncio.run(provider_mod.dispatch_with_fallback({
            "projectId": "p",
            "beatId": "beat-1",
            "sceneId": "beat-1-scene-1",
            "refinedPrompt": "cinematic still of the keeper",
            "durationSeconds": 5,
            "beatTemplate": "trailer.establishing",
        }))
    finally:
        cached_mod.DEMO_TRAILER_CLIPS["trailer.establishing"] = None

    assert name == "cached"
    assert original == "vertex"
    assert reason and "vertex 503" in reason
    assert "jobId" in result


def test_session_get_returns_cached_state(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    session_service._SPECULATIVE.clear()
    session_service._SESSIONS.clear()
    client = TestClient(app)

    started = client.post("/api/session/start", json={"mode": "demo"})
    assert started.status_code == 200, started.text
    body = started.json()
    project_id = body["projectId"]

    res = client.get(f"/api/session/{project_id}")
    assert res.status_code == 200, res.text
    state = res.json()
    assert state["projectId"] == project_id
    assert state["mode"] == "demo"
    assert len(state["manifest"]["beats"]) == 7
    assert sorted(state["speculativeJobs"].keys()) == [f"beat-{i}" for i in range(1, 8)]
    assert state["projectRefs"]["character"]["publicId"].startswith("shared::")


def test_session_get_unknown_project_returns_404(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    session_service._SPECULATIVE.clear()
    session_service._SESSIONS.clear()
    client = TestClient(app)
    res = client.get("/api/session/does-not-exist")
    assert res.status_code == 404


# ---------- upload retry tests ----------------------------------------------
#
# Pin the new transport-error retry behavior in `cloudinary.upload_video_from_url`.
# This was added because the 7-way parallel re-bake of the lighthouse demo
# (Veo 3.1, 1080p, ~25 MB base64 each) reliably hit `httpx.WriteTimeout('')`
# uploading data URIs to Cloudinary. The fix retries on the full transport-
# error family with backoff, but still hard-fails fast on a 4xx so we never
# waste minutes retrying a permanently-bad public_id or auth.

class _FakeResponse:
    def __init__(self, status: int = 200, body: dict | None = None, text: str = ""):
        self.status_code = status
        self._body = body or {
            "public_id": "sceneos/demo/clip",
            "secure_url": "https://res.cloudinary.com/demo/video/upload/clip.mp4",
            "duration": 6,
        }
        self.text = text or "ok"

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(f"{self.status_code}", request=None, response=self)  # type: ignore[arg-type]


def _patch_cloudinary_creds(monkeypatch):
    monkeypatch.setattr(
        cloudinary_mod,
        "_cloudinary_creds",
        lambda: ("cloud", "key", "secret"),
    )
    # Skip real backoff so the test runs in milliseconds, not seconds.
    monkeypatch.setattr(cloudinary_mod, "_httpx_backoff", lambda _attempt: asyncio.sleep(0))


def test_upload_video_retries_on_write_timeout_then_succeeds(monkeypatch):
    """The exact production failure mode: WriteTimeout on attempt 1, success on
    attempt 2. Old code raised — new code returns the second response."""
    _patch_cloudinary_creds(monkeypatch)

    calls = {"n": 0}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.WriteTimeout("")
            return _FakeResponse()

    monkeypatch.setattr(cloudinary_mod.httpx, "AsyncClient", _Client)

    result = asyncio.run(
        cloudinary_mod.upload_video_from_url("data:video/mp4;base64,AAA=", "sceneos/demo/clip")
    )
    assert calls["n"] == 2
    assert result["publicId"] == "sceneos/demo/clip"


def test_upload_video_retries_on_5xx_then_gives_up(monkeypatch):
    """Three 5xx responses → exhausts retries, raises a clean error that
    surfaces both the public_id and the upstream body. We must NOT silently
    swallow this."""
    _patch_cloudinary_creds(monkeypatch)

    calls = {"n": 0}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            calls["n"] += 1
            return _FakeResponse(status=503, text="Cloudinary overloaded")

    monkeypatch.setattr(cloudinary_mod.httpx, "AsyncClient", _Client)

    with pytest.raises(RuntimeError) as exc_info:
        asyncio.run(
            cloudinary_mod.upload_video_from_url("data:video/mp4;base64,AAA=", "sceneos/demo/clip")
        )
    assert calls["n"] == 3
    msg = str(exc_info.value)
    assert "exhausted retries" in msg
    assert "sceneos/demo/clip" in msg


def test_upload_video_does_not_retry_on_4xx(monkeypatch):
    """A 401 / 400 / 422 is deterministic — bad creds, malformed payload,
    public_id collision. Retrying just wastes 7-13 seconds per failure
    inside the 7-way bake. Must fail fast."""
    _patch_cloudinary_creds(monkeypatch)

    calls = {"n": 0}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            calls["n"] += 1
            return _FakeResponse(status=401, text="Invalid Cloudinary signature")

    monkeypatch.setattr(cloudinary_mod.httpx, "AsyncClient", _Client)

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(
            cloudinary_mod.upload_video_from_url("data:video/mp4;base64,AAA=", "sceneos/demo/clip")
        )
    assert calls["n"] == 1, "must NOT retry a 4xx"
