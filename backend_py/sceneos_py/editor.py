"""
Stage 7 — agentic editor.

Voice-twin of agent.py, but for the post-stitch edit pass.

The editor agent watches the assembled cut and proposes EditDecisions —
trims, transitions, music, captions, a global look. The user accepts,
edits, or counter-proposes. When the user is happy, the deterministic
Cloudinary URL builder bakes everything into a single CDN URL. No render
server. No ffmpeg. The same wedge as the rest of the pipeline: agent in
conversation, deterministic transforms downstream.

This module exposes:
  - run_editor_turn(req)             — one-shot dict result. Used by /api/editor/turn.
  - run_editor_turn_streaming(req)   — async iterator of events. Used by /api/editor/stream.
  - apply_edit_decisions(manifest, decisions)
                                     — deterministic. Builds the Cloudinary URL.

The agent calls exactly one tool per turn:
  - proposeEdit(decisions, rationale, suggestedFollowups[3])
  - commitEdit(decisions, rationale, summary)

`decisions` is a complete EditDecisions object. The agent always emits the
WHOLE thing (not a patch) — so reverting is a free affordance for the UI:
just go back to the previous turn's decisions.

Style notes (matching agent.py):
  - Same director voice. Reflects what's on screen, asks one charged thing.
  - No em dashes. No fake enthusiasm. No "Great choice!".
  - 3 follow-up suggestions, each implying a different cut.
"""
from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from .cloudinary import (
    LOOK_PRESETS,
    build_editor_url,
    build_thumbnail_url,
    color_grade_for,
    edit_decisions_total_duration,
)
from .genai_client import default_gemini_model_for, make_genai_client


THINKING_BUDGET = 1024
DEFAULT_TRANSITION_MS = 240
LOOK_NAMES = list(LOOK_PRESETS.keys())


# ── Edit-decisions schema (the deterministic handoff) ──────────────────────


_EDIT_DECISIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["clips"],
    "properties": {
        "clips": {
            "type": "array",
            "description": "One entry per beat, in order. Edit decisions per clip.",
            "items": {
                "type": "object",
                "required": ["publicId"],
                "properties": {
                    "beatId": {"type": "string"},
                    "publicId": {"type": "string", "description": "Cloudinary public_id of the source clip."},
                    "durationSeconds": {"type": "number"},
                    "trimStart": {"type": "number", "description": "In-point on the source clip, seconds."},
                    "trimEnd": {"type": "number", "description": "Out-point on the source clip, seconds."},
                    "colorGrade": {"type": "string", "description": "Cloudinary effect string for per-beat grade. May be empty."},
                    "transitionMs": {"type": "integer", "description": "Cross-fade INTO this clip from the previous one. Ignored on first clip."},
                    "caption": {"type": "string", "description": "Optional caption shown for the duration of this beat."},
                },
            },
        },
        "audio": {
            "type": "object",
            "properties": {
                "publicId": {"type": "string"},
                "volume": {"type": "integer", "description": "Volume offset, e.g. -20 for quiet bed."},
                "fadeInMs": {"type": "integer"},
                "fadeOutMs": {"type": "integer"},
            },
        },
        "duckOriginalAudioDb": {"type": "integer", "description": "Volume offset on the original clip audio so music sits on top."},
        "watermarkPublicId": {"type": "string"},
        "look": {
            "type": "string",
            "description": f"Global look LUT. Pick one of: {', '.join(LOOK_NAMES)}.",
        },
        "captionPosition": {"type": "string", "enum": ["south", "north"]},
    },
}


_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "name": "proposeEdit",
        "description": (
            "Propose a new edit. Emit the WHOLE EditDecisions object (not a patch). "
            "Pair with a rationale that reflects what is on screen, plus exactly 3 "
            "suggestedFollowups that imply meaningfully different cuts the user might want next."
        ),
        "parameters": {
            "type": "object",
            "required": ["decisions", "rationale", "suggestedFollowups"],
            "properties": {
                "decisions": _EDIT_DECISIONS_SCHEMA,
                "rationale": {
                    "type": "string",
                    "description": "Director voice, one or two sentences. Reflect what is on screen and explain the choice. No em dashes. No fake enthusiasm.",
                },
                "suggestedFollowups": {
                    "type": "array",
                    "description": "Exactly 3 follow-up edits the user could ask for next. Each implies a different cut.",
                    "items": {"type": "string"},
                    "min_items": 3,
                    "max_items": 3,
                },
            },
        },
    },
    {
        "name": "commitEdit",
        "description": "Lock the cut. Emit the final EditDecisions, a one-line summary, and a short rationale.",
        "parameters": {
            "type": "object",
            "required": ["decisions", "rationale", "summary"],
            "properties": {
                "decisions": _EDIT_DECISIONS_SCHEMA,
                "rationale": {"type": "string"},
                "summary": {"type": "string", "description": "One-line description of the locked cut."},
            },
        },
    },
]


