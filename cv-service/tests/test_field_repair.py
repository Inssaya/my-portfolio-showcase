"""Repairing the ways a model mangles line breaks.

Every renderer field is line-oriented, so a section that arrives as one unbroken
line becomes one unwrapped run that overflows the page. Both faults below were
observed in a real container run and both destroyed the CV.

The escaped sequences are built with `chr(92)` rather than written inline.
A literal-vs-escaped backslash is exactly the distinction under test, and a
source file that is edited, copied through a shell, or reformatted can silently
lose one — which would leave the test passing while testing nothing.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv.builder import build_resume
from app.session import store
from conftest import TEST_USER_ID

BS = chr(92)  # a single backslash
ESC_N = BS + "n"  # the two characters a double-escaping model sends


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


def test_the_fixture_really_is_two_characters() -> None:
    """Guards the guard: if ESC_N were a real newline these tests prove nothing."""
    assert len(ESC_N) == 2
    assert "\n" not in ESC_N


def test_literal_backslash_n_becomes_a_newline() -> None:
    """The model double-escapes its JSON arguments, so a line break arrives as
    a backslash followed by an 'n'."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("languages", f"Arabic — Native{ESC_N}French — B2{ESC_N}English — B2")

    stored = session.draft["languages"]
    assert ESC_N not in stored
    assert stored.count("\n") == 2
    assert stored.splitlines()[1] == "French — B2"


def test_escaped_crlf_and_tabs_are_repaired() -> None:
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("skills", f"Languages: Python{BS}r{BS}nData: pandas{BS}tNumPy")

    stored = session.draft["skills"]
    assert BS + "r" not in stored and BS + "t" not in stored
    assert stored.splitlines()[0] == "Languages: Python"


def test_real_newlines_are_untouched() -> None:
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("languages", "Arabic — Native\nFrench — B2")

    assert session.draft["languages"] == "Arabic — Native\nFrench — B2"


def test_a_backslash_that_is_not_an_escape_survives() -> None:
    """Only the escape sequences are rewritten, not every backslash."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("skills", f"Tools: C:{BS}Program Files, awk")

    assert f"C:{BS}Program Files" in session.draft["skills"]


def test_piped_contact_becomes_one_item_per_line() -> None:
    """The model borrows the entry-header delimiter for a flat field."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field(
        "contact", "Casablanca, Morocco | +212 6 23 84 25 35 | me@example.com"
    )

    assert session.draft["contact"].splitlines() == [
        "Casablanca, Morocco",
        "+212 6 23 84 25 35",
        "me@example.com",
    ]


def test_pipes_in_experience_are_preserved() -> None:
    """There the pipe is load-bearing — it delimits title, employer and dates."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field(
        "experience", "AI Data Engineer | Aptiv | Jun 2026 | Tangier\n- Did the work."
    )

    assert "AI Data Engineer | Aptiv | Jun 2026 | Tangier" in session.draft["experience"]


def test_contact_with_newlines_is_not_re_split() -> None:
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("contact", "Casablanca\nme@example.com")

    assert session.draft["contact"].splitlines() == ["Casablanca", "me@example.com"]


def test_repaired_fields_render_as_separate_lines() -> None:
    """End to end: the mangled input must reach the page as real lines."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Yassine Sinif")
    session.set_field("languages", f"Arabic — Native{ESC_N}French — B2{ESC_N}English — B2")
    session.set_field("skills", f"Languages: Python{ESC_N}Data: pandas, NumPy")

    pdf_bytes, pages = build_resume(
        full_name=session.draft["full_name"],
        languages=session.draft["languages"],
        skills=session.draft["skills"],
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages)

    assert ESC_N not in text, "literal escape reached the page"
    assert "French — B2" in text
    assert "Data: pandas, NumPy" in text or "pandas" in text
    assert pages == 1


def test_an_overlong_title_is_demoted_instead_of_overflowing() -> None:
    """Titles are drawn unwrapped, so a collapsed experience block used to run
    straight off both edges of the page and over the rest of the CV."""
    from app.cv.builder import MAX_TITLE_CHARS, _polish_entries
    from app.cv._cvdesign import parse_entries

    runaway = "Software Engineering Intern " * 12
    entries = _polish_entries(parse_entries(f"{runaway} | Aptiv | 2026 | Tangier"))

    assert entries[0].title == "", "an overlong title must not stay a title"
    assert len(entries[0].notes) == 1
    assert len(runaway.strip()) > MAX_TITLE_CHARS

    # And it still renders, with the text preserved in the wrapped body.
    pdf_bytes, _ = build_resume(
        full_name="Yassine Sinif", experience=f"{runaway} | Aptiv | 2026 | Tangier"
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages)
    assert "Software Engineering Intern" in text
