"""
Multi-keyframe ref selection + movie plan + open-ended question shape.

These guard the user's three core complaints:
  1. "One image of one character is insufficient" — multi-keyframe set with
     framing-aware selection.
  2. "Doesn't remember context from previous nodes" — movie plan stamps
     onto the manifest and the agent context blocks read it.
  3. "Always exactly 3 questions / loaded multiple choice" — askQuestion
     normalizer accepts 0-4 suggestions and infers openEnded.
"""
from __future__ import annotations

import asyncio

import pytest

from sceneos_py.agent import _normalize_call_to_result
from sceneos_py.movie_plan import _parse_movie_plan, _stub_movie_plan
from sceneos_py.orchestrator import _ref_is_real, _pick_keyframe_seed
from sceneos_py.vertex_imagen import (
    KEYFRAME_VARIANTS,
    pick_keyframe_for_framing,
)


# ── Multi-keyframe selection ───────────────────────────────────────────────


def _make_keyframe_set(kind: str, *, variants: list[str] | None = None, degraded: list[str] | None = None) -> list[dict]:
    refs = []
    available = KEYFRAME_VARIANTS[kind]
    chosen = variants or [v for v, _ in available]
    bad = set(degraded or [])
    for variant_id, _ in available:
        if variant_id not in chosen:
            continue
        if variant_id in bad:
            refs.append({
                "imageUrl": None,
                "publicId": None,
                "kind": kind,
                "variant": variant_id,
                "prompt": "[test]",
                "degraded": "test_failure",
            })
        else:
            refs.append({
                "imageUrl": f"https://cdn.example/{kind}-{variant_id}.jpg",
                "publicId": f"test::{kind}-{variant_id}",
                "kind": kind,
                "variant": variant_id,
                "prompt": "[test]",
            })
    return refs


def test_pick_keyframe_close_framing_picks_front():
    refs = _make_keyframe_set("character")
    result = pick_keyframe_for_framing(refs=refs, framing="85mm intimate close-up", mood="tense-climax")
    assert result is not None
    assert result["variant"] == "front"


def test_pick_keyframe_tracking_framing_picks_action():
    refs = _make_keyframe_set("character")
    result = pick_keyframe_for_framing(refs=refs, framing="tracking handheld push", mood="kinetic-rising")
    assert result is not None
    assert result["variant"] == "action"


def test_pick_keyframe_wide_framing_picks_wide_for_location():
    refs = _make_keyframe_set("location")
    result = pick_keyframe_for_framing(refs=refs, framing="wide 24mm establishing", mood="wide-establish")
    assert result is not None
    assert result["variant"] == "wide"


def test_pick_keyframe_skips_degraded():
    """When the preferred variant is degraded, fall back to a healthy sibling."""
    refs = _make_keyframe_set("character", degraded=["front"])
    result = pick_keyframe_for_framing(refs=refs, framing="close intimate", mood="tense-climax")
    assert result is not None
    # 'front' is degraded → mood preference fallback should pick something else.
    assert result.get("variant") != "front"
    assert not result.get("degraded")


def test_pick_keyframe_returns_none_when_all_degraded():
    refs = _make_keyframe_set("character", degraded=["front", "profile", "action"])
    result = pick_keyframe_for_framing(refs=refs, framing="close", mood="tense-climax")
    assert result is None


def test_ref_is_real_rejects_stub():
    stub = {"imageUrl": "https://cdn.example/x.jpg", "stub": True, "publicId": "stub"}
    assert _ref_is_real(stub) is False


def test_ref_is_real_rejects_degraded():
    degraded = {"imageUrl": "https://cdn.example/x.jpg", "degraded": "imagen_no_images", "publicId": "x"}
    assert _ref_is_real(degraded) is False


def test_ref_is_real_accepts_clean_ref():
    clean = {"imageUrl": "https://cdn.example/x.jpg", "publicId": "x"}
    assert _ref_is_real(clean) is True


def test_pick_keyframe_seed_routes_wide_to_location():
    """Wide framing → location ref wins for the seed image."""
    keyframes = {
        "character": _make_keyframe_set("character"),
        "location": _make_keyframe_set("location"),
    }
    char_ref, loc_ref, seed, char_set, loc_set = _pick_keyframe_seed(
        framing="wide 24mm establishing",
        mood="wide-establish",
        project_keyframes=keyframes,
    )
    assert seed is not None
    assert seed == loc_ref["imageUrl"]
    assert len(char_set) == 3
    assert len(loc_set) == 3


def test_pick_keyframe_seed_falls_back_when_keyframes_empty():
    char_ref, loc_ref, seed, char_set, loc_set = _pick_keyframe_seed(
        framing="close",
        mood="intimate-hook",
        project_keyframes={"character": [], "location": []},
    )
    assert seed is None


