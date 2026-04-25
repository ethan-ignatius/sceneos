from __future__ import annotations

import asyncio

from sceneos_py.agent import run_agent_turn
from sceneos_py.sufficiency import score

from .fixtures import request_with_turns


def _run(req: dict) -> dict:
    return asyncio.run(run_agent_turn(req))


def test_sparse_node_asks_question(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_USE_VERTEX", "false")
    response = _run(request_with_turns([], "An astronaut is alone."))
    assert response["kind"] == "question"
    assert response["question"]


def test_one_answer_cannot_mark_sufficient(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_USE_VERTEX", "false")
    turns = [
        {
            "role": "user",
            "content": "A lone astronaut walks across a frozen Europa plain in a wide 24mm shot, blue ice glow, eerie hopeful mood.",
        }
    ]
    response = _run(request_with_turns(turns))
    assert response["kind"] == "question"


def test_complete_node_marks_sufficient(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_USE_VERTEX", "false")
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
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_USE_VERTEX", "false")
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