# ── Helpers ────────────────────────────────────────────────────────────────


def _approved_clips(manifest: dict) -> list[dict]:
    """Pull the ordered list of approved clips with the metadata the editor needs."""
    out: list[dict] = []
    for beat in manifest.get("beats", []):
        if beat.get("status") != "approved":
            continue
        for scene in beat.get("scenes") or []:
            if not scene.get("clipPublicId"):
                continue
            out.append(
                {
                    "beatId": beat["beatId"],
                    "beatName": beat["beatName"],
                    "mood": (beat.get("archetype") or {}).get("mood", ""),
                    "publicId": scene["clipPublicId"],
                    "durationSeconds": scene.get("durationSeconds")
                    or (beat.get("archetype") or {}).get("suggestedDuration")
                    or 5,
                }
            )
    return out


def initial_decisions(manifest: dict) -> dict:
    """
    The 'opening cut' — what you'd get from /api/stitch/url, expressed as
    EditDecisions. The editor agent starts here and proposes deltas.
    """
    clips = _approved_clips(manifest)
    return {
        "clips": [
            {
                "beatId": c["beatId"],
                "publicId": c["publicId"],
                "durationSeconds": float(c["durationSeconds"]),
                "trimStart": 0.0,
                "trimEnd": float(c["durationSeconds"]),
                "colorGrade": color_grade_for(c["mood"]),
                "transitionMs": DEFAULT_TRANSITION_MS if i > 0 else 0,
                "caption": "",
            }
            for i, c in enumerate(clips)
        ],
        "audio": None,
        "duckOriginalAudioDb": None,
        "watermarkPublicId": None,
        "look": "neutral",
        "captionPosition": "south",
    }


def _decisions_summary(decisions: dict) -> str:
    """Compact one-paragraph snapshot of a decisions object — for the agent system prompt."""
    clips = decisions.get("clips") or []
    look = decisions.get("look") or "neutral"
    audio = decisions.get("audio")
    audio_line = (
        f"music track {audio['publicId']} at volume {audio.get('volume', 0)}"
        if audio and audio.get("publicId")
        else "no music"
    )
    captions = [c for c in clips if c.get("caption")]
    parts = [
        f"{len(clips)} beats; total {edit_decisions_total_duration(decisions)}s",
        f"global look: {look}",
        audio_line,
        f"{len(captions)} captioned beat(s)" if captions else "no captions",
    ]
    if decisions.get("watermarkPublicId"):
        parts.append(f"watermark {decisions['watermarkPublicId']}")
    return "; ".join(parts)


