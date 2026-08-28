"""In-process rate limiting: the sliding window itself, and both layers wired
into the app — the global per-IP backstop and the per-user limits on the
routes that spend tokens or CPU.

conftest.py resets `limiter` before and after every test in the suite, so
these are the only tests that ever see it in a non-empty state.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ratelimit import GLOBAL_PER_IP, Rule, SlidingWindow, client_ip, limiter
from app.session import store
from conftest import TEST_USER_ID


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


# ------------------------------------------------------------- SlidingWindow

def test_allows_up_to_the_limit() -> None:
    window = SlidingWindow()
    rule = Rule(times=3, seconds=60)

    assert window.check("k", rule) is None
    assert window.check("k", rule) is None
    assert window.check("k", rule) is None


def test_the_hit_over_the_limit_is_refused_with_a_wait() -> None:
    window = SlidingWindow()
    rule = Rule(times=3, seconds=60)
    for _ in range(3):
        window.check("k", rule)

    retry_after = window.check("k", rule)

    assert retry_after is not None
    assert 0 < retry_after <= 60


def test_different_keys_do_not_share_a_bucket() -> None:
    window = SlidingWindow()
    rule = Rule(times=1, seconds=60)

    assert window.check("a", rule) is None
    assert window.check("b", rule) is None, "a different key must not be affected by 'a'"


def test_a_hit_ages_out_of_the_window() -> None:
    """A sliding window, not a fixed one: once the oldest hit is older than
    the window, it must stop counting."""
    window = SlidingWindow()
    rule = Rule(times=1, seconds=60)
    window.check("k", rule)

    # Simulate time passing by manipulating the recorded timestamp directly
    # rather than sleeping 60s in a test.
    window._hits["k"][0] -= 61

    assert window.check("k", rule) is None


def test_reset_clears_every_key() -> None:
    window = SlidingWindow()
    rule = Rule(times=1, seconds=60)
    window.check("a", rule)
    window.check("b", rule)

    window.reset()

    assert window.check("a", rule) is None
    assert window.check("b", rule) is None


# ------------------------------------------------------------------ client_ip

def test_client_ip_reads_the_asgi_scope() -> None:
    class FakeClient:
        host = "203.0.113.5"

    class FakeRequest:
        client = FakeClient()

    assert client_ip(FakeRequest()) == "203.0.113.5"


def test_client_ip_falls_back_when_no_client_info() -> None:
    class FakeRequest:
        client = None

    assert client_ip(FakeRequest()) == "unknown"


# ------------------------------------------------------------- HTTP: global

def test_global_limit_blocks_after_enough_requests(client: TestClient) -> None:
    for _ in range(GLOBAL_PER_IP.times):
        response = client.get("/ping")
        assert response.status_code == 200

    blocked = client.get("/ping")
    assert blocked.status_code == 429
    assert "retry-after" in blocked.headers


def test_global_limit_response_carries_cors_headers(client: TestClient) -> None:
    """The whole reason the rate-limit middleware is added *after* CORS: a
    429 that lost its CORS headers would show the visitor a CORS error
    instead of the real 'too many requests' message."""
    for _ in range(GLOBAL_PER_IP.times):
        client.get("/ping", headers={"Origin": "http://localhost:8080"})

    blocked = client.get("/ping", headers={"Origin": "http://localhost:8080"})

    assert blocked.status_code == 429
    assert blocked.headers.get("access-control-allow-origin") == "http://localhost:8080"


def test_cors_preflight_is_never_rate_limited(client: TestClient) -> None:
    """An OPTIONS blocked by the limiter would silently break the *next* real
    request: a browser that fails a preflight never sends the request it was
    clearing, so the visitor would see the real call itself appear to fail."""
    for _ in range(GLOBAL_PER_IP.times + 5):
        response = client.options(
            "/chat",
            headers={
                "Origin": "http://localhost:8080",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code != 429


def test_health_and_ping_are_not_special_cased_out_of_the_global_limit(client: TestClient) -> None:
    """A flood of cheap requests still saturates the one Render instance even
    though no single request costs anything — the backstop has to be
    genuinely global, not opt-in per route."""
    for _ in range(GLOBAL_PER_IP.times):
        client.get("/health")

    assert client.get("/health").status_code == 429


def test_patch_is_allowed_by_cors(client: TestClient) -> None:
    """A route added with a new HTTP method is invisible to this test suite —
    TestClient talks to the app directly and never runs a browser's preflight
    check, so a route can pass every other test and still be unreachable from
    the actual frontend.

    This shipped once for real: `/session/{id}/style` (PATCH) was added, CORS
    was not told about the method, and nothing failed loudly. The browser's
    preflight just declined to grant PATCH, so the real request never left the
    browser — the visitor saw a picker that span forever, and the server never
    even saw a request to explain why.
    """
    preflight = client.options(
        "/session/some-id/style",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "PATCH",
        },
    )
    allowed = preflight.headers.get("access-control-allow-methods", "")
    assert "PATCH" in allowed, (
        f"CORS does not grant PATCH ({allowed!r}) — a route using it is "
        "unreachable from a browser even though every other test can call it "
        "directly."
    )


def test_disabling_rate_limiting_lifts_the_global_limit(monkeypatch, client: TestClient) -> None:
    from app.config import get_settings, reset_settings

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    reset_settings()
    try:
        assert get_settings().rate_limit_enabled is False
        for _ in range(GLOBAL_PER_IP.times + 10):
            assert client.get("/ping").status_code == 200
    finally:
        reset_settings()


# --------------------------------------------------------------- HTTP: per-user

def test_chat_is_limited_per_user(monkeypatch, client: TestClient) -> None:
    from app import agent as agent_module
    from app.llm import Completion
    from app.ratelimit import CHAT_PER_USER

    monkeypatch.setattr(agent_module, "complete", lambda *a, **k: Completion(content="ok"))

    for _ in range(CHAT_PER_USER.times):
        response = client.post("/chat", json={"message": "hi"})
        assert response.status_code == 200

    blocked = client.post("/chat", json={"message": "hi"})
    assert blocked.status_code == 429
    assert "chat messages" in blocked.json()["detail"]


def test_generate_is_limited_per_user_separately_from_chat(client: TestClient) -> None:
    """Each route has its own bucket — hammering /generate must not spend
    down the budget /chat has for the same user, and vice versa."""
    from app.ratelimit import GENERATE_PER_USER

    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")

    for _ in range(GENERATE_PER_USER.times):
        response = client.post(f"/generate/{session.id}")
        assert response.status_code == 200

    blocked = client.post(f"/generate/{session.id}")
    assert blocked.status_code == 429

    # A wholly separate route, same user: must still be untouched.
    assert client.get(f"/draft/{session.id}").status_code == 200
