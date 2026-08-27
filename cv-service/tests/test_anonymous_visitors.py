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
from app.ratelimit import (
    ANON_CHAT_PER_IP,
    ANON_SESSION_PER_IP,
    Rule,
    limit_by_account,
    limiter,
)
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


def test_opening_conversation_after_conversation_is_what_gets_capped(
    monkeypatch, client: TestClient
) -> None:
    """End to end, and the rule that makes the guest token ceiling mean
    anything at all.

    A guest's allowance is per conversation, and opening one costs nothing —
    so without this, N conversations is N allowances and the ceiling bounds
    nothing. Every request here is a brand-new identity opening a brand-new
    conversation, which is precisely the shape of the abuse.
    """
    _replies(monkeypatch)
    refusal = None

    for index in range(ANON_SESSION_PER_IP.times + 1):
        _as(AuthUser(id=f"anon-{index}", email=None, access_token="t",
                     is_anonymous=True))
        response = client.post("/chat", json={"message": "hi"})
        if response.status_code == 429:
            refusal = response.json()["detail"]
            break

    assert refusal is not None, "a fresh guest account per request bypassed the limit"
    # Named, not just a 429: the global flood backstop would otherwise be an
    # easy false pass, and it is far too loose to be an economic control.
    assert "new conversations" in refusal


def test_continuing_one_conversation_is_not_charged_as_a_new_one(
    monkeypatch, client: TestClient
) -> None:
    """The other half. Rationing new conversations must not ration *talking* —
    a guest who keeps answering questions in the one conversation they opened
    is exactly the behaviour this product wants."""
    _replies(monkeypatch)
    _as(ANON)

    first = client.post("/chat", json={"message": "hi"})
    assert first.status_code == 200
    session_id = first.json()["session_id"]

    for _ in range(ANON_SESSION_PER_IP.times * 3):
        again = client.post("/chat", json={"message": "and more", "session_id": session_id})
        assert again.status_code == 200, again.json()


def test_a_long_guest_conversation_still_meets_the_chat_rule(
    monkeypatch, client: TestClient
) -> None:
    """Not unlimited, though: continuing costs tokens, so the per-IP chat rule
    is what bounds one very long conversation."""
    _replies(monkeypatch)
    _as(ANON)

    session_id = client.post("/chat", json={"message": "hi"}).json()["session_id"]
    refusal = None

    for _ in range(ANON_CHAT_PER_IP.times + 2):
        response = client.post("/chat", json={"message": "more", "session_id": session_id})
        if response.status_code == 429:
            refusal = response.json()["detail"]
            break

    assert refusal is not None, "a guest conversation ran without any chat limit"
    assert "chat messages" in refusal


# ------------------------------------------------------------ token budget

def test_a_guest_is_rationed_per_conversation() -> None:
    settings = get_settings()

    session = store.create(user_id=ANON.id)
    session.is_anonymous = True
    session.usage.add(settings.guest_session_tokens, 0)

    with pytest.raises(SessionBudgetExceeded) as caught:
        run_turn(session, "carry on")

    # The message has to say the draft survives and what the ways forward
    # are — a guest told only "limit reached" assumes their work is gone.
    message = str(caught.value).lower()
    assert "guest" in message
    assert "account" in message


def test_the_same_usage_is_fine_for_a_signed_up_visitor(monkeypatch) -> None:
    """Signing up changes the *shape* of the limit, not just the number: an
    account has no per-conversation ceiling at all, only a weekly one across
    every conversation (test_weekly_quota.py)."""
    settings = get_settings()
    _replies(monkeypatch, "ok")

    session = store.create(user_id=MEMBER.id)
    session.is_anonymous = False
    session.usage.add(settings.guest_session_tokens, 0)

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
    session.usage.add(settings.guest_session_tokens, 0)
    with pytest.raises(SessionBudgetExceeded):
        run_turn(session, "hi")

    session.is_anonymous = False  # they signed up; the id did not change

    assert run_turn(session, "hi")["reply"] == "ok"


# ------------------------------------------------- guests cannot reach across

def test_a_guest_presenting_someone_elses_session_id_gets_a_new_one(
    monkeypatch, client: TestClient
) -> None:
    """Isolation over the wire, not just in the store.

    /chat and /upload no longer call `store.get_or_create` — they resolve the
    session themselves so that opening a *new* conversation can be rationed
    separately (see `_session_for` in app/main.py). That rewrite is exactly
    the kind that can quietly drop an ownership check, and a guest id costs
    nothing to obtain, so anyone could sit and guess.

    The behaviour that must survive: someone else's session reads as one that
    does not exist. Not an error — an error that distinguishes "not yours"
    from "no such thing" is itself a way to enumerate ids.
    """
    _replies(monkeypatch)

    victim = store.create(user_id="someone-else")
    victim.set_field("full_name", "Ahmed Sefriui")

    _as(ANON)
    response = client.post(
        "/chat", json={"message": "hi", "session_id": victim.id}
    )

    assert response.status_code == 200
    assert response.json()["session_id"] != victim.id


def test_the_new_conversation_guard_does_not_apply_to_members(
    monkeypatch, client: TestClient
) -> None:
    """Rationing how fast conversations can be opened only makes sense for
    guests: an account's limit is weekly and account-wide, so opening a new
    conversation gains them nothing to farm."""
    _replies(monkeypatch)
    _as(MEMBER)

    for _ in range(ANON_SESSION_PER_IP.times * 2):
        response = client.post("/chat", json={"message": "new one"})
        assert response.status_code == 200, response.json()