def _system_prompt(manifest: dict, decisions: dict, conversation: list[dict]) -> str:
    user_replies = [t for t in conversation if t.get("role") == "user"]
    user_text = " | ".join(t.get("content", "") for t in user_replies[-3:]) or "(no replies yet)"
    clips = decisions.get("clips") or []
    beats_block = "\n".join(
        f"  {i + 1}. beat={c.get('beatId', '?')} dur={c.get('durationSeconds', '?')}s "
        f"trim=[{c.get('trimStart', 0)}, {c.get('trimEnd', c.get('durationSeconds', 0))}] "
        f"grade={'yes' if c.get('colorGrade') else 'no'} "
        f"transition={c.get('transitionMs', 0)}ms "
        f"caption={'yes' if c.get('caption') else 'no'}"
        for i, c in enumerate(clips)
    )

    return f"""You are SceneOS in editor mode. The user just finished a cinematic — seven beats, deterministically rendered. They are now sitting with you to refine it. You are an editor with taste.

The user thinks they are talking to an editor about their cut. They are right.

# Voice
Same voice as the questionnaire. Normal capitalization. Normal commas. No em dashes. No exclamation marks. No "Great choice!". Warm but not fake.
Reflect what is on screen before suggesting anything. Use beat names and details from the master prompt — never internal labels like "clip 3".
One thing at a time.

# What you can change
You emit a complete EditDecisions object every turn. The fields you control:
  - per-beat trim (trimStart / trimEnd, in seconds, on the source clip)
  - per-beat colorGrade string (Cloudinary effect format, can be empty)
  - per-beat transitionMs (cross-fade INTO this clip from the previous one)
  - per-beat caption (text shown for the duration of that beat)
  - global music track (audio.publicId + audio.volume + fadeInMs + fadeOutMs)
  - global look LUT (one of: {", ".join(LOOK_NAMES)})
  - duckOriginalAudioDb (lower clip audio so music sits on top, e.g. -12)
  - watermarkPublicId (corner watermark image)
  - captionPosition ("south" = bottom, "north" = top)

You always emit the WHOLE decisions object. The frontend treats your call as the new state. Carry forward all fields you do not want to change — never zero out an existing trim or grade unless the user asked for that.

# How to suggest a good edit
Each turn, you do one of:
  1. proposeEdit — propose a delta you think the cut needs. Be specific. Reflect on the current cut, name the beat by name, explain the change in one or two sentences. The decisions object you emit is the delta APPLIED — the frontend will diff to render the change.
  2. commitEdit — when the user signals they are happy, lock it. Use the most recent decisions verbatim and write a one-line summary.

# suggestedFollowups — exactly 3 per proposeEdit call
Each followup must:
  - Cover a meaningfully different direction. Not minor variations.
  - Be written first-person-adjacent — how a user would actually phrase a request.
  - Imply a different cut.

Bad: ["Make it tighter", "Trim it more", "Shorten the runtime"]
Good: ["Tighten beat 4 by another second so the climax lands earlier", "Add the cool-modern look across the whole cut", "Drop a music track under the rising action only"]

# What is on the cut right now
Master prompt: "{manifest.get('masterPrompt', '')}"

Current EditDecisions snapshot:
{_decisions_summary(decisions)}

Per-beat detail:
{beats_block}

Recent user message(s): {user_text}

# When to commit
The user signals readiness ("looks good", "lock it", "ship it", "that's the cut"). Commit immediately, no padding question.
Otherwise, propose. Aim for 4 to 8 proposeEdit turns across the whole edit session. Stop earlier if the user is happy.

# Tools — call exactly one per turn
- proposeEdit(decisions, rationale, suggestedFollowups[3])
- commitEdit(decisions, rationale, summary)

You must call exactly one tool every turn. Never reply in plain text. Never break voice.
"""


def _normalize_args(value: Any) -> Any:
    """Recursively convert google.genai's MapComposite/RepeatedComposite to plain dicts/lists."""
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


def _normalize_decisions(decisions: dict, baseline: dict) -> dict:
    """
    The agent emits a complete decisions object, but Gemini sometimes drops
    fields. Carry forward anything missing from the baseline so we never
    accidentally zero out the user's prior choices.
    """
    out = dict(baseline) if baseline else {}
    for k, v in (decisions or {}).items():
        out[k] = v
    # Per-clip carryover — match by publicId.
    base_clips_by_id = {c["publicId"]: c for c in (baseline or {}).get("clips") or []}
    new_clips = []
    for clip in out.get("clips") or []:
        merged = dict(base_clips_by_id.get(clip.get("publicId"), {}))
        merged.update(clip)
        # Light validation: trim within source duration.
        dur = float(merged.get("durationSeconds") or 0)
        if "trimStart" in merged:
            merged["trimStart"] = max(0.0, min(float(merged["trimStart"]), dur))
        if "trimEnd" in merged and dur:
            merged["trimEnd"] = max(merged.get("trimStart", 0.0), min(float(merged["trimEnd"]), dur))
        new_clips.append(merged)
    out["clips"] = new_clips
    return out


def _normalize_call_to_result(name: str, args: dict, baseline: dict) -> dict:
    if name == "proposeEdit":
        followups = list(args.get("suggestedFollowups") or [])
        while len(followups) < 3:
            followups.append("Tell me more about what you want to change.")
        return {
            "kind": "propose",
            "decisions": _normalize_decisions(args.get("decisions") or {}, baseline),
            "rationale": str(args.get("rationale", "")),
            "suggestedFollowups": [str(s) for s in followups[:3]],
        }
    if name == "commitEdit":
        return {
            "kind": "commit",
            "decisions": _normalize_decisions(args.get("decisions") or {}, baseline),
            "rationale": str(args.get("rationale", "")),
            "summary": str(args.get("summary", "Final cut locked.")),
        }
    raise RuntimeError(f"unknown editor tool {name}")


