"""
Questionnaire agent service — Gemini 2.5 via Vertex AI with thinking + streaming.

Encodes the SceneOS Agent Question Framework: a director-voice LLM that
quietly fills in a 7-beat dramatic structure (hook, exposition, inciting
incident, rising action, climax, falling action, resolution) without ever
revealing the structure to the user.

Per turn, the agent calls exactly one tool:
  - askQuestion(question, reasoning, suggestedAnswers, openEnded?, estimatedRemaining)
  - markSufficient(refinedPrompt, sceneSummary, beatFacts, suggestedDuration)

`beatFacts` is the structured handoff to the downstream deterministic
pipeline (orchestrator.py): subject, action, setting, framing, mood,
characterDescription, locationDescription, voiceLine, captionLine. The
orchestrator reads this — never the raw conversation.

# Package layout (SOLID split from the old single-file agent.py)

  tools.py        — askQuestion + markSufficient schemas (Gemini-only)
  context.py      — conversation collection + cross-beat memory blocks
  prompt.py       — system prompt composition (huge string, mode-aware)
  stub.py         — no-LLM fallback (deterministic question bank)
  normalizer.py   — tool-call → AgentResponse shape
  repair.py       — redundancy / contradiction repair
  messages.py     — Gemini message + config builder
  gemini.py       — Vertex Gemini dispatch (non-streaming + streaming)
  _constants.py   — TARGET_CLIP_SECONDS, THINKING_BUDGET_*, DEMO_MAX_QUESTIONS

Vertex Gemini is the only LLM SceneOS uses; Anthropic was removed.

# Public surface (back-compat)

External callers import from `sceneos_py.agent`:

  from sceneos_py.agent import run_agent_turn, run_agent_turn_streaming

Tests also import the repair helper:

  from sceneos_py.agent import _repair_question_if_redundant

This __init__ re-exports those names so existing imports keep working.
The module-level constants are also re-exported so `sceneos_py.agent.MAX_QUESTIONS`
etc. still resolve.

Stop conditions are SOFT — the model decides via the system prompt. No
Python-side _forced_followup or hard turn-count gating in the live path.
The stub fallback uses MIN_USER_TURNS as a floor since it cannot reason.
"""
from __future__ import annotations

# Constants — re-exported for back-compat with any code that read them
# off the old monolithic agent.py.
from ._constants import (
    DEMO_MAX_QUESTIONS,
    TARGET_CLIP_SECONDS,
    THINKING_BUDGET_DEMO,
    THINKING_BUDGET_NORMAL,
)

# Public entry points.
from .gemini import run_agent_turn, run_agent_turn_streaming

# Test seam: tests import _repair_question_if_redundant from this module.
from .repair import _repair_question_if_redundant

# Internal helpers occasionally referenced from tests / siblings. Keeping
# them re-exported avoids breaking the existing import surface even when
# they look private.
from .normalizer import _normalize_args, _normalize_call_to_result
from .stub import _stub_agent_turn, _missing_facet_question


__all__ = [
    # Public
    "run_agent_turn",
    "run_agent_turn_streaming",
    # Constants
    "DEMO_MAX_QUESTIONS",
    "TARGET_CLIP_SECONDS",
    "THINKING_BUDGET_DEMO",
    "THINKING_BUDGET_NORMAL",
    # Test seams (private but stable)
    "_repair_question_if_redundant",
    "_normalize_args",
    "_normalize_call_to_result",
    "_stub_agent_turn",
    "_missing_facet_question",
]
