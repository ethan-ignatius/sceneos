"""
Questionnaire agent service — Gemini via Vertex AI.

Encodes the SceneOS Agent Question Framework: a director-voice LLM that
quietly fills in a 7-beat dramatic structure (hook, exposition, inciting
incident, rising action, climax, falling action, resolution) without ever
revealing the structure to the user.

Per turn, the agent calls exactly one tool:
  - askQuestion(question, reasoning, suggestedAnswers[3], estimatedRemaining)
  - markSufficient(refinedPrompt, sceneSummary, beatFacts, suggestedDuration)

`beatFacts` is the structured handoff to the downstream deterministic
pipeline (orchestrator.py): subject, action, setting, framing, mood,
characterDescription, locationDescription. The orchestrator reads this —
never the raw conversation.

Falls back to a deterministic stub when no Vertex AI client is available
(no GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from .genai_client import default_gemini_model_for, make_genai_client
from .sufficiency import FACET_HINTS, MAX_QUESTIONS, MIN_USER_TURNS, REQUIRED_FACETS


TARGET_CLIP_SECONDS = 5

# Tool schemas — dict form, accepted by google.genai SDK and converted internally.
_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "name": "askQuestion",
        "description": (
            "Ask one focused question about the most charged, naturally curious thing "
            "in the story so far. Reflect the story back before asking. Provide exactly 3 "
            "suggestedAnswers covering meaningfully different directions — each must imply "
            "a different movie."
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
                    "description": "Exactly 3 first-person-adjacent answer options. Each implies a different movie if chosen. Not minor variations.",
                    "min_items": 3,
                    "max_items": 3,
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
            "pipeline (motion preset → character ref → location ref → video gen). "
            "Must include beatFacts."
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


# ── helpers ─────────────────────────────────────────────────────────────────


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


def _earlier_beats_block(beat: dict, manifest: dict) -> str:
    beat_idx = next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )
    if beat_idx == 0:
        return ""
    lines: list[str] = []
    for b in manifest["beats"][:beat_idx]:
        scenes = b.get("scenes") or []
        scene = scenes[0] if scenes else None
        if not scene:
            continue
        facts = scene.get("beatFacts")
        if facts:
            lines.append(
                f"- {b['beatName']}: subject={facts.get('subject', '?')}; "
                f"action={facts.get('action', '?')}; "
                f"setting={facts.get('setting', '?')}; "
                f"mood={facts.get('mood', '?')}"
            )
        elif scene.get("sceneSummary") or scene.get("refinedPrompt"):
            summary = scene.get("sceneSummary") or scene.get("refinedPrompt", "")
            lines.append(f"- {b['beatName']}: {_truncate(summary, 220)}")
    if not lines:
        return ""
    return "What you have already established (use these details when reflecting the story back):\n" + "\n".join(lines) + "\n"


def _system_prompt(beat: dict, manifest: dict) -> str:
    beat_idx = next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )
    earlier = _earlier_beats_block(beat, manifest)
    archetype = beat["archetype"]

    return f"""You are SceneOS. You work in film. You are talking to someone who is excited about an idea for a movie they want to make.

Your job: ask the most natural-sounding question you can about the most charged unresolved thing in their story. The user thinks they are just telling someone about their movie. They are right to think that.

# Voice
Normal capitalization. Normal punctuation. Normal commas.
No em dashes. No exclamation marks. No "Great choice!", no "Interesting!", no performed enthusiasm.
Warm but not fake. Curious but not performative.
Ask one thing at a time.

# Mapping (DO NOT tell the user any of this)
You are filling in a 7-beat dramatic structure: hook, exposition, inciting incident, rising action, climax, falling action, resolution.
You are working on the {beat['beatName']} beat ({beat_idx + 1} of {len(manifest['beats'])}).
Its narrative role: {archetype['intent']}.
Mood: {archetype['mood']}.
Suggested clip duration: {archetype['suggestedDuration']}s.

The master idea: "{manifest['masterPrompt']}"

{earlier}
NEVER say "for the hook of your story" or "let us establish the inciting incident" or "for the climax."
NEVER reveal the 7-beat structure. The user feels like they are just talking about their movie. Keep it that way.

