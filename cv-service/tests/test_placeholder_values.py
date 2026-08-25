"""Catching template/example values a real CV never contains.

Regression coverage for a real failure: a visitor uploaded a half-filled CV
template and the draft was saved holding its placeholder junk —
"kenza@example.com", "University of Example", "123-456-7890". builder.py's
_PLACEHOLDERS scrubs single-word labels ("Company Name") but not these
multi-token, structured placeholders, so they reached the rendered CV.

Like the invented-year check, this runs at write time in tools.update_resume,
because POST /generate renders straight from session.draft without the model —
the only way to protect that path is to never let a placeholder into the draft.
"""
from __future__ import annotations

import pytest

from app.cv.verify import strip_placeholder_values
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


# ------------------------------------------------- strip_placeholder_values

def test_example_email_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("Email: kenza@example.com")
    assert cleaned == ""
    assert removed == ["kenza@example.com"]


def test_keyboard_walk_phone_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("Phone: 123-456-7890")
    assert cleaned == ""
    assert "123-456-7890" in removed


def test_template_university_is_removed_but_column_kept_empty() -> None:
    cleaned, removed = strip_placeholder_values(
        "Bachelor's Degree | University of Example | 2023"
    )
    assert "University of Example" in removed
    assert "University of Example" not in cleaned
    # The empty column stays empty rather than collapsing the whole line —
    # matches the system prompt's "LEAVE EMPTY COLUMNS EMPTY".
    assert "Bachelor's Degree" in cleaned


def test_real_contact_details_are_left_alone() -> None:
    text = "Email: kenza.mrabet0908@gmail.com\nPhone: +212 612345678"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


# ---------------------------------------------------- Canva's default template
# A real upload (a "reallygreatsite.com" Canva resume template a visitor only
# partly personalised) exposed a second gap of the same shape as
# kenza@example.com: Canva's own placeholder domain and its boilerplate
# "123 Anywhere St., Any City" address are shipped, unchanged, in real
# templates and were not caught by any existing pattern.

def test_canva_placeholder_email_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("hello@reallygreatsite.com")
    assert cleaned == ""
    assert removed == ["hello@reallygreatsite.com"]


def test_canva_placeholder_address_is_removed_cleanly() -> None:
    cleaned, removed = strip_placeholder_values("123 Anywhere St., Any City")
    assert cleaned == ""
    assert "123 Anywhere St" in removed
    assert "Any City" in removed


def test_a_real_street_address_is_left_alone() -> None:
    text = "12 Rue Ibn Sina, Casablanca"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


def test_real_headings_and_content_survive() -> None:
    text = "EXPERIENCE\nIntern | Aptiv | Feb 2024\nSkills: Python, Java"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


# ----------------------------------------------------- via update_resume

def test_update_resume_scrubs_template_contact(session: Session) -> None:
    out = run_tool(
        session,
        "update_resume",
        {"field": "contact", "content": "Email: kenza@example.com\nPhone: 123-456-7890"},
    )
    assert "example.com" not in session.draft.get("contact", "")
    assert "123-456-7890" not in session.draft.get("contact", "")
    assert "template placeholder" in out


def test_update_resume_keeps_a_real_email(session: Session) -> None:
    out = run_tool(
        session,
        "update_resume",
        {"field": "contact", "content": "kenza.mrabet0908@gmail.com"},
    )
    assert "kenza.mrabet0908@gmail.com" in session.draft["contact"]
    assert "template placeholder" not in out


def test_the_build_button_never_sees_a_template_placeholder(session: Session) -> None:
    run_tool(session, "update_resume", {"field": "full_name", "content": "Kenza Mrabet"})
    run_tool(session, "update_resume", {"field": "contact", "content": "kenza@example.com"})
    assert "example.com" not in session.draft.get("contact", "")
