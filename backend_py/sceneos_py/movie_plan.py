"""
Movie plan — the holistic story coordinator.

The user's complaint was that each beat was treated as a standalone scene
rather than a coordinated piece of one movie. Beats drifted: characters
looked different, motifs evaporated, the emotional arc didn't compose. The
fix is a single-shot LLM pass at session boot that produces a STORY-LEVEL
plan, which every beat then reads as part of its system prompt.

Shape:

  {
    "logline":            one-sentence dramatic premise
    "protagonistArc":     start state → end state
    "visualMotif":        a recurring visual thread (lighting / object / palette)
                          that every beat must echo — this is what makes
                          7 generated clips feel like one movie
    "toneAndGenre":       e.g. "intimate sci-fi character study, blue/grey palette"
    "dramaticQuestion":   the central unresolved Q the movie answers
    "beats": [
      {
        "beatId":           beat-1, beat-2, ...
        "template":         story.hook, story.exposition, ...
        "beatName":         display name
        "synopsis":         one-line synopsis specific to THIS movie (not the generic archetype intent)
        "emotionalState":   protagonist's interior state at this point in the arc
        "visualContinuity": which motif element shows up in this beat (verbatim)
      },
      ...
    ]
  }

The plan is generated once. The agent reads `moviePlan.logline` /
`protagonistArc` / `visualMotif` / `toneAndGenre` / `dramaticQuestion` so
its questions stay inside the established story (no cross-genre drift).
The orchestrator reads `moviePlan.beats[i].visualContinuity` and
`moviePlan.visualMotif` so each clip's image prompt carries the motif.

Reliability:
- Gemini 2.5 Pro via Vertex (1M context, strong story reasoning).
- Wrapped in `with_reliability` (60s timeout, 3 attempts, jittered).
- Stub fallback when no GCP creds: deterministic plan derived from the
  master prompt + beat templates so dev / tests still see a populated
  manifest.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from .config import env, mock_mode
from .genai_client import default_gemini_model_for, make_genai_client
from .retry import with_reliability


logger = logging.getLogger(__name__)


_MOVIE_PLAN_SYSTEM = """You are a film director outlining a short cinematic.

You are given:
- A one-line master prompt from the user (the seed idea).
- A 7-beat dramatic structure (hook → exposition → inciting → rising → climax → falling → resolution) with each beat's intent.

Your job: produce a STORY-LEVEL plan that turns the seed into one coherent movie. The plan will be read by:
1. A questionnaire agent (so its questions per beat stay inside the established story instead of drifting genre-by-genre).
2. A deterministic image+video pipeline (so each clip echoes the same character, world, and visual motif).

Output ONLY valid JSON matching this shape — no prose, no markdown:

{
  "logline": "<one sentence: protagonist + want + obstacle + stakes>",
  "protagonistArc": "<start state → end state, in plain language>",
  "visualMotif": "<a recurring visual thread (lighting quality, recurring object, color palette, or compositional habit) that every beat must echo. Concrete, not abstract — 'sodium-yellow streetlight reflecting in puddles' beats 'urban melancholy'>",
  "toneAndGenre": "<short tag — e.g. 'intimate sci-fi character study, blue-grey palette, handheld' >",
  "dramaticQuestion": "<the central unresolved question the audience tracks>",
  "beats": [
    {
      "beatId": "beat-1",
      "template": "story.hook",
      "beatName": "Hook",
      "synopsis": "<one-line plot-specific synopsis for THIS movie, not the generic archetype>",
      "emotionalState": "<protagonist's interior state at this beat>",
      "visualContinuity": "<which element of the visualMotif appears in this beat, in verbatim language the image model can use>"
    },
    ... (7 entries total, in order)
  ]
}

