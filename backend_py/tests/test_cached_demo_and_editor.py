"""Cached demo route + editor extras.

These tests pin the surfaces the mock_frontend relies on for its visual
end-to-end demo:

  * GET /api/cached/lighthouse returns a stable, fully-baked payload with
    the expected shape (durationSeconds > 0, all 7 beats, valid finalUrl,
    cloudName the assets actually live on).
  * POST /api/editor/apply with cloudName override produces a URL on that
    specific cloud — used by the baked path so the agent's counter-edit
    points at the same cloud the source clips live on.
  * The editor's caption layer uses a Cloudinary built-in font (Arial),
    not a custom font that would 400 the URL.
  * audio.audio_publicid_exists handles missing creds and bad IDs without
    raising.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from sceneos_py import audio
from sceneos_py.app import app
from sceneos_py.cloudinary import _caption_overlay, build_editor_url
from sceneos_py.editor import apply_edit_decisions


def test_cached_lighthouse_route_shape(monkeypatch):
    """The route is the on-stage safety net + the visual proof button.
    It must work in mock mode (no creds, no network) and report a stable
    shape the frontend can render without branching."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    res = client.get("/api/cached/lighthouse")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["demoId"] == "lighthouse-ship"
    assert body["finalUrl"].startswith("https://res.cloudinary.com/")
    assert body["durationSeconds"] > 0
    assert body["cloudName"] == "dghelx0al"
    assert isinstance(body["beats"], list) and len(body["beats"]) == 7
    # Every beat carries the surface the frontend draws and the editor
    # can stitch a manifest from.
    for b in body["beats"]:
        assert b["beatName"]
        assert b["template"].startswith("story.")
        assert b["publicId"]
        assert b["clipUrl"].startswith("https://res.cloudinary.com/")
        assert b["durationSeconds"] > 0
    bake = body["bake"]
    assert bake["videoModel"] == "veo-3.0-generate-001"
    assert bake["musicModel"] == "lyria-002"
    assert bake["nativeAudio"] is True
    assert bake["captions"] is True
    # Static stitch URL contains every beat's publicId — proves the cut
    # actually splices all 7, not just plays the first.
    for b in body["beats"][1:]:
        # `fl_splice` overlay refs use `:` separators on the layer side.
        layer_id = b["publicId"].replace("/", ":")
        assert layer_id in body["finalUrl"]


def test_editor_apply_honors_cloud_name_override(monkeypatch):
    """An explicit cloudName must show up in the resulting URL — needed
    when applying counter-edits to the baked demo (whose assets live on
    a fixed cloud independent of the backend's default)."""
    monkeypatch.setenv("MOCK_MODE", "true")
    client = TestClient(app)
    manifest = {
        "projectId": "lh",
        "videoType": "story",
        "masterPrompt": "x",
        "beats": [
            {
                "beatId": "b1", "beatName": "Hook", "template": "story.hook",
                "status": "approved",
                "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 6, "directorNotes": ""},
                "scenes": [{"sceneId": "s1", "conversation": [], "approved": True, "clipPublicId": "sceneos/8dbb956c76a7/beat-1/beat-1-scene-1", "durationSeconds": 6}],
            },
            {
                "beatId": "b2", "beatName": "Exposition", "template": "story.exposition",
                "status": "approved",
                "archetype": {"intent": "x", "mood": "wide-establish", "suggestedDuration": 6, "directorNotes": ""},
                "scenes": [{"sceneId": "s2", "conversation": [], "approved": True, "clipPublicId": "sceneos/8dbb956c76a7/beat-2/beat-2-scene-1", "durationSeconds": 6}],
            },
        ],
    }
    decisions = {
        "clips": [
            {"publicId": "sceneos/8dbb956c76a7/beat-1/beat-1-scene-1", "durationSeconds": 6, "trimEnd": 5.5, "caption": "Cape Disappointment"},
            {"publicId": "sceneos/8dbb956c76a7/beat-2/beat-2-scene-1", "durationSeconds": 6, "transitionMs": 360, "caption": "Forty years"},
        ],
        "look": "warm-archive",
    }
    # Explicit override — URL must point at the override cloud, not whatever
    # CLOUDINARY_CLOUD_NAME the backend was booted with. We assert the
    # presence of the override in the URL host, not the difference between
    # default and override (the default depends on whatever .env may have
    # been loaded at module import time).
    res = client.post(
        "/api/editor/apply",
        json={"manifest": manifest, "decisions": decisions, "cloudName": "an-explicit-override"},
    )
    assert res.status_code == 200
    url = res.json()["finalUrl"]
    assert url.startswith("https://res.cloudinary.com/an-explicit-override/video/upload/")