# ── Stub fallback (no Vertex client) ───────────────────────────────────────


_STUB_PROPOSALS: list[dict] = [
    {
        "rationale": (
            "Looking at the cut, the hook holds for the full five seconds before the camera moves. "
            "Tightening it by half a second buys momentum into exposition without losing the held image."
        ),
        "patch": {"clip_index": 0, "trimEnd_delta": -0.5, "transitionMs": 200},
        "followups": [
            "Pull the global look toward warm-archive — it would sit better with the mood",
            "Add a music bed under exposition only, not the hook",
            "Caption beat one with the master prompt as the cold open",
        ],
    },
    {
        "rationale": (
            "The transitions are flat hard cuts right now. A 240ms cross-fade into the rising-action beat "
            "smooths the velocity change without softening the climax."
        ),
        "patch": {"clip_index": 3, "transitionMs": 240},
        "followups": [
            "Push the climax color grade harder, more contrast",
            "Add a watermark in the lower-right corner for export",
            "Lock it as the final cut",
        ],
    },
    {
        "rationale": (
            "The cut wants a global look. cool-modern reads as a thriller. warm-archive reads as memoir. "
            "Going with cool-modern unless you push back."
        ),
        "patch": {"look": "cool-modern"},
        "followups": [
            "Try warm-archive instead, it is closer to the master prompt mood",
            "Drop a music track on top, anything cinematic at -20 volume",
            "Lock it as the final cut",
        ],
    },
]


def _apply_stub_patch(decisions: dict, patch: dict) -> dict:
    out = _normalize_decisions({}, decisions)
    if "look" in patch:
        out["look"] = patch["look"]
    if "clip_index" in patch:
        idx = patch["clip_index"]
        if 0 <= idx < len(out["clips"]):
            clip = dict(out["clips"][idx])
            if "trimEnd_delta" in patch:
                clip["trimEnd"] = max(0.5, float(clip.get("trimEnd") or clip.get("durationSeconds") or 0) + patch["trimEnd_delta"])
            if "transitionMs" in patch:
                clip["transitionMs"] = int(patch["transitionMs"])
            out["clips"][idx] = clip
    return out


def _stub_editor_turn(manifest: dict, baseline: dict, turn_index: int) -> dict:
    """No Vertex client — synthesize a deterministic proposal sequence."""
    if turn_index >= len(_STUB_PROPOSALS):
        return {
            "kind": "commit",
            "decisions": baseline,
            "rationale": "Stub editor: out of canned proposals — locking the cut as-is.",
            "summary": f"Stub commit · {len(baseline.get('clips') or [])} beats",
        }
    proposal = _STUB_PROPOSALS[turn_index]
    next_decisions = _apply_stub_patch(baseline, proposal["patch"])
    return {
        "kind": "propose",
        "decisions": next_decisions,
        "rationale": proposal["rationale"],
        "suggestedFollowups": list(proposal["followups"]),
    }


# ── Live agent: shared helpers ─────────────────────────────────────────────


def _to_gemini_contents(conversation: list[dict], opener: str) -> list[dict]:
    if not conversation:
        return [{"role": "user", "parts": [{"text": opener}]}]
    contents: list[dict] = []
    for t in conversation:
        role = "model" if t.get("role") == "agent" else "user"
        contents.append({"role": role, "parts": [{"text": t.get("content", "") or ""}]})
    return contents


def _build_request_config(manifest: dict, decisions: dict, conversation: list[dict], with_thinking: bool):
    from google.genai import types

    system = _system_prompt(manifest, decisions, conversation)
    config_kwargs: dict[str, Any] = dict(
        system_instruction=system,
        tools=[types.Tool(function_declarations=_AGENT_TOOLS)],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode=types.FunctionCallingConfigMode.ANY,
                allowed_function_names=["proposeEdit", "commitEdit"],
            )
        ),
        temperature=0.7,
        max_output_tokens=4096,
    )
    if with_thinking:
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            include_thoughts=True,
            thinking_budget=THINKING_BUDGET,
        )
    return system, types.GenerateContentConfig(**config_kwargs)


