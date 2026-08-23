"""Shared test setup: a fake authenticated user, everywhere.

Every route now sits behind `Depends(get_current_user)`, which calls out to
Supabase's `/auth/v1/user` over the network (see app/auth.py). Tests must stay
hermetic — no network, no real Supabase project, no API key — so this
overrides the dependency once, for every test in the suite, with a fixed fake
user rather than a real verified token.

`TEST_USER_ID` is what direct, non-HTTP tests pass to `store.create()` and
`store.get()` — those calls never go through the FastAPI dependency at all, so
the override above does not reach them.
"""
from __future__ import annotations

import pytest

from app.auth import AuthUser, get_current_user
from app.main import app

TEST_USER_ID = "00000000-0000-4000-8000-000000000001"
TEST_USER_EMAIL = "test@example.com"

# A second, distinct user for the tests that prove sessions are actually
# isolated between accounts, not just present.
OTHER_USER_ID = "00000000-0000-4000-8000-000000000002"


def _fake_current_user() -> AuthUser:
    return AuthUser(id=TEST_USER_ID, email=TEST_USER_EMAIL, access_token="test-token")


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user] = _fake_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
