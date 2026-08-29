"""The renderer must produce a real, readable PDF from block-formatted input.

These assert on extracted text rather than bytes: a PDF that is structurally
valid but has lost the person's job title is the failure worth catching, and
byte comparison would only catch a renderer upgrade.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv.builder import (
    CLASSIC_ACCENTS,
    MODERN_PALETTES,
    RESUME_FIELDS,
    build_resume,
)

SAMPLE = {
    "full_name": "Yassine Sinif",
    "headline": "AI & Data Engineering",
    "contact": "Casablanca, Morocco\n+212 6 23 84 25 35\nyassinsinif4@gmail.com\ngithub.com/Inssaya",
    "profile": "Final-year engineering student in AI & Data Science, looking for a PFE internship.",
    "experience": (
        "AI Data Engineer Intern | Aptiv | Jun 2026 - Aug 2026 | Tangier, Morocco\n"
        "- Built a maintenance KPI platform replacing a manual Excel workflow.\n"
        "- Designed a predictive maintenance module ranking machines by failure risk.\n"
    ),
    "education": "Engineering Degree, Computer Science & Networks | EMSI Casablanca | 2022-2027\nSpecialization: AI & Data Science",
    "skills": "Languages: Python, TypeScript, Java\nData: PostgreSQL, Kafka, ETL",
    "languages": "Arabic - Native\nFrench - B2\nEnglish - B2",
    "projects": "Nexora AI - Call-center SaaS with on-premise RAG",
    "certifications": "Python for Data Science - IBM, 2025",
}


def _text_of(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _drawing_commands(pdf_bytes: bytes) -> str:
    """The decompressed content streams — where colours actually live.

    `extract_text()` cannot see a fill colour: it is a drawing operator, not
    text. Reading the raw stream is the only way to assert on what was
    *painted* rather than what was written.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(
        page.get_contents().get_data().decode("latin-1") for page in reader.pages
    )


def _rgb_triple(hex_colour: str) -> str:
    """'#254553' -> '.145098 .270588 .32549', how ReportLab writes an rg.

    Built with ReportLab's own float formatter rather than an f-string: it
    strips the leading zero *and* trailing zeros, so a hand-rolled '%.6f'
    produces a string that never appears in the file and a test using one
    fails against output that is perfectly correct.
    """
    from reportlab.lib.rl_accel import fp_str

    return fp_str(*(int(hex_colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5)))


ALL_STYLES = [
    "modern", "modern-blue", "modern-plum", "modern-burgundy",
    "classic", "classic-blue", "classic-green", "classic-burgundy",
    "bold",
]


@pytest.mark.parametrize("style", ALL_STYLES)
def test_renders_a_valid_pdf(style: str) -> None:
    pdf_bytes, pages = build_resume(style=style, **SAMPLE)

    assert pdf_bytes.startswith(b"%PDF-"), "not a PDF"
    assert pages >= 1
    # SAMPLE is a short CV. It fits on one page, so tolerating two was not
    # leniency but a blind spot: a real draft shipped a second page holding
    # three lines and this suite called it acceptable. See test_layout.py.
    assert pages == 1, f"{style} produced {pages} pages for a one-page CV"


@pytest.mark.parametrize("style", ALL_STYLES)
def test_content_survives_rendering(style: str) -> None:
    """The facts a recruiter reads must actually be in the file.

    Case-insensitive on purpose: the classic template sets the name in caps as
    a design choice, so asserting exact case would test the styling, not that
    the content survived.
    """
    pdf_bytes, _ = build_resume(style=style, **SAMPLE)
    text = _text_of(pdf_bytes).lower()

    for needle in ("yassine sinif", "aptiv", "emsi", "python"):
        assert needle in text, f"{needle!r} missing from the {style} PDF"


def test_empty_sections_are_skipped() -> None:
    """A CV with only a name must render rather than crash on empty blocks."""
    pdf_bytes, pages = build_resume(full_name="Sam Taylor")

    assert pdf_bytes.startswith(b"%PDF-")
    assert pages == 1
    assert "Sam Taylor" in _text_of(pdf_bytes)


def test_recolouring_modern_leaves_plain_modern_untouched() -> None:
    """`modern` is the house style and matches a printed reference, so making
    it recolourable must not move it by a shade.

    The risk is specific: `modern` could have been re-expressed as "a variant
    that happens to pass the reference hexes", at which point a rounding
    difference in the colour plumbing silently repaints the one template that
    is not allowed to change. It passes no colours at all instead.

    Compares drawing commands, not raw bytes: ReportLab stamps a creation
    timestamp and document ID into every file, so two renders of identical
    content are never byte-equal and a bytes assertion would fail on the
    clock rather than on anything drawn.
    """
    default, _ = build_resume(**SAMPLE)
    explicit, _ = build_resume(style="modern", **SAMPLE)

    assert _drawing_commands(explicit) == _drawing_commands(default), (
        "naming `modern` painted something different from the default"
    )
    # And the reference palette specifically, in case both drifted together.
    assert _rgb_triple("#254553") in _drawing_commands(default), (
        "modern no longer paints its measured reference teal"
    )


def test_modern_variants_recolour_both_band_and_accent() -> None:
    """A modern variant moves two colours, and the failure worth catching is
    moving only one — a plum sidebar with the original teal headings reads as
    a rendering bug, not a palette.

    Checked structurally rather than by eye: every variant's declared sidebar
    and accent must both appear in the PDF's drawing commands, and the
    reference teal band must not survive into a variant that replaced it.
    """
    reference_band = _rgb_triple("#254553")  # modern's own teal

    for style, (sidebar, accent) in MODERN_PALETTES.items():
        rendered, _ = build_resume(style=style, **SAMPLE)
        text = _drawing_commands(rendered)

        for role, hex_colour in (("sidebar", sidebar), ("accent", accent)):
            assert _rgb_triple(hex_colour) in text, (
                f"{style} does not paint its {role} colour {hex_colour}"
            )
        assert reference_band not in text, (
            f"{style} still paints the reference teal band — it recoloured only "
            "the accent, leaving a mismatched sidebar"
        )


def test_classic_variants_actually_change_colour() -> None:
    """Each `classic-*` is the same layout with a different accent — this pins
    that the colour actually reaches the page rather than being accepted and
    silently ignored, which is exactly the shape of bug that would still pass
    `test_renders_a_valid_pdf` (a valid PDF in the wrong colour is still a
    valid PDF).

    Compares raw bytes, not extracted text: colour is a drawing command, not
    something `extract_text()` would ever see either way.
    """
    baseline, _ = build_resume(style="classic", **SAMPLE)
    variant_bytes = {
        variant: build_resume(style=variant, **SAMPLE)[0] for variant in CLASSIC_ACCENTS
    }

    for variant, rendered in variant_bytes.items():
        assert rendered != baseline, f"{variant} rendered identically to plain classic"

    names = list(variant_bytes)
    for i, first in enumerate(names):
        for second in names[i + 1 :]:
            assert variant_bytes[first] != variant_bytes[second], (
                f"{first} and {second} rendered identically"
            )


def test_every_declared_field_is_accepted() -> None:
    """RESUME_FIELDS is what the tool schema offers the model, so build_resume
    must accept all of it — a mismatch would only surface at render time."""
    payload = {name: "Placeholder" for name in RESUME_FIELDS}
    payload["full_name"] = "Field Coverage"

    pdf_bytes, _ = build_resume(**payload)
    assert pdf_bytes.startswith(b"%PDF-")
