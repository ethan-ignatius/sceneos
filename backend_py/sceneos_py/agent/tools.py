"""Tool schemas exposed to Gemini + Anthropic.

Suggested answers are NON-DETERMINISTIC in count (0-4 + openEnded flag).
The user explicitly does not want every question to be a forced 3-choice
multiple choice — that constrained the conversation and made it feel
loaded.

Both schemas are kept structurally identical between Gemini (parameters)
and Anthropic (input_schema) shapes so the two SDKs can share normalization.
"""
from __future__ import annotations

from typing import Any


_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "name": "askQuestion",
        "description": (
            "Ask one focused question about the most charged, naturally curious thing "
            "in the story so far. Reflect the story back before asking. Suggested answers "
            "are OPTIONAL nudges (0-4 of them) — emit fewer (or zero with openEnded=true) "
            "when the question genuinely wants the user's invention; emit 3-4 only when "
            "they cover meaningfully different movies. Never use suggestions to constrain "
            "the user's choices."
        ),
        "parameters": {
            "type": "object",
            "required": ["question", "reasoning", "suggestedAnswers", "estimatedRemaining"],
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question for the user. Must reflect the story so far. One thing at a time. No em dashes. No fake enthusiasm.",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Internal note: which facet of the beat this question targets. Useful for debug only.",
                },
                "suggestedAnswers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "0-4 first-person-adjacent answer nudges. Each must imply a different movie if chosen. Use 0 (with openEnded=true) when the question genuinely wants the user's invention. Use 3-4 only when each one is a meaningfully different direction.",
                    "min_items": 0,
                    "max_items": 4,
                },
                "openEnded": {
                    "type": "boolean",
                    "description": "True when the question wants the user's invention more than a pick-one-of-three. UI shows the text input prominently. Default false.",
                },
                "estimatedRemaining": {
                    "type": "integer",
                    "description": "Soft hint to the UI for how many more questions you might ask in this beat.",
                },
            },
        },
    },
    {
        "name": "markSufficient",
        "description": (
            "Call when this beat is fully characterized. Hands off to the deterministic "
            "pipeline. Must include beatFacts."
        ),
        "parameters": {
            "type": "object",
            "required": ["refinedPrompt", "sceneSummary", "beatFacts", "suggestedDuration"],
            "properties": {
                "refinedPrompt": {
                    "type": "string",
                    "description": "Cinematic prompt for this beat — one paragraph: subject, action, setting, framing/lens, motivated light, controlled motion, emotional register.",
                },
                "sceneSummary": {
                    "type": "string",
                    "description": "One-line plot-level summary of what happens in this beat.",
                },
                "beatFacts": {
                    "type": "object",
                    "required": ["subject", "action", "setting", "mood"],
                    "properties": {
                        "subject": {"type": "string", "description": "Who or what is in frame."},
                        "action": {"type": "string", "description": "The single action they take."},
                        "setting": {"type": "string", "description": "Where, concrete."},
                        "framing": {"type": "string", "description": "Lens / distance / camera move."},
                        "mood": {"type": "string", "description": "Emotional register."},
                        "characterDescription": {
                            "type": "string",
                            "description": "Appearance, age, costume, identifying details — enough for an image model to render the same person in any beat.",
                        },
                        "locationDescription": {
                            "type": "string",
                            "description": "Visual details of the setting — enough for an image model to render the location.",
                        },
                        "voiceLine": {
                            "type": "string",
                            "description": "ONE short narration or dialogue line for this beat (8-18 words, ~5 seconds spoken). Voice-over style — what a narrator would say across this image, OR a single line of overheard dialogue. Drives both Veo 3 native lip-sync (when dialogue) and the post-stitch narration track. Optional but strongly recommended.",
                        },
                        "captionLine": {
                            "type": "string",
                            "description": "Optional short on-screen text (5-10 words) — not subtitles, but a single evocative phrase like a chapter card. Often a quote, a date, or a one-line emotional beat.",
                        },
                    },
                },
                "suggestedDuration": {
                    "type": "integer",
                    "description": "Clip length in seconds.",
                },
            },
        },
    },
]


_ANTHROPIC_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "name": tool["name"],
        "description": tool["description"],
        "input_schema": tool["parameters"],
    }
    for tool in _AGENT_TOOLS
]
