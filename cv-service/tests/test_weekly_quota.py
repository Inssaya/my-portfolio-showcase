"""The account ceiling: a rolling week, across every conversation.

Signing up changes the *shape* of the limit, not just the number. A guest is
capped per conversation; an account is capped per week and has no per-session
ceiling at all — they can start as many CVs as they like and revise one for as
long as they need.

That shape only works if the week survives a restart, which is why the figure
is read from the `cv_usage` ledger in Postgres rather than from memory: a
single Render instance restarts routinely, and an in-process window would
silently reset itself on every deploy. These tests pin the parts of that which
would fail quietly — most of all that a database that cannot answer lets the
visitor through instead of refusing them.
"""
from __future__ import annotations

import pytest

from app import agent as agent_module
from app import db as db_module
from app import quota
from app.agent import run_turn
from app.config import get_settings, reset_settings
from app.llm import Completion
from app.session import store

MEMBER = "member-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()
    reset_settings()


@pytest.fixture(autouse=True)
def _persistence_on(monkeypatch):
    """quota.check only consults the ledger when Postgres is configured; the
    suite runs with it off, so switch it on and stub the wire."""
    monkeypatch.setattr(db_module, "persistence_configured", lambda: True)
    monkeypatch.setattr(quota.db, "persistence_configured", lambda: True)


def _member():
    session = store.create(user_id=MEMBER)
    session.is_anonymous = False
    return session


def _weekly(monkeypatch, value):
    monkeypatch.setattr(quota.db, "weekly_token_total", lambda token: value)


def _reply(monkeypatch, content="ok"):
    monkeypatch.setattr(
        agent_module, "complete", lambda *a, **k: Completion(content=content)
    )


def test_under_the_weekly_total_the_turn_runs(monkeypatch) -> None:
    _weekly(monkeypatch, 10_000)
    _reply(monkeypatch)

    assert run_turn(_member(), "hello", "token")["reply"] == "ok"


def test_over_the_weekly_total_the_turn_is_refused(monkeypatch) -> None:
    _weekly(monkeypatch, get_settings().account_weekly_tokens)
    monkeypatch.setattr(
        agent_module, "complete",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not spend")),
    )

    with pytest.raises(quota.BudgetExceeded):
        run_turn(_member(), "hello", "token")


def test_the_refusal_says_the_work_is_still_there(monkeypatch) -> None:
    """Running out of allowance is not losing your CVs, and the message has to
    say so — the Build button still renders any of them."""
    _weekly(monkeypatch, 999_999_999)

    with pytest.raises(quota.BudgetExceeded) as caught:
        run_turn(_member(), "hello", "token")

    message = str(caught.value).lower()
    assert "saved" in message
    assert "build" in message


def test_a_long_conversation_alone_does_not_stop_an_account(monkeypatch) -> None:
    """No per-session ceiling: this session has spent more than a guest is
    ever allowed and is still fine, because only the week counts."""
    _weekly(monkeypatch, 1_000)
    _reply(monkeypatch)

    session = _member()
    session.usage.add(get_settings().guest_session_tokens * 3, 0)

    assert run_turn(session, "hello", "token")["reply"] == "ok"


def test_a_database_that_cannot_answer_lets_them_through(monkeypatch) -> None:
    """Failing open, deliberately.

    `weekly_token_total` returns None for "no answer" — a blip, or the schema
    not applied yet. Refusing service on that would punish visitors for an
    outage that has nothing to do with them, and it is not the only control:
    app/ratelimit.py still caps requests per account, so an outage cannot turn
    into unbounded spend.
    """
    _weekly(monkeypatch, None)
    _reply(monkeypatch)

    assert run_turn(_member(), "hello", "token")["reply"] == "ok"


def test_none_is_not_treated_as_zero_by_accident(monkeypatch) -> None:
    """The mirror of the test above, and the reason the sentinel is None and
    not 0: a bug that read "no answer" as "spent nothing" would look identical
    in the happy path and silently remove the limit."""
    calls: list[str] = []
    monkeypatch.setattr(quota.db, "weekly_token_total", lambda t: calls.append(t) or None)
    _reply(monkeypatch)

    run_turn(_member(), "hello", "the-token")

    assert calls == ["the-token"], "the ledger must be consulted as the visitor"


def test_a_guest_never_touches_the_ledger(monkeypatch) -> None:
    """A guest's limit is per conversation. Asking Postgres for their week
    would be a round trip whose answer is meaningless — the identity is one
    request old."""
    def explode(_token):
        raise AssertionError("no weekly lookup for a guest")

    monkeypatch.setattr(quota.db, "weekly_token_total", explode)
    _reply(monkeypatch)

    session = store.create(user_id="guest-1")
    session.is_anonymous = True

    assert run_turn(session, "hello", "token")["reply"] == "ok"


def test_the_weekly_limit_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setenv("ACCOUNT_WEEKLY_TOKENS", "0")
    reset_settings()

    def explode(_token):
        raise AssertionError("no lookup when the ceiling is off")

    monkeypatch.setattr(quota.db, "weekly_token_total", explode)
    _reply(monkeypatch)

    assert run_turn(_member(), "hello", "token")["reply"] == "ok"


def test_without_a_token_there_is_nothing_to_ask_as(monkeypatch) -> None:
    """Direct callers (tests, scripts) have no HTTP request behind them. The
    ledger is read *as the visitor* — no token means no read, not a read with
    somebody else's credentials."""
    def explode(_token):
        raise AssertionError("no lookup without a token")

    monkeypatch.setattr(quota.db, "weekly_token_total", explode)
    _reply(monkeypatch)

    assert run_turn(_member(), "hello")["reply"] == "ok"