def test_editor_caption_uses_arial_not_custom_font():
    """Inter / Helvetica Neue / etc are NOT in Cloudinary's built-in font
    catalog — using them produces a 400 from the CDN. The editor must use
    Arial (or another built-in) so URLs render without a TTF upload."""
    seg = _caption_overlay("Cape Disappointment", 0.0, 5.0)
    assert seg.startswith("l_text:Arial_")
    assert "Inter_" not in seg
    assert "co_rgb:F4F1E8" in seg          # warm cream off-white
    assert "e_outline:" in seg              # legibility stroke


def test_editor_apply_preserves_manifest_caption_position(monkeypatch):
    """captionPosition flows from decisions into the URL — the editor
    agent can move captions to top via this key."""
    monkeypatch.setenv("MOCK_MODE", "true")
    manifest = {
        "projectId": "p",
        "videoType": "story",
        "masterPrompt": "x",
        "beats": [{
            "beatId": "b1", "beatName": "Hook", "template": "story.hook",
            "status": "approved",
            "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 5, "directorNotes": ""},
            "scenes": [{"sceneId": "s1", "conversation": [], "approved": True, "clipPublicId": "alpha", "durationSeconds": 5}],
        }],
    }
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 5, "caption": "Hello"}], "captionPosition": "north"},
    )
    assert ",g_north," in res["finalUrl"]


async def _exists(public_id: str) -> bool:
    return await audio.audio_publicid_exists(public_id, timeout_seconds=2.0)


def test_audio_publicid_exists_handles_empty_input():
    """Empty publicId → False. Never raises. Used by the stitch path to
    drop a phantom l_audio overlay before Cloudinary refuses the URL."""
    import asyncio
    assert asyncio.run(_exists("")) is False
    assert asyncio.run(_exists(None)) is False  # type: ignore[arg-type]


def test_audio_publicid_exists_no_cloud_short_circuits(monkeypatch):
    """No CLOUDINARY_CLOUD_NAME means we can't probe — return True so we
    don't drop a publicId that might be valid against a cloud the env
    just isn't aware of."""
    import asyncio
    monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)
    assert asyncio.run(_exists("sceneos/audio/anything")) is True


def test_build_editor_url_with_explicit_cloud():
    """The cloud_name argument flows directly into the URL host."""
    decisions = {
        "clips": [
            {"publicId": "x", "durationSeconds": 5},
            {"publicId": "y", "durationSeconds": 5},
        ],
    }
    url = build_editor_url(decisions, cloud_name="my-cloud")
    assert url and url.startswith("https://res.cloudinary.com/my-cloud/video/upload/")
    assert "l_video:y" in url
    assert "fl_splice" in url
    assert url.endswith("/x.mp4")


# ── Adversarial tests — things that can and will break during a demo ──────


def _baseline_one_beat_manifest():
    return {
        "projectId": "p",
        "videoType": "story",
        "masterPrompt": "x",
        "beats": [{
            "beatId": "b1", "beatName": "Hook", "template": "story.hook",
            "status": "approved",
            "archetype": {"intent": "x", "mood": "intimate-hook", "suggestedDuration": 6, "directorNotes": ""},
            "scenes": [{"sceneId": "s1", "conversation": [], "approved": True, "clipPublicId": "alpha", "durationSeconds": 6}],
        }],
    }


def test_editor_drops_hostile_color_grade_injection():
    """If the LLM hallucinates an effect-name injection or a value with URL
    separators, the editor must drop it rather than splice it into the
    delivery URL (which would 400 the asset)."""
    manifest = _baseline_one_beat_manifest()
    res = apply_edit_decisions(
        manifest,
        {
            "clips": [{
                "publicId": "alpha",
                "durationSeconds": 6,
                # Real effect mixed with an injection attempt.
                "colorGrade": "e_brightness:5,e_destroy_world:9999,e_brightness:5/fl_attachment:bad",
            }],
        },
    )
    grade = res["decisions"]["clips"][0]["colorGrade"]
    assert grade == "e_brightness:5"  # only the safe effect survives
    assert "/" not in res["finalUrl"].split("/upload/")[1].split("alpha.mp4")[0].split("/")[-1]


