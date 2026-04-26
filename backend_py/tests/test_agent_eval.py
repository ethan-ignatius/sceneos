from __future__ import annotations

import asyncio

from sceneos_py.agent import run_agent_turn
from sceneos_py.sufficiency import score

from .fixtures import request_with_turns


def _run(req: dict) -> dict:
    return asyncio.run(run_agent_turn(req))


def _disable_llm(monkeypatch):
    """Strip any LLM credentials so run_agent_turn falls back to the deterministic stub."""
    monkeypatch.setenv("MOCK_MODE", "true")
    for key in ("ANTHROPIC_API_KEY", "GOOGLE_PROJECT_ID", "GCP_PROJECT_ID", "GOOGLE_APPLICATION_CREDENTIALS"):
        monkeypatch.delenv(key, raising=False)


def test_sparse_node_asks_question(monkeypatch):
    _disable_llm(monkeypatch)
    response = _run(request_with_turns([], "An astronaut is alone."))
    assert response["kind"] == "question"
    assert response["question"]


def test_one_answer_cannot_mark_sufficient(monkeypatch):
    _disable_llm(monkeypatch)
    turns = [
        {
            "role": "user",
            "content": "A lone astronaut walks across a frozen Europa plain in a wide 24mm shot, blue ice glow, eerie hopeful mood.",
        }
    ]
    response = _run(request_with_turns(turns))
    assert response["kind"] == "question"


def test_fallback_does_not_ask_redundant_location_question(monkeypatch):
    _disable_llm(monkeypatch)
    turns = [
        {
            "role": "agent",
            "content": "Tell me what is happening in this part of the story. Who is on screen and what are they doing?",
        },
        {
            "role": "user",
            "content": "The astronaut runs around the desert",
        },
    ]

    response = _run(request_with_turns(turns))

    assert response["kind"] == "question"
    assert "where" not in response["question"].lower()
    assert "interior" not in response["question"].lower()
    assert "exterior" not in response["question"].lower()
    assert any(word in response["question"].lower() for word in ("why", "close", "wide", "panic"))


def test_repair_redundant_llm_setting_question():
    from sceneos_py.agent import _repair_question_if_redundant
    from .fixtures import BASE_MANIFEST

    beat = BASE_MANIFEST["beats"][0]
    turns = [
        {
            "role": "user",
            "content": "The astronaut walks through the red sand dunes of Mars.",
        }
    ]
    result = {
        "kind": "question",
        "question": "Are these dunes part of Europa?",
        "reasoning": "bad setting reconciliation",
        "suggestedAnswers": ["yes", "no", "maybe"],
        "estimatedRemaining": 1,
    }

    repaired = _repair_question_if_redundant(result, beat, turns)

    assert "europa" not in repaired["question"].lower()
    assert "where" not in repaired["question"].lower()


def test_complete_node_marks_sufficient(monkeypatch):
    _disable_llm(monkeypatch)
    turns = [
        {
            "role": "user",
            "content": "The subject is a lone astronaut in a cracked white suit on Europa's exterior ice plain.",
        },
        {
            "role": "user",
            "content": "She walks slowly toward a glowing fissure, wide 24mm dolly push, blue cold light, eerie hopeful mood.",
        },
        {
            "role": "user",
            "content": "Tense and intimate framing, handheld breath, the camera holds her face for a beat.",
        },
    ]
    response = _run(request_with_turns(turns))
    assert response["kind"] == "sufficient"
    assert "refinedPrompt" in response
    assert len(response["refinedPrompt"]) > 40
    # New: structured handoff for the deterministic pipeline.
    assert "beatFacts" in response
    facts = response["beatFacts"]
    for required_key in ("subject", "action", "setting", "mood"):
        assert required_key in facts and facts[required_key]


def test_question_includes_three_suggested_answers(monkeypatch):
    _disable_llm(monkeypatch)
    response = _run(request_with_turns([], "An astronaut is alone."))
    assert response["kind"] == "question"
    assert "suggestedAnswers" in response
    suggestions = response["suggestedAnswers"]
    assert len(suggestions) == 3
    # Each suggestion is a non-trivial string (no empty placeholders).
    for s in suggestions:
        assert isinstance(s, str) and len(s) > 5


def test_sufficiency_reports_missing_facets():
    report = score(
        [
            {"role": "user", "content": "A robot stands still."},
        ]
    )
    assert "setting" in report.missing
    assert "framing" in report.missing
    assert not report.sufficient
