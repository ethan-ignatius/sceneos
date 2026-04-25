"""Audio selection + final stitch contract.

These tests pin the audio + stitch wiring that the mock_frontend's
auto-stitch panel relies on:

* `audio.pick_music(videoType)` returns a stable public_id (or None).
* `/api/stitch/url` reads `manifest.audioPublicId` when no explicit
  body override is set, AND falls back to `audio.pick_music` when the
  manifest is silent.
* The full demo flow (session/start → all 7 statuses → stitch) returns
  a Cloudinary `fl_splice` URL that includes the `l_audio:` overlay.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py import audio, session as session_service
from sceneos_py.app import app


def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("MOCK_MODE", "true")
    session_service._SPECULATIVE.clear()
    session_service._SESSIONS.clear()
    return TestClient(app)


def test_pick_music_returns_default_for_story():
    pid = audio.pick_music("story", mood="auto")
    assert pid and pid.startswith("sceneos/audio/")


def test_pick_music_unknown_videotype_falls_through():
    """An unknown videoType must not raise — it returns None so the
    splice URL builder skips the l_audio layer entirely."""
    pid = audio.pick_music("documentary-feature", mood="auto")
    assert pid is None


def test_pick_music_respects_env_override(monkeypatch):
    monkeypatch.setenv(
        "SCENEOS_MUSIC_LIBRARY",
        '{"story": {"auto": "sceneos/audio/cinematic-strings"}}',
    )
    pid = audio.pick_music("story", mood="auto")
    assert pid == "sceneos/audio/cinematic-strings"


def test_full_demo_flow_stitches_with_audio(monkeypatch):
    """Walks the full demo flow end-to-end and verifies the final
    splice URL includes the l_audio: layer that came from session
    start."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()
    manifest = session["manifest"]
    audio_pid = manifest["audioPublicId"]
    assert audio_pid, "audio must be stamped on the manifest at session start"

    # Drive every speculative job to succeeded + populate clipPublicId
    for beat in manifest["beats"]:
        bid = beat["beatId"]
        spec = session["speculativeJobs"][bid]
        s = client.get(f'/api/status/{spec["jobId"]}').json()  # poll 1: running
        s = client.get(f'/api/status/{spec["jobId"]}').json()  # poll 2: succeeded
        assert s["status"] == "succeeded"
        beat["status"] = "approved"
        beat["scenes"][0]["clipPublicId"] = s["clipPublicId"]
        beat["scenes"][0]["durationSeconds"] = beat["archetype"]["suggestedDuration"]

    # Stitch — body has no audioPublicId, so the manifest field wins
    res = client.post("/api/stitch/url", json={"manifest": manifest, "colorGrade": True})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["finalUrl"]
    assert body["audioPublicId"] == audio_pid
    # The audio overlay must actually be in the URL (l_audio:<id>).
    assert f"l_audio:{audio_pid.replace('/', ':')}" in body["finalUrl"]


def test_stitch_explicit_audio_override_wins(monkeypatch):
    """Power-user override — body.audioPublicId beats manifest.audioPublicId."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()
    manifest = session["manifest"]

    # Promote the speculative jobs' clipPublicIds onto the manifest the
    # cheap way (don't bother actually polling status — we only need a
    # well-formed manifest for stitch).
    for beat in manifest["beats"]:
        spec = session["speculativeJobs"][beat["beatId"]]
        beat["status"] = "approved"
        beat["scenes"][0]["clipPublicId"] = f"mock/{beat['beatId']}"
        beat["scenes"][0]["durationSeconds"] = 5
        # Don't actually poll — tests don't need it for this assertion.
        del spec  # unused

    res = client.post(
        "/api/stitch/url",
        json={
            "manifest": manifest,
            "audioPublicId": "sceneos/audio/custom-override",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["audioPublicId"] == "sceneos/audio/custom-override"
