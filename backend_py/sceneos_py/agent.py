"""
Questionnaire agent service — Gemini 2.5 via Vertex AI with thinking + streaming.

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

This module exposes TWO entry points:
  - run_agent_turn(req)            — one-shot dict result. Used by /api/agent.
  - run_agent_turn_streaming(req)  — async iterator of events. Used by
                                     /api/agent/stream. Surfaces Gemini's
                                     thinking tokens live as SSE.

Stop conditions are SOFT — the model decides via the system prompt. No
Python-side _forced_followup or hard turn-count gating in the live path.
The stub fallback still uses MIN_USER_TURNS as a floor since it cannot reason.
"""
from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from .config import mock_mode
from .anthropic_client import make_claude_client
from .genai_client import default_gemini_model_for, make_genai_client
from .sufficiency import FACET_HINTS, MAX_QUESTIONS, MIN_USER_TURNS, REQUIRED_FACETS, score


TARGET_CLIP_SECONDS = 5
THINKING_BUDGET_NORMAL = 2048
THINKING_BUDGET_DEMO = 512  # smaller budget = faster turn-around for the live demo

# Hard ceiling per beat in demo mode. The system prompt encodes a 1-2 question
# soft target, but this cap is what the model actually sees ("never exceed N").
DEMO_MAX_QUESTIONS = 2

# Tool schemas — dict form, accepted by google.genai SDK.
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


def _project_conversation_block(beat: dict, manifest: dict) -> str:
    """Short cross-beat context so each node can remember details from other segments."""
    lines: list[str] = []
    for b in manifest.get("beats") or []:
        if b.get("beatId") == beat.get("beatId"):
            continue
        scenes = b.get("scenes") or []
        scene = scenes[0] if scenes else None
        if not scene:
            continue
        user_turns = [
            str(t.get("content", "")).strip()
            for t in scene.get("conversation", [])
            if t.get("role") == "user" and str(t.get("content", "")).strip()
        ]
        if user_turns:
            lines.append(f"- {b.get('beatName', 'Beat')}: {_truncate(' / '.join(user_turns[-2:]), 180)}")
    if not lines:
        return ""
    return "Relevant details from other segments:\n" + "\n".join(lines) + "\n"


def _mode_of(manifest: dict) -> str:
    """Resolve the session mode from the manifest. Defaults to 'normal' for
    back-compat with manifests that predate the demo/normal split."""
    raw = (manifest.get("mode") or "normal").strip().lower()
    return "demo" if raw == "demo" else "normal"


def _demo_speed_block(beat: dict, manifest: dict) -> str:
    """Speed-mode override appended to the system prompt in demo mode.
    The visuals are pre-curated speculatively; the conversation is theatre.
    Be CONCISE — every second of conversation eats the demo timer."""
    return f"""

# DEMO MODE — LIVE TIMED PRESENTATION
You are inside a 3-4 minute live hackathon demo. Time matters more than texture here.

Hard rules (override any earlier guidance):
- Maximum {DEMO_MAX_QUESTIONS} user answers per beat. After {DEMO_MAX_QUESTIONS} answers, you MUST call markSufficient.
- Prefer 1 question per beat when the user's first answer is at all usable. Mark sufficient.
- Keep questions short — under 18 words. No multi-clause warm-ups.
- Suggested answers stay 3, but make them short (under 12 words each).
- Treat the master prompt "{manifest['masterPrompt']}" as already cinematic. Don't ask the user to invent the world. Build on what's there.
- The downstream visuals are pre-rendering in parallel using a curated story bible. The user's answers shape the FEEL, not the literal visuals — so don't fixate on getting every detail extracted.

When in doubt: mark sufficient and move on.
"""


