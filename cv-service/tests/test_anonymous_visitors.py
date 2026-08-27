"""Letting people in before they sign up, without handing over the budget.

Visitors were dropping out at email verification — being asked to open their
inbox for a product they had not seen work. So a visitor with no session is now
signed in anonymously and builds a CV straight away, and the account only
becomes permanent when they choose to keep it.

Anonymous sign-in mints a real Supabase account, so nothing about ownership,
RLS or admin checks needed to change. One thing does: an anonymous identity is
*free*. Every limit that rations by account silently stops being a limit,
because a script can mint a fresh account per request. These tests pin the
replacement — anonymous callers are rationed by IP, and get a smaller token
budget — because that is the part where getting it wrong costs real money.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.agent import SessionBudgetExceeded, run_turn
from app.auth import AuthUser, get_current_user, require_admin
from app.config import get_settings
from app.llm import Completion
from app.main import app
from app.ratelimit import ANON_CHAT_PER_IP, Rule, limit_by_account, limiter
from app.session import store

ANON = AuthUser(id="anon-a", email=None, access_token="t-a", is_anonymous=True)
MEMBER = AuthUser(
    id="member-1", email="someone@example.com", access_token="t-m", is_anonymous=False
)


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    limiter.reset()
    yield
    store.reset()
    limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _as(user: AuthUser) -> None:
    """Answer the next request as `user`. conftest installs the default
    override and pops it again after every test, so this only has to set it."""
    app.dependency_overrides[get_current_user] = lambda: user


def _replies(monkeypatch, content: str = "Noted.") -> None:
    monkeypatch.setattr(
        agent_module, "complete", lambda *a, **k: Completion(content=content)
    )


class _Request:
    """Just enough Request for `client_ip` — it reads `.client.host`."""

    def __init__(self, ip: str) -> None:
        self.client = type("C", (), {"host": ip})()


# ------------------------------------------------------- identifying a guest

def test_an_account_with_no_email_is_a_guest() -> None:
    assert ANON.is_anonymous and ANON.email is None
    assert not MEMBER.is_anonymous


def test_a_guest_can_never_be_admin() -> None:
    """`require_admin` compares an email address. A guest has none, so the
    admin surface is closed to them by construction rather than by a check
    somebody has to remember to write."""
    with pytest.raises(HTTPException) as caught:
        require_admin(ANON)

    assert caught.value.status_code == 403


# --------------------------------------------------------- rationing by IP
#
# `limit_by_account` is a dependency factory; these call the dependency it
# builds directly, with a stub Request, so the *keying* can be tested against
# small rules rather than by making forty real HTTP calls per case.

def _dependency(anon_times: int = 2, member_times: int = 2):
    return limit_by_account(
        Rule(member_times, 60), Rule(anon_times, 60), "t", "things"
    ).dependency


def test_minting_a_fresh_guest_account_per_request_does_not_reset_the_limit() -> None:
    """The whole point. A per-account limit assumes an account costs
    something; anonymous sign-in makes one free, so a loop that signs in again
    each time would otherwise never hit a limit while spending real tokens on
    every call."""
    check = _dependency(anon_times=2)
    request = _Request("203.0.113.7")

    for index in range(2):
        check(request, AuthUser(id=f"anon-{index}", email=None, access_token="t",
                                is_anonymous=True))

    with pytest.raises(HTTPException) as caught:
        check(request, AuthUser(id="anon-brand-new", email=None, access_token="t",
                                is_anonymous=True))

    assert caught.value.status_code == 429


def test_guests_on_different_networks_do_not_share_an_allowance() -> None:
    """The flip side: keying on the IP must not mean one abusive visitor
    closes the door on everyone else."""
    check = _dependency(anon_times=1)

    check(_Request("203.0.113.7"), ANON)
    check(_Request("198.51.100.4"), ANON)  # no raise


def test_members_sharing_one_ip_each_keep_their_own_allowance() -> None:
    """Members keep the per-account rule: they paid the signup price, and a
    school, an office or a carrier-grade NAT can legitimately put many of them
    behind a single address."""
    check = _dependency(member_times=1)
    one_office = _Request("203.0.113.7")

    check(one_office, MEMBER)
    check(one_office, AuthUser(id="member-2", email="b@example.com",
                               access_token="t", is_anonymous=False))

    with pytest.raises(HTTPException) as caught:
        check(one_office, MEMBER)

    assert caught.value.status_code == 429


def test_a_guest_and_a_member_do_not_draw_on_the_same_bucket() -> None:
    """Different keys entirely — otherwise converting an account mid-session
    would carry the guest's spent allowance across with it."""
    check = _dependency(anon_times=1, member_times=1)
    request = _Request("203.0.113.7")

    check(request, ANON)
    check(request, MEMBER)  # no raise


def test_the_chat_route_really_is_wired_to_the_anonymous_rule(
    monkeypatch, client: TestClient
) -> None:
    """End to end against the real ANON_CHAT_PER_IP, because the keying being
    correct is worth nothing if the route is not actually behind it. The
    message distinguishes it from the global flood backstop, which would
    otherwise be an easy false pass."""
    _replies(monkeypatch)
    refusal = None

    for index in range(ANON_CHAT_PER_IP.times + 1):
        _as(AuthUser(id=f"anon-{index}", email=None, access_token="t",
                     is_anonymous=True))
        response = client.post("/chat", json={"message": "hi"})
        if response.status_code == 429:
            refusal = response.json()["detail"]
            break

    assert refusal is not None, "a fresh guest account per request bypassed the limit"
    assert "chat messages" in refusal


# ------------------------------------------------------------ token budget

def test_a_guest_session_has_a_smaller_token_budget() -> None:
    settings = get_settings()
    assert settings.max_anonymous_session_tokens < settings.max_session_tokens

    session = store.create(user_id=ANON.id)
    session.is_anonymous = True
    session.usage.add(settings.max_anonymous_session_tokens, 0)

    with pytest.raises(SessionBudgetExceeded) as caught:
        run_turn(session, "carry on")

    # The message has to say the draft survives and that signing up lifts the
    # ceiling — a guest told only "limit reached" assumes their work is gone.
    message = str(caught.value).lower()
    assert "guest" in message
    assert "account" in message


def test_the_same_usage_is_fine_for_a_signed_up_visitor(monkeypatch) -> None:
    """Proves the lower ceiling is about the account type, not the number."""
    settings = get_settings()
    _replies(monkeypatch, "ok")

    session = store.create(user_id=MEMBER.id)
    session.is_anonymous = False
    session.usage.add(settings.max_anonymous_session_tokens, 0)

    assert run_turn(session, "carry on")["reply"] == "ok"


def test_signing_up_lifts_the_ceiling_on_the_same_session(monkeypatch) -> None:
    """Supabase keeps the user id when an anonymous account is converted, so
    converting must not cost the visitor the CV they already built. The flag is
    re-stamped from the verified token on every request, which is what makes
    that work — the session object itself is never migrated."""
    settings = get_settings()
    _replies(monkeypatch, "ok")

    session = store.create(user_id="same-id")
    session.is_anonymous = True
    session.usage.add(settings.max_anonymous_session_tokens, 0)
    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hi")

    session.is_anonymous = False  # they signed up; the id did not change

    assert run_turn(session, "hi")["reply"] == "ok"
