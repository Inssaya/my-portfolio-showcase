"""The agent loop and the tool layer, driven by a scripted fake model.

No network and no API key: the point is to pin the mechanics — that tool calls
mutate session state, that usage accumulates across rounds, that a runaway model
is stopped — none of which needs a real provider to verify, and all of which
would be expensive and non-deterministic to test against one.
"""
from __future__ import annotations

import pytest

from app import agent as agent_module
from app.llm import Completion, ToolCall
from app.session import Session, store
from app.tools import run_tool


@pytest.fixture(autouse=True)
def _clean_sessions():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def session() -> Session:
    return store.create()


def _fake_llm(monkeypatch, script: list[Completion]):
    """Replace the provider call with a fixed sequence of responses."""
    calls = {"n": 0}

    def fake_complete(messages, tools=None, sticky_key=None):
        index = calls["n"]
        calls["n"] += 1
        if index >= len(script):
            raise AssertionError("the agent asked for more rounds than scripted")
        return script[index]

    monkeypatch.setattr(agent_module, "complete", fake_complete)
    return calls


# ------------------------------------------------------------------ tools

def test_update_resume_writes_the_field(session: Session) -> None:
    out = run_tool(session, "update_resume", {"field": "full_name", "content": "Jane Doe"})

    assert session.draft["full_name"] == "Jane Doe"
    assert "full_name" in out


def test_update_resume_rejects_an_unknown_field(session: Session) -> None:
    """The model must be told, not 500'd, so it can correct itself."""
    out = run_tool(session, "update_resume", {"field": "favourite_colour", "content": "blue"})

    assert "not a section" in out
    assert session.draft == {}


def test_generate_refuses_without_a_name(session: Session) -> None:
    session.set_field("skills", "Languages: Python")

    out = run_tool(session, "generate_resume", {})

    assert "full_name" in out
    assert session.pdf is None, "must not render a nameless CV"


def test_generate_renders_and_stores_the_pdf(session: Session) -> None:
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")

    out = run_tool(session, "generate_resume", {})

    assert session.pdf is not None and session.pdf.startswith(b"%PDF-")
    assert session.pdf_version == 1
    assert session.pdf_name == "cv-jane-doe.pdf"
    assert "Rendered" in out


def test_regenerating_bumps_the_version(session: Session) -> None:
    """The client tells a fresh PDF from a re-offer by the version alone."""
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")
    run_tool(session, "generate_resume", {})
    run_tool(session, "update_resume", {"field": "headline", "content": "Engineer"})
    run_tool(session, "generate_resume", {})

    assert session.pdf_version == 2


def test_review_draft_reports_what_is_missing(session: Session) -> None:
    session.set_field("full_name", "Jane Doe")

    out = run_tool(session, "review_draft")

    assert "Jane Doe" in out
    assert "still empty" in out and "experience" in out


def test_long_fields_are_summarised_not_echoed(session: Session) -> None:
    """The whole token argument: review_draft must not read back the full CV."""
    session.set_field("experience", "\n".join(f"- Did thing number {i}" for i in range(60)))

    out = run_tool(session, "review_draft")

    assert len(out) < 600
    assert "60 lines" in out


# ------------------------------------------------------------------ loop

def test_plain_reply_ends_the_turn(monkeypatch, session: Session) -> None:
    _fake_llm(monkeypatch, [Completion(content="Hello, what's your name?", prompt_tokens=90, completion_tokens=12)])

    result = agent_module.run_turn(session, "hi")

    assert result["reply"] == "Hello, what's your name?"
    assert result["pdf_ready"] is False
    assert session.usage.total == 102


def test_tool_round_then_reply(monkeypatch, session: Session) -> None:
    _fake_llm(
        monkeypatch,
        [
            Completion(
                content="",
                tool_calls=[ToolCall("c1", "update_resume", {"field": "full_name", "content": "Jane Doe"})],
                prompt_tokens=100,
                completion_tokens=20,
            ),
            Completion(content="Got it, Jane.", prompt_tokens=130, completion_tokens=8),
        ],
    )

    result = agent_module.run_turn(session, "I'm Jane Doe")

    assert session.draft["full_name"] == "Jane Doe"
    assert result["reply"] == "Got it, Jane."
    # Usage must cover the tool round too — that request was paid for.
    assert session.usage.total == 258


def test_parallel_tool_calls_all_run(monkeypatch, session: Session) -> None:
    """Filling a CV from an upload depends on batching calls into one round."""
    _fake_llm(
        monkeypatch,
        [
            Completion(
                content="",
                tool_calls=[
                    ToolCall("a", "update_resume", {"field": "full_name", "content": "Jane Doe"}),
                    ToolCall("b", "update_resume", {"field": "headline", "content": "Data Engineer"}),
                    ToolCall("c", "update_resume", {"field": "skills", "content": "Languages: Python"}),
                ],
            ),
            Completion(content="Saved all three."),
        ],
    )

    agent_module.run_turn(session, "here are my details")

    assert session.draft["full_name"] == "Jane Doe"
    assert session.draft["headline"] == "Data Engineer"
    assert session.draft["skills"] == "Languages: Python"


def test_generate_marks_the_turn_pdf_ready(monkeypatch, session: Session) -> None:
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")
    _fake_llm(
        monkeypatch,
        [
            Completion(content="", tool_calls=[ToolCall("g", "generate_resume", {})]),
            Completion(content="Your CV is ready."),
        ],
    )

    result = agent_module.run_turn(session, "yes, build it")

    assert result["pdf_ready"] is True
    assert "Built the CV" in result["actions"]