def _system_prompt(beat: dict, manifest: dict) -> str:
    beat_idx = next(
        (i for i, b in enumerate(manifest["beats"]) if b["beatId"] == beat["beatId"]),
        0,
    )
    earlier = _earlier_beats_block(beat, manifest)
    cross_beat = _project_conversation_block(beat, manifest)
    archetype = beat["archetype"]
    mode = _mode_of(manifest)

    base = f"""You are SceneOS. You work in film. You are talking to someone who is excited about an idea for a movie they want to make.

Your job: ask the most natural-sounding question you can about the most charged unresolved thing in their story. The user thinks they are just telling someone about their movie. They are right to think that.

# Voice
Normal capitalization. Normal punctuation. Normal commas.
No em dashes. No exclamation marks. No "Great choice!", no "Interesting!", no performed enthusiasm.
Warm but not fake. Curious but not performative.
Ask one thing at a time.
Keep the user-facing question under 18 words whenever possible.
Do not start with "Okay, so" or "Great". Use a short grounded echo only when it helps.

# Mapping (DO NOT tell the user any of this)
You are filling in a 7-beat dramatic structure: hook, exposition, inciting incident, rising action, climax, falling action, resolution.
You are working on the {beat['beatName']} beat ({beat_idx + 1} of {len(manifest['beats'])}).
Its narrative role: {archetype['intent']}.
Mood: {archetype['mood']}.
Suggested clip duration: {archetype['suggestedDuration']}s.

The master idea: "{manifest['masterPrompt']}"

The user has not seen the structure. They think you are just curious. Stay that way.

{earlier}
{cross_beat}
NEVER say "for the hook of your story" or "let us establish the inciting incident" or "for the climax."
NEVER reveal the 7-beat structure. The user feels like they are just talking about their movie. Keep it that way.

# Thinking
Before you respond, think.
- Trace which facets (subject, action, setting, framing, mood, characterDescription, locationDescription) are still unclear or thin.
- Treat ordinary concrete nouns as valid facets. If the user says "desert", setting is covered. If they say "astronaut", subject is covered. If they say "runs", action is covered.
- Never ask for a facet the user just answered. Deepen it instead: stakes, cause, consequence, emotional charge, or what changed.
- The user's latest concrete answer wins over the master idea. If they add a desert to an astronaut story, do not ask "where is this desert?" or "is this still on Europa?" Treat it as the setting and ask why the astronaut is there, what they are running from, or what discovery changed the scene.
- Use the original prompt, this beat's conversation, and relevant details from other segments. Never ignore newly added details.
- If the user answers your exact question, do not ask the same question again. Ask the next causal or consequential thing.
- Identify the most charged, naturally curious unresolved thing about the story so far.
- Draft the question, then critique it: does it reflect the story back? Does it ask the most charged thing? Are the three suggestions meaningfully different (each implying a different movie)?
- Decide whether you have enough to call markSufficient or whether to ask one more question.
Your thinking is shown to the developer in a side panel — be substantive but not endless.

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

# When to stop — YOU decide. There is no target number.
The right number of questions for this beat is whatever the conversation needs. It can be one. It can be seven. It depends entirely on the texture of what the user gives you.

- If the user's first answer already locks the beat (concrete subject, action, setting, mood, identity all readable), call markSufficient. Do not pad. Trust the user.
- If they keep giving you rich specific texture worth digging into, keep going. Their interest > your structure.
- If they get vague or short, narrow your question to the single most important unresolved thing and try once more. If still vague, lock in what you have and move on.
- Hard ceiling: never exceed {MAX_QUESTIONS} questions in a single beat. By then you have everything that matters.

Do NOT pace yourself toward a quota. Do NOT try to hit a number. Each turn ask yourself one question only: "given what they just said, is the next question genuinely interesting, or am I just running through a checklist?" If it is the second one, mark sufficient.

# Anti-patterns — avoid these
- Walking the facets in order (subject → action → setting → framing → mood). The facets are what you EXTRACT, not what you ASK. Ask the most charged thing — the structured object falls out as a byproduct.
- Asking about the camera or framing as a standalone question. People do not think in lenses. Ask about what is happening; lens choice follows from emotion.
- Asking the same shape of question twice in a row ("and how does X feel? ... and how does Y feel?"). Vary the angle each turn.
- Asking the user to invent things they have not thought about ("what does the building look like?" when they never mentioned a building).
- Recapping back the entire story so far. One specific detail to prove you were listening, not a synopsis.

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
- voiceLine: ONE short narration or dialogue line for this beat (8-18 words, ~5 seconds spoken). This is what the audience HEARS over the image. It can be a narrator's voice-over OR a single line of overheard dialogue. Examples:
   - VO: "She had spent eleven years pretending the language was real."
   - Dialogue (overheard): "We've been waiting for you. We just didn't know it was you."
  Make it sound like real cinema — earned, not on-the-nose. Avoid generic narration ("In a world where..."). Required.
- captionLine: optional 5-10 word on-screen phrase (not subtitles — a chapter-card or stylized cue). Examples: "Geneva. The thirty-first session." or "Three days before everything." Optional.

Carry forward character + world descriptors verbatim from earlier beats so the protagonist looks the same in every frame. Keep voiceLine consistent in voice — if beat 1 was first-person VO, every beat should be first-person VO.

# Tools — call exactly one per turn
- askQuestion(question, reasoning, suggestedAnswers, estimatedRemaining)
- markSufficient(refinedPrompt, sceneSummary, beatFacts, suggestedDuration)

You must call exactly one tool every turn. Never reply in plain text. Never break voice.
"""

    if mode == "demo":
        return base + _demo_speed_block(beat, manifest)
    return base


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


