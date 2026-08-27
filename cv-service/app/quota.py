"""How much a visitor may spend, and which question to ask about them.

Two ceilings with deliberately different shapes — see `Settings` for the
numbers and the reasoning:

* **A guest** is rationed per conversation. Their identity is free to mint, so
  a longer-term total keyed on it would measure nothing; what a per-session
  ceiling does buy is a hard stop on one runaway conversation. The rest of the
  defence against a guest simply starting conversation after conversation is
  not here — it is `app/ratelimit.py`, which rations guests by IP.

* **An account** is rationed per rolling week across every conversation, with
  no per-session ceiling. They can start as many CVs as they like and revise
  one for as long as they need; only the week's total runs out.

The weekly figure comes from the `cv_usage` ledger in Postgres rather than
from memory, because a week has to survive the restarts a single Render
instance does routinely — in-process state would reset the window every
deploy, which is the same as having no weekly limit at all.
"""
from __future__ import annotations

import logging

from . import db
from .config import get_settings
from .session import Session

logger = logging.getLogger(__name__)


class BudgetExceeded(Exception):
    """The visitor has spent their allowance. Never fatal to their work: the
    draft is intact and app/tools.py's Build button renders it without the
    model, so this is always "you cannot say more", never "you lost the CV"."""


def check(session: Session, access_token: str | None = None) -> None:
    """Raise BudgetExceeded if this turn must not run. Otherwise return.

    Called *before* any spend, never during: stopping mid-turn would bill for
    the rounds already run and still leave the visitor without an answer.
    """
    settings = get_settings()

    if session.is_anonymous:
        ceiling = settings.guest_session_tokens
        if ceiling and session.usage.total >= ceiling:
            raise BudgetExceeded(
                "This conversation has reached the limit for a guest. Nothing "
                "is lost — use the Build button to get your CV now. Starting a "
                "new conversation gives you a fresh allowance, and creating an "
                "account keeps everything you have built here."
            )
        return

    ceiling = settings.account_weekly_tokens
    if not ceiling or not access_token or not db.persistence_configured():
        return

    spent = db.weekly_token_total(access_token)
    if spent is None:
        # No answer from the ledger — a network blip, or the schema has not
        # been applied yet. Let them through.
        #
        # Failing open is the deliberate choice, and it is not the only thing
        # standing here: app/ratelimit.py still caps requests per account, so
        # an outage cannot turn into unbounded spend. Failing closed would
        # refuse service to paying-in-attention visitors over a hiccup that
        # has nothing to do with them.
        logger.warning("weekly usage unavailable; allowing the turn")
        return

    if spent >= ceiling:
        raise BudgetExceeded(
            "You've used this week's allowance. Your CVs and conversations are "
            "all saved — the Build button still works on any of them — and the "
            "allowance refreshes as the last seven days roll forward."
        )


def record(session: Session, spent_prompt: int, spent_completion: int,
           access_token: str | None) -> None:
    """Append what this turn cost to the ledger. Best-effort by design."""
    if not access_token or not db.persistence_configured():
        return
    if spent_prompt <= 0 and spent_completion <= 0:
        return
    db.record_usage(
        session.user_id, session.id, spent_prompt, spent_completion, access_token
    )
