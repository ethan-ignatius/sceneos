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