def _last_user_answer(conversation: list[dict]) -> str:
    for turn in reversed(conversation):
        if turn.get("role") == "user" and str(turn.get("content", "")).strip():
            return str(turn.get("content", "")).strip()
    return ""


def _missing_facet_question(beat: dict, conversation: list[dict], idx: int) -> tuple[str, list[str], str]:
    """Pick a fallback question from what is actually missing, not turn count.

    This keeps the no-LLM path coherent. If the user says "the astronaut runs
    around the desert", subject/action/setting are already covered, so the
    next question should deepen stakes or feeling instead of asking where.
    """
    report = score(conversation)
    last = _last_user_answer(conversation)
    echo_text = (last[:1].lower() + last[1:]).rstrip(".") if last else ""
    echo = f"So, {echo_text}." if echo_text else ""
    missing_facets = list(report.missing)
    if "framing" in missing_facets and "mood" in missing_facets:
        # A story/stakes question is more natural than asking about lenses.
        missing_facets.remove("mood")
        missing_facets.insert(0, "mood")
    missing = missing_facets[0] if missing_facets else "mood"

    if missing == "subject":
        return (
            "Tell me who is on screen in this moment. Who are we following?",
            [
                "One person alone, carrying the whole scene",
                "Two people whose conflict defines the moment",
                "A place or object tells the story before anyone appears",
            ],
            "subject",
        )
    if missing == "action":
        return (
            f"{echo} What is the main thing they are doing in frame?",
            [
                "They move with purpose toward something specific",
                "They freeze because they have seen something",
                "They are trying to escape before anyone notices",
            ],
            "action",
        )
    if missing == "setting":
        return (
            f"{echo} Where exactly does this happen?",
            [
                "An ordinary place that suddenly feels wrong",
                "A vast exterior landscape that dwarfs them",
                "A tight interior space with no easy way out",
            ],
            "setting",
        )
    if missing == "framing":
        return (
            f"{echo} Are we close enough to feel their panic, or wide enough to see what they are up against?",
            [
                "Close on their body and breath",
                "Wide, with the landscape swallowing them",
                "Tracking beside them, urgent and unstable",
            ],
            "framing",
        )
    if missing == "mood":
        return (
            f"{echo} Why are they doing it, fear, discovery, play, or survival?",
            [
                "They are running from something they barely understand",
                "They are chasing a signal only they can see",
                "They are testing the limits of a strange new world",
            ],
            "mood",
        )

    question, suggestions = _STUB_QUESTION_BANK[idx % len(_STUB_QUESTION_BANK)]
    return question, suggestions, "fallback"


