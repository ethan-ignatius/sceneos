"""Question repair: catch the most blatant Gemini failure modes.

The old aggressive keyword matcher (was rewriting any question
containing "where" / "is this" / "happen somewhere") was forcing
mechanical-feeling rewrites on perfectly natural questions. The new
repair fires only on:
  1. Exact duplicate of the immediately prior agent question (a real
     low-temperature Gemini failure mode).
  2. Question that explicitly contradicts the user's just-stated setting
     ("still on Europa?" after the user said Mars).

Anything else trusts the LLM's question — the system prompt does the
heavy lifting on quality.
"""
from __future__ import annotations

from ..sufficiency import score
from .stub import _missing_facet_question


def _repair_question_if_redundant(result: dict, beat: dict, conversation: list[dict]) -> dict:
    if result.get("kind") != "question":
        return result
    question = (result.get("question") or "").strip().lower()
    if not question:
        return result

    prior_agent_question = ""
    for turn in reversed(conversation):
        if turn.get("role") == "agent":
            prior_agent_question = str(turn.get("content") or "").strip().lower()
            break

    def _normalize(s: str) -> str:
        return " ".join(s.rstrip(".?!").split())

    is_exact_duplicate = (
        prior_agent_question
        and _normalize(question) == _normalize(prior_agent_question)
    )

    report = score(conversation)
    setting_covered = "setting" in report.covered
    contradicts_user_setting = (
        setting_covered
        and any(phrase in question for phrase in ("still on ", "part of ", "is this still"))
    )

    if not (is_exact_duplicate or contradicts_user_setting):
        return result

    repaired_question, suggestions, target = _missing_facet_question(beat, conversation, 0)
    reason = "exact duplicate" if is_exact_duplicate else "contradicts user-stated setting"
    return {
        **result,
        "question": repaired_question,
        "suggestedAnswers": suggestions,
        "openEnded": False,
        "reasoning": f"Repaired ({reason}) → target: {target}.",
        "estimatedRemaining": max(0, int(result.get("estimatedRemaining", 1))),
    }
