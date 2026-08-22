"""Extraction is heuristic, so these tests pin the behaviour that matters:
sections get found, layout noise gets dropped, and an unreadable file fails
with a message a visitor can act on rather than a stack trace.
"""
from __future__ import annotations

import pytest

from app.cv.builder import build_resume
from app.cv.extract import SECTION_CAP, ExtractionError, extract_cv

PLAIN_CV = """\
Yassine Sinif
yassinsinif4@gmail.com | +212 6 23 84 25 35
github.com/Inssaya

Profile
Final-year engineering student in AI & Data Science.

Experience
AI Data Engineer Intern, Aptiv, Tangier, 2026
- Built a maintenance KPI platform.

Education
Engineering Degree, EMSI Casablanca, 2022-2027

Skills
Python, TypeScript, Kafka, PostgreSQL

Languages
Arabic - Native
French - B2
"""


def test_finds_sections_in_plain_text() -> None:
    result = extract_cv(PLAIN_CV.encode("utf-8"), "cv.txt")

    assert set(result["sections"]) >= {"profile", "experience", "education", "skills", "languages"}
    assert "Aptiv" in result["sections"]["experience"]
    assert "full_text" not in result["sections"], "should not fall back when headings were found"


def test_finds_name_and_contact() -> None:
    result = extract_cv(PLAIN_CV.encode("utf-8"), "cv.txt")

    assert result["estimated_name"] == "Yassine Sinif"
    assert "yassinsinif4@gmail.com" in result["contact_candidates"]
    assert any("+212" in c for c in result["contact_candidates"])


@pytest.mark.parametrize(
    "written",
    [
        "+212 6 23 84 25 35",   # single-digit group after the country code
        "+212623842535",
        "+33 6 12 34 56 78",
        "0623842535",
        "06 23 84 25 35",
        "+1 (555) 123-4567",
    ],
)
def test_phone_keeps_its_country_code(written: str) -> None:
    """Regression: fixed-width digit groups used to drop '+212 6', leaving
    '23 84 25 35'. A CV that loses its country code is worse than one with no
    phone at all."""
    result = extract_cv(f"Jane Doe\n{written}\n\nSkills\nPython\n".encode(), "cv.txt")
    found = " ".join(result["contact_candidates"])

    digits = "".join(c for c in written if c.isdigit())
    assert "".join(c for c in found if c.isdigit()).endswith(digits[-8:])
    if written.startswith("+"):
        assert "+" in found, f"country code dropped from {written!r}"


def test_date_range_is_not_read_as_a_phone_number() -> None:
    """'2022-2027' has enough digits to pass the length filter, so the pattern
    itself has to exclude it."""
    result = extract_cv(b"Jane Doe\n\nEducation\nEMSI Casablanca 2022-2027\n", "cv.txt")

    assert not any(c.strip().startswith(("2022", "2027")) for c in result["contact_candidates"])


def test_headingless_cv_falls_back_to_full_text() -> None:
    """A CV with no recognisable headings must still reach the model."""
    result = extract_cv(b"Jane Doe\nWorked at Acme doing things.\n", "cv.txt")

    assert "full_text" in result["sections"]
    assert "Acme" in result["sections"]["full_text"]


def test_drops_repeated_running_headers() -> None:
    """A header repeated on every page is layout noise, not content."""
    noisy = "Curriculum Vitae\n" * 5 + "Experience\nReal content here.\n"
    result = extract_cv(noisy.encode("utf-8"), "cv.txt")

    body = "\n".join(result["sections"].values())
    assert body.count("Curriculum Vitae") <= 2
    assert "Real content here." in body


def test_drops_page_numbers() -> None:
    text = "Experience\nPage 1 of 3\nDid the work.\n2\nMore work.\n"
    result = extract_cv(text.encode("utf-8"), "cv.txt")

    experience = result["sections"]["experience"]
    assert "Page 1 of 3" not in experience
    assert "Did the work." in experience
    assert "More work." in experience


def test_page_number_stripping_spares_a_bare_phone_number() -> None:
    """Regression: an unbounded \\d+ page-number pattern also matched a phone
    written without separators, deleting it from the CV before extraction."""
    result = extract_cv(b"Jane Doe\n0623842535\n\nSkills\nPython\n", "cv.txt")

    assert any("0623842535" in c.replace(" ", "") for c in result["contact_candidates"])


def test_sections_are_capped() -> None:
    """A padded CV must not be able to blow the context window."""
    huge = "Experience\n" + ("Did a thing that took a while. " * 500)
    result = extract_cv(huge.encode("utf-8"), "cv.txt")

    assert len(result["sections"]["experience"]) <= SECTION_CAP


def test_roundtrip_from_generated_pdf() -> None:
    """The strongest available check: render a CV, then read it back.

    If the renderer and the extractor disagree, a visitor uploading a CV this
    very service produced would come back mangled.
    """
    pdf_bytes, _ = build_resume(
        full_name="Yassine Sinif",
        headline="AI & Data Engineering",
        contact="Casablanca\nyassinsinif4@gmail.com",
        experience="AI Data Engineer | Aptiv | 2026 | Tangier\n- Built the platform.",
        skills="Languages: Python, TypeScript",
        style="modern",
    )

    result = extract_cv(pdf_bytes, "generated.pdf")
    blob = " ".join(result["sections"].values()) + " ".join(result["contact_candidates"])

    assert "Aptiv" in blob
    assert "yassinsinif4@gmail.com" in blob


def test_scanned_pdf_gives_an_actionable_error() -> None:
    """An image-only PDF is a real case; the message must tell them what to do."""
    with pytest.raises(ExtractionError) as caught:
        extract_cv(b"%PDF-1.4\n%garbage that yields no text\n", "scan.pdf")

    assert str(caught.value), "error must carry a message"


def test_unsupported_type_is_rejected_by_name() -> None:
    with pytest.raises(ExtractionError, match="Unsupported file type"):
        extract_cv(b"\x00\x01", "resume.pages")
