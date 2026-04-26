"""
AI co-director narrator for SceneOS — Gemini script generation + ElevenLabs TTS.

The narrator is a persistent creative partner who lives inside SceneOS and
guides the filmmaker at every stage:

  - prompt_reaction:   reacts to the master prompt right after submission
  - decompose_intro:   introduces the beat structure as the canvas loads
  - beat_intro:        context-aware intro when the user opens a beat
  - beat_locked:       encouragement when the agent marks a beat sufficient
  - beat_complete:     reaction when Veo finishes rendering a clip
  - summary:           full story narration before the editor

All narration is optional — if Gemini or ElevenLabs are unavailable,
callers get None and the app continues without narration.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

import httpx

from .config import env, mock_mode
from .genai_client import default_gemini_model_for, make_genai_client

logger = logging.getLogger(__name__)

# ── The co-director's persona (shared across all moments) ─────────────────

_PERSONA = (
    "You are the co-director of SceneOS — a warm, confident, cinematic voice "
    "who sits beside the filmmaker as their creative partner. You speak in "
    "second person ('you'), present tense. You are never generic. You always "
    "react to THIS specific story, THIS specific beat. You are encouraging "
    "but never sycophantic. You sound like a seasoned film director who is "
    "genuinely excited by what the filmmaker is building.\n\n"
    "Rules for ALL narration:\n"
    "- No preamble, no quotes, no markdown, no meta-commentary.\n"
    "- Do NOT describe UI actions.\n"
    "- Never mention that you are an AI or that this is a tool.\n"
    "- Sound natural when spoken aloud — write for the ear, not the page."
)

# ── Per-moment system prompts ─────────────────────────────────────────────

_MOMENT_PROMPTS: dict[str, str] = {
    "prompt_reaction": (
        f"{_PERSONA}\n\n"
        "The filmmaker just told you their idea — the master prompt. React to it. "
        "Show genuine excitement about what you see in their concept. Hint at the "
        "story possibilities. Make them feel like they've just handed you something "
        "worth making.\n\n"
        "Write EXACTLY 2-3 sentences (~30-40 words). Be specific to THEIR idea."
    ),
    "decompose_intro": (
        f"{_PERSONA}\n\n"
        "You've just broken the filmmaker's idea into beats. Introduce the structure "
        "briefly — mention how many beats there are and name 1-2 of them to show "
        "you're paying attention. Invite them to explore each beat.\n\n"
        "Write EXACTLY 2-3 sentences (~30-45 words)."
    ),
    "beat_intro": (
        f"{_PERSONA}\n\n"
        "The filmmaker just opened a specific beat. Introduce this moment in "
        "their story — what it means, what mood it carries, why it matters to "
        "the film. Be encouraging and specific.\n\n"
        "Write EXACTLY 2-3 sentences (~25-35 words). "
        "Match the emotional register of the beat (intimate = soft, climax = intense)."
    ),
    "beat_locked": (
        f"{_PERSONA}\n\n"
        "The filmmaker just finished directing this beat — the vision is locked in. "
        "Acknowledge their creative choices briefly. Build anticipation for seeing "
        "it come to life.\n\n"
        "Write EXACTLY 1-2 sentences (~15-25 words). Keep it punchy."
    ),
    "beat_complete": (
        f"{_PERSONA}\n\n"
        "The beat just finished rendering — the filmmaker is about to see their "
        "vision realized. React with the energy of watching a first take come "
        "back from the lab.\n\n"
        "Write EXACTLY 1-2 sentences (~15-20 words). Short and impactful."
    ),
    "summary": (
        f"{_PERSONA}\n\n"
        "The filmmaker has finished crafting every beat and is about to see the "
        "assembled film. Write a full narration (~120-180 words, ~50-70 seconds "
        "spoken) that tells the COMPLETE story across all beats, as if you are "
        "reading the voice-over for the finished film. Evocative, emotionally "
        "resonant, building from opening to resolution.\n\n"
        "Flow as one continuous piece of prose — not a list of beats. "
        "Match the tone the filmmaker established. "
        "End on a note that makes them feel proud of what they created."
    ),
}

_MOCK_SCRIPTS: dict[str, str] = {
    "prompt_reaction": (
        "Now that's a concept. I can already see this unfolding — "
        "let me show you what we can build together."
    ),
    "decompose_intro": (
        "I've laid out your story in beats. Each one is a moment "
        "that matters. Let's walk through them together."
    ),
    "beat_intro": (
        "This is where your story takes shape. A moment that sets "
        "everything in motion."
    ),
    "beat_locked": "That's the take. Let's bring it to life.",
    "beat_complete": "There it is. Exactly what this moment needed.",
    "summary": (
        "Every story begins with a single frame. Yours started with an idea — "
        "a feeling you wanted the world to see. Beat by beat, you shaped it into "
        "something real. What began as a whisper is now a film. And it is yours."
    ),
}

# Keep backward compat aliases
_BEAT_SYSTEM = _MOMENT_PROMPTS["beat_intro"]
_SUMMARY_SYSTEM = _MOMENT_PROMPTS["summary"]


def _beat_user_prompt(beat: dict, manifest: dict, continuity_bible: str | None) -> str:
    arch = beat.get("archetype", {})
    scene = (beat.get("scenes") or [{}])[0]
    refined = scene.get("refinedPrompt", "")
    convo_summary = ""
    turns = scene.get("conversation") or []
    user_answers = [t["content"] for t in turns if t.get("role") == "user"]
    if user_answers:
        convo_summary = f"\nThe filmmaker said: {'; '.join(user_answers[:3])}"

    parts = [
        f"MASTER PROMPT: {manifest.get('masterPrompt', '')}",
        f"BEAT: {beat.get('beatName', '')} (#{beat.get('beatId', '')})",
        f"INTENT: {arch.get('intent', '')}",
        f"MOOD: {arch.get('mood', '')}",
    ]
    if refined:
        parts.append(f"REFINED PROMPT: {refined}")
    if continuity_bible:
        parts.append(f"CONTINUITY: {continuity_bible}")
    if convo_summary:
        parts.append(convo_summary)
    return "\n".join(parts)


def _summary_user_prompt(manifest: dict, continuity_bible: str | None) -> str:
    lines = [f"MASTER PROMPT: {manifest.get('masterPrompt', '')}"]
    if continuity_bible:
        lines.append(f"CONTINUITY BIBLE: {continuity_bible}")
    lines.append("\nBEATS:")
    for i, beat in enumerate(manifest.get("beats", [])):
        arch = beat.get("archetype", {})
        scene = (beat.get("scenes") or [{}])[0]
        refined = scene.get("refinedPrompt", "")
        lines.append(
            f"  {i + 1}. {beat.get('beatName', '')} — {arch.get('intent', '')} "
            f"(mood: {arch.get('mood', '')})"
        )
        if refined:
            lines.append(f"     Refined: {refined[:200]}")
    return "\n".join(lines)


async def _gemini_generate(system: str, user: str, max_tokens: int = 300) -> str | None:
    client = make_genai_client()
    if client is None:
        return None
    from google.genai import types
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.7,
        max_output_tokens=max_tokens,
    )

    def _call() -> Any:
        return client.models.generate_content(
            model=default_gemini_model_for("decompose"),
            contents=[{"role": "user", "parts": [{"text": user}]}],
            config=config,
        )

    try:
        response = await asyncio.wait_for(asyncio.to_thread(_call), timeout=15.0)
    except Exception as exc:
        logger.warning("[narration] Gemini call failed: %s", exc)
        return None
    text = getattr(response, "text", None)
    return text.strip() if text else None


def _moment_user_prompt(moment: str, context: dict) -> str:
    """Build the user prompt for any narration moment."""
    manifest = context.get("manifest") or {}
    master = context.get("masterPrompt") or manifest.get("masterPrompt", "")
    beat = context.get("beat")
    continuity = context.get("continuityBible")

    if moment == "prompt_reaction":
        return f"MASTER PROMPT: {master}"

    if moment == "decompose_intro":
        beats = manifest.get("beats") or []
        beat_names = [b.get("beatName", "") for b in beats[:4]]
        return (
            f"MASTER PROMPT: {master}\n"
            f"BEAT COUNT: {len(beats)}\n"
            f"BEAT NAMES: {', '.join(beat_names)}"
        )

    if moment in ("beat_intro", "beat_locked", "beat_complete"):
        if beat:
            return _beat_user_prompt(beat, manifest, continuity)
        return f"MASTER PROMPT: {master}"

    if moment == "summary":
        return _summary_user_prompt(manifest, continuity)

    return f"MASTER PROMPT: {master}"


async def generate_moment_script(moment: str, context: dict) -> str | None:
    """Generate a narration script for any moment type."""
    if moment not in _MOMENT_PROMPTS:
        logger.warning("[narration] unknown moment type: %s", moment)
        return None

    if mock_mode():
        return _MOCK_SCRIPTS.get(moment, "")

    max_tokens = 500 if moment == "summary" else 120
    script = await _gemini_generate(
        _MOMENT_PROMPTS[moment],
        _moment_user_prompt(moment, context),
        max_tokens=max_tokens,
    )
    if script:
        return script
    # Gemini unavailable (billing, quota, network) — fall back to canned
    # scripts so ElevenLabs TTS still has something to speak.
    fallback = _MOCK_SCRIPTS.get(moment)
    if fallback:
        logger.info("[narration] using fallback script for moment=%s", moment)
    return fallback


async def generate_beat_script(
    beat: dict, manifest: dict, continuity_bible: str | None = None
) -> str | None:
    return await generate_moment_script("beat_intro", {
        "beat": beat, "manifest": manifest, "continuityBible": continuity_bible
    })


async def generate_summary_script(
    manifest: dict, continuity_bible: str | None = None
) -> str | None:
    return await generate_moment_script("summary", {
        "manifest": manifest, "continuityBible": continuity_bible
    })


async def synthesize_speech(text: str, voice_id: str | None = None) -> tuple[bytes, float] | None:
    """ElevenLabs TTS. Returns (mp3_bytes, estimated_duration_seconds) or None."""
    api_key = env("ELEVEN_LABS_API_KEY") or env("ELEVENLABS_API_KEY")
    if not api_key:
        logger.info("[narration] no ElevenLabs API key — skipping TTS")
        return None
    voice = voice_id or env("ELEVEN_LABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
                headers={"xi-api-key": api_key, "accept": "audio/mpeg"},
                json={
                    "text": text,
                    "model_id": "eleven_flash_v2_5",
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
                },
            )
            r.raise_for_status()
            audio_bytes = r.content
    except Exception as exc:
        logger.warning("[narration] ElevenLabs synthesis failed: %s", exc)
        return None
    word_count = len(text.split())
    est_duration = max(2.0, word_count / 2.5)
    return audio_bytes, est_duration


async def narrate_beat(
    beat: dict, manifest: dict, continuity_bible: str | None = None
) -> dict | None:
    """Full beat narration pipeline: Gemini script + ElevenLabs TTS.
    Returns { text, audioBase64, durationSeconds } or None."""
    script = await generate_beat_script(beat, manifest, continuity_bible)
    if not script:
        return None
    result = await synthesize_speech(script)
    if not result:
        return {"text": script, "audioBase64": None, "durationSeconds": 0}
    audio_bytes, duration = result
    return {
        "text": script,
        "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
        "durationSeconds": round(duration, 1),
    }


async def narrate_summary(
    manifest: dict, continuity_bible: str | None = None
) -> dict | None:
    """Full summary narration: Gemini script + ElevenLabs TTS + Cloudinary upload.
    Returns { text, audioUrl, publicId, durationSeconds } or None."""
    script = await generate_summary_script(manifest, continuity_bible)
    if not script:
        return None

    from .audio import synthesize_narration
    project_id = manifest.get("projectId", "unknown")
    uploaded = await synthesize_narration(
        project_id=project_id,
        text=script,
    )
    if not uploaded:
        result = await synthesize_speech(script)
        if not result:
            return {"text": script, "audioUrl": None, "publicId": None, "durationSeconds": 0}
        audio_bytes, duration = result
        return {
            "text": script,
            "audioUrl": f"data:audio/mpeg;base64,{base64.b64encode(audio_bytes).decode('ascii')}",
            "publicId": None,
            "durationSeconds": round(duration, 1),
        }

    return {
        "text": script,
        "audioUrl": uploaded.get("url"),
        "publicId": uploaded.get("publicId"),
        "durationSeconds": uploaded.get("durationSeconds", 0),
    }


async def narrate_moment(moment: str, context: dict) -> dict | None:
    """Generalized narration: Gemini script + ElevenLabs TTS for any moment.
    Returns { text, audioBase64, durationSeconds } or None."""
    if moment == "summary":
        return await narrate_summary(
            context.get("manifest", {}),
            context.get("continuityBible"),
        )
    script = await generate_moment_script(moment, context)
    if not script:
        return None
    result = await synthesize_speech(script)
    if not result:
        return {"text": script, "audioBase64": None, "durationSeconds": 0}
    audio_bytes, duration = result
    return {
        "text": script,
        "audioBase64": base64.b64encode(audio_bytes).decode("ascii"),
        "durationSeconds": round(duration, 1),
    }
