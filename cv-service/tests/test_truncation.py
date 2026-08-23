"""Recovering when a response is cut off mid-flight.

Saving a full CV means emitting every section's text as tool-call arguments.
A real pasted CV ran out at exactly max_tokens with `finish_reason: length`
after seven calls — projects, certifications and interests were never written,
and nothing anywhere reported it.
"""
from __future__ import annotations

import pytest

from app import agent as agent_module
from app.config import get_settings
from app.llm import Completion, ToolCall
from app.session import Session, store
from conftest import TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def session() -> Session:
    return store.create(user_id=TEST_USER_ID)


def _script(monkeypatch, script: list[Completion]):
    calls = {"n": 0}

    def fake_complete(messages, tools=None, sticky_key=None):
        index = calls["n"]
        calls["n"] += 1
        return script[min(index, len(script) - 1)]

    monkeypatch.setattr(agent_module, "complete", fake_complete)
    return calls


def test_output_cap_is_large_enough_for_a_full_cv() -> None:
    """700 silently cost whole sections. The cap is a ceiling, not a charge."""
    assert get_settings().llm_max_tokens >= 1500


def test_truncation_is_detected_from_finish_reason() -> None:
    from app.llm import _parse

    body = {
        "choices": [{"message": {"content": "", "tool_calls": []}, "finish_reason": "length"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 700},
    }
    assert _parse(body, "key-1").truncated is True

    body["choices"][0]["finish_reason"] = "stop"
    assert _parse(body, "key-1").truncated is False


def test_a_truncated_turn_is_told_to_continue(monkeypatch, session: Session) -> None:
    _script(
        monkeypatch,
        [
            Completion(
                content="",
                tool_calls=[ToolCall("a", "update_resume", {"field": "skills", "content": "Python"})],
                truncated=True,
            ),
            Completion(
                content="",
                tool_calls=[
                    ToolCall("b", "update_resume", {"field": "projects", "content": "Chatbot - an AI bot"})
                ],
            ),
            Completion(content="All saved."),
        ],
    )

    result = agent_module.run_turn(session, "here is my CV")

    # The sections that would otherwise have been lost are present.
    assert session.draft["skills"] == "Python"
    assert session.draft["projects"] == "Chatbot - an AI bot"
    assert result["reply"] == "All saved."

    nudges = [
        m for m in session.history
        if m.get("role") == "system" and "cut off" in str(m.get("content", ""))
    ]
    assert len(nudges) == 1


def test_a_complete_turn_is_not_nudged(monkeypatch, session: Session) -> None:
    _script(
        monkeypatch,
        [
            Completion(
                content="",
                tool_calls=[ToolCall("a", "update_resume", {"field": "skills", "content": "Python"})],
                truncated=False,
            ),
            Completion(content="Saved."),
        ],
    )

    agent_module.run_turn(session, "hi")

    assert not [
        m for m in session.history
        if m.get("role") == "system" and "cut off" in str(m.get("content", ""))
    ]