def test_editor_clamps_absurd_transition_ms():
    """The agent occasionally hallucinates wild numeric values. A 3-minute
    cross-fade is nonsense and Cloudinary's URL parser doesn't bound it for
    us, so we clamp at apply time."""
    manifest = _baseline_one_beat_manifest()
    manifest["beats"].append({
        "beatId": "b2", "beatName": "Exposition", "template": "story.exposition",
        "status": "approved",
        "archetype": {"intent": "x", "mood": "wide-establish", "suggestedDuration": 6, "directorNotes": ""},
        "scenes": [{"sceneId": "s2", "conversation": [], "approved": True, "clipPublicId": "beta", "durationSeconds": 6}],
    })
    res = apply_edit_decisions(
        manifest,
        {"clips": [
            {"publicId": "alpha", "durationSeconds": 6},
            {"publicId": "beta", "durationSeconds": 6, "transitionMs": 999_999},
        ]},
    )
    assert res["decisions"]["clips"][1]["transitionMs"] == 2400  # MAX_TRANSITION_MS


def test_editor_bounds_oversized_caption():
    """A 5000-char caption would silently break Cloudinary's l_text parser.
    The editor must trim before sending to URL build."""
    long_caption = "x" * 5000
    manifest = _baseline_one_beat_manifest()
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 6, "caption": long_caption}]},
    )
    cap = res["decisions"]["clips"][0]["caption"]
    assert 0 < len(cap) <= 120


def test_editor_falls_back_to_neutral_for_unknown_look():
    """If Gemini invents a look like 'cinematic-neon-darkmode', the URL
    builder would treat it as no-op anyway, but normalize early so the UI
    doesn't show a fake state."""
    manifest = _baseline_one_beat_manifest()
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 6}], "look": "cinematic-neon-darkmode"},
    )
    assert res["decisions"]["look"] == "neutral"


def test_editor_caption_strips_control_chars():
    """Captions with newlines or null bytes can't be inlined into the URL
    cleanly — strip them in normalize."""
    manifest = _baseline_one_beat_manifest()
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 6, "caption": "Hello\x00\nWorld\t  there"}]},
    )
    cap = res["decisions"]["clips"][0]["caption"]
    assert "\x00" not in cap and "\n" not in cap
    assert cap == "Hello World there"


def test_editor_clamps_audio_duck_db():
    """A wild duckOriginalAudioDb (e.g. positive 50dB) would shred the audio
    mix. Clamp into a sane band."""
    manifest = _baseline_one_beat_manifest()
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 6}], "duckOriginalAudioDb": 50},
    )
    assert res["decisions"]["duckOriginalAudioDb"] == 0  # clamped to 0 (no positive duck)
    res = apply_edit_decisions(
        manifest,
        {"clips": [{"publicId": "alpha", "durationSeconds": 6}], "duckOriginalAudioDb": -200},
    )
    assert res["decisions"]["duckOriginalAudioDb"] == -60


def test_sanitize_color_grade_drops_bad_inputs():
    """The sanitizer is the gate for everything that flows into the URL."""
    from sceneos_py.cloudinary import sanitize_color_grade
    assert sanitize_color_grade("") == ""
    assert sanitize_color_grade(None) == ""  # type: ignore[arg-type]
    assert sanitize_color_grade("nonsense,evil") == ""
    assert sanitize_color_grade("e_brightness:abc") == ""
    assert sanitize_color_grade("e_brightness:10") == "e_brightness:10"
    assert sanitize_color_grade("e_brightness:9999") == "e_brightness:100"  # clamped
    # Real preset round-trips intact.
    assert sanitize_color_grade("e_brightness:-22,e_contrast:30,e_saturation:-15") \
        == "e_brightness:-22,e_contrast:30,e_saturation:-15"


def test_apply_edit_decisions_raises_on_empty_clips():
    """No clips in decisions = nothing to bake. Better to raise loudly than
    to ship a malformed URL."""
    import pytest
    manifest = _baseline_one_beat_manifest()
    with pytest.raises(ValueError):
        apply_edit_decisions(manifest, {"clips": []})
