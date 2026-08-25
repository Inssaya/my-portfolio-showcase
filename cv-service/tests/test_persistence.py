"""Postgres persistence: app/db.py's PostgREST calls, and SessionStore's
write-through/read-on-miss behaviour built on top of them.

Hits no real network — httpx.get/post/patch are faked at the module boundary,
the same pattern test_auth.py uses for /auth/v1/user. tests/conftest.py's
`_no_real_supabase` fixture blanks SUPABASE_URL/ANON_KEY before every test, so
`_configure()` here opts a given test back into a *fake* configured project.
"""
from __future__ import annotations

import httpx
import pytest

from fastapi.testclient import TestClient

from app import db
from app.config import reset_settings
from app.main import app
from app.session import Session, SessionStore

TEST_USER_ID = "00000000-0000-4000-8000-000000000001"
OTHER_USER_ID = "00000000-0000-4000-8000-000000000002"


def _configure(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    reset_settings()


@pytest.fixture(autouse=True)
def _clean():
    yield
    reset_settings()


def _response(status_code: int, body) -> httpx.Response:
    return httpx.Response(
        status_code, json=body, request=httpx.Request("GET", "https://example.supabase.co/x")
    )


def _forbid_network(monkeypatch) -> None:
    """Any of these being called is the bug under test — a real network call
    from what must stay a hermetic, offline suite."""
    def boom(*a, **k):
        raise AssertionError("no network call should have been attempted")
    monkeypatch.setattr(httpx, "get", boom)
    monkeypatch.setattr(httpx, "post", boom)
    monkeypatch.setattr(httpx, "patch", boom)


# ------------------------------------------------------------- persistence_configured

def test_not_configured_without_supabase_env() -> None:
    assert db.persistence_configured() is False


def test_configured_once_supabase_env_is_set(monkeypatch) -> None:
    _configure(monkeypatch)
    assert db.persistence_configured() is True


# ------------------------------------------------------------------------ db.py

def test_load_session_row_returns_none_on_miss(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, []))
    assert db.load_session_row("some-id", "token") is None


def test_load_session_row_returns_the_row(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {"id": "s1", "user_id": TEST_USER_ID, "draft": {}, "cv_messages": []}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))
    assert db.load_session_row("s1", "token") == row


def test_load_session_row_swallows_network_errors(monkeypatch) -> None:
    _configure(monkeypatch)

    def boom(*a, **k):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx, "get", boom)

    assert db.load_session_row("s1", "token") is None


def test_load_session_row_swallows_http_error_status(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(500, {}))
    assert db.load_session_row("s1", "token") is None


def test_create_session_row_sends_the_row(monkeypatch) -> None:
    _configure(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["url"], seen["json"], seen["headers"] = url, json, headers
        return _response(201, {})
    monkeypatch.setattr(httpx, "post", fake_post)

    ok = db.create_session_row({"id": "s1", "user_id": TEST_USER_ID}, "token")

    assert ok is True
    assert seen["url"].endswith("/cv_sessions")
    assert seen["json"] == {"id": "s1", "user_id": TEST_USER_ID}
    assert seen["headers"]["Authorization"] == "Bearer token"
    assert seen["headers"]["apikey"] == "anon-key"
    assert seen["headers"]["Prefer"] == "return=minimal"


def test_create_session_row_failure_is_reported_not_raised(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _response(400, {}))
    assert db.create_session_row({"id": "s1"}, "token") is False


def test_update_session_row_filters_by_id(monkeypatch) -> None:
    _configure(monkeypatch)
    seen = {}

    def fake_patch(url, params=None, json=None, headers=None, timeout=None):
        seen["params"] = params
        return _response(204, {})
    monkeypatch.setattr(httpx, "patch", fake_patch)

    assert db.update_session_row("s1", {"draft": {}}, "token") is True
    assert seen["params"] == {"id": "eq.s1"}


def test_append_messages_is_a_noop_for_an_empty_list(monkeypatch) -> None:
    _forbid_network(monkeypatch)
    assert db.append_messages("s1", [], "token") is True


def test_append_messages_tags_each_row_with_the_session(monkeypatch) -> None:
    _configure(monkeypatch)
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        seen["json"] = json
        return _response(201, {})
    monkeypatch.setattr(httpx, "post", fake_post)

    ok = db.append_messages("s1", [{"role": "user", "content": "hi"}], "token")

    assert ok is True
    assert seen["json"] == [{"session_id": "s1", "role": "user", "content": "hi"}]


def test_list_session_rows_returns_what_postgrest_sends(monkeypatch) -> None:
    _configure(monkeypatch)
    rows = [{"id": "s1", "draft": {"full_name": "Jane"}}, {"id": "s2", "draft": {}}]
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, rows))
    assert db.list_session_rows("token") == rows


