from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py.app import app
from .fixtures import request_with_turns


def test_agent_endpoint_returns_question(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post("/api/agent", json=request_with_turns([], "An astronaut is alone."))
    assert res.status_code == 200
    assert res.json()["kind"] == "question"


def test_generate_accepts_short_prompt_in_mock_mode(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post(
        "/api/generate",
        json={
            "projectId": "p",
            "beatId": "b",
            "sceneId": "s",
            "refinedPrompt": "short prompt is fine in mock",
            "durationSeconds": 5,
            "beatTemplate": "trailer.establishing",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "cached"
    assert body["jobId"].startswith("mock::")


def test_orchestrate_first_beat_no_chain(monkeypatch):
    """First beat — orchestrator should NOT chain (no previous frame). Returns stub refs."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post(
        "/api/orchestrate/beat-1",
        json={
            "manifest": {
                "projectId": "p1",
                "videoType": "story",
                "masterPrompt": "A monkey steals a banana from the zoo",
                "beats": [
                    {
                        "beatId": "beat-1",
                        "beatName": "Hook",
                        "template": "story.hook",
                        "archetype": {"intent": "Establish.", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
                        "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}],
                    }
                ],
            },
            "beatFacts": {
                "subject": "a determined chimpanzee",
                "action": "reaches through the bars",
                "setting": "an outdoor primate enclosure at golden hour",
                "framing": "85mm intimate close-up, slight handheld",
                "mood": "intimate-hook",
                "characterDescription": "small chimpanzee, scuffed fur, intelligent eyes",
                "locationDescription": "primate enclosure, bars, soft golden hour",
            },
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["chainFromPrevious"] is False
    assert body["characterRef"] is not None
    assert body["characterRef"]["kind"] == "character"
    assert body["locationRef"] is not None
    assert body["seedImageUrl"]
    assert body["motionPreset"]["lens"]
    assert "imagePrompt" in body["clipPrompt"]
    assert body["jobId"].startswith("mock::")


def test_orchestrate_subsequent_beat_with_chain(monkeypatch):
    """Subsequent beat with previousLastFrameUrl: chains, no fresh refs."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    manifest = {
        "projectId": "p1",
        "videoType": "story",
        "masterPrompt": "x",
        "beats": [
            {"beatId": "beat-1", "beatName": "Hook", "template": "story.hook",
             "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
             "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}]},
            {"beatId": "beat-2", "beatName": "Exposition", "template": "story.exposition",
             "archetype": {"intent": "x", "mood": "wide-establish", "suggestedDuration": 8, "directorNotes": ""},
             "scenes": [{"sceneId": "scene-2", "conversation": [], "approved": False}]},
        ],
    }
    res = client.post(
        "/api/orchestrate/beat-2",
        json={
            "manifest": manifest,
            "beatFacts": {"subject": "the chimp", "action": "walks", "setting": "a hallway", "mood": "wide-establish"},
            "previousLastFrameUrl": "https://res.cloudinary.com/demo/video/upload/so_99p/dog.jpg",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["chainFromPrevious"] is True
    assert body["characterRef"] is None
    assert body["locationRef"] is None
    assert body["seedImageUrl"] == "https://res.cloudinary.com/demo/video/upload/so_99p/dog.jpg"


def test_orchestrate_hard_cut_overrides_chain(monkeypatch):
    """Beat with chainFromPrevious=false skips chaining even with previousLastFrameUrl set."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    manifest = {
        "projectId": "p1", "videoType": "story", "masterPrompt": "x",
        "beats": [
            {"beatId": "beat-1", "beatName": "Hook", "template": "story.hook",
             "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
             "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}]},
            {"beatId": "beat-2", "beatName": "Exposition", "template": "story.exposition",
             "chainFromPrevious": False,  # explicit hard cut
             "archetype": {"intent": "x", "mood": "wide-establish", "suggestedDuration": 8, "directorNotes": ""},
             "scenes": [{"sceneId": "scene-2", "conversation": [], "approved": False}]},
        ],
    }
    res = client.post(
        "/api/orchestrate/beat-2",
        json={
            "manifest": manifest,
            "beatFacts": {"subject": "x", "action": "y", "setting": "z", "mood": "wide-establish",
                          "characterDescription": "char", "locationDescription": "loc"},
            "previousLastFrameUrl": "https://example.com/prev.jpg",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["chainFromPrevious"] is False
    assert body["characterRef"] is not None  # fresh refs for the cut


def test_references_generate_mock(monkeypatch):
    """In mock mode, /api/references/generate short-circuits to a Cloudinary demo asset."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post(
        "/api/references/generate",
        json={
            "kind": "character",
            "description": "A determined chimpanzee with intelligent eyes",
            "projectId": "p1",
            "beatId": "beat-1",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["kind"] == "character"
    assert body["imageUrl"].endswith(".jpg")
    assert body["publicId"].startswith("mock::")
    assert "Cinematic character reference" in body["prompt"]


def test_references_generate_rejects_unknown_kind(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post(
        "/api/references/generate",
        json={"kind": "skybox", "description": "x"},
    )
    assert res.status_code == 400


def test_status_includes_last_frame_url_on_succeeded(monkeypatch):
    """Chain primitive: when a clip succeeds, lastFrameUrl is the seed image
    for the next beat's I2V generation."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    # Mock-mode jobIds tick to "succeeded" on the second poll.
    job_id = "mock::story.hook-scene-1-test"
    res1 = client.get(f"/api/status/{job_id}")
    assert res1.status_code == 200
    res2 = client.get(f"/api/status/{job_id}")
    assert res2.status_code == 200
    body = res2.json()
    assert body["status"] == "succeeded"
    assert "clipPublicId" in body
    assert "lastFrameUrl" in body
    assert body["lastFrameUrl"].endswith(".jpg")
    assert "/so_99p/" in body["lastFrameUrl"]


def test_stitch_builds_url():
    client = TestClient(app)
    res = client.post(
        "/api/stitch/url",
        json={
            "manifest": {
                "beats": [
                    {
                        "status": "approved",
                        "archetype": {"mood": "wide-establish"},
                        "scenes": [
                            {"clipPublicId": "sceneos/demo/a", "durationSeconds": 5}
                        ],
                    }
                ]
            },
            "colorGrade": True,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["finalUrl"].endswith("sceneos/demo/a.mp4")
    assert body["durationSeconds"] == 5