def _stub_question_turn(beat: dict, master: str, conversation: list[dict], idx: int) -> dict:
    question, suggestions, target = _missing_facet_question(beat, conversation, idx)
    return {
        "kind": "question",
        "question": question,
        "reasoning": (
            f"Stub agent (no Vertex AI client): targeting {target} for the {beat['beatName'].lower()} "
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
    return _stub_question_turn(beat, master, conversation, user_turn_count)


# ── live agent: shared helpers ─────────────────────────────────────────────


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


def _to_anthropic_messages(conversation: list[dict], opening_master_prompt: str) -> list[dict]:
    if not conversation:
        return [
            {
                "role": "user",
                "content": (
                    f"My idea: {opening_master_prompt}. "
                    "Ask me your first question about this part of the story."
                ),
            }
        ]
    messages: list[dict] = []
    for turn in conversation:
        role = "assistant" if turn.get("role") == "agent" else "user"
        text = str(turn.get("content", "") or "").strip()
        if text:
            messages.append({"role": role, "content": text})
    return messages or _to_anthropic_messages([], opening_master_prompt)


def _normalize_args(value: Any) -> Any:
    """Recursively turn google.genai's MapComposite/RepeatedComposite into plain dicts/lists."""
    if isinstance(value, dict):
        return {k: _normalize_args(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize_args(v) for v in value]
    try:
        from collections.abc import Mapping, Sequence
        if isinstance(value, Mapping):
            return {k: _normalize_args(v) for k, v in value.items()}
        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            return [_normalize_args(v) for v in value]
    except Exception:
        pass
    return value


def _build_request_config(
    beat: dict,
    manifest: dict,
    with_thinking: bool,
    user_turn_count: int = 0,
):
    """Build (system_prompt, contents, GenerateContentConfig). Mode-aware:
    demo uses a smaller thinking budget for faster turn-around. In demo mode,
    once the user has answered DEMO_MAX_QUESTIONS times we restrict the tool
    surface to markSufficient ONLY — a hard ceiling that protects the demo
    timer even if the model wants to keep asking."""
    from google.genai import types

    system = _system_prompt(beat, manifest)
    mode = _mode_of(manifest)
    must_finalize = mode == "demo" and user_turn_count >= DEMO_MAX_QUESTIONS
    allowed = ["markSufficient"] if must_finalize else ["askQuestion", "markSufficient"]

    # Normal mode runs hotter (1.0) so the question pool genuinely varies
    # across sessions — the user explicitly does not want a deterministic
    # script. Demo mode stays at 0.8 because the timer matters more than
    # variety on stage, and the questions are short anyway.
    temperature = 0.6 if mode == "demo" else 0.75
    config_kwargs: dict[str, Any] = dict(
        system_instruction=system,
        tools=[types.Tool(function_declarations=_AGENT_TOOLS)],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.ANY,
                allowed_function_names=allowed,
            )
        ),
        temperature=temperature,
        max_output_tokens=768 if mode == "demo" else 1024,
    )
    if with_thinking:
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            include_thoughts=True,
            thinking_budget=THINKING_BUDGET_DEMO if mode == "demo" else THINKING_BUDGET_NORMAL,
        )
    return system, types.GenerateContentConfig(**config_kwargs)


def _normalize_call_to_result(name: str, args: dict, beat: dict) -> dict:
    """Convert a raw tool call into the public AgentResponse shape."""
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
        beat_facts = dict(args.get("beatFacts") or {})
        beat_facts.setdefault("subject", "the protagonist")
        beat_facts.setdefault("action", "the action of this beat")
        beat_facts.setdefault("setting", "the established location")
        beat_facts.setdefault("mood", beat["archetype"]["mood"])
        # voiceLine + captionLine pass through whatever the model emitted.
        # Both are optional but strongly preferred — the orchestrator will
        # still ship a clip without them, just silent + un-captioned.
        return {
            "kind": "sufficient",
            "refinedPrompt": str(args.get("refinedPrompt", "")),
            "sceneSummary": str(args.get("sceneSummary", beat["beatName"])),
            "suggestedDuration": int(args.get("suggestedDuration", TARGET_CLIP_SECONDS)),
            "beatFacts": beat_facts,
        }
    raise RuntimeError(f"unknown tool {name}")


def _repair_question_if_redundant(result: dict, beat: dict, conversation: list[dict]) -> dict:
    if result.get("kind") != "question":
        return result
    question = str(result.get("question") or "")
    q = question.lower()
    report = score(conversation)
    setting_covered = "setting" in report.covered
    action_covered = "action" in report.covered

    asks_setting_again = (
        setting_covered
        and any(phrase in q for phrase in ("where", "still on", "part of", "happen somewhere", "is this"))
    )
    repeats_action = action_covered and any(
        phrase in q for phrase in ("what are they doing", "what is the main thing they are doing")
    )
    if not asks_setting_again and not repeats_action:
        return result

    repaired_question, suggestions, target = _missing_facet_question(beat, conversation, 0)
    return {
        **result,
        "question": repaired_question,
        "suggestedAnswers": suggestions,
        "reasoning": f"Repaired redundant {target} question after user already supplied setting/action.",
        "estimatedRemaining": max(0, int(result.get("estimatedRemaining", 1))),
    }


