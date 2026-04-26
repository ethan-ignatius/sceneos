"""Gemini 2.5 (Vertex) agent dispatch — non-streaming + streaming.

The non-streaming path (run_agent_turn) is used by /api/agent and tests.
The streaming path (run_agent_turn_streaming) is used by /api/agent/stream
and surfaces Gemini's thinking tokens live as SSE events.

Both paths share:
  - Stub fallback when no Gemini client is available (mock mode + tests).
  - Anthropic Haiku fallback when Gemini fails (quota, malformed tool call,
    no candidates). The Anthropic fallback itself is wrapped in retry.
  - `_repair_question_if_redundant` defense-in-depth on the final result.

The streaming producer runs in a thread because google.genai is sync.
We use a queue to bridge into asyncio land. A SENTINEL marks end-of-stream.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, AsyncIterator

from ..config import mock_mode
from ..genai_client import default_gemini_model_for, make_genai_client
from ..retry import with_reliability
from .anthropic import _run_anthropic_agent_turn
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

    try:
        response = await with_reliability(
            "vertex.gemini.agent",
            lambda: asyncio.to_thread(_call_sync),
            timeout_seconds=30.0,
            max_attempts=2,
            base_backoff=1.0,
            breaker_name="vertex.gemini",
        )
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
    function_call = next(
        (getattr(p, "function_call", None) for p in parts if getattr(p, "function_call", None)),
        None,
    )
    if function_call is None:
        # Gemini occasionally emits MALFORMED_FUNCTION_CALL under load.
        # Retry once colder, then fall back to Anthropic rather than 502.
        try:
            response = await asyncio.to_thread(lambda: _call_sync(0.25))
            candidates = getattr(response, "candidates", None) or []
            parts = getattr(candidates[0].content, "parts", None) if candidates else []
            function_call = next(
                (getattr(p, "function_call", None) for p in (parts or []) if getattr(p, "function_call", None)),
                None,
            )
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


# ── Streaming entry point ──────────────────────────────────────────────────


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
        for chunk in [
            f"[stub mode — no Vertex client] working on the {beat['beatName'].lower()} beat. ",
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
            # Stream-level Gemini error → pivot to Anthropic fallback so the
            # user gets a real answer instead of a dead stream. We surface a
            # short status thought so the visualizer can show the pivot.
            yield {"type": "thought", "chunk": f"[gemini stream error: {item['message']}; falling back to Anthropic Haiku]"}
            try:
                result = await _run_anthropic_agent_turn(
                    beat=beat,
                    manifest=manifest,
                    conversation=conversation,
                )
            except Exception as exc:
                yield {"type": "error", "message": f"Both Gemini stream and Anthropic fallback failed: {exc}"}
                return
            yield {
                "type": "tool_call",
                "name": ("markSufficient" if result["kind"] == "sufficient" else "askQuestion"),
                "args": result,
            }
            yield {"type": "result", **result}
            return

    if final_call is None:
        # Stream ended with no function_call. Pivot to Anthropic instead of
        # surfacing a dead stream.
        yield {"type": "thought", "chunk": "[gemini stream produced no tool call; falling back to Anthropic Haiku]"}
        try:
            result = await _run_anthropic_agent_turn(
                beat=beat,
                manifest=manifest,
                conversation=conversation,
            )
        except Exception as exc:
            yield {"type": "error", "message": f"Stream completed without tool call and fallback failed: {exc}"}
            return
        yield {
            "type": "tool_call",
            "name": ("markSufficient" if result["kind"] == "sufficient" else "askQuestion"),
            "args": result,
        }
        yield {"type": "result", **result}
        return

    try:
        result = _normalize_call_to_result(final_call["name"], final_call["args"], beat)
    except Exception as exc:
        yield {"type": "error", "message": f"Failed to normalize tool call: {exc}"}
        return
    result = _repair_question_if_redundant(result, beat, conversation)
    yield {"type": "result", **result}
