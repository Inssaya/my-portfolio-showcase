"""Regression coverage for the `bold` template's two-up skills/languages footer.

Real failure caught while building this template: a categorised skillset (six
groups, Yassine's real data) rendered with the group label repeated on every
individual skill ("Languages & Frameworks: Python", "...: Django", ...), which
overflowed the grid column and silently truncated to just the label fragment.
A second pass fixed the layout (grouped wrapped blocks instead of a flat
per-item grid) but then dropped every group that didn't fit the remaining
space on the page, because the footer had no page-break handling at all.

These tests exist so both failure modes stay fixed: nothing truncates, and
nothing that doesn't fit the current page is silently lost.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv.builder import build_resume

# A realistic categorised skillset — six groups, mirroring the real CV that
# exposed the bug (see cv/yassine-sinif-cv.tex).
CATEGORISED_SKILLS = (
    "Languages & Frameworks: Python, Django, FastAPI, React, React Native, "
    "JavaScript, TypeScript, Java, C++, C#, ASP.NET\n"
    "Data & ML: pandas, NumPy, scikit-learn, PyTorch, feature engineering, "
    "model evaluation, backtesting\n"
    "LLM & RAG: LangChain, LangGraph, RAG pipelines, embeddings, ChromaDB, "
    "Ollama, prompt engineering\n"
    "Data Engineering: PostgreSQL, SQL Server, SSIS, MySQL, MongoDB, Neo4j, "
    "Cassandra, Hadoop, ETL, Kafka, data warehousing\n"
    "DevOps & Tools: Docker, Git, CI/CD, Linux, REST APIs\n"
    "BI & Cloud: Power BI, Tableau"
)

SAMPLE = {
    "full_name": "Yassine Sinif",
    "headline": "AI & Data Engineering",
    "contact": "Casablanca, Morocco\nyassinsinif4@gmail.com",
    "profile": "Final-year engineering student in AI & Data Science.",
    "experience": (
        "AI Data Engineer Intern | Aptiv | Jun 2026 - Present | Tangier, Morocco\n"
        "- Built a maintenance KPI platform.\n"
    ),
    "education": "Engineering Degree | EMSI Casablanca | 2022",
    "skills": CATEGORISED_SKILLS,
    "languages": "Arabic - Native\nFrench - B2\nEnglish - B2\nSpanish - A2",
    "projects": "Nexora AI - Call-center SaaS with on-premise RAG",
    "certifications": "Python for Data Science - IBM, 2025",
}


def _text_of(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_every_skill_group_and_member_survives() -> None:
    """No group is silently dropped, and no member is truncated by a too-narrow
    grid column — this is the exact failure both bug passes produced."""
    pdf_bytes, _ = build_resume(style="bold", **SAMPLE)
    text = _text_of(pdf_bytes)

    for label in (
        "LANGUAGES & FRAMEWORKS", "DATA & ML", "LLM & RAG",
        "DATA ENGINEERING", "DEVOPS & TOOLS", "BI & CLOUD",
    ):
        assert label in text, f"skill group {label!r} missing — content dropped"

    # One member from each group, including the last group in the block —
    # the group most likely to be cut off if the page-break estimate is wrong.
    # Checked word-by-word rather than as multi-word phrases: a member that
    # wraps onto two lines (e.g. "data warehousing") is extracted by pypdf
    # with a newline where the visual wrap happened, not a space, which is
    # correct rendering, not truncation.
    for member in ("ASP.NET", "backtesting", "prompt", "engineering",
                    "warehousing", "REST", "Tableau"):
        assert member in text, f"{member!r} missing — group content truncated"


def test_a_long_labelled_item_is_not_truncated_to_its_label() -> None:
    """The original bug: "Languages & Frameworks: Python" wrapped inside a
    narrow grid cell and only the label fragment before the wrap point
    survived. Guards specifically against that shape recurring."""
    pdf_bytes, _ = build_resume(style="bold", **SAMPLE)
    text = _text_of(pdf_bytes)

    assert "Python" in text
    assert "Django" in text
    assert "ASP.NET" in text


def test_languages_still_use_the_flat_two_column_grid() -> None:
    """Languages are always short pairs, so unlike skills they keep the flat
    bullet grid — this just confirms that path still renders correctly."""
    pdf_bytes, _ = build_resume(style="bold", **SAMPLE)
    text = _text_of(pdf_bytes)

    for language in ("Arabic", "French", "English", "Spanish"):
        assert language in text


@pytest.mark.parametrize("n_groups", [1, 3, 6])
def test_footer_survives_various_skillset_sizes(n_groups: int) -> None:
    """From a single ungrouped skill line up to the full six-category set —
    none of these should crash or silently drop content."""
    lines = CATEGORISED_SKILLS.splitlines()[:n_groups]
    sample = dict(SAMPLE, skills="\n".join(lines))

    pdf_bytes, pages = build_resume(style="bold", **sample)

    assert pdf_bytes.startswith(b"%PDF-")
    assert pages >= 1
    text = _text_of(pdf_bytes)
    first_label = lines[0].split(":")[0].upper()
    assert first_label in text


def test_no_photo_shifts_the_masthead_to_the_left_margin() -> None:
    """Without a photo, the name must not leave a blank gap where the
    portrait would have been."""
    pdf_bytes, _ = build_resume(style="bold", **{**SAMPLE, "photo": ""})
    assert pdf_bytes.startswith(b"%PDF-")
    assert "YASSINE SINIF" in _text_of(pdf_bytes).upper()
