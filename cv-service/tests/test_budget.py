"""The per-session token ceiling.

Not a per-minute limit — this service has none; a "too many requests" message
can only ever be OpenAI's own, relayed. This is a ceiling on one conversation,
so a single runaway session cannot spend without bound.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.agent import SessionBudgetExceeded, run_turn
from app.config import get_settings, reset_settings
from app.llm import Completion
from app.main import app
from app.session import store


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


def test_budget_default_clears_a_full_interview() -> None:
    """Measured: ~12.7k by upload, ~34.7k by full interview. A 30k ceiling
    would cut a real interview off partway, with the draft written and no PDF —
    the worst possible moment."""
    assert get_settings().max_session_tokens >= 40_000


def test_turn_is_refused_once_the_budget_is_spent(monkeypatch) -> None:
    session = store.create()
    session.usage.add(get_settings().max_session_tokens, 0)
    _reply(monkeypatch, Completion(content="should never run"))

    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hello")


def test_the_check_happens_before_any_spend(monkeypatch) -> None:
    """Stopping mid-turn would bill for the rounds already spent and still
    leave the visitor without an answer."""
    session = store.create()
    session.usage.add(get_settings().max_session_tokens, 0)

    def explode(*args, **kwargs):
        raise AssertionError("the model must not be called over budget")

    monkeypatch.setattr(agent_module, "complete", explode)

    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hello")
    assert session.history == [], "the message must not be recorded either"


def test_an_exhausted_session_can_still_build_its_cv(monkeypatch) -> None:
    """The whole reason the Build button bypasses the model: running out of
    conversation must never mean losing the CV."""
    client = TestClient(app)
    session = store.create()
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("skills", "Finance: Budgeting")
    session.usage.add(get_settings().max_session_tokens, 0)

    chat = client.post("/chat", json={"message": "hi", "session_id": session.id})
    assert chat.status_code == 429
    assert chat.json()["detail"]["budget_exhausted"] is True

    built = client.post(f"/generate/{session.id}")
    assert built.status_code == 200
    assert built.json()["pdf_ready"] is True


def test_budget_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setenv("MAX_SESSION_TOKENS", "0")
    reset_settings()

    session = store.create()
    session.usage.add(999_999, 0)
    _reply(monkeypatch, Completion(content="fine"))

    assert run_turn(session, "hello")["reply"] == "fine"