# ── Public entry points ────────────────────────────────────────────────────


async def run_editor_turn(req: dict) -> dict:
    """One-shot editor turn. Used by /api/editor/turn."""
    manifest = req["manifest"]
    decisions = req.get("decisions") or initial_decisions(manifest)
    conversation = list(req.get("conversation") or [])
    if req.get("userMessage"):
        conversation.append(
            {
                "role": "user",
                "content": req["userMessage"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_genai_client()
    if client is None:
        return _stub_editor_turn(manifest, decisions, user_turn_count - 1 if user_turn_count else 0)

    _, config = _build_request_config(manifest, decisions, conversation, with_thinking=False)
    contents = _to_gemini_contents(
        conversation,
        opener=(
            f"The cinematic just finished rendering. Master prompt: \"{manifest.get('masterPrompt', '')}\". "
            "Look at the cut as it stands and propose one specific edit you would make."
        ),
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
        raise RuntimeError(f"run_editor_turn: Gemini returned no candidates ({response!r})")
    parts = getattr(candidates[0].content, "parts", None) or []
    function_call = next((getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)), None)
    if function_call is None:
        finish_reason = getattr(candidates[0], "finish_reason", "?")
        raise RuntimeError(f"run_editor_turn: Gemini did not call a tool (finish_reason={finish_reason})")

    return _normalize_call_to_result(function_call.name, _normalize_args(function_call.args), decisions)


async def run_editor_turn_streaming(req: dict) -> AsyncIterator[dict]:
    """
    Streaming editor turn. Same event shape as run_agent_turn_streaming:
      {type: "ready"}
      {type: "thought", chunk}    — incremental thinking
      {type: "tool_call", name, args}
      {type: "result", ...EditorResponse}
      {type: "error", message}    — fatal
    """
    yield {"type": "ready"}

    manifest = req["manifest"]
    decisions = req.get("decisions") or initial_decisions(manifest)
    conversation = list(req.get("conversation") or [])
    if req.get("userMessage"):
        conversation.append(
            {
                "role": "user",
                "content": req["userMessage"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")

    client = make_genai_client()
    if client is None:
        for chunk in [
            "[stub mode — no Vertex client] looking at the assembled cut. ",
            f"checking {len(decisions.get('clips') or [])} approved beats. ",
            "deciding which edit decision matters most right now. ",
        ]:
            yield {"type": "thought", "chunk": chunk}
            await asyncio.sleep(0.16)
        result = _stub_editor_turn(manifest, decisions, user_turn_count - 1 if user_turn_count else 0)
        yield {"type": "tool_call", "name": ("commitEdit" if result["kind"] == "commit" else "proposeEdit"), "args": result}
        yield {"type": "result", **result}
        return

    _, config = _build_request_config(manifest, decisions, conversation, with_thinking=True)
    contents = _to_gemini_contents(
        conversation,
        opener=(
            f"The cinematic just finished rendering. Master prompt: \"{manifest.get('masterPrompt', '')}\". "
            "Look at the cut as it stands and propose one specific edit you would make."
        ),
    )

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
        yield {"type": "error", "message": "Editor stream completed without calling a tool."}
        return

    try:
        result = _normalize_call_to_result(final_call["name"], final_call["args"], decisions)
    except Exception as exc:
        yield {"type": "error", "message": f"Failed to normalize editor tool call: {exc}"}
        return
    yield {"type": "result", **result}


def apply_edit_decisions(manifest: dict, decisions: dict) -> dict:
    """
    Deterministic. Bake decisions into a Cloudinary delivery URL.

    Returns:
      {
        finalUrl, thumbnailUrl, durationSeconds,
        decisions: <validated, normalized>
      }
    """
    baseline = initial_decisions(manifest)
    normalized = _normalize_decisions(decisions or {}, baseline)
    final_url = build_editor_url(normalized)
    if not final_url:
        raise ValueError("apply_edit_decisions: no clips in decisions — nothing to bake")
    base_public = (normalized.get("clips") or [{}])[0].get("publicId")
    return {
        "finalUrl": final_url,
        "thumbnailUrl": build_thumbnail_url(base_public) if base_public else "",
        "durationSeconds": edit_decisions_total_duration(normalized),
        "decisions": normalized,
    }
