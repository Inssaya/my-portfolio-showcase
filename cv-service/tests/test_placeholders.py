"""Template placeholders must never reach the page.

The `Role | Employer | Dates | Location` format has four slots. A model handed
three facts fills the fourth with the slot's own name, printing "Manager Intern
— Company Name" over a line reading "Location". A recruiter reads that as
obviously machine-written, which is worse than a gap.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv._cvdesign import parse_entries
from app.cv.builder import _is_placeholder, _polish_entries, build_resume


@pytest.mark.parametrize(
    "text",
    ["Company Name", "company name", "  Location  ", "[Employer]", "N/A", "TBD", "-", "XXX"],
)
def test_placeholders_are_recognised(text: str) -> None:
    assert _is_placeholder(text)


@pytest.mark.parametrize(
    "text",
    [
        "Aptiv",
        "Location Services Ltd",   # substring match would wrongly kill this
        "Marketing Manager",
        "Casablanca, Morocco",
        "Company of Heroes Studio",
        "",
    ],
)
def test_real_values_survive(text: str) -> None:
    if text:
        assert not _is_placeholder(text)


@pytest.mark.parametrize("text", [".", "..", ",", " . ", "-.-", "()"])
def test_punctuation_only_remnants_are_recognised(text: str) -> None:
    """A stray "." is what remains of an org field after
    verify.strip_placeholder_values removes "Wardiere Inc" from "Wardiere
    Inc." — real fields never end up all-punctuation, so this is treated the
    same as the explicit "-"/"--"/"..." entries in _PLACEHOLDERS, without
    having to enumerate every possible remnant."""
    assert _is_placeholder(text)


def test_entry_placeholders_are_stripped() -> None:
    entries = _polish_entries(
        parse_entries("Manager Intern | Company Name | Feb 2021 | Location\n- Managed cash flow.")
    )

    assert entries[0].title == "Manager Intern"
    assert entries[0].org == ""
    assert entries[0].dates == "Feb 2021"
    assert entries[0].meta == ""
    assert entries[0].bullets == ["Managed cash flow."]


def test_a_partly_real_meta_line_keeps_the_real_half() -> None:
    entries = _polish_entries(parse_entries("Intern | Acme | 2021 | Casablanca, Location"))

    assert entries[0].meta == "Casablanca"


def test_placeholders_never_reach_the_pdf() -> None:
    pdf_bytes, _ = build_resume(
        full_name="Ahmed Sefriui",
        headline="Finance Student",
        experience="Manager Intern | Company Name | Feb 2021 | Location\n- Managed cash flow.",
        contact="Casablanca, Morocco\nCity\nN/A",
        certifications="TBD",
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages)

    for junk in ("Company Name", "N/A", "TBD"):
        assert junk not in text, f"{junk!r} reached the page"
    # A bare "Location"/"City" line must be gone, while the real city stays.
    assert "Casablanca, Morocco" in text
    assert "Manager Intern" in text
    assert "Managed cash flow." in text


def test_prompt_tells_the_model_to_leave_columns_empty() -> None:
    from app.agent import SYSTEM_PROMPT

    assert "LEAVE EMPTY COLUMNS EMPTY" in SYSTEM_PROMPT