def _claude_agent_model() -> str:
    # Haiku is fast and reliable for the short questionnaire turn. This is a
    # fallback path for Gemini quota / malformed tool-call failures.
    from .config import env

    return env("ANTHROPIC_AGENT_MODEL", "claude-3-5-haiku-latest") or "claude-3-5-haiku-latest"


async def _run_anthropic_agent_turn(
    *,
    beat: dict,
    manifest: dict,
    conversation: list[dict],
) -> dict:
    client = make_claude_client()
    if client is None:
        raise RuntimeError("Anthropic fallback unavailable: ANTHROPIC_API_KEY is not configured.")

    system = _system_prompt(beat, manifest)
    messages = _to_anthropic_messages(conversation, manifest["masterPrompt"])

    def _call_sync() -> Any:
        return client.messages.create(
            model=_claude_agent_model(),
            max_tokens=768,
            temperature=0.65,
            system=system,
            tools=_ANTHROPIC_AGENT_TOOLS,
            tool_choice={"type": "any"},
            messages=messages,
        )

    response = await asyncio.to_thread(_call_sync)
    tool_use = next((b for b in response.content if getattr(b, "type", None) == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError(
            f"Anthropic fallback did not call a tool (stop_reason={getattr(response, 'stop_reason', '?')})"
        )
    return _repair_question_if_redundant(
        _normalize_call_to_result(tool_use.name, _normalize_args(tool_use.input), beat),
        beat,
        conversation,
    )


# ── live agent: non-streaming entry point ──────────────────────────────────


async def run_agent_turn(req: dict) -> dict:
    """One-shot agent turn. Used by /api/agent for backwards compat + tests."""
    manifest = req["manifest"]
    beat = next((b for b in manifest["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        raise ValueError(f"runAgentTurn: beatId not found in manifest ({req['beatId']})")

    conversation = _collect_conversation(beat, req.get("userMessage"))
    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_genai_client()
    if client is None:
        if not mock_mode():
            raise RuntimeError(
                "Vertex Gemini client unavailable in real mode. Install google-genai "
                "and set GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS, or set MOCK_MODE=true."
            )
        return _stub_agent_turn(beat, manifest["masterPrompt"], conversation, user_turn_count)

    _, config = _build_request_config(
        beat, manifest, with_thinking=False, user_turn_count=user_turn_count
    )
    contents = _to_gemini_contents(conversation, manifest["masterPrompt"])

    def _call_sync(temp: float = 0.75) -> Any:
        config_kwargs = dict(config.model_dump(exclude_none=True))
        config_kwargs["temperature"] = temp
        from google.genai import types
        retry_config = types.GenerateContentConfig(**config_kwargs)
        return client.models.generate_content(
            model=default_gemini_model_for("agent"),
            contents=contents,
            config=retry_config,
        )

    try:
        response = await asyncio.to_thread(_call_sync)
    except Exception:
        return await _run_anthropic_agent_turn(
            beat=beat,
            manifest=manifest,
            conversation=conversation,
        )

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return await _run_anthropic_agent_turn(
            beat=beat,
            manifest=manifest,
            conversation=conversation,
        )
    parts = getattr(candidates[0].content, "parts", None) or []
    function_call = next((getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)), None)
    if function_call is None:
        # Gemini occasionally emits MALFORMED_FUNCTION_CALL under load. Retry
        # once colder, then use the Anthropic fallback rather than surfacing a
        # 502 to the user.
        try:
            response = await asyncio.to_thread(lambda: _call_sync(0.25))
            candidates = getattr(response, "candidates", None) or []
            parts = getattr(candidates[0].content, "parts", None) if candidates else []
            function_call = next((getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)), None)
        except Exception:
            function_call = None
        if function_call is None:
            return await _run_anthropic_agent_turn(
                beat=beat,
                manifest=manifest,
                conversation=conversation,
            )

    return _repair_question_if_redundant(
        _normalize_call_to_result(function_call.name, _normalize_args(function_call.args), beat),
        beat,
        conversation,
    )


# ── live agent: streaming entry point ──────────────────────────────────────


async def run_agent_turn_streaming(req: dict) -> AsyncIterator[dict]:
    """
    Streaming agent turn. Yields events:
      {type: "ready"}
      {type: "thought", chunk: "..."}    — incremental thinking text
      {type: "text", chunk: "..."}       — incremental free text (rare; tool_choice=ANY)
      {type: "tool_call", name, args}    — final tool invocation
      {type: "result", ...AgentResponse} — normalized public shape
      {type: "error", message}           — fatal
      {type: "done"}                     — emitted by the route, not here
    """
    yield {"type": "ready"}

    manifest = req["manifest"]
    beat = next((b for b in manifest["beats"] if b["beatId"] == req["beatId"]), None)
    if beat is None:
        yield {"type": "error", "message": f"beatId not found in manifest ({req['beatId']})"}
        return

    conversation = _collect_conversation(beat, req.get("userMessage"))
    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_genai_client()
    if client is None:
        if not mock_mode():
            yield {
                "type": "error",
                "message": (
                    "Vertex Gemini client unavailable in real mode. Install google-genai "
                    "and set GOOGLE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS, or set MOCK_MODE=true."
                ),
            }
            return
        # Stub streaming: synthesize thinking events for the visualizer demo path.
        for chunk in [
            f"[stub mode — no Vertex client] working on the {beat['beatName'].lower()} beat. ",
            f"checking what we know so far: {user_turn_count} user reply(ies). ",
            "tracing facets: subject, action, setting, framing, mood. ",
            "drafting the next question. ",
        ]:
            yield {"type": "thought", "chunk": chunk}
            await asyncio.sleep(0.18)
        result = _stub_agent_turn(beat, manifest["masterPrompt"], conversation, user_turn_count)
        yield {"type": "tool_call", "name": ("markSufficient" if result["kind"] == "sufficient" else "askQuestion"), "args": result}
        yield {"type": "result", **result}
        return

    _, config = _build_request_config(
        beat, manifest, with_thinking=True, user_turn_count=user_turn_count
    )
    contents = _to_gemini_contents(conversation, manifest["masterPrompt"])

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()

    def _producer():
        try:
            stream = client.models.generate_content_stream(
                model=default_gemini_model_for("agent"),
                contents=contents,
                config=config,
            )
            for chunk in stream:
                cands = getattr(chunk, "candidates", None) or []
                if not cands:
                    continue
                content = getattr(cands[0], "content", None)
                parts = getattr(content, "parts", None) if content else None
                if not parts:
                    continue
                for part in parts:
                    fc = getattr(part, "function_call", None)
                    if fc is not None:
                        loop.call_soon_threadsafe(queue.put_nowait, {
                            "kind": "function_call",
                            "name": fc.name,
                            "args": _normalize_args(fc.args),
                        })
                        continue
                    text = getattr(part, "text", None) or ""
                    if not text:
                        continue
                    if getattr(part, "thought", False):
                        loop.call_soon_threadsafe(queue.put_nowait, {"kind": "thought", "chunk": text})
                    else:
                        loop.call_soon_threadsafe(queue.put_nowait, {"kind": "text", "chunk": text})
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, {"kind": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

    threading.Thread(target=_producer, daemon=True).start()

    final_call: dict | None = None
    while True:
        item = await queue.get()
        if item is SENTINEL:
            break
        kind = item["kind"]
        if kind == "thought":
            yield {"type": "thought", "chunk": item["chunk"]}
        elif kind == "text":
            yield {"type": "text", "chunk": item["chunk"]}
        elif kind == "function_call":
            final_call = {"name": item["name"], "args": item["args"]}
            yield {"type": "tool_call", "name": item["name"], "args": item["args"]}
        elif kind == "error":
            yield {"type": "error", "message": item["message"]}
            return

    if final_call is None:
        yield {"type": "error", "message": "Agent stream completed without calling a tool."}
        return

    try:
        result = _normalize_call_to_result(final_call["name"], final_call["args"], beat)
    except Exception as exc:
        yield {"type": "error", "message": f"Failed to normalize tool call: {exc}"}
        return
    yield {"type": "result", **result}