# ── Movie plan ─────────────────────────────────────────────────────────────


def test_stub_movie_plan_has_required_keys():
    beat_templates = [
        {"template": "story.hook", "beatName": "Hook", "intent": "establish", "mood": "intimate-hook", "suggestedDuration": 5},
        {"template": "story.exposition", "beatName": "Exposition", "intent": "world", "mood": "wide-establish", "suggestedDuration": 8},
    ]
    plan = _stub_movie_plan("a lonely lighthouse keeper sees a ghost ship", "story", beat_templates)
    assert plan["logline"]
    assert plan["protagonistArc"]
    assert plan["visualMotif"]
    assert plan["dramaticQuestion"]
    assert len(plan["beats"]) == 2
    for entry in plan["beats"]:
        assert entry["beatId"]
        assert entry["template"]
        assert entry["beatName"]
        assert entry["synopsis"]
        assert entry["emotionalState"]
        assert entry["visualContinuity"]


def test_parse_movie_plan_strips_codeblock_fence():
    text = '```json\n{"logline":"x","beats":[{"beatId":"beat-1"}]}\n```'
    plan = _parse_movie_plan(text)
    assert plan["logline"] == "x"


def test_parse_movie_plan_rescues_embedded_json():
    text = "Here's the plan: {\"logline\":\"x\",\"beats\":[]} hope it helps!"
    plan = _parse_movie_plan(text)
    assert plan["logline"] == "x"


def test_parse_movie_plan_returns_empty_on_garbage():
    plan = _parse_movie_plan("not json at all")
    assert plan == {}


# ── Open-ended question normalization ─────────────────────────────────────


def _fake_beat() -> dict:
    return {
        "beatId": "beat-1",
        "beatName": "Hook",
        "archetype": {"mood": "intimate-hook"},
    }


def test_zero_suggestions_backfills_to_two():
    """Universal pill row: every question must reach the UI with at least 2
    suggestions. When the model emits zero, the normalizer backfills with
    mood-aware nudges. openEnded stays True so the input remains primary."""
    result = _normalize_call_to_result(
        "askQuestion",
        {"question": "What does she remember about that night?", "reasoning": "rich open prompt", "suggestedAnswers": [], "estimatedRemaining": 1},
        _fake_beat(),
    )
    assert len(result["suggestedAnswers"]) == 2
    assert result["openEnded"] is True


def test_three_suggestions_pass_through():
    """Three suggestions stay as-is; openEnded defaults True (pills are
    invitations, the input is still the primary affordance)."""
    result = _normalize_call_to_result(
        "askQuestion",
        {
            "question": "Q?",
            "reasoning": "r",
            "suggestedAnswers": ["a", "b", "c"],
            "estimatedRemaining": 1,
        },
        _fake_beat(),
    )
    assert result["suggestedAnswers"] == ["a", "b", "c"]
    assert result["openEnded"] is True


def test_explicit_open_ended_true_with_two_suggestions():
    """Mid-count suggestions can still be marked open-ended for UX."""
    result = _normalize_call_to_result(
        "askQuestion",
        {
            "question": "Q?",
            "reasoning": "r",
            "suggestedAnswers": ["nudge a", "nudge b"],
            "openEnded": True,
            "estimatedRemaining": 1,
        },
        _fake_beat(),
    )
    assert len(result["suggestedAnswers"]) == 2
    assert result["openEnded"] is True


def test_duplicate_suggestions_deduped():
    result = _normalize_call_to_result(
        "askQuestion",
        {
            "question": "Q?",
            "reasoning": "r",
            "suggestedAnswers": ["alpha", "ALPHA", "beta", "  alpha  "],
            "estimatedRemaining": 1,
        },
        _fake_beat(),
    )
    assert [s.lower().strip() for s in result["suggestedAnswers"]] == ["alpha", "beta"]


def test_more_than_four_suggestions_capped():
    result = _normalize_call_to_result(
        "askQuestion",
        {
            "question": "Q?",
            "reasoning": "r",
            "suggestedAnswers": ["a", "b", "c", "d", "e", "f"],
            "estimatedRemaining": 1,
        },
        _fake_beat(),
    )
    assert len(result["suggestedAnswers"]) == 4
    assert result["suggestedAnswers"] == ["a", "b", "c", "d"]


