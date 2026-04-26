"""Tunables shared across the agent package."""
from __future__ import annotations


# Default suggested clip duration when the agent doesn't infer one from
# the beat archetype. In seconds.
# Default / ceiling for agent `suggestedDuration` when the model omits it.
# 4s snaps to the shortest Veo tier (4/6/8) for lower wall-clock per beat.
TARGET_CLIP_SECONDS = 4

# Gemini 2.5 thinking budgets. The demo budget is intentionally smaller
# so each user-facing turn lands fast on stage; normal mode gives the
# model room to actually reason about cross-beat continuity.
THINKING_BUDGET_NORMAL = 3072
THINKING_BUDGET_DEMO = 512

# Hard ceiling per beat in demo mode. Kept for back-compat; new dispatch
# code should call `max_questions_for_manifest(manifest)` so the cap
# tracks the user's selected video tier.
DEMO_MAX_QUESTIONS = 2

# Per-tier question caps. The user picks a tier on landing
# (Trailer/Short film/Movie); the cap scales with the storytelling room
# the format gives. Trailer is 3 beats × 2 questions = ~6 user turns
# total — the demo timer wants this. Movie has the most room (8 beats)
# and earns more depth.
MAX_QUESTIONS_BY_TIER: dict[str, int] = {
    "short": 2,     # Trailer (3 beats)   — punchy, autonomous-fill on vague
    "trailer": 3,   # Short film (5 beats) — moderate
    "feature": 5,   # Movie (8 beats)      — depth permitted
    "story": 4,     # canonical 7-beat fallback path
}

# Used when manifest.videoType is missing or unrecognized.
DEFAULT_MAX_QUESTIONS = 3


def max_questions_for_manifest(manifest: dict) -> int:
    """Per-tier question cap. Reads `manifest.videoType`; falls back to
    DEFAULT_MAX_QUESTIONS if absent or not in the tier map."""
    video_type = manifest.get("videoType") if isinstance(manifest, dict) else None
    return MAX_QUESTIONS_BY_TIER.get(video_type or "", DEFAULT_MAX_QUESTIONS)
