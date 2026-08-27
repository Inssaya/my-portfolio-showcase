"""The limits have to make sense next to each other, not just individually.

Each ceiling was defensible on its own and the set was absurd: a guest could
spend 80k per conversation and open several conversations an hour, while an
account got 300k for a whole week. Signing up *reduced* what a visitor was
allowed by roughly ninety times, and the refusal message helpfully explained
that starting a new conversation would reset the allowance.

Nothing caught it because nothing compared the numbers. These tests do.
"""
from __future__ import annotations

import pytest

from app.config import get_settings, reset_settings
from app.quota import BudgetExceeded, check
from app.ratelimit import ANON_SESSION_PER_IP, TokenWindow
from app.session import store


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()
    reset_settings()


def _guest():
    session = store.create(user_id="guest")
    session.is_anonymous = True
    return session


# ------------------------------------------------------- the ordering itself

def test_an_account_may_spend_more_than_a_guest() -> None:
    """The whole point of signing up. If a guest's realistic ceiling is higher
    than an account's, the incentive runs backwards and the product is asking
    people to pay a price for less."""
    settings = get_settings()

    assert settings.account_weekly_tokens > settings.guest_daily_ip_tokens


def test_a_week_of_guest_days_is_not_wildly_past_an_account_week() -> None:
    """A guest who came back every single day should not comfortably beat
    somebody who signed up. Exact parity is not achievable — addresses are not
    identities — but an order of magnitude apart means the limit is theatre."""
    settings = get_settings()
    guest_week = settings.guest_daily_ip_tokens * 7

    assert guest_week <= settings.account_weekly_tokens * 2


def test_a_guest_can_finish_a_cv_before_any_ceiling_bites() -> None:
    """Measured: ~34.7k for a full interview. Both guest ceilings have to
    clear that with room to revise, or the limits are just a wall."""
    settings = get_settings()

    assert settings.guest_session_tokens >= 60_000
    assert settings.guest_daily_ip_tokens >= settings.guest_session_tokens


# ------------------------------------------------ the daily total is enforced

def test_the_daily_total_stops_a_fresh_conversation() -> None:
    """The bug in one test. A brand-new conversation has spent nothing, so the
    per-conversation ceiling has nothing to say about it — and that was the
    entire limit for a guest."""
    settings = get_settings()
    fresh = _guest()
    assert fresh.usage.total == 0

    with pytest.raises(BudgetExceeded):
        check(fresh, daily_spent=settings.guest_daily_ip_tokens)


def test_the_refusal_does_not_explain_how_to_get_around_it() -> None:
    """It used to read: "Starting a new conversation gives you a fresh
    allowance." True at the time, and an instruction for bypassing the limit
    printed on the limit itself."""
    settings = get_settings()

    with pytest.raises(BudgetExceeded) as caught:
        check(_guest(), daily_spent=settings.guest_daily_ip_tokens)
    daily = str(caught.value).lower()

    session = _guest()
    session.usage.add(settings.guest_session_tokens, 0)
    with pytest.raises(BudgetExceeded) as caught:
        check(session, daily_spent=0)
    per_conversation = str(caught.value).lower()

    for message in (daily, per_conversation):
        assert "fresh allowance" not in message
        assert "new conversation" not in message
        # Still has to leave them somewhere to go.
        assert "build" in message or "account" in message


def test_under_the_daily_total_a_guest_carries_on() -> None:
    check(_guest(), daily_spent=0)  # no raise


def test_a_direct_caller_with_no_address_still_gets_the_conversation_ceiling() -> None:
    """Tests and scripts have no request behind them. They should not silently
    lose the ceiling that does apply."""
    settings = get_settings()
    session = _guest()
    session.usage.add(settings.guest_session_tokens, 0)

    with pytest.raises(BudgetExceeded):
        check(session, daily_spent=None)


def test_the_daily_total_can_be_disabled() -> None:
    import os

    os.environ["GUEST_DAILY_IP_TOKENS"] = "0"
    reset_settings()
    try:
        check(_guest(), daily_spent=10_000_000)  # no raise
    finally:
        del os.environ["GUEST_DAILY_IP_TOKENS"]
        reset_settings()


# ------------------------------------------------------------- the accounting

def test_spending_accumulates_across_conversations() -> None:
    """A TokenWindow keyed on the address, so a second conversation starts
    where the first one left off rather than at zero."""
    window = TokenWindow()

    window.add("ip", 30_000)
    window.add("ip", 25_000)

    assert window.total("ip", 86_400) == 55_000


def test_one_visitor_does_not_spend_another_visitors_day() -> None:
    window = TokenWindow()

    window.add("one", 50_000)

    assert window.total("two", 86_400) == 0


def test_spending_falls_out_of_the_window() -> None:
    """Rolling, not a daily reset at midnight — nobody is locked out until an
    arbitrary hour."""
    window = TokenWindow()
    window.add("ip", 50_000)

    assert window.total("ip", 0) == 0


def test_opening_conversations_is_still_capped_as_well() -> None:
    """Belt and braces: the token total is the economic bound, but a script
    opening sessions in a loop costs CPU and Postgres rows before it spends a
    single token."""
    assert ANON_SESSION_PER_IP.times <= 10
