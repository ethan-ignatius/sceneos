"""
Distributed-system primitives for the SceneOS pipeline.

The agentic pipeline is a small distributed system: every external call
(Imagen, Veo submit + poll, Gemini, Anthropic, Lyria, Cloudinary upload) is
network-bound and intermittently flaky. The pipeline used to crash on the
first transient failure and surface raw stack traces to the user. This
module gives every external call a uniform reliability skin:

  - exponential backoff with jitter
  - retryable-vs-terminal classification (HTTP 4xx, ValueError, TypeError → never retry)
  - per-call async timeout
  - per-provider circuit breaker so a dead provider is short-circuited
    instead of burning latency on every request
  - structured trace events (one log line per attempt) so failure modes
    are diagnosable post-hoc instead of reading 500 lines of stack traces

Public surface:

  await with_reliability(
      "imagen.generate",
      lambda: imagen_call(...),
      *,
      timeout_seconds=30.0,
      max_attempts=3,
      idempotency_key=f"{project_id}:{beat_id}:character",
  )

  CIRCUIT_BREAKERS["vertex.veo"].is_open()  # for fan-out callers that want
                                             # to skip a known-dead provider

Design choices that matter:

  - Retries CAN cause double-charges on idempotency-violating providers
    (e.g. Veo predictLongRunning is fire-and-poll, retrying will create a
    second job and waste quota). Callers that submit jobs MUST pass an
    idempotency_key — when present, we look up the previous result in a
    process-local cache before retrying. For pure fetches (Imagen,
    Cloudinary upload) the key is optional.

  - The breaker is intentionally simple: open after `failure_threshold`
    consecutive failures, half-open after `cooldown_seconds`, close on the
    first success. No sliding-window math. If a provider is dead we want
    fast fail, not statistical analysis.

  - We log to stdlib logging (logger name "sceneos.reliability") with
    a structured `extra` dict. Production deployments can ship these to
    Cloud Logging / Datadog without code changes.

  - Backoff lives in `_compute_backoff`. The jitter is full ±50% of the
    nominal delay so 7-way concurrent retries don't synchronize.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterable


logger = logging.getLogger("sceneos.reliability")


# ── Retryability ────────────────────────────────────────────────────────────


# Exception types that are deterministic bugs — retrying them is wasteful
# and masks the real bug. Anything else is treated as transient.
_NEVER_RETRY: tuple[type[BaseException], ...] = (
    ValueError,
    TypeError,
    KeyError,
    AttributeError,
    NotImplementedError,
    AssertionError,
)


def _is_retryable(exc: BaseException) -> bool:
    """Decide whether `exc` is worth retrying.

    Hard rule: programming errors (ValueError/TypeError/KeyError/etc.) are
    never retried — those are deterministic and retrying them just turns a
    1s failure into a 7s failure.

    For HTTPX errors we also short-circuit 4xx (auth, malformed payload,
    public_id collision) — retrying a 401 is pointless. 5xx + transport
    errors stay retryable.
    """
    if isinstance(exc, _NEVER_RETRY):
        return False

    # httpx.HTTPStatusError carries a response. 4xx → terminal, 5xx → retry.
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int) and 400 <= status_code < 500:
        # 408 Request Timeout and 429 Too Many Requests are transient by spec.
        if status_code in (408, 429):
            return True
        return False
    return True


# ── Backoff ─────────────────────────────────────────────────────────────────


def _compute_backoff(attempt: int, *, base: float = 1.0, factor: float = 2.0, cap: float = 30.0) -> float:
    """Exponential backoff with full ±50% jitter.

    attempt is 1-indexed: attempt=1 → base, attempt=2 → base*factor, etc.
    Jitter is critical when 7 beats fan out concurrently — without it,
    every beat retries at the same instant and DOSes the upstream.
    """
    nominal = min(cap, base * (factor ** max(0, attempt - 1)))
    jitter = random.uniform(0.5, 1.5)
    return nominal * jitter


# ── Circuit breaker ─────────────────────────────────────────────────────────


@dataclass
class CircuitBreaker:
    """Lightweight three-state breaker keyed by provider name.

    States:
      closed     — calls flow through. Failures increment the counter.
      open       — calls short-circuit immediately with CircuitOpenError.
                   Stays open until cooldown_seconds elapse since open_at.
      half_open  — one trial call is allowed. Success closes; failure re-opens.

    Callers can ALSO read `is_open()` to decide whether to bother trying a
    provider at all (e.g. for speculative kickoff fan-out where we'd rather
    skip dead providers than burn latency).
    """

    name: str
    failure_threshold: int = 4
    cooldown_seconds: float = 30.0

    _state: str = field(default="closed", init=False)
    _failures: int = field(default=0, init=False)
    _opened_at: float = field(default=0.0, init=False)

    def is_open(self) -> bool:
        """Is the breaker currently rejecting calls?"""
        if self._state == "open" and self._cooldown_elapsed():
            self._state = "half_open"
            logger.info(
                "[breaker] %s half-open (cooldown elapsed)",
                self.name,
                extra={"breaker": self.name, "transition": "open->half_open"},
            )
        return self._state == "open"

    def record_success(self) -> None:
        if self._state != "closed":
            logger.info(
                "[breaker] %s closed (recovered)",
                self.name,
                extra={"breaker": self.name, "transition": f"{self._state}->closed"},
            )
        self._state = "closed"
        self._failures = 0

    def record_failure(self) -> None:
        self._failures += 1
        if self._state == "half_open" or self._failures >= self.failure_threshold:
            prev = self._state
            self._state = "open"
            self._opened_at = time.monotonic()
            logger.warning(
                "[breaker] %s open (failures=%d)",
                self.name,
                self._failures,
                extra={"breaker": self.name, "transition": f"{prev}->open", "failures": self._failures},
            )

    def _cooldown_elapsed(self) -> bool:
        return (time.monotonic() - self._opened_at) >= self.cooldown_seconds

    def reset(self) -> None:
        """Test seam — wipe state without going through transitions."""
        self._state = "closed"
        self._failures = 0
        self._opened_at = 0.0


class CircuitOpenError(RuntimeError):
    """Raised when a circuit breaker rejects a call without invoking it."""

    def __init__(self, breaker_name: str):
        super().__init__(f"circuit breaker {breaker_name!r} is open — provider considered unavailable")
        self.breaker_name = breaker_name


# Process-local registry. Breakers are referenced by name across modules.
CIRCUIT_BREAKERS: dict[str, CircuitBreaker] = {}


def get_breaker(name: str) -> CircuitBreaker:
    if name not in CIRCUIT_BREAKERS:
        CIRCUIT_BREAKERS[name] = CircuitBreaker(name=name)
    return CIRCUIT_BREAKERS[name]


def reset_all_breakers() -> None:
    """Test seam used by tests to keep state clean across suites."""
    for breaker in CIRCUIT_BREAKERS.values():
        breaker.reset()


# ── Idempotency ─────────────────────────────────────────────────────────────


# In-process cache of completed call results, keyed by idempotency key.
# Used so that a retry after a successful submit (e.g. Veo accepted but the
# response parse blew up) doesn't double-submit. TTL is intentionally short
# (10 minutes) — long enough to absorb retries, short enough that stale
# state doesn't pile up.
_IDEMPOTENCY_TTL_SECONDS = 600
_IDEMPOTENCY_CACHE: dict[str, tuple[float, Any]] = {}


def _idempotency_get(key: str) -> Any | None:
    if key not in _IDEMPOTENCY_CACHE:
        return None
    expires_at, value = _IDEMPOTENCY_CACHE[key]
    if expires_at < time.monotonic():
        _IDEMPOTENCY_CACHE.pop(key, None)
        return None
    return value


def _idempotency_put(key: str, value: Any) -> None:
    _IDEMPOTENCY_CACHE[key] = (time.monotonic() + _IDEMPOTENCY_TTL_SECONDS, value)


def reset_idempotency_cache() -> None:
    """Test seam."""
    _IDEMPOTENCY_CACHE.clear()


# ── Public entry point ─────────────────────────────────────────────────────


async def with_reliability(
    name: str,
    fn: Callable[[], Awaitable[Any]],
    *,
    timeout_seconds: float = 60.0,
    max_attempts: int = 3,
    base_backoff: float = 1.0,
    idempotency_key: str | None = None,
    breaker_name: str | None = None,
    never_retry: Iterable[type[BaseException]] = (),
) -> Any:
    """Run `fn()` with retry + timeout + breaker + idempotency.

    Args:
      name: short label for logs (e.g. "imagen.generate", "veo.submit").
      fn: async zero-arg callable. Must be safe to invoke multiple times
          unless `idempotency_key` is given.
      timeout_seconds: per-attempt async timeout.
      max_attempts: total tries. 1 = no retry; 3 is the sane default.
      base_backoff: backoff seconds at attempt=1; doubles each retry.
      idempotency_key: optional. When set, a successful call's result is
          cached for 10 minutes — subsequent calls with the same key return
          immediately without re-invoking `fn`.
      breaker_name: optional. When set, calls are gated on the named
          breaker. Defaults to `name` if a breaker has been registered there.
      never_retry: exception types to add to the no-retry set (per-call).

    Raises the last exception on exhaustion or CircuitOpenError if the
    breaker is open at call time.
    """
    if idempotency_key is not None:
        cached = _idempotency_get(idempotency_key)
        if cached is not None:
            logger.info(
                "[%s] idempotency hit", name,
                extra={"call": name, "idempotency_key": idempotency_key, "outcome": "cache_hit"},
            )
            return cached

    breaker = get_breaker(breaker_name) if breaker_name else None
    if breaker and breaker.is_open():
        logger.warning(
            "[%s] breaker open — skipping call", name,
            extra={"call": name, "breaker": breaker.name, "outcome": "breaker_open"},
        )
        raise CircuitOpenError(breaker.name)

    last_exc: BaseException | None = None
    extra_no_retry = tuple(never_retry)

    for attempt in range(1, max_attempts + 1):
        started = time.monotonic()
        try:
            result = await asyncio.wait_for(fn(), timeout=timeout_seconds)
        except asyncio.TimeoutError as exc:
            last_exc = exc
            logger.warning(
                "[%s] attempt %d/%d timed out after %.1fs",
                name, attempt, max_attempts, timeout_seconds,
                extra={"call": name, "attempt": attempt, "outcome": "timeout"},
            )
            if breaker:
                breaker.record_failure()
            if attempt >= max_attempts:
                break
            await asyncio.sleep(_compute_backoff(attempt, base=base_backoff))
            continue
        except BaseException as exc:
            last_exc = exc
            elapsed = time.monotonic() - started
            terminal = isinstance(exc, _NEVER_RETRY) or isinstance(exc, extra_no_retry) or not _is_retryable(exc)
            logger.warning(
                "[%s] attempt %d/%d failed in %.2fs: %s: %s",
                name, attempt, max_attempts, elapsed, type(exc).__name__, exc,
                extra={
                    "call": name,
                    "attempt": attempt,
                    "outcome": "terminal_error" if terminal else "transient_error",
                    "exc_type": type(exc).__name__,
                },
            )
            if breaker:
                breaker.record_failure()
            if terminal or attempt >= max_attempts:
                break
            await asyncio.sleep(_compute_backoff(attempt, base=base_backoff))
            continue

        elapsed = time.monotonic() - started
        logger.info(
            "[%s] attempt %d/%d ok in %.2fs",
            name, attempt, max_attempts, elapsed,
            extra={"call": name, "attempt": attempt, "outcome": "success", "elapsed_s": round(elapsed, 3)},
        )
        if breaker:
            breaker.record_success()
        if idempotency_key is not None:
            _idempotency_put(idempotency_key, result)
        return result

    assert last_exc is not None
    raise last_exc
