"""
Reliability + retry primitive — edge-case test suite.

Covers:
  - Retry on transient errors → eventual success.
  - Retry exhaustion raises the LAST exception.
  - HTTP 4xx classified terminal → no retry.
  - HTTP 408/429 still retried (transient by spec).
  - Programming errors (ValueError/TypeError/KeyError) classified terminal.
  - Idempotency cache returns the same result without re-invoking.
  - Idempotency miss after manual reset re-invokes.
  - Circuit breaker opens after N failures, short-circuits subsequent calls.
  - Half-open state lets one trial through; success closes the breaker.
  - Per-attempt timeout trips when the call hangs.
"""
from __future__ import annotations

import asyncio

import httpx
import pytest

from sceneos_py.retry import (
    CIRCUIT_BREAKERS,
    CircuitBreaker,
    CircuitOpenError,
    _is_retryable,
    get_breaker,
    reset_all_breakers,
    reset_idempotency_cache,
    with_reliability,
)


@pytest.fixture(autouse=True)
def _isolate_state():
    """Reset retry-layer state before every test so they don't leak."""
    reset_all_breakers()
    reset_idempotency_cache()
    yield
    reset_all_breakers()
    reset_idempotency_cache()


# ── Retry classification ───────────────────────────────────────────────────


def test_value_error_is_terminal():
    assert _is_retryable(ValueError("nope")) is False


def test_type_error_is_terminal():
    assert _is_retryable(TypeError("bad arg")) is False


def test_key_error_is_terminal():
    assert _is_retryable(KeyError("missing")) is False


def test_runtime_error_is_retryable():
    assert _is_retryable(RuntimeError("flaky upstream")) is True


def _http_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://example.com/")
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_http_400_is_terminal():
    assert _is_retryable(_http_error(400)) is False


def test_http_401_is_terminal():
    assert _is_retryable(_http_error(401)) is False


def test_http_408_is_retryable():
    assert _is_retryable(_http_error(408)) is True


def test_http_429_is_retryable():
    assert _is_retryable(_http_error(429)) is True


def test_http_500_is_retryable():
    assert _is_retryable(_http_error(500)) is True


def test_http_503_is_retryable():
    assert _is_retryable(_http_error(503)) is True


# ── with_reliability ───────────────────────────────────────────────────────


def test_eventual_success_after_two_failures():
    state = {"attempts": 0}

    async def call():
        state["attempts"] += 1
        if state["attempts"] < 3:
            raise RuntimeError(f"transient-{state['attempts']}")
        return "ok"

    result = asyncio.run(
        with_reliability("test.eventual", call, max_attempts=3, base_backoff=0.001)
    )
    assert result == "ok"
    assert state["attempts"] == 3


def test_exhaustion_raises_last_exception():
    async def call():
        raise RuntimeError("forever-flaky")

    with pytest.raises(RuntimeError, match="forever-flaky"):
        asyncio.run(
            with_reliability("test.exhaust", call, max_attempts=3, base_backoff=0.001)
        )


def test_terminal_error_does_not_retry():
    state = {"attempts": 0}

    async def call():
        state["attempts"] += 1
        raise ValueError("definitely not retryable")

    with pytest.raises(ValueError):
        asyncio.run(
            with_reliability("test.terminal", call, max_attempts=5, base_backoff=0.001)
        )
    assert state["attempts"] == 1


def test_idempotency_cache_returns_cached_result():
    state = {"attempts": 0}

    async def call():
        state["attempts"] += 1
        return f"call-{state['attempts']}"

    first = asyncio.run(
        with_reliability(
            "test.idem", call,
            max_attempts=2, base_backoff=0.001,
            idempotency_key="my-key",
        )
    )
    second = asyncio.run(
        with_reliability(
            "test.idem", call,
            max_attempts=2, base_backoff=0.001,
            idempotency_key="my-key",
        )
    )
    assert first == "call-1"
    assert second == "call-1"  # cached, not re-invoked
    assert state["attempts"] == 1


def test_idempotency_cache_reset_re_invokes():
    state = {"attempts": 0}

    async def call():
        state["attempts"] += 1
        return f"call-{state['attempts']}"

    asyncio.run(
        with_reliability(
            "test.idem.reset", call,
            max_attempts=2, base_backoff=0.001,
            idempotency_key="reset-key",
        )
    )
    reset_idempotency_cache()
    second = asyncio.run(
        with_reliability(
            "test.idem.reset", call,
            max_attempts=2, base_backoff=0.001,
            idempotency_key="reset-key",
        )
    )
    assert second == "call-2"
    assert state["attempts"] == 2


def test_per_attempt_timeout_triggers_retry():
    state = {"attempts": 0}

    async def call():
        state["attempts"] += 1
        if state["attempts"] < 2:
            await asyncio.sleep(0.5)  # exceeds timeout
        return "ok"

    result = asyncio.run(
        with_reliability(
            "test.timeout", call,
            timeout_seconds=0.05,
            max_attempts=3,
            base_backoff=0.001,
        )
    )
    assert result == "ok"
    assert state["attempts"] == 2


# ── Circuit breaker ────────────────────────────────────────────────────────


def test_breaker_opens_after_threshold_failures():
    breaker = get_breaker("test.flaky-provider")
    breaker.failure_threshold = 3
    breaker.cooldown_seconds = 60.0
    breaker.reset()

    async def boom():
        raise RuntimeError("upstream dead")

    for _ in range(3):
        with pytest.raises(RuntimeError):
            asyncio.run(
                with_reliability(
                    "test.flaky-provider", boom,
                    max_attempts=1, base_backoff=0.001,
                    breaker_name="test.flaky-provider",
                )
            )
    # 4th call should short-circuit with CircuitOpenError before invoking.
    with pytest.raises(CircuitOpenError):
        asyncio.run(
            with_reliability(
                "test.flaky-provider", boom,
                max_attempts=1, base_backoff=0.001,
                breaker_name="test.flaky-provider",
            )
        )


def test_breaker_recovers_after_success():
    breaker = get_breaker("test.recover")
    breaker.failure_threshold = 2
    breaker.reset()

    async def boom():
        raise RuntimeError("die")

    async def good():
        return "alive"

    for _ in range(2):
        with pytest.raises(RuntimeError):
            asyncio.run(
                with_reliability(
                    "test.recover", boom,
                    max_attempts=1, base_backoff=0.001,
                    breaker_name="test.recover",
                )
            )
    assert breaker.is_open()

    # Force half-open by zeroing the cooldown.
    breaker.cooldown_seconds = 0.0
    assert breaker.is_open() is False  # transitions open → half_open

    result = asyncio.run(
        with_reliability(
            "test.recover", good,
            max_attempts=1, base_backoff=0.001,
            breaker_name="test.recover",
        )
    )
    assert result == "alive"
    # Successful call closes the breaker.
    assert breaker.is_open() is False