def test_runaway_model_is_stopped(monkeypatch, session: Session) -> None:
    """A model that only ever calls tools must not bill forever."""
    from app.config import get_settings

    rounds = get_settings().max_tool_rounds
    _fake_llm(
        monkeypatch,
        [Completion(content="", tool_calls=[ToolCall("r", "review_draft", {})]) for _ in range(rounds)],
    )

    result = agent_module.run_turn(session, "go")

    assert "tangled" in result["reply"]
    assert session.history[-1]["role"] == "assistant"


def test_tool_failure_is_reported_to_the_model(monkeypatch, session: Session) -> None:
    """A broken tool becomes a message the model can recover from, not a 500."""
    def boom(*_args, **_kwargs):
        raise RuntimeError("renderer exploded")

    monkeypatch.setattr(agent_module, "run_tool", boom)
    _fake_llm(
        monkeypatch,
        [
            Completion(content="", tool_calls=[ToolCall("x", "generate_resume", {})]),
            Completion(content="Something went wrong building that."),
        ],
    )

    result = agent_module.run_turn(session, "build it")

    assert result["reply"] == "Something went wrong building that."
    tool_message = [m for m in session.history if m.get("role") == "tool"][-1]
    assert "RuntimeError" in tool_message["content"]


# ------------------------------------------------------------------ upload

def test_seeding_an_upload_puts_sections_in_context(session: Session) -> None:
    agent_module.seed_uploaded_cv(
        session,
        {
            "estimated_name": "Jane Doe",
            "contact_candidates": ["jane@example.com"],
            "sections": {"experience": "Did the work at Acme."},
            "notes": ["Recognised sections: experience."],
        },
        "jane.pdf",
    )

    blob = session.history[-1]["content"]
    assert "jane.pdf" in blob
    assert "Jane Doe" in blob
    assert "Acme" in blob
    # It must be flagged unconfirmed, or the model will assert it as fact.
    assert "unconfirmed" in blob.lower()


# ------------------------------------------------- truthfulness about the PDF

def test_review_warns_when_no_pdf_exists(session: Session) -> None:
    """Regression: a live run had the model read the draft back and announce
    'Your CV is ready!' having never called generate_resume. The tool result
    now states the file's existence as fact."""
    session.set_field("full_name", "Jane Doe")

    out = run_tool(session, "review_draft")

    assert "NO PDF EXISTS YET" in out
    assert "generate_resume" in out


def test_review_confirms_an_existing_pdf(session: Session) -> None:
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")
    run_tool(session, "generate_resume", {})

    out = run_tool(session, "review_draft")

    assert "A PDF exists (version 1" in out
    assert "NO PDF EXISTS YET" not in out


def test_review_reports_the_current_version_after_an_edit(session: Session) -> None:
    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")
    run_tool(session, "generate_resume", {})
    run_tool(session, "generate_resume", {})

    assert "version 2" in run_tool(session, "review_draft")


def test_prompt_forbids_inventing_dates_and_degrees() -> None:
    """Regression: from 'final year at EMSI' the model produced 'Bachelor's
    Degree ... | 2023' — a degree name and a year the visitor never said."""
    from app.agent import SYSTEM_PROMPT

    assert "NEVER WRITE A FACT THEY DID NOT GIVE YOU" in SYSTEM_PROMPT
    assert "Bachelor" in SYSTEM_PROMPT, "the concrete counter-example earns its tokens"


def test_generate_refuses_a_name_only_draft(session: Session) -> None:
    """Regression: the model described an uploaded CV in prose without calling
    update_resume, then rendered — producing a CV containing one line."""
    session.set_field("full_name", "Jane Doe")
    session.set_field("headline", "Data Engineer")

    out = run_tool(session, "generate_resume", {})

    assert "only a name" in out
    assert session.pdf is None, "must not hand somebody a CV with no content"


def test_generate_proceeds_once_there_is_substance(session: Session) -> None:
    session.set_field("full_name", "Jane Doe")
    session.set_field("experience", "Engineer | Acme | 2024\n- Did the work.")

    run_tool(session, "generate_resume", {})

    assert session.pdf is not None


def test_upload_prompt_demands_saving_before_describing() -> None:
    from app.agent import SYSTEM_PROMPT

    assert "Describing a section is not saving it" in SYSTEM_PROMPT


def test_pdf_status_is_injected_every_turn(session: Session) -> None:
    """review_draft reports this too, but only to a model that calls it — and a
    model that thinks it is finished calls nothing."""
    from app.agent import _wire_messages

    wire = _wire_messages(session)
    assert "no PDF exists yet" in wire[-1]["content"]

    session.set_field("full_name", "Jane Doe")
    session.set_field("skills", "Languages: Python")
    run_tool(session, "generate_resume", {})

    assert "a PDF exists, version 1" in _wire_messages(session)[-1]["content"]


def test_pdf_status_does_not_disturb_the_cached_prefix(session: Session) -> None:
    """It is appended, not inserted: prepending anything variable ahead of the
    system prompt would invalidate the prompt cache on every turn."""
    from app.agent import SYSTEM_PROMPT, _wire_messages

    wire = _wire_messages(session)
    assert wire[0]["role"] == "system" and wire[0]["content"] == SYSTEM_PROMPT
