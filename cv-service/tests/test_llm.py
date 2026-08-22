"""The OpenAI client's retry policy.

The behaviour worth pinning is that a 429 never reaches the visitor while a
healthy key remains: it is a wrong-key signal, not a failed request. Faked at
the httpx boundary so the policy is tested without a network or a real key.
"""
from __future__ import annotations

import httpx
import pytest

from app import llm as llm_module
from app.config import get_settings, reset_settings
from app.llm import LLMBusy, LLMError, LLMNotConfigured, complete, get_pool


@pytest.fixture(autouse=True)
def _three_keys(monkeypatch):
    """Pin the pool to exactly three fake keys.

    Every slot is set to an explicit empty string rather than deleted:
    `Settings` also reads `cv-service/.env`, and an absent environment variable
    lets that file's real key through — so the suite would pass or fail
    depending on whether the developer had configured the service. An empty
    env var takes precedence over the file and keeps the tests hermetic.
    """
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-a,sk-b,sk-c")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    for index in range(1, 21):
        monkeypatch.setenv(f"OPENAI_API_KEY_{index}", "")
    reset_settings()
    llm_module.reset_pool()
    yield
    reset_settings()
    llm_module.reset_pool()


def _response(status_code: int, *, body: dict | None = None, headers: dict | None = None):
    return httpx.Response(
        status_code,
        json=body if body is not None else {},
        headers=headers or {},
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )


OK_BODY = {
    "choices": [{"message": {"content": "Hello.", "tool_calls": []}}],
    "usage": {"prompt_tokens": 40, "completion_tokens": 7},
}


def test_keys_are_read_from_the_comma_form() -> None:
    assert get_settings().api_key_list == ["sk-a", "sk-b", "sk-c"]
    assert len(get_pool()) == 3


def test_numbered_and_comma_forms_merge(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY_1", "sk-d")
    reset_settings()

    assert set(get_settings().api_key_list) == {"sk-a", "sk-b", "sk-c", "sk-d"}


def test_successful_call_returns_usage_and_key(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _response(200, body=OK_BODY))

    result = complete([{"role": "user", "content": "hi"}])

    assert result.content == "Hello."
    assert result.prompt_tokens == 40 and result.completion_tokens == 7
    assert result.key_label.startswith("key-")


def test_rate_limit_falls_through_to_another_key(monkeypatch) -> None:
    """The whole point of the pool: a 429 must not reach the visitor."""
    seen: list[str] = []

    def fake_post(url, **kwargs):
        token = kwargs["headers"]["authorization"].removeprefix("Bearer ")
        seen.append(token)
        if len(seen) == 1:
            return _response(429, headers={"retry-after": "30"})
        return _response(200, body=OK_BODY)

    monkeypatch.setattr(httpx, "post", fake_post)

    result = complete([{"role": "user", "content": "hi"}])

    assert result.content == "Hello."
    assert len(seen) == 2, "should have retried"
    assert seen[0] != seen[1], "retry must use a different key"


def test_exhausting_every_key_raises_busy_with_a_wait(monkeypatch) -> None:
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _response(429, headers={"retry-after": "12"})
    )

    with pytest.raises(LLMBusy) as caught:
        complete([{"role": "user", "content": "hi"}])

    # The API turns this into a 429 + Retry-After, so it has to be a real number.
    assert caught.value.retry_after > 0


def test_rejected_key_is_disabled_and_the_call_still_succeeds(monkeypatch) -> None:
    """A mistyped key must not poison one request in three forever."""
    def fake_post(url, **kwargs):
        token = kwargs["headers"]["authorization"].removeprefix("Bearer ")
        if token == "sk-a":
            return _response(401)
        return _response(200, body=OK_BODY)

    monkeypatch.setattr(httpx, "post", fake_post)

    assert complete([{"role": "user", "content": "hi"}]).content == "Hello."

    labels = {entry["label"]: entry for entry in get_pool().snapshot()}
    assert labels["key-1"]["state"] == "disabled"
    assert get_pool().health()["disabled"] == 1


def test_no_keys_configured_is_reported_plainly(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEYS", "")
    reset_settings()
    llm_module.reset_pool()

    with pytest.raises(LLMNotConfigured):
        complete([{"role": "user", "content": "hi"}])


def test_every_key_disabled_is_not_reported_as_busy(monkeypatch) -> None:
    """Waiting cannot fix revoked keys — that must surface as configuration
    broken (503), never as 'try again shortly' (429)."""
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _response(401))

    with pytest.raises(LLMError) as caught:
        complete([{"role": "user", "content": "hi"}])
    assert not isinstance(caught.value, LLMBusy)

    with pytest.raises(LLMNotConfigured):
        complete([{"role": "user", "content": "hi"}])


