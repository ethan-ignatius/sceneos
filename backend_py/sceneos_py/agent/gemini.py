"""Gemini 2.5 (Vertex) agent dispatch — non-streaming + streaming.

The non-streaming path (run_agent_turn) is used by /api/agent and tests.
The streaming path (run_agent_turn_streaming) is used by /api/agent/stream
and surfaces Gemini's thinking tokens live as SSE events. If the stream ends
with no function_call in any chunk, we fall back once to the non-streaming
`run_agent_turn` (same request), which is more reliable with thinking.

Both paths share:
  - Stub fallback when no Gemini client is available (mock mode + tests).
  - On Gemini failure (quota, malformed tool call, no candidates): one
    cold retry, then raise. There is no second-LLM fallback — Vertex
    Gemini is the only model SceneOS uses.
  - `_repair_question_if_redundant` defense-in-depth on the final result.

The streaming producer runs in a thread because google.genai is sync.
We use a queue to bridge into asyncio land. A SENTINEL marks end-of-stream.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any, AsyncIterator

from ..config import mock_mode
from ..genai_client import default_gemini_model_for, make_genai_client
from ..retry import with_reliability
from .context import _collect_conversation
from .messages import _build_request_config, _to_gemini_contents
from .normalizer import _normalize_args, _normalize_call_to_result
from .repair import _repair_question_if_redundant
from .stub import _stub_agent_turn


logger = logging.getLogger(__name__)


# ── Non-streaming entry point ──────────────────────────────────────────────


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

    def _call_sync(temp: float = 0.85) -> Any:
        config_kwargs = dict(config.model_dump(exclude_none=True))
        config_kwargs["temperature"] = temp
        from google.genai import types
        retry_config = types.GenerateContentConfig(**config_kwargs)
        return client.models.generate_content(
            model=default_gemini_model_for("agent"),
            contents=contents,
            config=retry_config,
        )

    response = await with_reliability(
        "vertex.gemini.agent",
        lambda: asyncio.to_thread(_call_sync),
        timeout_seconds=30.0,
        max_attempts=2,
        base_backoff=1.0,
        breaker_name="vertex.gemini",
    )

    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        raise RuntimeError("Gemini agent returned no candidates after retry.")
    parts = getattr(candidates[0].content, "parts", None) or []
    function_call = next(
        (getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)),
        None,
    )
    if function_call is None:
        # Gemini occasionally emits MALFORMED_FUNCTION_CALL under load.
        # One colder retry, then raise — there is no second-LLM fallback.
        response = await asyncio.to_thread(lambda: _call_sync(0.25))
        candidates = getattr(response, "candidates", None) or []
        parts = getattr(candidates[0].content, "parts", None) if candidates else []
        function_call = next(
            (getattr(p, "function_call", None) for p in (parts or []) if getattr(p, "function_call", None)),
            None,
        )
        if function_call is None:
            raise RuntimeError("Gemini agent did not emit a tool call after cold retry.")

    return _repair_question_if_redundant(
        _normalize_call_to_result(
            function_call.name,
            _normalize_args(function_call.args),
            beat,
            manifest=manifest,
        ),
        beat,
        conversation,
    )


# ── Streaming entry point ──────────────────────────────────────────────────

# The non-streaming path uses with_reliability(timeout_seconds=30). The
# streaming path needs a wider window because thinking tokens arrive over
# 6–15s on the trial tier, but we MUST have a ceiling — without one, a
# stalled Gemini stream blocks the consumer coroutine (and thus the SSE
# connection) forever. 45s gives Gemini 2.5 Flash generous room for its
# thinking budget while still recovering within a minute via Anthropic.
STREAM_TIMEOUT_SECONDS = 45.0

# Per-chunk liveness: if the producer hasn't put ANYTHING on the queue for
# this many seconds, the consumer treats it as a stall even if the overall
# timeout hasn't fired yet. Catches the case where Gemini sends a few
# thinking tokens then goes silent mid-stream.
CHUNK_SILENCE_SECONDS = 20.0


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
    beat_id = req["beatId"]
    beat = next((b for b in manifest["beats"] if b["beatId"] == beat_id), None)
    if beat is None:
        yield {"type": "error", "message": f"beatId not found in manifest ({beat_id})"}
        return

    conversation = _collect_conversation(beat, req.get("userMessage"))
    user_turn_count = sum(1 for t in conversation if t.get("role") == "user")
    beat_name = beat.get("beatName", beat_id)

    logger.info(
        "[agent/stream] start beat=%s user_turns=%d conversation_len=%d",
        beat_name, user_turn_count, len(conversation),
    )

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
        logger.info("[agent/stream] stub mode — no Vertex client, beat=%s", beat_name)
        for chunk in [
            f"[stub mode — no Vertex client] working on the {beat_name.lower()} beat. ",
            f"checking what we know so far: {user_turn_count} user reply(ies). ",
            "tracing facets: subject, action, setting, framing, mood. ",
            "drafting the next question. ",
        ]:
            yield {"type": "thought", "chunk": chunk}
            await asyncio.sleep(0.18)
        result = _stub_agent_turn(beat, manifest["masterPrompt"], conversation, user_turn_count)
        yield {
            "type": "tool_call",
            "name": ("markSufficient" if result["kind"] == "sufficient" else "askQuestion"),
            "args": result,
        }
        yield {"type": "result", **result}
        return

    _, config = _build_request_config(
        beat, manifest, with_thinking=True, user_turn_count=user_turn_count
    )
    contents = _to_gemini_contents(conversation, manifest["masterPrompt"])

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    SENTINEL = object()
    # Liveness flag — the producer sets this on first chunk so the consumer
    # can distinguish "Gemini hasn't responded at all" from "Gemini is
    # streaming but slowly."
    producer_alive = threading.Event()

    def _producer():
        try:
            logger.info("[agent/stream] producer started, beat=%s", beat_name)
            stream = client.models.generate_content_stream(
                model=default_gemini_model_for("agent"),
                contents=contents,
                config=config,
            )
            chunk_count = 0
            for chunk in stream:
                if chunk_count == 0:
                    producer_alive.set()
                    logger.info("[agent/stream] first chunk received, beat=%s", beat_name)
                chunk_count += 1
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
            logger.info(
                "[agent/stream] producer finished, beat=%s chunks=%d",
                beat_name, chunk_count,
            )
        except Exception as exc:
            logger.warning(
                "[agent/stream] producer error, beat=%s: %s: %s",
                beat_name, type(exc).__name__, exc,
            )
            loop.call_soon_threadsafe(queue.put_nowait, {"kind": "error", "message": f"{type(exc).__name__}: {exc}"})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

    thread = threading.Thread(target=_producer, daemon=True)
    thread.start()

    # ── Consume the queue with timeout protection ──────────────────────────
    # Two timeout layers:
    #   1. STREAM_TIMEOUT_SECONDS (45s) — overall wall-clock ceiling from
    #      producer start to SENTINEL. Catches total stalls.
    #   2. CHUNK_SILENCE_SECONDS (20s) — per-get ceiling. Catches mid-stream
    #      stalls where Gemini sends a few thinking tokens then goes silent.
    # On any timeout: fall back to Anthropic Haiku and surface a thought
    # event so the user sees "switching to backup" instead of frozen UI.

    final_call: dict | None = None
    timed_out = False
    wall_start = time.monotonic()

    while True:
        elapsed = time.monotonic() - wall_start
        remaining = STREAM_TIMEOUT_SECONDS - elapsed
        if remaining <= 0:
            timed_out = True
            logger.warning(
                "[agent/stream] overall timeout (%.0fs) hit, beat=%s",
                STREAM_TIMEOUT_SECONDS, beat_name,
            )
            break
        # Use the smaller of remaining wall-clock and per-chunk silence as
        # the get() timeout. This way both ceilings are enforced.
        get_timeout = min(remaining, CHUNK_SILENCE_SECONDS)
        try:
            item = await asyncio.wait_for(queue.get(), timeout=get_timeout)
        except asyncio.TimeoutError:
            timed_out = True
            logger.warning(
                "[agent/stream] chunk silence timeout (%.0fs) hit after %.1fs total, beat=%s",
                CHUNK_SILENCE_SECONDS, elapsed, beat_name,
            )
            break

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
            # Stream-level Gemini error → one-shot agent turn (same request).
            logger.warning("[agent/stream] Gemini stream error, beat=%s: %s", beat_name, item["message"])
            yield {
                "type": "thought",
                "chunk": f"[gemini stream error: {item['message']}; finishing with one-shot request]",
            }
            try:
                result = await run_agent_turn(req)
            except Exception as exc:
                yield {"type": "error", "message": f"Gemini stream failed and recovery failed: {exc}"}
                return
            yield {"type": "result", **result}
            return

    # ── Timeout → non-streaming recovery (no separate Anthropic path in tree)
    if timed_out:
        yield {
            "type": "thought",
            "chunk": (
                f"[gemini stream timed out after {time.monotonic() - wall_start:.0f}s; "
                f"finishing with one-shot request]"
            ),
        }
        try:
            result = await run_agent_turn(req)
        except Exception as exc:
            logger.error("[agent/stream] one-shot recovery failed after timeout, beat=%s: %s", beat_name, exc)
            yield {"type": "error", "message": f"Gemini timed out and recovery failed: {exc}"}
            return
        logger.info("[agent/stream] one-shot recovery after timeout, beat=%s kind=%s", beat_name, result.get("kind"))
        yield {"type": "result", **result}
        return

    # ── Stream ended without tool call (not a timeout) ────────────────────
    if final_call is None:
        logger.warning(
            "vertex.gemini.agent.stream: stream ended without function_call; "
            "using non-streaming recovery pass (beat=%s).",
            beat_name,
        )
        try:
            result = await run_agent_turn(req)
        except Exception as exc:
            logger.exception("vertex.gemini.agent: recovery after empty stream failed")
            yield {
                "type": "error",
                "message": f"Stream completed without a tool call, and recovery failed: {exc}",
            }
            return
        yield {"type": "result", **result}
        return

    logger.info("[agent/stream] tool call received: %s, beat=%s", final_call["name"], beat_name)
    try:
        result = _normalize_call_to_result(
            final_call["name"],
            final_call["args"],
            beat,
            manifest=manifest,
        )
    except Exception as exc:
        yield {"type": "error", "message": f"Failed to normalize tool call: {exc}"}
        return
    result = _repair_question_if_redundant(result, beat, conversation)
    yield {"type": "result", **result}