def test_no_filler_padding_with_canned_text():
    """The old behavior padded to 3 with 'tell me more in your own words'.
    The user hated that. Backfills must be specific mood-aware nudges
    that imply different movies — never the canned filler."""
    result = _normalize_call_to_result(
        "askQuestion",
        {"question": "Q?", "reasoning": "r", "suggestedAnswers": [], "estimatedRemaining": 1},
        _fake_beat(),
    )
    assert all("tell me more" not in s.lower() for s in result["suggestedAnswers"])
    # Universal-pill rule: at least 2 nudges always reach the UI.
    assert len(result["suggestedAnswers"]) == 2
    # Each backfill must be a real cinematographic option, not placeholder text.
    for s in result["suggestedAnswers"]:
        assert len(s) > 10, f"backfill suggestion too short to be a real nudge: {s!r}"


# ── Cross-beat memory ──────────────────────────────────────────────────────


def test_earlier_beats_block_emits_full_beatfacts():
    """Prior beat with full beatFacts should propagate every key, not 4."""
    from sceneos_py.agent.context import _earlier_beats_block

    manifest = {
        "beats": [
            {
                "beatId": "beat-1",
                "beatName": "Hook",
                "archetype": {"intent": "x", "mood": "intimate-hook"},
                "scenes": [{
                    "sceneId": "s1",
                    "approved": True,
                    "beatFacts": {
                        "subject": "lone keeper",
                        "action": "tends the lamp",
                        "setting": "lighthouse interior at midnight",
                        "framing": "85mm intimate handheld",
                        "mood": "intimate-hook",
                        "characterDescription": "salt-and-pepper beard, yellow slicker, deep-set eyes",
                        "locationDescription": "brass fresnel lens, cast-iron spiral stair",
                        "voiceLine": "Tonight, the light keeps something from coming home.",
                        "captionLine": "Astoria. October 31st.",
                    },
                    "conversation": [
                        {"role": "user", "content": "set on the Oregon coast in 1922"},
                        {"role": "agent", "content": "okay"},
                        {"role": "user", "content": "the keeper is haunted by a missed signal"},
                    ],
                }],
            },
            {
                "beatId": "beat-2",
                "beatName": "Exposition",
                "archetype": {"intent": "y", "mood": "wide-establish"},
                "scenes": [{"sceneId": "s2", "approved": False, "conversation": []}],
            },
        ],
    }
    block = _earlier_beats_block(manifest["beats"][1], manifest)
    assert "salt-and-pepper beard" in block  # characterDescription verbatim
    assert "brass fresnel lens" in block  # locationDescription verbatim
    assert "Astoria. October 31st." in block  # captionLine verbatim
    assert "the keeper is haunted by a missed signal" in block  # user turn full


def test_earlier_beats_block_uses_latest_rich_scene_not_first():
    from sceneos_py.agent.context import _earlier_beats_block

    manifest = {
        "beats": [
            {
                "beatId": "beat-1",
                "beatName": "Hook",
                "archetype": {"intent": "x", "mood": "intimate-hook"},
                "scenes": [
                    {
                        "sceneId": "s1",
                        "approved": True,
                        "conversation": [{"role": "user", "content": "early draft"}],
                    },
                    {
                        "sceneId": "s2",
                        "approved": True,
                        "sceneSummary": "finalized beat after retries",
                        "beatFacts": {
                            "subject": "keeper",
                            "action": "lights the lamp",
                            "setting": "storm tower",
                            "framing": "tight handheld",
                            "mood": "dread",
                            "characterDescription": "scarred keeper in yellow slicker",
                            "locationDescription": "iron stair and brass lens",
                            "voiceLine": "He keeps the dark offshore.",
                            "captionLine": "Night one.",
                        },
                        "conversation": [{"role": "user", "content": "make it stormier and haunted"}],
                    },
                ],
            },
            {
                "beatId": "beat-2",
                "beatName": "Exposition",
                "archetype": {"intent": "y", "mood": "wide-establish"},
                "scenes": [{"sceneId": "s3", "approved": False, "conversation": []}],
            },
        ],
    }
    block = _earlier_beats_block(manifest["beats"][1], manifest)
    assert "scarred keeper in yellow slicker" in block
    assert "Night one." in block
    assert "make it stormier and haunted" in block


def test_movie_plan_block_emitted_when_present():
    from sceneos_py.agent.context import _movie_plan_block
    manifest = {
        "moviePlan": {
            "logline": "A keeper protects the coast from itself.",
            "visualMotif": "sodium-yellow lamp glow on wet stone",
            "dramaticQuestion": "what does the lamp see that he can't?",
        }
    }
    block = _movie_plan_block(manifest)
    assert "logline" in block.lower() or "Logline:" in block
    assert "sodium-yellow lamp glow on wet stone" in block


def test_movie_plan_block_empty_when_absent():
    from sceneos_py.agent.context import _movie_plan_block
    assert _movie_plan_block({}) == ""
