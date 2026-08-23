"""In-process rate limiting.

Ported from projectAntiv/backend/app/ratelimit.py — the *algorithm*, not the
numbers: that service protects login/password-reset endpoints against
credential stuffing and email bombing, this one protects a single OpenAI key
pool and a single Render instance against being flooded, which is a different
threat with different rules. See the bottom of this file for what changed and
why.

DESIGN
------
A sliding-window log: per key, keep the timestamps of recent hits and count
those inside the window. More accurate than a fixed window, which lets a
caller send 2x the limit across a boundary.

Deliberately in-process and dependency-free — the same reasoning as
`session.py` and `keypool.py`: this runs as a single Render instance
(`render.yaml`'s `numInstances: 1`, and for the same reason those two are
per-process). Redis would add an operational component this deployment does
not need for the traffic it actually gets.

.. warning::
   The state is per-process. Scaling to more than one instance multiplies the
   effective limit by the replica count — the same documented boundary as
   session state, and it needs solving at the same time (NEXT.md Step 2c).
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from .auth import AuthUser, get_current_user
from .config import get_settings


@dataclass(frozen=True)
class Rule:
    """`times` requests allowed per `seconds`."""

    times: int
    seconds: int


# ---------------------------------------------------------------- the rules
# Tuned for what each route actually costs, not a single blanket number.
#
# GLOBAL_PER_IP is the literal "not 10,000 requests a second" backstop —
# applied to every route by the middleware below, including /ping and
# /health, because a flood of cheap requests still saturates the one Render
# instance even if no single request costs anything.
#
# CHAT_PER_USER and UPLOAD_PER_USER are the ones that matter economically:
# every /chat or /upload call spends real OpenAI tokens against the pool. A
# real CV-building conversation runs maybe 10-15 turns; 30 in 5 minutes is
# generous for genuine use and decisive against a runaway loop or a script.
#
# GENERATE_PER_USER spends no tokens (app/tools.py's generate_resume calls no
# model — that is the entire point of the Build button) but still does real
# CPU work laying out a PDF, so it gets a looser cap rather than none.
GLOBAL_PER_IP = Rule(120, 60)       # 120 requests / minute, any route
CHAT_PER_USER = Rule(30, 300)       # 30 chat turns / 5 min
UPLOAD_PER_USER = Rule(15, 300)     # 15 uploads / 5 min — larger payloads, same account
GENERATE_PER_USER = Rule(20, 300)   # 20 renders / 5 min — cheap in tokens, not in CPU


class SlidingWindow:
    """Thread-safe sliding-window counters with bounded memory.

    A lock is required, not optional: FastAPI runs sync endpoints in a
    threadpool, so two requests genuinely execute this concurrently.
    """

    SWEEP_EVERY = 600

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def check(self, key: str, rule: Rule) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until retry."""
        now = time.monotonic()
        with self._lock:
            self._maybe_sweep(now)
            window = self._hits[key]
            cutoff = now - rule.seconds
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= rule.times:
                return max(1.0, window[0] + rule.seconds - now)
            window.append(now)
            return None

    def _maybe_sweep(self, now: float) -> None:
        """Drop keys whose entries are all stale. Caller holds the lock."""
        if now - self._last_sweep < self.SWEEP_EVERY:
            return
        self._last_sweep = now
        horizon = now - 3600
        for key in [k for k, w in self._hits.items() if not w or w[-1] <= horizon]:
            del self._hits[key]

    def reset(self) -> None:
        """Clear all counters. Used by the test suite between tests."""
        with self._lock:
            self._hits.clear()
            self._last_sweep = time.monotonic()


limiter = SlidingWindow()


def client_ip(request: Request) -> str:
    """The caller's address.

    No trusted-proxy configuration here, unlike projectAntiv's version: this
    service has exactly one deployment target (Render) with a known, fixed
    proxy depth rather than a configurable on-premise setup, so
    `request.client.host` is trustworthy as Render presents it without needing
    an `X-Forwarded-For` depth to be configured per environment.
    """
    return request.client.host if request.client else "unknown"


def _enforce(key: str, rule: Rule, what: str) -> None:
    if not get_settings().rate_limit_enabled:
        return
    retry_after = limiter.check(key, rule)
    if retry_after is None:
        return
    seconds = int(retry_after) + 1
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Too many {what}. Try again in {seconds} seconds.",
        headers={"Retry-After": str(seconds)},
    )


def limit_by_user(rule: Rule, scope: str, what: str):
    """Dependency factory keying on the authenticated user rather than the IP.

    For the routes that spend tokens or CPU: the meaningful subject is the
    account, and several visitors can legitimately share one IP (a school, an
    office, a carrier-grade NAT).
    """

    def dependency(user: AuthUser = Depends(get_current_user)) -> None:
        _enforce(f"{scope}:user:{user.id}", rule, what)

    return Depends(dependency)


class GlobalIpRateLimitMiddleware(BaseHTTPMiddleware):
    """The blanket backstop: GLOBAL_PER_IP on every route, before any of them
    run.

    A middleware rather than a per-route dependency, deliberately: a
    dependency only protects the routes it is attached to, and the whole
    point of a flood backstop is that it covers everything, including routes
    added later without anyone remembering to wire it in by hand.

    CORS preflight (`OPTIONS`) is exempted. It carries no cost and blocking it
    would silently break the *next* real request: a browser that fails a
    preflight never sends the request it was clearing, so a rate-limited
    OPTIONS reads to the visitor as the real call itself having failed.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS" or not get_settings().rate_limit_enabled:
            return await call_next(request)

        retry_after = limiter.check(f"global:ip:{client_ip(request)}", GLOBAL_PER_IP)
        if retry_after is not None:
            seconds = int(retry_after) + 1
            return JSONResponse(
                {"detail": f"Too many requests. Try again in {seconds} seconds."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(seconds)},
            )
        return await call_next(request)


# --------------------------------------------------------- what changed, and why
#
# Dropped from the projectAntiv version, because this service has no
# equivalent surface:
#   - LOGIN_PER_IP / LOGIN_PER_EMAIL / FORGOT_* / RESET_* / VERIFY_PER_USER —
#     all defend hand-rolled auth endpoints. This service has none; every
#     login, signup and password reset goes through Supabase directly, which
#     runs its own abuse protection (and its own mailer rate limit — see
#     HANDOFF.md's bug list, item 21).
#   - enforce_ip / enforce_value — per-route dependency helpers keyed on IP or
#     on a request-body value (an email address). Nothing here needs either:
#     the one IP-keyed rule is the global backstop above, applied uniformly by
#     middleware rather than opted into per route.
#
# Kept unchanged: SlidingWindow itself, the sweep logic, and the per-process
# boundary documented in the module docstring.
