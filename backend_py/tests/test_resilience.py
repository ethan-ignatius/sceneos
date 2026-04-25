"""
Tests for the round-4 resilience + real-mode-boot work:

* `config.mock_mode()` recognizes Vertex creds (the user's setup) as a
  valid real-mode auth path even when Anthropic/Higgsfield keys are absent.
* `provider.active_provider_name()` defaults to `vertex` when GOOGLE
  creds are present and `GENERATION_PROVIDER` is unset.
* `provider.dispatch_with_fallback()` swaps in `cached` when the active
  provider's submission raises, and surfaces the failure reason.
* `GET /api/session/{projectId}` returns the cached manifest +
  speculative jobs for a known projectId, 404 for an unknown one.
"""
from __future__ import annotations

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

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
    """User's actual setup: Vertex + Cloudinary present, no Anthropic/Higgsfield.
    Pre-patch this test would have returned True → silent mock mode.
    """
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("GOOGLE_PROJECT_ID", "my-gcp-project")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/sa.json")
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://k:s@cloudname")
    assert config_mod.mock_mode() is False


def test_mock_mode_true_when_no_video_provider(monkeypatch):
    """Cloudinary + Anthropic present but no video provider → mock."""
    _clear_real_mode_envs(monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "ak")
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
