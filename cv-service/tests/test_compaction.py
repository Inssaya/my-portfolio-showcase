"""History compaction.

Two properties matter and they pull against each other: the transcript sent
upstream must stay bounded, and it must stay *valid* — OpenAI rejects a request
outright if a `tool_calls` message is not followed by its matching `tool`
results, which is exactly what a naive slice produces.
"""
from __future__ import annotations

import pytest

from app.agent import VERBATIM_WINDOW, _compact, _wire_messages
from app.session import store


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


def _exchange(session, index: int) -> None:
    """One turn: user says something, model saves a field, model replies."""
    session.history.append({"role": "user", "content": f"answer number {index}"})
    session.history.append(
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": f"call{index}",
                    "type": "function",
                    "function": {"name": "update_resume", "arguments": "{}"},
                }
            ],
        }
    )
    session.history.append({"role": "tool", "tool_call_id": f"call{index}", "content": "Saved."})
    session.history.append({"role": "assistant", "content": f"reply number {index}"})


def test_short_history_is_untouched() -> None:
    session = store.create()
    _exchange(session, 1)

    assert _compact(session) == session.history


def test_long_history_is_bounded() -> None:
    """The point: cost per request stops growing with conversation length.

    The bound is the window plus at most one turn, because the cut walks back
    to a user message rather than slicing mid-exchange. What matters is that it
    is a *constant* — identical for a 20-turn and a 200-turn conversation.
    """
    short, long = store.create(), store.create()
    for i in range(20):
        _exchange(short, i)
    for i in range(200):
        _exchange(long, i)

    assert len(_compact(short)) < len(short.history)
    assert len(_compact(long)) == len(_compact(short)), "size must not track length"


def test_compaction_keeps_the_most_recent_turns() -> None:
    """'No, change that' must still have its referent."""
    session = store.create()
    for i in range(20):
        _exchange(session, i)

    blob = " ".join(str(m.get("content", "")) for m in _compact(session))

    assert "answer number 19" in blob
    assert "answer number 2" not in blob


def test_every_tool_call_keeps_its_result() -> None:
    """A `tool_calls` message whose results were sliced away is rejected by
    OpenAI with a 400 — the failure mode a naive truncation walks straight into.
    """
    session = store.create()
    for i in range(20):
        _exchange(session, i)

    compacted = _compact(session)

    open_ids: set[str] = set()
    for message in compacted:
        if message.get("role") == "assistant":
            for call in message.get("tool_calls") or []:
                open_ids.add(call["id"])
        elif message.get("role") == "tool":
            # A tool result whose call was cut away is equally invalid.
            assert message["tool_call_id"] in open_ids, "orphaned tool result"
            open_ids.discard(message["tool_call_id"])

    assert not open_ids, f"tool calls left without results: {open_ids}"


def test_cut_lands_on_a_user_message() -> None:
    session = store.create()
    for i in range(20):
        _exchange(session, i)

    compacted = _compact(session)

    # First message is the digest; the conversation proper must resume at a
    # user turn, never mid tool-exchange.
    assert compacted[0]["role"] == "user"
    assert "saved on the server" in compacted[0]["content"]
    assert compacted[1]["role"] == "user"


def test_digest_carries_the_saved_draft() -> None:
    """Dropped turns are only safe because their content is in the draft."""
    session = store.create()
    session.set_field("full_name", "Yassine Sinif")
    session.set_field("skills", "Languages: Python, TypeScript")
    for i in range(20):
        _exchange(session, i)

    digest = _compact(session)[0]["content"]

    assert "Yassine Sinif" in digest
    assert "skills" in digest


def test_system_prompt_stays_the_stable_prefix() -> None:
    """Prompt caching only pays if nothing variable is prepended ahead of the
    system message."""
    session = store.create()
    for i in range(20):
        _exchange(session, i)

    wire = _wire_messages(session)

    assert wire[0]["role"] == "system"
    assert "resume writer" in wire[0]["content"]


def test_growth_is_linear_not_quadratic() -> None:
    """The whole justification, measured: per-request size must flatten."""
    session = store.create()
    sizes = []
    for i in range(30):
        _exchange(session, i)
        sizes.append(sum(len(str(m)) for m in _compact(session)))

    early = sizes[VERBATIM_WINDOW]
    late = sizes[-1]

    # Without compaction `late` would be several times `early`; bounded, it
    # settles to roughly a constant.
    assert late < early * 2, f"history still growing: {early} -> {late}"