Rules:
- The logline must read like the back of a Criterion case — character + want + obstacle + stakes.
- The visual motif must be CONCRETE. "Memory" is bad. "A specific photograph that recurs in beats 1, 3, 5, 7" is good.
- Every beat's visualContinuity entry must be a phrase the image model can render literally.
- Do not invent characters or settings the master prompt doesn't support. Stay inside the seed.
- Write at the level of a real screenwriter. No cliches, no generic narration.
"""


def _system_prompt(master_prompt: str, video_type: str, beat_templates: list[dict]) -> str:
    """Compose the user-facing prompt with the seed + beat templates."""
    beat_lines: list[str] = []
    for i, t in enumerate(beat_templates):
        beat_lines.append(
            f"  beat-{i + 1}  ({t['template']})  {t['beatName']} — {t['intent']} "
            f"[mood: {t['mood']}, duration: {t['suggestedDuration']}s]"
        )
    return (
        f"Master prompt: \"{master_prompt}\"\n"
        f"Video type: {video_type}\n\n"
        "Beat structure (the dramatic spine of the movie):\n"
        + "\n".join(beat_lines)
        + "\n\nProduce the JSON movie plan now."
    )


def _strip_codeblock(text: str) -> str:
    """Gemini occasionally wraps JSON in ```json ... ``` despite the prompt.
    Strip it so json.loads succeeds without manual intervention."""
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return text


def _parse_movie_plan(text: str) -> dict:
    """Best-effort parse. Falls back to {} when the LLM's JSON is broken —
    the caller treats {} as "no plan" and downstream code handles it."""
    cleaned = _strip_codeblock(text)
    try:
        return json.loads(cleaned)
    except Exception:
        # Try to find the outermost JSON object as a last resort.
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                return {}
        return {}


# ── Stub fallback ──────────────────────────────────────────────────────────


def _stub_movie_plan(master_prompt: str, video_type: str, beat_templates: list[dict]) -> dict:
    """Deterministic plan when no LLM is available. Not creative, but
    populated enough that the agent + orchestrator can still consume it
    without crashing."""
    seed = master_prompt.strip().rstrip(".")
    motif = "warm motivated practical light + a single recurring object the protagonist carries"
    beats = []
    for i, t in enumerate(beat_templates):
        beats.append({
            "beatId": f"beat-{i + 1}",
            "template": t["template"],
            "beatName": t["beatName"],
            "synopsis": f"{t['beatName']}: {t['intent']} (within the master idea: {seed})",
            "emotionalState": t["mood"],
            "visualContinuity": motif,
        })
    return {
        "logline": f"A short cinematic for: {seed}.",
        "protagonistArc": "established → tested → transformed",
        "visualMotif": motif,
        "toneAndGenre": "cinematic, motivated lighting, controlled motion",
        "dramaticQuestion": "what changes in the protagonist by the resolution",
        "beats": beats,
        "stub": True,
    }


# ── Public entry point ─────────────────────────────────────────────────────


async def generate_movie_plan(
    *,
    master_prompt: str,
    video_type: str,
    beat_templates: list[dict],
) -> dict:
    """
    Produce a story-level plan for the master prompt + beat structure.

    Returns the plan dict (see module docstring). On any failure, returns
    a stub plan rather than raising — the agent + orchestrator MUST work
    even when the plan generator is unavailable.
    """
    if not master_prompt or not beat_templates:
        return _stub_movie_plan(master_prompt or "", video_type, beat_templates or [])

    if mock_mode():
        return _stub_movie_plan(master_prompt, video_type, beat_templates)

    client = make_genai_client()
    if client is None:
        return _stub_movie_plan(master_prompt, video_type, beat_templates)

    user_prompt = _system_prompt(master_prompt, video_type, beat_templates)

    async def _call() -> Any:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=_MOVIE_PLAN_SYSTEM,
            temperature=0.85,
            max_output_tokens=2048,
            response_mime_type="application/json",
        )

        def _sync() -> Any:
            return client.models.generate_content(
                model=env("GEMINI_MOVIE_PLAN_MODEL") or default_gemini_model_for("decompose"),
                contents=[{"role": "user", "parts": [{"text": user_prompt}]}],
                config=config,
            )

        return await asyncio.to_thread(_sync)

    try:
        response = await with_reliability(
            "gemini.movie_plan",
            _call,
            timeout_seconds=60.0,
            max_attempts=3,
            base_backoff=1.5,
            idempotency_key=None,  # plan is generative, retries should re-roll
            breaker_name="vertex.gemini",
        )
    except Exception as exc:
        logger.warning("[movie_plan] gemini call exhausted retries: %s — using stub", exc)
        return _stub_movie_plan(master_prompt, video_type, beat_templates)

    text = ""
    try:
        candidates = getattr(response, "candidates", None) or []
        parts = getattr(candidates[0].content, "parts", None) or [] if candidates else []
        for part in parts:
            t = getattr(part, "text", None)
            if t:
                text += t
    except Exception as exc:
        logger.warning("[movie_plan] failed to extract text from gemini response: %s", exc)
        return _stub_movie_plan(master_prompt, video_type, beat_templates)

    plan = _parse_movie_plan(text)
    if not plan or "beats" not in plan or not plan.get("beats"):
        logger.warning("[movie_plan] LLM produced unusable JSON (len=%d) — using stub", len(text))
        return _stub_movie_plan(master_prompt, video_type, beat_templates)

    # Normalize: ensure each beat has the expected keys + the right beatId.
    plan_beats = plan.get("beats") or []
    normalized: list[dict] = []
    for i, t in enumerate(beat_templates):
        # Match by template first (LLM usually preserves it), then fall
        # back to positional index. This guards against the LLM mis-ordering
        # or skipping a beat.
        match = next(
            (b for b in plan_beats if b.get("template") == t["template"]),
            plan_beats[i] if i < len(plan_beats) else {},
        )
        normalized.append({
            "beatId": f"beat-{i + 1}",
            "template": t["template"],
            "beatName": t["beatName"],
            "synopsis": str(match.get("synopsis") or "").strip(),
            "emotionalState": str(match.get("emotionalState") or t["mood"]).strip(),
            "visualContinuity": str(match.get("visualContinuity") or "").strip(),
        })
    plan["beats"] = normalized
    return plan
