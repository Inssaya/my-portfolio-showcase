"""Postgres persistence for CV sessions, via Supabase's PostgREST endpoint.

WRITES THROUGH WITH THE VISITOR'S OWN ACCESS TOKEN, NEVER service_role
------------------------------------------------------------------------
Same boundary app/auth.py already keeps: this service holds only the anon
key, and every read or write happens as the visitor themselves, so Postgres'
own row-level security (see supabase/setup.sql's cv_sessions/cv_messages
policies) enforces per-user isolation at the database — this module does not
re-implement that check, it just carries the token through.

BEST-EFFORT, NEVER FATAL
-------------------------
A visitor waiting on a chat reply must never see a 500 because Postgres had a
bad moment. Every function here returns None/False on any failure instead of
raising; app/session.py logs the miss and moves on. Losing one write here
costs nothing but staleness — the session's real state is still whatever this
process holds right now, and the next save catches Postgres back up.
"""
from __future__ import annotations

import logging

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 10


def persistence_configured() -> bool:
    """Persistence piggybacks on the same project auth already needs — see
    Settings.auth_configured. No separate on/off switch: if auth works, so
    does this."""
    return get_settings().auth_configured


def _base_url() -> str:
    return f"{get_settings().supabase_url.rstrip('/')}/rest/v1"


def _headers(access_token: str, *, prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": get_settings().supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def load_session_row(session_id: str, access_token: str) -> dict | None:
    """The session's row plus its messages in one round trip, or None if it
    does not exist, is unreachable, or (via RLS) belongs to someone else."""
    try:
        response = httpx.get(
            f"{_base_url()}/cv_sessions",
            params={
                "id": f"eq.{session_id}",
                "select": "*,cv_messages(role,content,tool_name,tool_arguments,id)",
                "cv_messages.order": "id.asc",
            },
            headers=_headers(access_token),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("could not load session %s from Postgres: %s", session_id, exc)
        return None
    rows = response.json()
    return rows[0] if rows else None


def create_session_row(row: dict, access_token: str) -> bool:
    try:
        response = httpx.post(
            f"{_base_url()}/cv_sessions",
            json=row,
            headers=_headers(access_token, prefer="return=minimal"),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("could not create session %s in Postgres: %s", row.get("id"), exc)
        return False


def update_session_row(session_id: str, row: dict, access_token: str) -> bool:
    try:
        response = httpx.patch(
            f"{_base_url()}/cv_sessions",
            params={"id": f"eq.{session_id}"},
            json=row,
            headers=_headers(access_token, prefer="return=minimal"),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("could not save session %s to Postgres: %s", session_id, exc)
        return False


def store_upload(
    session_id: str,
    user_id: str,
    filename: str,
    content_type: str,
    data: bytes,
    access_token: str,
) -> bool:
    """Persist one uploaded file (base64 in cv_uploads) so the admin can later
    download exactly what the visitor sent — for reviewing chatbot quality.

    Best-effort like save(): a failure here must never break the upload the
    visitor is waiting on, so it is logged and swallowed. RLS ("own uploads
    insert") ties the row to the writer; only the admin can read it back."""
    import base64

    payload = {
        "session_id": session_id,
        "user_id": user_id,
        "filename": filename,
        "content_type": content_type or "application/octet-stream",
        "byte_size": len(data),
        "content_base64": base64.b64encode(data).decode("ascii"),
    }
    try:
        response = httpx.post(
            f"{_base_url()}/cv_uploads",
            json=payload,
            headers=_headers(access_token, prefer="return=minimal"),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning("could not store upload for session %s: %s", session_id, exc)
        return False


def list_session_rows(access_token: str, user_id: str) -> list[dict]:
    """Every session this visitor owns, newest first — powers "History".

    Filtered explicitly by user_id, NOT left to RLS alone: the admin account
    also has an "admin read sessions" policy (for the admin panel), so without
    this filter the owner's own History would show every user's sessions. The
    filter scopes the personal listing to the caller regardless of policy.

    An empty list covers both "no CVs yet" and "could not reach Postgres",
    which is the right default for a listing (never surface a database hiccup
    as if the visitor's history was wiped)."""
    try:
        response = httpx.get(
            f"{_base_url()}/cv_sessions",
            params={
                "select": "id,draft,style,language,pdf_version,created_at,updated_at",
                "user_id": f"eq.{user_id}",
                "order": "updated_at.desc",
            },
            headers=_headers(access_token),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("could not list sessions from Postgres: %s", exc)
        return []
    return response.json()


def append_messages(session_id: str, messages: list[dict], access_token: str) -> bool:
    """Insert only the transcript entries the caller has not already saved —
    see Session._persisted_message_count, which tracks that cursor so a
    session's whole history is never re-sent on every turn."""
    if not messages:
        return True
    payload = [{"session_id": session_id, **message} for message in messages]
    try:
        response = httpx.post(
            f"{_base_url()}/cv_messages",
            json=payload,
            headers=_headers(access_token, prefer="return=minimal"),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        logger.warning(
            "could not save %d message(s) for session %s: %s", len(messages), session_id, exc
        )
        return False
