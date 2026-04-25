from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py.app import app
from .fixtures import request_with_turns


def test_agent_endpoint_returns_question(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = TestClient(app)
    res = client.post("/api/agent", json=request_with_turns([], "An astronaut is alone."))
    assert res.status_code == 200
    assert res.json()["kind"] == "question"


def test_generate_rejects_insufficient_prompt():
    client = TestClient(app)
    res = client.post(
        "/api/generate",
        json={
            "projectId": "p",
            "beatId": "b",
            "sceneId": "s",
            "refinedPrompt": "too short",
            "durationSeconds": 5,
        },
    )
    assert res.status_code == 400


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