# How to ask a good question
Every question must:
1. Reflect the story so far back to the user. Prove you were listening. Use details they actually said.
2. Ask the most charged, naturally curious thing about the premise — what anyone would want to know next, not what the structure needs.
3. Be answerable in one sentence by someone who has thought about their idea for five minutes. Never make them invent things they have not thought about.

Bad: "Describe the setting of scene 3."
Bad: "Does he feel bad?"
Bad: "What tone are you going for?"
Good: "Okay so he is pretending to be their son, does he actually start feeling something for them or is he just in too deep to leave?"
Good: "And the family, do they have any idea something is off?"

# Suggested answers — exactly 3 per askQuestion call
Each suggestedAnswer must:
- Cover a meaningfully different direction. Not minor variations.
- Be written first-person-adjacent, plain language, how a person would actually say it.
- Imply a different movie if selected.

Bad set:
  ["He starts to feel guilty", "He feels bad about it", "He has remorse"]   (all the same direction)

Good set:
  ["He genuinely starts to love them, which is the problem",
   "He tells himself it is just the job but it is clearly becoming something more",
   "He doesn't feel anything for them, he is just trapped by circumstances"]
  (each implies a different movie: tragedy, character study, thriller)

# When to stop
- Minimum {MIN_USER_TURNS} user answers before markSufficient.
- Maximum {MAX_QUESTIONS} questions, hard cap. By question {MAX_QUESTIONS} you must call markSufficient.
- Stop earlier than feels comfortable. The user should feel you got what you needed before they get tired.

# beatFacts — what the deterministic pipeline reads
When you call markSufficient, you also emit a structured beatFacts object. The downstream pipeline (motion preset selector, character image generator, location image generator, video generator) reads this — not the raw conversation. Be specific.

beatFacts must contain:
- subject: who or what is in frame for this beat (concrete)
- action: the single action they take
- setting: where this happens, concrete
- framing: lens / camera distance / camera movement (e.g. "85mm intimate close-up, slight handheld")
- mood: emotional register (a word or two)
- characterDescription: appearance, age, costume, identifying details — enough for an image model to render the same person consistently across all 7 beats
- locationDescription: visual details of the setting — enough for an image model to render the location

Carry forward character + world descriptors verbatim from earlier beats so the protagonist looks the same in every frame.

# Tools — call exactly one per turn
- askQuestion(question, reasoning, suggestedAnswers, estimatedRemaining)
- markSufficient(refinedPrompt, sceneSummary, beatFacts, suggestedDuration)

