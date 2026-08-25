"""Verifying the Supabase session a visitor brings with them.

VERIFICATION GOES THROUGH SUPABASE'S OWN /auth/v1/user, NOT A LOCAL JWT CHECK
-------------------------------------------------------------------------------
The alternative is decoding the JWT here with a shared signing secret. Two
things rule that out:

* **No secret to manage.** Supabase projects sign with either a shared HS256
  secret (older projects) or a rotating asymmetric key served over JWKS
  (newer ones). Plumbing either correctly into this service is one more thing
  to configure and get wrong — and the anon key already gets this service
  everything it needs.
* **Instant revocation.** A JWT verified locally reads as valid until it
  expires, even if the user is banned or has signed out everywhere in the
  meantime. Asking Supabase directly means Supabase's own revocation applies
  immediately, not at the token's natural expiry.

The cost is a network round trip per check. `get_current_user` caches a
verified token briefly (see CACHE_TTL_SECONDS) — a single visitor action
(a chat turn, an upload) triggers exactly one call to this service, so caching
saves nothing there; it only helps when the frontend fires two or three calls
in quick succession (fetching the draft right after a chat reply, for
instance), which is the actual pattern in `useResumeChat.ts`.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30
VERIFY_TIMEOUT_SECONDS = 10
# Bounds memory if a huge number of distinct tokens pass through — a login
# storm, or a client that never reuses a token. Clearing outright rather than
# evicting one at a time keeps this O(1) instead of needing an LRU structure
# for what should be a rare event.
MAX_CACHE_ENTRIES = 2_000


@dataclass
class AuthUser:
    id: str
    email: str | None
    # Kept so a route can make its own authenticated call back to Supabase
    # (Postgres via PostgREST, once Phase 2's persistence lands) without
    # re-deriving it — RLS then enforces per-user isolation at the database
    # itself, and this service never needs the service_role key.
    access_token: str


_cache: dict[str, tuple[float, AuthUser]] = {}
_cache_lock = threading.Lock()


class AuthNotConfigured(Exception):
    """SUPABASE_URL / SUPABASE_ANON_KEY are not set on this deployment."""


def _verify_with_supabase(token: str) -> AuthUser:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise AuthNotConfigured("Supabase is not configured on this service.")

    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
            timeout=VERIFY_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        logger.error("could not reach Supabase auth: %s", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Could not verify your session. Try again."
        ) from exc

    if response.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")

    body = response.json()
    user_id = body.get("id")
    if not user_id:
        # Malformed response from an endpoint that should never send one —
        # treat as unverifiable rather than trusting a partial payload.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session could not be verified.")
    return AuthUser(id=user_id, email=body.get("email"), access_token=token)


def get_current_user(authorization: str = Header(default="")) -> AuthUser:
    """FastAPI dependency: the authenticated visitor, or a 401/503.

    Expects `Authorization: Bearer <supabase-access-token>`, exactly what
    `supabase.auth.getSession()` hands the frontend.
    """
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to use the CV builder.")
    token = authorization[len("bearer "):].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to use the CV builder.")

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(token)
        if cached and cached[0] > now:
            return cached[1]

    try:
        user = _verify_with_supabase(token)
    except AuthNotConfigured as exc:
        # Distinct from "your token is bad": a deployer forgot to set two env
        # vars, and a generic 401 would send them looking at the wrong thing.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "not_configured") from exc

    with _cache_lock:
        if len(_cache) >= MAX_CACHE_ENTRIES:
            _cache.clear()
        _cache[token] = (now + CACHE_TTL_SECONDS, user)
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    """FastAPI dependency for /admin/* routes: the verified admin, or a 403.

    The email comes from Supabase's own /auth/v1/user response (see
    _verify_with_supabase), so it cannot be spoofed by the caller. Matched
    against Settings.admin_email — the same identity the portfolio's
    src/lib/adminRole.ts and the is_admin() SQL policy use. A signed-in but
    non-admin visitor (any CV-builder user) gets a 403, never data.
    """
    admin_email = (get_settings().admin_email or "").strip().lower()
    if not admin_email or (user.email or "").strip().lower() != admin_email:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access only.")
    return user