def test_server_error_is_not_retried_across_keys(monkeypatch) -> None:
    """A 500 is OpenAI's problem, not the key's: burning the pool on it would
    turn one bad response into three."""
    calls = {"n": 0}

    def fake_post(*args, **kwargs):
        calls["n"] += 1
        return _response(500)

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(LLMError):
        complete([{"role": "user", "content": "hi"}])
    assert calls["n"] == 1


def test_provider_body_is_never_surfaced(monkeypatch) -> None:
    """Error bodies can carry the organisation id and other account detail."""
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: _response(400, body={"error": {"message": "org-SECRET123 quota"}}),
    )

    with pytest.raises(LLMError) as caught:
        complete([{"role": "user", "content": "hi"}])

    assert "SECRET123" not in str(caught.value)


def test_transport_failure_does_not_park_a_key(monkeypatch) -> None:
    """A network blip is not the key's fault; parking it would shrink the pool
    every time the host has a bad moment."""
    def fake_post(*args, **kwargs):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(LLMError):
        complete([{"role": "user", "content": "hi"}])

    assert get_pool().health()["cooling"] == 0
    assert get_pool().health()["disabled"] == 0


def test_malformed_tool_arguments_do_not_crash(monkeypatch) -> None:
    body = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "tool_calls": [
                        {"id": "1", "function": {"name": "update_resume", "arguments": "{not json"}}
                    ],
                }
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
    }
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _response(200, body=body))

    result = complete([{"role": "user", "content": "hi"}])

    assert result.tool_calls[0].arguments == {}


def test_single_key_still_retries_a_dropped_connection(monkeypatch) -> None:
    """Regression: attempts were `min(4, len(pool))`, so a one-key deployment
    got a single attempt and one dropped connection failed the visitor's turn.
    """
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-only")
    reset_settings()
    llm_module.reset_pool()
    monkeypatch.setattr(llm_module.time, "sleep", lambda _s: None)

    calls = {"n": 0}

    def flaky_post(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.")
        return _response(200, body=OK_BODY)

    monkeypatch.setattr(httpx, "post", flaky_post)

    assert complete([{"role": "user", "content": "hi"}]).content == "Hello."
    assert calls["n"] == 2, "should have retried on the same key"


def test_transport_retries_are_bounded(monkeypatch) -> None:
    """A persistent outage must give up rather than spin."""
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-only")
    reset_settings()
    llm_module.reset_pool()
    monkeypatch.setattr(llm_module.time, "sleep", lambda _s: None)

    calls = {"n": 0}

    def always_down(*args, **kwargs):
        calls["n"] += 1
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", always_down)

    with pytest.raises(LLMError):
        complete([{"role": "user", "content": "hi"}])
    assert calls["n"] == llm_module.MAX_ATTEMPTS


def test_a_short_cooldown_is_waited_out_not_reported(monkeypatch) -> None:
    """With one key there is nothing to fail over to, so `acquire` raised
    immediately and a one-second backoff surfaced as "everyone's building CVs
    right now" — alarming, for a wait nobody would have noticed."""
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-only")
    reset_settings()
    llm_module.reset_pool()

    # The fake sleep must advance the pool's clock the way a real one does, or
    # the key is still cooling on the next attempt and the retry is wasted.
    slept: list[float] = []

    def fake_sleep(seconds: float) -> None:
        slept.append(seconds)
        for key in llm_module.get_pool()._keys:
            key.cooldown_until -= seconds

    monkeypatch.setattr(llm_module.time, "sleep", fake_sleep)

    calls = {"n": 0}

    def fake_post(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _response(429, headers={"retry-after": "2"})
        return _response(200, body=OK_BODY)

    monkeypatch.setattr(httpx, "post", fake_post)

    assert complete([{"role": "user", "content": "hi"}]).content == "Hello."
    assert slept and slept[0] >= 2, "should have waited the cooldown out"


def test_a_long_cooldown_is_still_reported(monkeypatch) -> None:
    """Past the wait-out threshold it is a real wait, and saying so with a time
    beats silently hanging the request."""
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-only")
    reset_settings()
    llm_module.reset_pool()
    monkeypatch.setattr(llm_module.time, "sleep", lambda _s: None)
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _response(429, headers={"retry-after": "45"})
    )

    with pytest.raises(LLMBusy) as caught:
        complete([{"role": "user", "content": "hi"}])
    assert caught.value.retry_after >= 40