def test_list_session_rows_degrades_to_empty_on_failure(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(500, {}))
    assert db.list_session_rows("token") == []


# ------------------------------------------------------------- Session rows

def test_to_row_excludes_photo_and_pdf_bytes() -> None:
    session = Session(id="s1", user_id=TEST_USER_ID)
    session.photo = b"\x89PNG"
    session.pdf = b"%PDF"
    row = session.to_row()
    assert "photo" not in row
    assert "pdf" not in row
    assert row["id"] == "s1"
    assert row["user_id"] == TEST_USER_ID


def test_from_row_round_trips_draft_style_language_usage() -> None:
    session = Session(id="s1", user_id=TEST_USER_ID)
    session.set_field("full_name", "Jane Doe")
    session.style = "classic"
    session.language = "fr"
    session.usage.add(prompt=100, completion=50)
    session.pdf_version = 3

    restored = Session.from_row(session.to_row())

    assert restored.draft == session.draft
    assert restored.style == "classic"
    assert restored.language == "fr"
    assert restored.usage.prompt == 100
    assert restored.usage.completion == 50
    assert restored.pdf_version == 3
    assert restored.photo is None
    assert restored.pdf is None
    assert restored.history == []


def test_from_row_rebuilds_the_transcript_and_sets_the_persisted_cursor() -> None:
    row = {
        "id": "s1",
        "user_id": TEST_USER_ID,
        "draft": {},
        "cv_messages": [
            {"role": "user", "content": "hi"},
            {"role": "tool", "content": "saved", "tool_name": "update_resume", "tool_arguments": {"a": 1}},
        ],
    }
    session = Session.from_row(row)

    assert session.transcript == [
        {"role": "user", "content": "hi"},
        {"role": "tool", "content": "saved", "name": "update_resume", "arguments": {"a": 1}},
    ]
    # Already-loaded messages must not be re-sent on the next save().
    assert session._persisted_message_count == 2


# --------------------------------------------------------------- SessionStore

def test_no_token_never_touches_the_network(monkeypatch) -> None:
    """The default path for every existing direct-call test in this suite:
    no access_token means pure in-memory behaviour, unchanged."""
    _configure(monkeypatch)
    _forbid_network(monkeypatch)
    store = SessionStore()

    session = store.create(TEST_USER_ID)
    fetched = store.get(session.id, TEST_USER_ID)
    store.save(session)

    assert fetched is session


def test_not_configured_never_touches_the_network(monkeypatch) -> None:
    """No SUPABASE_URL/ANON_KEY: even with a token, persistence is a no-op."""
    _forbid_network(monkeypatch)
    store = SessionStore()

    session = store.create(TEST_USER_ID, access_token="token")
    store.save(session, access_token="token")

    assert store.get(session.id, TEST_USER_ID, access_token="token") is session


def test_create_with_a_token_inserts_a_row(monkeypatch) -> None:
    _configure(monkeypatch)
    seen = {}
    monkeypatch.setattr(
        httpx, "post",
        lambda url, json=None, headers=None, timeout=None: (seen.update(json=json) or _response(201, {})),
    )
    store = SessionStore()

    session = store.create(TEST_USER_ID, access_token="token")

    assert seen["json"]["id"] == session.id
    assert seen["json"]["user_id"] == TEST_USER_ID


def test_get_falls_through_to_postgres_on_a_local_miss(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {
        "id": "s1", "user_id": TEST_USER_ID, "draft": {"full_name": "Jane"},
        "style": "modern", "language": "en", "prompt_tokens": 10, "completion_tokens": 5,
        "pdf_version": 1, "cv_messages": [],
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))
    store = SessionStore()

    restored = store.get("s1", TEST_USER_ID, access_token="token")

    assert restored is not None
    assert restored.draft == {"full_name": "Jane"}
    assert restored.usage.prompt == 10
    # Re-cached: a second get() must not need Postgres again.
    monkeypatch.setattr(httpx, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("hit twice")))
    assert store.get("s1", TEST_USER_ID, access_token="token") is restored