You must call exactly one tool every turn. Never reply in plain text. Never break voice.
"""


def _turn_budget_reminder(user_turn_count: int) -> str:
    remaining = max(0, MAX_QUESTIONS - user_turn_count)
    if user_turn_count < MIN_USER_TURNS:
        suffix = (
            f"You must askQuestion this turn — minimum {MIN_USER_TURNS} user answers "
            f"before markSufficient is allowed."
        )
    elif user_turn_count >= MAX_QUESTIONS:
        suffix = (
            "Hard cap reached. You MUST call markSufficient this turn. "
            "Do your best with what you have."
        )
    else:
        suffix = (
            "If every facet (subject/action/setting/framing/mood/character/location) is locked in, "
            "prefer markSufficient. Otherwise askQuestion."
        )
    return (
        f"TURN STATE: the user has answered {user_turn_count} time"
        f"{'' if user_turn_count == 1 else 's'} so far. "
        f"Hard cap is {MAX_QUESTIONS}; you have ~{remaining} questions left.\n{suffix}"
    )


def _has_facet_coverage(conversation: list[dict]) -> bool:
    user_text = " ".join(
        (t.get("content") or "").lower() for t in conversation if t.get("role") == "user"
    )
    if len(user_text) < 40:
        return False
    return all(any(kw in user_text for kw in FACET_HINTS[f]) for f in REQUIRED_FACETS)


# ── stub fallback (no Vertex client) ────────────────────────────────────────


_STUB_QUESTION_BANK: list[tuple[str, list[str]]] = [
    (
        "Tell me what is happening in this part of the story. Who is on screen and what are they doing?",
        [
            "The main character is alone, doing the thing that defines them",
            "Two characters in conflict, the difference between them is the whole movie",
            "A single object or place tells us the situation without anyone speaking",
        ],
    ),
    (
        "Where does this happen, exactly? Interior or exterior, and what does the place tell us?",
        [
            "Somewhere ordinary that is about to become anything but",
            "A specific charged location that is doing emotional work just by being in frame",
            "An open landscape that dwarfs the character",
        ],
    ),
    (
        "How should the camera see this moment, close and intimate or wide and observed?",
        [
            "Tight close-up so we feel what they feel",
            "Wide and patient so the world dwarfs the moment",
            "Handheld and kinetic so we are inside the chaos with them",
        ],
    ),
    (
        "What is the dominant feeling, what should the audience be carrying when this beat ends?",
        [
            "Tension that has nowhere to go yet",
            "Quiet, contemplative, almost sad",
            "Pure kinetic momentum into whatever comes next",
        ],
    ),
    (
        "And the light, what is the dominant source and what does it say about the moment?",
        [
            "Warm motivated practical light, intimate",
            "Cool overcast daylight, emotionally flat by design",
            "Hard backlight, silhouette, withholding their face",
        ],
    ),
]


def _stub_question_turn(beat: dict, master: str, idx: int) -> dict:
    question, suggestions = _STUB_QUESTION_BANK[idx % len(_STUB_QUESTION_BANK)]
    return {
        "kind": "question",
        "question": question,
        "reasoning": (
            f"Stub agent (no Vertex AI client): walking through the {beat['beatName'].lower()} "
            f"beat for \"{_truncate(master, 80)}\"."
        ),
        "suggestedAnswers": suggestions,
        "estimatedRemaining": max(0, MIN_USER_TURNS - idx - 1),
    }


def _stub_beat_facts(beat: dict, conversation: list[dict]) -> dict:
    user_answers = " ".join(t.get("content", "") for t in conversation if t.get("role") == "user")
    archetype = beat.get("archetype", {})
    return {
        "subject": _truncate(user_answers, 80) or "the protagonist",
        "action": "the action drawn from the user's answers",
        "setting": "the location described by the user",
        "framing": "cinematic, motivated camera",
        "mood": archetype.get("mood", "cinematic"),
        "characterDescription": _truncate(user_answers, 200),
        "locationDescription": _truncate(user_answers, 200),
    }


def _stub_sufficient_turn(beat: dict, master: str, conversation: list[dict]) -> dict:
    archetype = beat["archetype"]
    intent = archetype.get("intent", "")
    user_answers = " ".join(t.get("content", "") for t in conversation if t.get("role") == "user")
    return {
        "kind": "sufficient",
        "refinedPrompt": (
            f"Stub agent ({TARGET_CLIP_SECONDS}-second {beat['beatName'].lower()} clip "
            f"for \"{master}\"). {intent} "
            f"User-locked details: {_truncate(user_answers, 240)}. "
            f"Mood {archetype.get('mood', 'cinematic')}; cinematic 35mm, motivated practical light, "
            f"controlled motion, {TARGET_CLIP_SECONDS}-second sustained moment."
        ),
        "sceneSummary": f"{beat['beatName']}: {_truncate(intent, 120)}",
        "suggestedDuration": archetype.get("suggestedDuration", TARGET_CLIP_SECONDS),
        "beatFacts": _stub_beat_facts(beat, conversation),
    }


def _stub_agent_turn(beat: dict, master: str, conversation: list[dict], user_turn_count: int) -> dict:
    if user_turn_count >= MIN_USER_TURNS and (_has_facet_coverage(conversation) or user_turn_count >= MAX_QUESTIONS):
        return _stub_sufficient_turn(beat, master, conversation)
    return _stub_question_turn(beat, master, user_turn_count)


def _forced_followup(beat: dict) -> dict:
    return {
        "kind": "question",
        "question": (
            f"Before I lock this in, give me one concrete sensory detail from this moment. "
            f"A sound, a color, a single object in frame."
        ),
        "reasoning": (
            f"Below the minimum-turn floor for {beat['beatName'].lower()}; one more answer locks it in."
        ),
        "suggestedAnswers": [
            "A specific sound — wind, breath, a distant siren",
            "A specific color or light source — sodium street light, a candle, dawn blue",
            "A specific object in the foreground that does emotional work",
        ],
        "estimatedRemaining": 1,
    }


# ── live agent (Gemini via Vertex AI) ──────────────────────────────────────


def _to_gemini_contents(conversation: list[dict], opening_master_prompt: str) -> list[dict]:
    """Anthropic-style 'agent'/'user' turns → Gemini 'model'/'user' contents."""
    if not conversation:
        return [
            {
                "role": "user",
                "parts": [{
                    "text": (
                        f"My idea: {opening_master_prompt}. "
                        f"Ask me your first question about this part of the story."
                    )
                }],
            }
        ]
    contents: list[dict] = []
    for t in conversation:
        role = "model" if t.get("role") == "agent" else "user"
        text = t.get("content", "") or ""
        contents.append({"role": role, "parts": [{"text": text}]})
    return contents


def _normalize_args(value: Any) -> Any:
    """Recursively turn google.genai's MapComposite/RepeatedComposite into plain dicts/lists."""
    if isinstance(value, dict):
        return {k: _normalize_args(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_args(v) for v in value]
    # MapComposite / RepeatedComposite expose iter; coerce via dict()/list().
    try:
        from collections.abc import Mapping, Sequence
        if isinstance(value, Mapping):
            return {k: _normalize_args(v) for k, v in value.items()}
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            return [_normalize_args(v) for v in value]
    except Exception:
        pass
    return value


async def run_agent_turn(req: dict) -> dict:
    manifest = req["manifest"]
    beat = next((b for b in manifest["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        raise ValueError(f"runAgentTurn: beatId not found in manifest ({req['beatId']})")

    conversation = _collect_conversation(beat, req.get("userMessage"))
    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_genai_client()
    if client is None:
        return _stub_agent_turn(beat, manifest["masterPrompt"], conversation, user_turn_count)

    from google.genai import types

    system = _system_prompt(beat, manifest) + "\n\n" + _turn_budget_reminder(user_turn_count)
    contents = _to_gemini_contents(conversation, manifest["masterPrompt"])

    tool = types.Tool(function_declarations=_AGENT_TOOLS)
    config = types.GenerateContentConfig(
        system_instruction=system,
        tools=[tool],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.ANY,
                allowed_function_names=["askQuestion", "markSufficient"],
            )
        ),
        temperature=0.7,
        max_output_tokens=2048,
    )

    def _call_sync() -> Any:
        return client.models.generate_content(
            model=default_gemini_model_for("agent"),
            contents=contents,
            config=config,
        )

    response = await asyncio.to_thread(_call_sync)

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        raise RuntimeError(f"runAgentTurn: Gemini returned no candidates ({response!r})")
    parts = getattr(candidates[0].content, "parts", None) or []
    function_call = next((getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)), None)
    if function_call is None:
        finish_reason = getattr(candidates[0], "finish_reason", "?")
        raise RuntimeError(f"runAgentTurn: Gemini did not call a tool (finish_reason={finish_reason})")

    name = function_call.name
    args = _normalize_args(function_call.args)

    if name == "askQuestion":
        suggestions = list(args.get("suggestedAnswers") or [])
        while len(suggestions) < 3:
            suggestions.append("Tell me more in your own words.")
        suggestions = [str(s) for s in suggestions[:3]]
        return {
            "kind": "question",
            "question": str(args.get("question", "")),
            "reasoning": str(args.get("reasoning", "")),
            "suggestedAnswers": suggestions,
            "estimatedRemaining": int(args.get("estimatedRemaining", 1)),
        }

    if name == "markSufficient":
        if user_turn_count < MIN_USER_TURNS:
            return _forced_followup(beat)
        beat_facts = dict(args.get("beatFacts") or {})
        beat_facts.setdefault("subject", "the protagonist")
        beat_facts.setdefault("action", "the action of this beat")
        beat_facts.setdefault("setting", "the established location")
        beat_facts.setdefault("mood", beat["archetype"]["mood"])
        return {
            "kind": "sufficient",
            "refinedPrompt": str(args.get("refinedPrompt", "")),
            "sceneSummary": str(args.get("sceneSummary", beat["beatName"])),
            "suggestedDuration": int(args.get("suggestedDuration", TARGET_CLIP_SECONDS)),
            "beatFacts": beat_facts,
        }

    raise RuntimeError(f"runAgentTurn: unknown tool {name}")
