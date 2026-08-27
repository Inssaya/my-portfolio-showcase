"""The guest ceiling: one conversation's token total.

Two ceilings exist and they are deliberately different shapes (app/quota.py).
This file is the guest one — per *conversation*, because a guest identity is
free to mint and a longer-term figure keyed on it would measure nothing. The
account one is weekly and lives in test_weekly_quota.py.

Neither is a per-minute limit; that is app/ratelimit.py, and a "too many
requests" message from the model can only ever be OpenAI's own, relayed.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.agent import SessionBudgetExceeded, run_turn
from app.auth import AuthUser, get_current_user
from app.config import get_settings, reset_settings
from app.llm import Completion
from app.main import app
from app.session import store
from conftest import TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()
    reset_settings()


def _reply(monkeypatch, completion: Completion):
    monkeypatch.setattr(
        agent_module, "complete", lambda *a, **k: completion
    )


def _guest(**kwargs):
    """A session belonging to a visitor who has not signed up."""
    session = store.create(**kwargs)
    session.is_anonymous = True
    return session


def test_budget_default_clears_a_full_interview() -> None:
    """Measured: ~12.7k by upload, ~34.7k by full interview. A ceiling near
    that would cut a real interview off partway, with the draft written and no
    PDF — the worst possible moment. It has to leave room to revise, too."""
    assert get_settings().guest_session_tokens >= 60_000


def test_turn_is_refused_once_the_budget_is_spent(monkeypatch) -> None:
    session = _guest(user_id=TEST_USER_ID)
    session.usage.add(get_settings().guest_session_tokens, 0)
    _reply(monkeypatch, Completion(content="should never run"))

    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hello")


def test_the_check_happens_before_any_spend(monkeypatch) -> None:
    """Stopping mid-turn would bill for the rounds already spent and still
    leave the visitor without an answer."""
    session = _guest(user_id=TEST_USER_ID)
    session.usage.add(get_settings().guest_session_tokens, 0)

    def explode(*args, **kwargs):
        raise AssertionError("the model must not be called over budget")

    monkeypatch.setattr(agent_module, "complete", explode)

    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hello")
    assert session.history == [], "the message must not be recorded either"


def test_an_exhausted_session_can_still_build_its_cv(monkeypatch) -> None:
    """The whole reason the Build button bypasses the model: running out of
    conversation must never mean losing the CV."""
    # As a guest over the wire, not just in the store: the flag is re-stamped
    # from the verified token on every request (that is what makes signing up
    # take effect mid-session), so the caller has to be one for the guest
    # ceiling to apply at all.
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=TEST_USER_ID, email=None, access_token="t", is_anonymous=True
    )
    client = TestClient(app)
    session = _guest(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("skills", "Finance: Budgeting")
    session.usage.add(get_settings().guest_session_tokens, 0)

    chat = client.post("/chat", json={"message": "hi", "session_id": session.id})
    assert chat.status_code == 429
    assert chat.json()["detail"]["budget_exhausted"] is True

    built = client.post(f"/generate/{session.id}")
    assert built.status_code == 200
    assert built.json()["pdf_ready"] is True


def test_the_refusal_tells_them_their_work_is_safe(monkeypatch) -> None:
    """A guest reading "limit reached" assumes the CV is gone. It is not: the
    draft is intact, the Build button renders it without the model, a new
    conversation starts fresh, and an account keeps all of it."""
    session = _guest(user_id=TEST_USER_ID)
    session.usage.add(get_settings().guest_session_tokens, 0)

    with pytest.raises(SessionBudgetExceeded) as caught:
        run_turn(session, "hello")

    message = str(caught.value).lower()
    assert "build" in message
    assert "account" in message


def test_budget_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setenv("GUEST_SESSION_TOKENS", "0")
    reset_settings()

    session = _guest(user_id=TEST_USER_ID)
    session.usage.add(999_999, 0)
    _reply(monkeypatch, Completion(content="fine"))

    assert run_turn(session, "hello")["reply"] == "fine"


def test_a_signed_up_visitor_has_no_per_session_ceiling(monkeypatch) -> None:
    """The shapes really are different. An account is rationed weekly across
    every conversation instead, so one long conversation is not the thing that
    runs out — see test_weekly_quota.py."""
    session = store.create(user_id=TEST_USER_ID)
    session.is_anonymous = False
    session.usage.add(999_999, 0)
    _reply(monkeypatch, Completion(content="carry on"))

    assert run_turn(session, "hello")["reply"] == "carry on"
