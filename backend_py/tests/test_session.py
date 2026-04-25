"""Tests for /api/session/start (demo + normal) and the speculative-job
re-use path through /api/orchestrate.

These tests exercise the demo/normal split end-to-end in MOCK_MODE so they
don't depend on Vertex/fal/Cloudinary credentials. The contract they pin:

* `POST /api/session/start { mode: "demo" }` returns a manifest with all
  7 beats AND a `speculativeJobs` map keyed by beatId. Each speculative
  job carries the same shape the orchestrator returns.
* A subsequent `POST /api/orchestrate/<beatId>` for that project returns
  the SAME jobId with `speculativeReused: true` — no fresh work happens.
* `POST /api/session/start { mode: "normal" }` returns no speculative
  jobs and the manifest carries `mode: "normal"`. Orchestrate calls do
  fresh work (no `speculativeReused` flag).
* Bad mode → 400.
* `promptId` pins the curated prompt; unknown id → 400.

The agent speed-mode (DEMO_MAX_QUESTIONS, demo-block in system prompt)
is exercised by the existing test_agent_eval suite — there is nothing
mode-specific to assert at the HTTP layer because the mock agent ignores
mode in run_mock_agent_turn-streaming. The behavioral test lives in
test_agent_eval; this file is the API-contract layer.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py.app import app
from sceneos_py import session as session_service
from sceneos_py.demo_prompts import DEMO_PROMPTS, NORMAL_PROMPTS


def _client(monkeypatch) -> TestClient:
    monkeypatch.setenv("MOCK_MODE", "true")
    # Fresh in-memory state per test so speculative-jobs from prior tests
    # don't leak.
    session_service._SPECULATIVE.clear()
    session_service._SESSIONS.clear()
    return TestClient(app)


def test_session_start_demo_returns_seven_speculative_jobs(monkeypatch):
    client = _client(monkeypatch)
    res = client.post("/api/session/start", json={"mode": "demo"})
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["mode"] == "demo"
    assert body["demoPromptId"] in {p["id"] for p in DEMO_PROMPTS}
    assert body["masterPrompt"]
    assert body["videoType"] == "story"
    assert body["manifest"]["mode"] == "demo"
    assert len(body["manifest"]["beats"]) == 7

    spec = body["speculativeJobs"]
    assert isinstance(spec, dict)
    assert sorted(spec.keys()) == [f"beat-{i}" for i in range(1, 8)]
    for beat_id, job in spec.items():
        # Same shape as /api/orchestrate
        assert job["jobId"], f"beat {beat_id} missing jobId"
        assert job["provider"]
        assert "motionPreset" in job
        assert "clipPrompt" in job
        # Speculative jobs are flagged so the visualizer can show a badge
        assert job.get("speculative") is True


def test_session_start_normal_no_speculative(monkeypatch):
    client = _client(monkeypatch)
    res = client.post("/api/session/start", json={"mode": "normal"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "normal"
    assert body["normalPromptId"] in {p["id"] for p in NORMAL_PROMPTS}
    assert "speculativeJobs" not in body
    assert body["manifest"]["mode"] == "normal"


def test_session_start_rejects_unknown_mode(monkeypatch):
    client = _client(monkeypatch)
    res = client.post("/api/session/start", json={"mode": "yolo"})
    assert res.status_code == 400


def test_session_start_pins_prompt_id(monkeypatch):
    client = _client(monkeypatch)
    target = DEMO_PROMPTS[0]["id"]
    res = client.post("/api/session/start", json={"mode": "demo", "promptId": target})
    assert res.status_code == 200, res.text
    assert res.json()["demoPromptId"] == target


def test_session_start_rejects_unknown_prompt_id(monkeypatch):
    client = _client(monkeypatch)
    res = client.post(
        "/api/session/start",
        json={"mode": "demo", "promptId": "this-prompt-does-not-exist"},
    )
    assert res.status_code == 400


def test_orchestrate_reuses_speculative_job_in_demo_mode(monkeypatch):
    """The point of demo mode: orchestrate should be a near-instant
    cache hit because the work was kicked off at /api/session/start."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()
    manifest = session["manifest"]
    spec = session["speculativeJobs"]

    res = client.post(
        "/api/orchestrate/beat-1",
        json={
            "manifest": manifest,
            # The agent will eventually extract its own beatFacts; demo
            # mode ignores them and returns the pre-warmed job.
            "beatFacts": {
                "subject": "agent-extracted-subject",
                "action": "agent-extracted-action",
                "setting": "agent-extracted-setting",
                "mood": "intimate-hook",
            },
            "aspectRatio": "16:9",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["speculativeReused"] is True
    assert body["jobId"] == spec["beat-1"]["jobId"]


def test_orchestrate_normal_mode_does_fresh_work(monkeypatch):
    """Normal mode: no speculative cache, orchestrate runs fresh."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "normal"}).json()
    manifest = session["manifest"]

    res = client.post(
        "/api/orchestrate/beat-1",
        json={
            "manifest": manifest,
            "beatFacts": {
                "subject": "x",
                "action": "y",
                "setting": "z",
                "mood": "intimate-hook",
                "characterDescription": "char",
                "locationDescription": "loc",
            },
            "aspectRatio": "16:9",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Normal mode does NOT mark this as a cache reuse.
    assert not body.get("speculativeReused")
    assert body["jobId"]


def test_demo_session_returns_shared_project_refs(monkeypatch):
    """Visual-continuity anchor: ONE character ref + ONE location ref
    must be generated per project, and every speculative beat must
    reference the same publicId for each kind. Without this the
    protagonist drifts beat-to-beat — the most-noticed-by-humans bug."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()

    # Top-level projectRefs surfaced for the visualizer
    refs = session["projectRefs"]
    assert refs["character"] and refs["character"]["publicId"]
    assert refs["location"] and refs["location"]["publicId"]

    # Every beat's speculative job carries the SAME publicId per kind
    char_ids = {job["characterRef"]["publicId"] for job in session["speculativeJobs"].values()}
    loc_ids  = {job["locationRef"]["publicId"]  for job in session["speculativeJobs"].values()}
    assert char_ids == {refs["character"]["publicId"]}, (
        f"character ref drifted across beats: {char_ids}"
    )
    assert loc_ids == {refs["location"]["publicId"]}, (
        f"location ref drifted across beats: {loc_ids}"
    )

    # And every beat reports sharedRefs=True
    assert all(job["sharedRefs"] is True for job in session["speculativeJobs"].values())


def test_demo_session_stamps_audio_on_manifest(monkeypatch):
    """Audio must be auto-selected at session start so /api/stitch/url
    has a default l_audio: layer to overlay without any extra wiring."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()
    audio = session["manifest"].get("audioPublicId")
    assert audio, "manifest.audioPublicId must be stamped at session start"
    # The default library uses sceneos/audio/<id> public_ids; an empty
    # string would skip the l_audio layer in the splice URL builder.
    assert audio.startswith("sceneos/audio/")


def test_orchestrate_normal_mode_lazily_generates_shared_refs(monkeypatch):
    """First markSufficient in normal mode triggers shared-ref generation;
    subsequent beats reuse the cached refs (no duplicate generation)."""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "normal"}).json()
    manifest = session["manifest"]

    # Beat 1: ships character + location descriptions
    r1 = client.post("/api/orchestrate/beat-1", json={
        "manifest": manifest,
        "beatFacts": {
            "subject": "the protagonist",
            "action": "looks at the mirror",
            "setting": "a small bathroom",
            "mood": "intimate-hook",
            "characterDescription": "a woman in her 30s with chestnut hair, weary eyes",
            "locationDescription": "a small bathroom with cracked tile and a flickering bulb",
        },
        "aspectRatio": "16:9",
    }).json()
    assert r1["sharedRefs"] is True
    assert r1["characterRef"] and r1["locationRef"]
    char_pid_1 = r1["characterRef"]["publicId"]
    loc_pid_1  = r1["locationRef"]["publicId"]

    # Beat 2: ships DIFFERENT descriptions — refs must NOT be regenerated.
    # The cached project refs win, so the protagonist stays the same.
    r2 = client.post("/api/orchestrate/beat-2", json={
        "manifest": manifest,
        "beatFacts": {
            "subject": "the protagonist",
            "action": "walks down a hallway",
            "setting": "a long hallway",
            "mood": "wide-establish",
            # Deliberately drift to verify caching:
            "characterDescription": "an entirely different woman with red hair",
            "locationDescription": "a hallway in a different building",
        },
        "aspectRatio": "16:9",
    }).json()
    assert r2["sharedRefs"] is True
    assert r2["characterRef"]["publicId"] == char_pid_1, (
        "character ref leaked between beats — must reuse the project-cached ref"
    )
    assert r2["locationRef"]["publicId"] == loc_pid_1


def test_demo_speculative_jobs_complete_via_status_polling(monkeypatch):
    """The speculative jobIds must be valid handles that /api/status can
    drive to completion. (Mock mode flips to 'succeeded' on the second
    poll; in real mode the provider drives the state machine.)"""
    client = _client(monkeypatch)
    session = client.post("/api/session/start", json={"mode": "demo"}).json()
    job_id = session["speculativeJobs"]["beat-1"]["jobId"]

    poll1 = client.get(f"/api/status/{job_id}").json()
    poll2 = client.get(f"/api/status/{job_id}").json()
    assert poll1["status"] in {"running", "succeeded"}
    assert poll2["status"] == "succeeded"
    assert poll2.get("clipPublicId")
    assert poll2.get("lastFrameUrl"), (
        "lastFrameUrl is the chain primitive — it must be present so "
        "normal-mode beat-N+1 can use it as an I2V seed."
    )
