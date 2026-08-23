"""Catching years the model invented rather than transcribed.

Regression coverage for a real failure: told "final year at EMSI", a session
produced "ESM · 2023" — a year nobody said. The placeholder scrubber in
builder.py cannot catch this (2023 looks exactly like real data), so this is a
different check: not whether text looks fabricated, but whether it traces back
to something the visitor actually said or uploaded.

Verification happens at write time in tools.update_resume, not "after a turn",
because POST /generate (the Build button) renders straight from session.draft
without calling the model — the only way to protect that path is to never let
an invented year into the draft in the first place.
"""
from __future__ import annotations

import pytest

from app.cv.verify import input_years, strip_invented_years
from app.session import Session, store
from app.tools import run_tool
from conftest import TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def session() -> Session:
    return store.create(user_id=TEST_USER_ID)


# ------------------------------------------------------------- input_years

def test_years_are_read_from_user_messages() -> None:
    transcript = [{"role": "user", "content": "I started in 2020 and finished in 2024"}]
    assert input_years(transcript) == {"2020", "2024"}


def test_years_are_read_from_seeded_upload_text() -> None:
    transcript = [{"role": "system", "kind": "upload", "content": "EMSI, Casablanca · 2022"}]
    assert input_years(transcript) == {"2022"}


def test_a_plain_system_message_without_upload_kind_is_not_input() -> None:
    """Only the seeded upload text counts — an ordinary system note is not
    something the visitor said."""
    transcript = [{"role": "system", "content": "note mentioning 2099"}]
    assert input_years(transcript) == set()


def test_the_models_own_replies_do_not_count_as_input() -> None:
    """If the model invents a year in one turn, that reply must not become the
    justification for the same year on the next write."""
    transcript = [{"role": "assistant", "content": "Got it, ESM · 2023"}]
    assert input_years(transcript) == set()


def test_a_five_digit_number_does_not_match_as_a_year() -> None:
    transcript = [{"role": "user", "content": "reference number 20231"}]
    assert input_years(transcript) == set()


# --------------------------------------------------------- strip_invented_years

def test_an_unconfirmed_year_is_removed() -> None:
    cleaned, removed = strip_invented_years("EMSI, Casablanca · 2023", allowed=set())
    assert removed == {"2023"}
    assert "2023" not in cleaned
    assert cleaned == "EMSI, Casablanca"


def test_a_confirmed_year_survives() -> None:
    cleaned, removed = strip_invented_years("EMSI, Casablanca · 2022", allowed={"2022"})
    assert removed == set()
    assert cleaned == "EMSI, Casablanca · 2022"


def test_content_with_no_years_is_untouched() -> None:
    cleaned, removed = strip_invented_years("Managed cash flow effectively.", allowed=set())
    assert removed == set()
    assert cleaned == "Managed cash flow effectively."


def test_one_confirmed_one_invented_in_the_same_field() -> None:
    cleaned, removed = strip_invented_years("2024 - 2025 - 1 month", allowed={"2024"})
    assert removed == {"2025"}
    assert "2025" not in cleaned
    assert "2024" in cleaned


def test_a_year_alone_in_the_field_leaves_it_empty() -> None:
    cleaned, removed = strip_invented_years("2023", allowed=set())
    assert removed == {"2023"}
    assert cleaned == ""


def test_multiline_content_is_cleaned_line_by_line() -> None:
    cleaned, removed = strip_invented_years(
        "Role | Employer | 2023\nDid the work.", allowed=set()
    )
    assert removed == {"2023"}
    assert "2023" not in cleaned
    assert "Did the work." in cleaned


# ------------------------------------------------------------ end to end

def test_update_resume_scrubs_an_invented_year(session: Session) -> None:
    """The exact real-world shape: 'final year at EMSI' -> 'ESM · 2023'."""
    session.transcript.append(
        {"role": "user", "content": "I'm a 2nd year student at ESM, no year given"}
    )

    out = run_tool(session, "update_resume", {"field": "education", "content": "ESM · 2023"})

    assert "2023" not in session.draft["education"]
    assert "unconfirmed year" in out
    assert "2023" in out


def test_update_resume_keeps_a_year_the_visitor_actually_gave(session: Session) -> None:
    session.transcript.append({"role": "user", "content": "I started in 2020 and finished in 2024"})

    out = run_tool(
        session, "update_resume", {"field": "education", "content": "EMSI · 2020 - 2024"}
    )

    assert "2020" in session.draft["education"] and "2024" in session.draft["education"]
    assert "unconfirmed year" not in out


def test_update_resume_keeps_a_year_from_an_uploaded_cv(session: Session) -> None:
    session.transcript.append(
        {"role": "system", "kind": "upload", "content": "Aptiv | 2026 | Tangier"}
    )

    run_tool(session, "update_resume", {"field": "experience", "content": "AI Intern | Aptiv | 2026"})

    assert "2026" in session.draft["experience"]


def test_the_build_button_never_sees_an_invented_year(session: Session) -> None:
    """POST /generate calls generate_resume directly, with no model in the
    loop — proving the draft itself is already clean is what matters, not
    that a later check catches it."""
    session.transcript.append({"role": "user", "content": "final year at EMSI, no dates given"})
    run_tool(session, "update_resume", {"field": "full_name", "content": "Ahmed Sefriui"})
    run_tool(session, "update_resume", {"field": "education", "content": "ESM · 2023"})

    assert "2023" not in session.draft["education"]

    run_tool(session, "generate_resume", {})
    assert session.pdf is not None
