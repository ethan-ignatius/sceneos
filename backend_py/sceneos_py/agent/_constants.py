"""Tunables shared across the agent package."""
from __future__ import annotations


# Default suggested clip duration when the agent doesn't infer one from
# the beat archetype. In seconds.
TARGET_CLIP_SECONDS = 5

# Gemini 2.5 thinking budgets. The demo budget is intentionally smaller
# so each user-facing turn lands fast on stage; normal mode gives the
# model room to actually reason about cross-beat continuity.
THINKING_BUDGET_NORMAL = 2048
THINKING_BUDGET_DEMO = 512

# Hard ceiling per beat in demo mode. The system prompt encodes a 1-2
# question soft target, but this cap is what the model actually sees
# ("never exceed N"). The live agent would happily ask 7 in normal mode;
# DEMO_MAX_QUESTIONS protects the on-stage timer.
DEMO_MAX_QUESTIONS = 2
