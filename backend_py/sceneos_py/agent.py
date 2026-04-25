"""
Questionnaire agent service. Mirror of backend/src/services/agent.ts.

Two Anthropic tools:
  - askQuestion       -> the agent emits the next directorial question
  - markSufficient    -> the agent emits the locked refined prompt
The minimum-question gate (SUFFICIENCY_MIN_QUESTIONS) prevents premature locks.

When no Claude client is available (no ANTHROPIC_API_KEY, no Vertex SA), falls
back to a deterministic stub that walks STUB_QUESTIONS and produces a
template-driven refined prompt.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from .anthropic_client import default_model_for, make_claude_client
from .sufficiency import FACET_HINTS, MAX_QUESTIONS, MIN_USER_TURNS, REQUIRED_FACETS


TARGET_CLIP_SECONDS = 5

_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "name": "askQuestion",
        "description": "Ask one focused directorial question. Re-anchor to the master vision and offer concrete options.",
        "input_schema": {
            "type": "object",
            "required": ["question", "reasoning", "estimatedRemaining"],
            "properties": {
                "question": {"type": "string"},
                "reasoning": {"type": "string"},
                "estimatedRemaining": {"type": "integer", "minimum": 0, "maximum": MAX_QUESTIONS},
            },
        },
    },
    {
        "name": "markSufficient",
        "description": "Call when subject, action, setting, framing, and mood are locked in for this beat.",
        "input_schema": {
            "type": "object",
            "required": ["refinedPrompt", "sceneSummary", "suggestedDuration"],
            "properties": {
                "refinedPrompt": {"type": "string"},
                "sceneSummary": {"type": "string"},
                "suggestedDuration": {"type": "integer", "minimum": 3, "maximum": 10},
            },
        },
    },
]


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else (s[: n - 1].rstrip() + "...")


def _active_scene(beat: dict) -> dict | None:
    scenes = beat.get("scenes") or []
    if not scenes:
        return None
    for scene in reversed(scenes):
        if not scene.get("approved"):
            return scene
    return scenes[-1]


def _collect_conversation(beat: dict, user_message: str | None) -> list[dict]:
    scene = _active_scene(beat) or {"conversation": []}
    history = list(scene.get("conversation") or [])
    if user_message and user_message.strip():
        last = history[-1] if history else None
        if not (last and last.get("role") == "user" and (last.get("content") or "").strip() == user_message.strip()):
            history.append(
                {
                    "role": "user",
                    "content": user_message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
    return history


def _system_prompt(beat: dict, manifest: dict) -> str:
    beat_index = next((i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]), 0)
    earlier = []
    for b in manifest["beats"][:beat_index]:
        scenes = b.get("scenes") or []
        if scenes and scenes[0].get("refinedPrompt"):
            earlier.append(f"- {b['beatName']}: {scenes[0]['refinedPrompt']}")
    earlier_block = "EARLIER BEATS ALREADY LOCKED IN:\n" + "\n".join(earlier) + "\n" if earlier else ""

    facets = "\n".join(f"  - {f}" for f in REQUIRED_FACETS)
    return "\n".join(
        [
            "You are SceneOS, a warm and opinionated cinematographer guiding a non-expert through one beat of their film.",
            "You suggest concrete directorial choices: lens, movement, light, blocking, pace, and color.",
            "",
            f'MASTER VISION: "{manifest["masterPrompt"]}"',
            f"VIDEO TYPE: {manifest['videoType']}",
            f"CURRENT BEAT: {beat['beatName']} ({beat['template']}) - {beat_index + 1} of {len(manifest['beats'])}",
            f"INTENT: {beat['archetype']['intent']}",
            f"MOOD: {beat['archetype']['mood']}",
            f"BEAT BUDGET: {beat['archetype']['suggestedDuration']}s overall; write one {TARGET_CLIP_SECONDS}-second clip.",
            "",
            "FACETS REQUIRED BEFORE markSufficient:",
            facets,
            "",
            earlier_block,
            "If a character was described in an earlier beat, carry those exact descriptors into this beat.",
            "",
            "For askQuestion: ask one focused question, keep it to two short sentences, and offer 2-3 concrete options.",
            "For markSufficient: refinedPrompt must be one paragraph with subject, action, setting, framing/lens, movement, light/color, and mood.",
            "You must call exactly one tool per turn. Never reply in plain text.",
        ]
    )


def _turn_budget_reminder(user_turn_count: int) -> str:
    remaining = max(0, MAX_QUESTIONS - user_turn_count)
    suffix = (
        f"You must askQuestion this turn. Minimum answers before markSufficient: {MIN_USER_TURNS}."
        if user_turn_count < MIN_USER_TURNS
        else "If every facet is locked, prefer markSufficient. Otherwise askQuestion."
    )
    return (
        f"TURN STATE: the user has answered {user_turn_count} time"
        f"{'' if user_turn_count == 1 else 's'} so far. "
        f"Hard cap is {MAX_QUESTIONS}; you have ~{remaining} left.\n{suffix}"
    )


def _has_facet_coverage(conversation: list[dict]) -> bool:
    user_text = " ".join(
        (t.get("content") or "").lower() for t in conversation if t.get("role") == "user"
    )
    if len(user_text) < 40:
        return False
    return all(any(kw in user_text for kw in FACET_HINTS[f]) for f in REQUIRED_FACETS)


def _stub_questions(beat: dict, master: str, idx: int) -> str:
    name = beat["beatName"].lower()
    options = [
        f"We're opening the {name} of \"{_truncate(master, 80)}\": who is in frame? Pick a lone figure mid-action, a crowd reacting, or an object that carries the story.",
        f"For this {name}, what action sells the {beat['archetype']['mood']} mood? Choose a slow turn, a sudden movement, or a held breath.",
        f"Where are we, exactly? Give me one concrete interior or exterior location for the {name}.",
        f"Camera-wise, should this {name} feel intimate with a tight close-up, grand with an anamorphic wide, or kinetic with handheld tracking?",
        f"Last anchor for the {name}: what's the dominant color or light source? Golden hour, neon, candlelight, or overcast daylight all work.",
    ]
    return options[idx % len(options)]


def _stub_agent_turn(beat: dict, master: str, conversation: list[dict], user_turn_count: int) -> dict:
    if user_turn_count >= MIN_USER_TURNS and _has_facet_coverage(conversation):
        last_user = next(
            (t for t in reversed(conversation) if t.get("role") == "user"), None
        )
        flavor = (last_user or {}).get("content", "")[:240] or beat["archetype"]["intent"]
        return {
            "kind": "sufficient",
            "refinedPrompt": " ".join(
                [
                    f"Stub agent (no ANTHROPIC_API_KEY): {TARGET_CLIP_SECONDS}-second {beat['beatName'].lower()} clip for \"{master}\".",
                    beat["archetype"]["intent"],
                    f"Subject and action drawn from the user's last answer: {flavor}.",
                    f"Mood {beat['archetype']['mood']}; cinematic 35mm, shallow depth of field, motivated practical light, {TARGET_CLIP_SECONDS}-second sustained moment.",
                ]
            ),
            "sceneSummary": f"{beat['beatName']}: {_truncate(beat['archetype']['intent'], 100)}",
            "suggestedDuration": TARGET_CLIP_SECONDS,
        }

    return {
        "kind": "question",
        "question": _stub_questions(beat, master, user_turn_count),
        "reasoning": (
            f"Anchoring the {beat['beatName'].lower()} beat back to the master vision "
            f"before locking the {TARGET_CLIP_SECONDS}-second clip."
        ),
        "estimatedRemaining": max(0, MIN_USER_TURNS - user_turn_count - 1),
    }


def _forced_followup(beat: dict) -> str:
    return (
        f"Before I lock in the {beat['beatName'].lower()} clip, "
        f"give me one concrete sensory detail: a sound, a color, or a single object in frame."
    )


async def run_agent_turn(req: dict) -> dict:
    manifest = req["manifest"]
    beat = next((b for b in manifest["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        raise ValueError(f"runAgentTurn: beatId not found in manifest ({req['beatId']})")

    conversation = _collect_conversation(beat, req.get("userMessage"))
    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_claude_client()
    if client is None:
        return _stub_agent_turn(beat, manifest["masterPrompt"], conversation, user_turn_count)

    if conversation:
        messages = [
            {
                "role": "assistant" if t.get("role") == "agent" else "user",
                "content": t.get("content", ""),
            }
            for t in conversation
        ]
    else:
        messages = [{"role": "user", "content": f"Begin the questionnaire for the {beat['beatName']} beat."}]

    system = _system_prompt(beat, manifest) + "\n\n" + _turn_budget_reminder(user_turn_count)

    def _call_sync() -> Any:
        return client.messages.create(
            model=default_model_for("agent"),
            max_tokens=2048,
            system=system,
            tools=_AGENT_TOOLS,
            tool_choice={"type": "any"},
            messages=messages,
        )

    response = await asyncio.to_thread(_call_sync)
    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError(
            f"runAgentTurn: model did not call a tool (stop_reason={getattr(response, 'stop_reason', '?')})"
        )

    if tool_use.name == "askQuestion":
        args = dict(tool_use.input)
        return {
            "kind": "question",
            "question": str(args["question"]),
            "reasoning": str(args["reasoning"]),
            "estimatedRemaining": int(args["estimatedRemaining"]),
        }

    if tool_use.name == "markSufficient":
        if user_turn_count < MIN_USER_TURNS:
            return {
                "kind": "question",
                "question": _forced_followup(beat),
                "reasoning": (
                    f"We've only heard from you {user_turn_count} time"
                    f"{'' if user_turn_count == 1 else 's'}; one more answer locks the vision in."
                ),
                "estimatedRemaining": 1,
            }
        args = dict(tool_use.input)
        return {
            "kind": "sufficient",
            "refinedPrompt": str(args["refinedPrompt"]),
            "sceneSummary": str(args["sceneSummary"]),
            "suggestedDuration": int(args["suggestedDuration"]),
        }

    raise RuntimeError(f"runAgentTurn: unknown tool {tool_use.name}")
