from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py.app import app
from sceneos_py import app as app_module
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


def test_orchestrate_can_queue_in_background(monkeypatch):
    """When async orchestrate is enabled, /api/orchestrate should return a
    queue job immediately and /api/status should report running/succeeded
    without blocking on provider submission."""
    monkeypatch.setenv("MOCK_MODE", "false")
    monkeypatch.setenv("SCENEOS_ASYNC_ORCHESTRATE", "true")
    monkeypatch.setattr(app_module, "_ASYNC_ORCHESTRATE", True)

    async def _fake_runner(job_id: str) -> None:
        from sceneos_py import jobs as jobs_store
        jobs_store.update_orchestrate(job_id, status="running", stage="preparing")
        jobs_store.update_orchestrate(
            job_id,
            status="succeeded",
            stage="succeeded",
            submission={
                "clipUrl": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
                "clipPublicId": "demo/dog",
            },
            observability={"fakeRunner": True},
        )

    monkeypatch.setattr(app_module, "_run_orchestrate_job", _fake_runner)

    client = TestClient(app)
    manifest = {
        "projectId": "p-async",
        "videoType": "story",
        "masterPrompt": "x",
        "beats": [
            {
                "beatId": "beat-1",
                "beatName": "Hook",
                "template": "story.hook",
                "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
                "scenes": [{"sceneId": "scene-1", "conversation": [], "approved": False}],
            }
        ],
    }
    res = client.post(
        "/api/orchestrate/beat-1",
        json={
            "manifest": manifest,
            "beatFacts": {"subject": "x", "action": "y", "setting": "z", "mood": "intimate-hook"},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["jobId"].startswith("orch::")
    assert body["provider"] == "orchestrator"
    s = client.get(f"/api/status/{body['jobId']}")
    assert s.status_code == 200
    sb = s.json()
    assert sb["status"] in {"running", "succeeded"}


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


# ── Editor (Stage 7) ───────────────────────────────────────────────────────


def _approved_two_beat_manifest() -> dict:
    return {
        "projectId": "p1",
        "videoType": "story",
        "masterPrompt": "a monkey steals a banana from a zoo",
        "beats": [
            {
                "beatId": "b1", "beatName": "Hook", "template": "story.hook",
                "status": "approved",
                "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
                "scenes": [{"sceneId": "s1", "conversation": [], "approved": True, "clipPublicId": "dog", "durationSeconds": 5}],
            },
            {
                "beatId": "b2", "beatName": "Exposition", "template": "story.exposition",
                "status": "approved",
                "archetype": {"intent": "x", "mood": "wide-establish", "suggestedDuration": 8, "directorNotes": ""},
                "scenes": [{"sceneId": "s2", "conversation": [], "approved": True, "clipPublicId": "elephants", "durationSeconds": 8}],
            },
        ],
    }


def test_editor_init_returns_baked_url(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.post("/api/editor/init", json={"manifest": _approved_two_beat_manifest()})
    assert res.status_code == 200
    body = res.json()
    assert body["durationSeconds"] == 13.0
    assert body["finalUrl"].endswith("dog.mp4")
    assert "fl_splice" in body["finalUrl"]
    assert len(body["decisions"]["clips"]) == 2
    # Default editor decisions: every beat gets per-mood color grade carried forward.
    assert body["decisions"]["clips"][0]["colorGrade"]


def test_editor_init_rejects_no_approved_beats():
    client = TestClient(app)
    res = client.post(
        "/api/editor/init",
        json={"manifest": {"beats": [
            {"beatId": "b1", "beatName": "Hook", "template": "story.hook",
             "status": "pending",
             "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
             "scenes": [{"sceneId": "s1", "conversation": [], "approved": False}]}
        ]}},
    )
    assert res.status_code == 400


def test_editor_turn_proposes_then_commits_in_mock_mode(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    manifest = _approved_two_beat_manifest()

    # Turn 1: agent proposes an edit. No prior conversation.
    r1 = client.post("/api/editor/turn", json={"manifest": manifest})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["kind"] == "propose"
    assert "decisions" in b1
    assert len(b1["suggestedFollowups"]) == 3
    decisions = b1["decisions"]

    # Turn 2: user reply moves the agent through canned proposals.
    r2 = client.post(
        "/api/editor/turn",
        json={
            "manifest": manifest,
            "decisions": decisions,
            "conversation": [{"role": "user", "content": "tighter please"}],
        },
    )
    assert r2.status_code == 200
    assert r2.json()["kind"] == "propose"

    # After enough turns the stub commits.
    r3 = client.post(
        "/api/editor/turn",
        json={
            "manifest": manifest,
            "decisions": decisions,
            "conversation": [
                {"role": "user", "content": "ok"},
                {"role": "user", "content": "ok"},
                {"role": "user", "content": "ok"},
                {"role": "user", "content": "lock it"},
            ],
        },
    )
    assert r3.status_code == 200
    assert r3.json()["kind"] == "commit"
    assert "summary" in r3.json()


def test_editor_apply_bakes_full_transform_chain(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    manifest = _approved_two_beat_manifest()

    # Build a richly populated EditDecisions and ensure every transform shows up.
    decisions = {
        "clips": [
            {"publicId": "dog", "durationSeconds": 5, "trimEnd": 4.5,
             "colorGrade": "e_brightness:-5,e_contrast:8,e_saturation:0",
             "caption": "Hook"},
            {"publicId": "elephants", "durationSeconds": 8, "transitionMs": 360,
             "colorGrade": "e_brightness:-15,e_contrast:10,e_saturation:-12",
             "caption": "Exposition"},
        ],
        "audio": {"publicId": "audio/track", "volume": -20, "fadeInMs": 800, "fadeOutMs": 1200},
        "duckOriginalAudioDb": -12,
        "watermarkPublicId": "sceneos-mark",
        "look": "cool-modern",
        "captionPosition": "south",
    }
    res = client.post("/api/editor/apply", json={"manifest": manifest, "decisions": decisions})
    assert res.status_code == 200
    body = res.json()
    url = body["finalUrl"]
    assert url.startswith("https://res.cloudinary.com/")
    # Every transform we asked for appears in the URL — no server-side render path.
    assert "fl_splice" in url
    assert "e_fade:360" in url        # transition into exposition
    assert "eo_4.5" in url            # trim on the hook
    assert "e_volume:-12" in url      # ducking
    assert "l_audio:" in url          # music overlay
    assert "l_text:" in url           # caption layer
    assert "l_sceneos-mark" in url    # watermark
    assert "e_blue:10" in url         # cool-modern look component
    assert body["durationSeconds"] == 12.5