def test_get_restore_refuses_a_row_owned_by_someone_else(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {"id": "s1", "user_id": OTHER_USER_ID, "draft": {}, "cv_messages": []}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))
    store = SessionStore()

    assert store.get("s1", TEST_USER_ID, access_token="token") is None


def test_get_or_create_restores_before_creating_new(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {"id": "s1", "user_id": TEST_USER_ID, "draft": {"full_name": "Jane"}, "cv_messages": []}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not have created a new session")),
    )
    store = SessionStore()

    session = store.get_or_create("s1", TEST_USER_ID, access_token="token")

    assert session.draft == {"full_name": "Jane"}


def test_save_sends_only_messages_not_already_persisted(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "patch", lambda *a, **k: _response(204, {}))
    posted: list = []
    monkeypatch.setattr(
        httpx, "post",
        lambda url, json=None, headers=None, timeout=None: (posted.append(json) or _response(201, {})),
    )
    store = SessionStore()
    session = store.create(TEST_USER_ID)  # no token: no insert row consumed here
    session.transcript.append({"role": "user", "content": "hi"})

    store.save(session, access_token="token")
    assert posted == [[{"session_id": session.id, "role": "user", "content": "hi",
                         "tool_name": None, "tool_arguments": None}]]

    # A second save with no new messages must not resend the first one.
    store.save(session, access_token="token")
    assert len(posted) == 1

    session.transcript.append({"role": "assistant", "content": "hello"})
    store.save(session, access_token="token")
    assert len(posted) == 2
    assert posted[1][0]["content"] == "hello"


def test_sessions_route_is_empty_when_not_configured() -> None:
    client = TestClient(app)
    response = client.get("/sessions")
    assert response.status_code == 200
    assert response.json() == {"sessions": []}


def test_sessions_route_shapes_rows_for_the_frontend(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {
        "id": "s1", "draft": {"full_name": "Jane Doe"}, "style": "modern",
        "language": "en", "pdf_version": 2, "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))

    response = TestClient(app).get("/sessions")

    assert response.status_code == 200
    assert response.json() == {
        "sessions": [{
            "id": "s1", "name": "Jane Doe", "style": "modern", "language": "en",
            "pdf_version": 2, "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
        }]
    }


def test_sessions_route_falls_back_to_no_name_for_an_empty_draft(monkeypatch) -> None:
    _configure(monkeypatch)
    row = {"id": "s1", "draft": {}, "style": "modern", "language": "en", "pdf_version": 0}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _response(200, [row]))

    response = TestClient(app).get("/sessions")

    assert response.json()["sessions"][0]["name"] is None


def test_save_does_not_advance_the_cursor_when_the_write_fails(monkeypatch) -> None:
    _configure(monkeypatch)
    monkeypatch.setattr(httpx, "patch", lambda *a, **k: _response(204, {}))
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _response(500, {}))
    store = SessionStore()
    session = store.create(TEST_USER_ID)
    session.transcript.append({"role": "user", "content": "hi"})

    store.save(session, access_token="token")

    assert session._persisted_message_count == 0


# --------------------------------------------------------------- store_upload

def test_store_upload_posts_base64_of_the_file(monkeypatch) -> None:
    _configure(monkeypatch)
    captured: dict = {}

    def fake_post(url, *a, **k):
        captured["url"] = url
        captured["json"] = k.get("json")
        return _response(201, {})

    monkeypatch.setattr(httpx, "post", fake_post)

    ok = db.store_upload("sess-1", "user-1", "kenza.pdf", "application/pdf", b"PDFDATA", "token")

    assert ok is True
    assert captured["url"].endswith("/cv_uploads")
    body = captured["json"]
    assert body["session_id"] == "sess-1"
    assert body["user_id"] == "user-1"
    assert body["filename"] == "kenza.pdf"
    assert body["byte_size"] == len(b"PDFDATA")
    import base64
    assert base64.b64decode(body["content_base64"]) == b"PDFDATA"


def test_store_upload_swallows_network_errors(monkeypatch) -> None:
    _configure(monkeypatch)

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)

    assert db.store_upload("s", "u", "f.pdf", "application/pdf", b"x", "token") is False
