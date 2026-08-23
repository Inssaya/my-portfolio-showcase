"""Verifying the Supabase session a visitor brings, and that a session belongs
to exactly one user.

Hits no network: httpx.get is faked at the module boundary, the same pattern
already used for OpenAI in test_llm.py. The rest of the suite overrides
get_current_user globally (see conftest.py) so it never has to think about
auth; this file is where the dependency itself gets exercised for real.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import _cache, get_current_user
from app.config import reset_settings
from app.main import app
from app.session import store
from conftest import OTHER_USER_ID, TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    _cache.clear()
    yield
    _cache.clear()
    reset_settings()


def _configure(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    reset_settings()


def _response(status_code: int, body: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=body or {},
        request=httpx.Request("GET", "https://example.supabase.co/auth/v1/user"),
    )


# --------------------------------------------------------------- verification

def test_missing_header_is_rejected() -> None:
    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="")
    assert caught.value.status_code == 401


def test_non_bearer_header_is_rejected() -> None:
    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="Basic abc123")
    assert caught.value.status_code == 401


def test_a_valid_token_is_verified_against_supabase(monkeypatch) -> None:
    _configure(monkeypatch)
    seen: dict = {}

    def fake_get(url, headers=None, timeout=None):
        seen["url"], seen["headers"] = url, headers
        return _response(200, {"id": "user-123", "email": "a@b.com"})

    monkeypatch.setattr(httpx, "get", fake_get)

    user = get_current_user(authorization="Bearer real-token")

    assert user.id == "user-123"
    assert user.email == "a@b.com"
    assert user.access_token == "real-token"
    assert seen["headers"]["Authorization"] == "Bearer real-token"
    assert seen["headers"]["apikey"] == "anon-key"
    assert seen["url"].endswith("/auth/v1/user")


def test_an_invalid_token_is_401(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(401))

    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="Bearer bad-token")
    assert caught.value.status_code == 401


def test_missing_supabase_config_is_503(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "")
    reset_settings()

    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="Bearer whatever")
    assert caught.value.status_code == 503


def test_supabase_unreachable_is_503_not_401(monkeypatch) -> None:
    """A network blip is this service's problem, not proof the token is bad —
    conflating them would tell a legitimately signed-in visitor to sign in
    again when the real issue is Supabase being briefly unreachable."""
    _configure(monkeypatch)

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "get", boom)

    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="Bearer whatever")
    assert caught.value.status_code == 503


def test_a_malformed_response_is_not_trusted(monkeypatch) -> None:
    """Supabase returning 200 with no id would otherwise be treated as a
    verified user with an empty identity."""
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, {}))

    with pytest.raises(HTTPException) as caught:
        get_current_user(authorization="Bearer whatever")
    assert caught.value.status_code == 401


def test_verified_tokens_are_cached_briefly(monkeypatch) -> None:
    _configure(monkeypatch)
    calls = {"n": 0}

    def fake_get(*a, **k):
        calls["n"] += 1
        return _response(200, {"id": "user-123"})

    monkeypatch.setattr(httpx, "get", fake_get)

    get_current_user(authorization="Bearer same-token")
    get_current_user(authorization="Bearer same-token")

    assert calls["n"] == 1, "the second call should have hit the cache"


def test_different_tokens_are_verified_independently(monkeypatch) -> None:
    _configure(monkeypatch)
    calls = {"n": 0}

    def fake_get(*a, **k):
        calls["n"] += 1
        return _response(200, {"id": f"user-{calls['n']}"})

    monkeypatch.setattr(httpx, "get", fake_get)

    first = get_current_user(authorization="Bearer token-a")
    second = get_current_user(authorization="Bearer token-b")

    assert calls["n"] == 2
    assert first.id != second.id


# ---------------------------------------------------------------- ownership

@pytest.fixture(autouse=True)
def _clean_store():
    store.reset()
    yield
    store.reset()


def test_a_session_belongs_to_its_creator() -> None:
    session = store.create(user_id=TEST_USER_ID)
    assert store.get(session.id, TEST_USER_ID) is session


def test_a_session_is_invisible_to_another_user() -> None:
    """The core guarantee: nothing in the HTTP layer needs its own ownership
    check, because the store never hands back a session that is not the
    caller's — a 404 and 'belongs to someone else' are made to look identical
    so neither leaks whether a given id exists at all."""
    session = store.create(user_id=TEST_USER_ID)
    assert store.get(session.id, OTHER_USER_ID) is None


def test_get_or_create_starts_fresh_rather_than_error_on_a_foreign_id() -> None:
    """Presenting someone else's session id — a stale localStorage value from
    a shared browser, say — must not error. It degrades to 'start a new one'
    rather than exposing or reusing their draft."""
    theirs = store.create(user_id=OTHER_USER_ID)

    mine = store.get_or_create(theirs.id, TEST_USER_ID)

    assert mine.id != theirs.id
    assert mine.user_id == TEST_USER_ID


# ------------------------------------------------------------------- HTTP

def test_an_unauthenticated_request_is_rejected() -> None:
    """The one HTTP-level auth test that must bypass the suite-wide override
    conftest.py installs so every other test can ignore this concern."""
    app.dependency_overrides.pop(get_current_user, None)
    response = TestClient(app).post("/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_health_needs_no_auth() -> None:
    """Render's health check has no bearer token to send."""
    app.dependency_overrides.pop(get_current_user, None)
    assert TestClient(app).get("/health").status_code == 200
