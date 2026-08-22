"""Scheduling work across a pool of OpenAI API keys.

WHY THIS EXISTS
---------------
OpenAI enforces rate limits *per key* (requests and tokens per minute). One key
therefore caps how many people can build a CV at once, and the cap is reached
long before the service itself is under any real load. Holding several keys and
choosing between them turns that into a throughput problem we control.

WHAT MAKES IT MORE THAN A ROUND-ROBIN
-------------------------------------
Three failure modes a naive rotation gets wrong:

* **A 429 must not reach the visitor.** A key that is rate-limited is not a
  failed request; it is the wrong key. The caller retries on a different one and
  the visitor never learns it happened. Only exhausting every key is an error.
* **A revoked or mistyped key must leave the pool.** A 401 is permanent. Left in
  rotation it would poison one request in ten, forever, and look like a flaky
  service. It is disabled on the spot and reported.
* **Load must follow what is actually in flight**, not a counter. Turns differ
  wildly in cost — an upload with a long extraction is many times a "yes, build
  it". Choosing the key with the fewest requests *currently running* spreads
  real work; round-robin spreads request counts, which is not the same thing.

Cooldowns are honoured from the provider's own `Retry-After` when it sends one,
because guessing shorter simply earns another 429.

State is per-process, which is correct for a single dyno and is the same
documented boundary as the session store. Multiple replicas would each keep
their own view and the effective limits would multiply by the replica count.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

# A 429 with no Retry-After: back off exponentially rather than hammering a key
# that has just told us to stop. Capped so one bad minute cannot park a key.
BASE_COOLDOWN_SECONDS = 2.0
MAX_COOLDOWN_SECONDS = 60.0


class NoKeyAvailable(Exception):
    """Every key is cooling down or disabled. Carries when to try again."""

    def __init__(self, retry_after: float, detail: str) -> None:
        super().__init__(detail)
        self.retry_after = retry_after


@dataclass
class KeyState:
    """One key's health. `secret` never leaves this module."""

    label: str
    secret: str = field(repr=False)

    in_flight: int = 0
    cooldown_until: float = 0.0
    consecutive_limits: int = 0
    disabled_reason: str | None = None

    requests: int = 0
    rate_limited: int = 0
    last_used: float = 0.0

    def healthy_at(self, now: float) -> bool:
        return self.disabled_reason is None and self.cooldown_until <= now

    def snapshot(self, now: float) -> dict:
        """Operational view. Deliberately contains no part of the secret."""
        return {
            "label": self.label,
            "state": (
                "disabled"
                if self.disabled_reason
                else "cooling" if self.cooldown_until > now else "ready"
            ),
            "in_flight": self.in_flight,
            "requests": self.requests,
            "rate_limited": self.rate_limited,
            "cooldown_remaining": max(0.0, round(self.cooldown_until - now, 1)),
            "disabled_reason": self.disabled_reason,
        }


class KeyPool:
    """Thread-safe. FastAPI runs sync handlers in a threadpool, so two requests
    genuinely select a key concurrently."""

    def __init__(self, secrets: list[str]) -> None:
        seen: set[str] = set()
        self._keys: list[KeyState] = []
        for secret in secrets:
            cleaned = secret.strip()
            # A duplicated key is not extra capacity — it shares one rate limit
            # while making the pool look twice its real size.
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            self._keys.append(KeyState(label=f"key-{len(self._keys) + 1}", secret=cleaned))
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._keys)

    @property
    def configured(self) -> bool:
        return bool(self._keys)

    def acquire(self, sticky: str | None = None) -> KeyState:
        """Check out the least-loaded healthy key.

        `sticky` is the label a caller used last. It is preferred only when it
        is healthy *and* no other key is carrying less work, so stickiness never
        beats balance — it just avoids pointless reshuffling under light load.
        """
        now = time.monotonic()
        with self._lock:
            if not self._keys:
                raise NoKeyAvailable(0.0, "No OpenAI API keys are configured.")

            healthy = [key for key in self._keys if key.healthy_at(now)]
            if not healthy:
                live = [k for k in self._keys if k.disabled_reason is None]
                if not live:
                    raise NoKeyAvailable(
                        0.0,
                        "Every configured API key has been disabled: "
                        + "; ".join(f"{k.label} ({k.disabled_reason})" for k in self._keys),
                    )
                wait = max(0.0, min(k.cooldown_until for k in live) - now)
                raise NoKeyAvailable(
                    wait, f"All {len(live)} keys are rate-limited for another {wait:.0f}s."
                )

            # Fewest in-flight first; oldest use breaks the tie so a cold pool
            # fans out instead of stacking everything on the first key.
            chosen = min(healthy, key=lambda k: (k.in_flight, k.last_used))
            if sticky:
                preferred = next((k for k in healthy if k.label == sticky), None)
                if preferred is not None and preferred.in_flight <= chosen.in_flight:
                    chosen = preferred

            chosen.in_flight += 1
            chosen.requests += 1
            chosen.last_used = now
            return chosen

    def release(self, key: KeyState) -> None:
        with self._lock:
            key.in_flight = max(0, key.in_flight - 1)

    def record_success(self, key: KeyState) -> None:
        with self._lock:
            key.consecutive_limits = 0
            key.cooldown_until = 0.0

    def record_rate_limited(self, key: KeyState, retry_after: float | None) -> None:
        """Park a key until it is worth using again."""
        with self._lock:
            key.rate_limited += 1
            key.consecutive_limits += 1
            # Trust the provider's own number when it sends one; it knows when
            # the window reopens and guessing shorter earns another 429.
            wait = (
                retry_after
                if retry_after and retry_after > 0
                else min(
                    MAX_COOLDOWN_SECONDS,
                    BASE_COOLDOWN_SECONDS * (2 ** (key.consecutive_limits - 1)),
                )
            )
            key.cooldown_until = time.monotonic() + min(wait, MAX_COOLDOWN_SECONDS)

    def disable(self, key: KeyState, reason: str) -> None:
        """Remove a key permanently. For 401/403 — failures no wait can fix."""
        with self._lock:
            key.disabled_reason = reason

    def snapshot(self) -> list[dict]:
        now = time.monotonic()
        with self._lock:
            return [key.snapshot(now) for key in self._keys]

    def health(self) -> dict:
        now = time.monotonic()
        with self._lock:
            return {
                "total": len(self._keys),
                "ready": sum(1 for k in self._keys if k.healthy_at(now)),
                "cooling": sum(
                    1 for k in self._keys if k.disabled_reason is None and k.cooldown_until > now
                ),
                "disabled": sum(1 for k in self._keys if k.disabled_reason is not None),
            }
