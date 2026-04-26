"""continuity.merge_beat_facts_for_continuity — cross-beat visual lock."""

from sceneos_py.continuity import established_visual_anchors, merge_beat_facts_for_continuity


def _manifest():
    return {
        "projectId": "p1",
        "masterPrompt": "An astronaut lost on a red desert planet",
        "beats": [
            {
                "beatId": "b1",
                "beatName": "Hook",
                "scenes": [
                    {
                        "sceneId": "s1",
                        "beatFacts": {
                            "subject": "a lone astronaut in a scuffed white suit",
                            "setting": "vast red desert under a pale sky",
                            "characterDescription": "Astronaut, white EVA suit, visor, dust on shoulders",
                            "locationDescription": "Mars-like red sand, distant mesas, harsh sun",
                        },
                    }
                ],
            },
            {
                "beatId": "b2",
                "beatName": "Rising",
                "scenes": [{"sceneId": "s2", "beatFacts": {}}],
            },
        ],
    }


def test_established_anchors_takes_earliest_prior():
    m = _manifest()
    a = established_visual_anchors(m, "b2")
    assert a["subject"] == "a lone astronaut in a scuffed white suit"
    assert "red desert" in a["setting"].lower()
    assert "Astronaut" in a["characterDescription"]


def test_merge_overwrites_drift_on_later_beat():
    m = _manifest()
    bad = {
        "subject": "a man in a plaid shirt",
        "setting": "a pine forest at dusk",
        "characterDescription": "middle-aged man, flannel, beard",
        "locationDescription": "wooded trail, fog",
        "action": "discovers a metal shard glinting in the sand",
        "mood": "uneasy",
    }
    merged = merge_beat_facts_for_continuity(m, "b2", bad)
    assert "astronaut" in merged["subject"].lower()
    assert "forest" not in merged["setting"].lower()
    assert "plaid" not in merged["characterDescription"].lower()
    assert merged["action"] == "discovers a metal shard glinting in the sand"
    assert merged["mood"] == "uneasy"


def test_first_beat_no_anchors():
    m = _manifest()
    assert established_visual_anchors(m, "b1") == {}
    out = merge_beat_facts_for_continuity(
        m,
        "b1",
        {"subject": "astronaut", "characterDescription": "suit, helmet"},
    )
    assert out["subject"] == "astronaut"
