from __future__ import annotations

from sceneos_py.agent_graph import run_agent_turn
from sceneos_py.sufficiency import score

from .fixtures import request_with_turns


def test_sparse_node_asks_question(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = run_agent_turn(
        request_with_turns(
            [],
            "An astronaut is alone.",
        )
    )
    assert response["kind"] == "question"
    assert response["question"]


def test_one_answer_cannot_mark_sufficient(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    turns = [
        {
            "role": "user",
            "content": "A lone astronaut walks across a frozen Europa plain in a wide 24mm shot, blue ice glow, eerie hopeful mood.",
        }
    ]
    response = run_agent_turn(request_with_turns(turns))
    assert response["kind"] == "question"


def test_complete_node_marks_sufficient(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    turns = [
        {
            "role": "user",
            "content": "The subject is a lone astronaut in a cracked white suit on Europa's exterior ice plain.",
        },
        {
            "role": "user",
            "content": "She walks slowly toward a glowing fissure, wide 24mm dolly push, blue cold light, eerie hopeful mood.",
        },
    ]
    response = run_agent_turn(request_with_turns(turns))
    assert response["kind"] == "sufficient"
    assert "refinedPrompt" in response
    assert len(response["refinedPrompt"]) > 40


def test_sufficiency_reports_missing_facets():
    report = score([
        {"role": "user", "content": "A robot stands still."},
    ])
    assert "setting" in report.missing
    assert "framing" in report.missing
    assert not report.sufficient
