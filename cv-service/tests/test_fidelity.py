"""Fidelity to the reference CV (`cv/yassine-sinif-cv.pdf`).

The renderer exists to reproduce one specific document. Its palette, geometry
and fonts were measured off that PDF, so "still looks right" is a testable
property, not a matter of opinion — and a silent font fallback or a nudged
colour is exactly the kind of regression nobody notices until a CV has already
gone out.

The reference PDF is checked in at `cv/yassine-sinif-cv.pdf`; where it is not
available these tests skip rather than fail, so the suite still runs anywhere.
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from pypdf import PdfReader

from app.cv import _cvmodern
from app.cv.builder import build_resume

REFERENCE = Path(__file__).resolve().parents[2] / "cv" / "yassine-sinif-cv.pdf"
REFERENCE_TEX = REFERENCE.with_suffix(".tex")


# ------------------------------------------------------------------- fonts

def test_bundled_fonts_load() -> None:
    """The whole point of bundling: no silent fallback to Helvetica/Times.

    This previously failed everywhere except Linux, because the faces were read
    from /usr/share/fonts and the fallback was silent.
    """
    assert _cvmodern.fonts_are_authentic(), (
        "bundled Inter/Playfair failed to load — output will not match the reference"
    )
    assert _cvmodern.SANS == "Inter"
    assert _cvmodern.SANS_B == "Inter-Bold"
    assert _cvmodern.SERIF_B == "PlayfairDisplay"


def test_font_files_are_present_and_real() -> None:
    """Guards against a truncated or HTML-error-page download being committed."""
    directory = Path(_cvmodern.__file__).parent / "fonts"
    for _, filename in _cvmodern._FACES:
        path = directory / filename
        assert path.exists(), f"missing bundled font {filename}"
        assert path.stat().st_size > 50_000, f"{filename} is suspiciously small"
        # 0x00010000 is the sfnt version of a TrueType file.
        assert path.read_bytes()[:4] == b"\x00\x01\x00\x00", f"{filename} is not a TTF"


def test_font_licences_ship_alongside() -> None:
    """Both families are OFL; redistributing them requires the licence."""
    directory = Path(_cvmodern.__file__).parent / "fonts"
    assert (directory / "Inter-LICENSE.txt").exists()
    assert (directory / "PlayfairDisplay-OFL.txt").exists()


@pytest.mark.skipif(not REFERENCE.exists(), reason="reference CV not available")
def test_name_font_matches_the_reference() -> None:
    """The name is the most conspicuous thing on the page. The reference sets
    it in PlayfairDisplay-Regular at ~24.3pt, 136.5pt wide."""
    from reportlab.pdfbase import pdfmetrics

    _cvmodern._register_fonts()
    width = pdfmetrics.stringWidth("Yassine Sinif", _cvmodern.SERIF_B, 24.31)

    # 3% covers the variable font's default instance versus the static release
    # the reference was built with; anything more means the wrong family.
    assert width == pytest.approx(136.5, rel=0.03), f"name width {width:.1f} vs 136.5"


# ------------------------------------------------------------------ palette

@pytest.mark.skipif(not REFERENCE_TEX.exists(), reason="reference source not available")
def test_palette_matches_the_reference_source() -> None:
    """Colours were sampled from the original PDF into the LaTeX source, which
    makes that file the authority. Allow one step per channel for independent
    rounding; more than that is a drift worth catching."""
    source = REFERENCE_TEX.read_text(encoding="utf-8")

    expected = {
        "SIDEBAR_BG": "254553",
        "PAGE_BG": "FAF9F5",
        "ACCENT": "0E5B52",
        "NAME_INK": "12241F",
        "SIDE_HEAD": "C2C6CF",
    }
    for name, want in expected.items():
        assert want in source, f"{want} is not in the reference source"
        got = getattr(_cvmodern, name).hexval()[2:].upper()
        for channel in range(3):
            a = int(got[channel * 2:channel * 2 + 2], 16)
            b = int(want[channel * 2:channel * 2 + 2], 16)
            assert abs(a - b) <= 1, f"{name}: #{got} vs reference #{want}"


@pytest.mark.skipif(not REFERENCE_TEX.exists(), reason="reference source not available")
def test_geometry_matches_the_reference_source() -> None:
    """Sidebar width and main-column origin place every other element."""
    assert _cvmodern.SIDEBAR_W == pytest.approx(202.1, abs=0.5)
    assert _cvmodern.MAIN_X == pytest.approx(230.0, abs=1.0)


# -------------------------------------------------------------- typography

@pytest.mark.parametrize(
    "written,expected",
    [
        ("Jun 2026 - Present", "Jun 2026 – Present"),
        ("2022 - 2027", "2022 – 2027"),
        # A range plus a qualifier: first separator spans, the second divides.
        ("2024 - 2025 - 1 month", "2024 – 2025 · 1 month"),
    ],
)
def test_date_separators(written: str, expected: str) -> None:
    from app.cv.builder import _as_range

    assert _as_range(written) == expected


def test_pair_and_peer_separators() -> None:
    from app.cv.builder import _as_pair, _as_peers

    assert _as_pair("Arabic - Native") == "Arabic — Native"
    assert _as_peers("Tangier, Morocco - Maintenance") == "Tangier, Morocco · Maintenance"


@pytest.mark.parametrize("word", ["on-premise", "final-year", "e-commerce", "C++/C#"])
def test_hyphenated_words_are_untouched(word: str) -> None:
    """The patterns require whitespace on both sides precisely so that real
    hyphens inside words survive."""
    from app.cv.builder import _as_pair, _as_peers, _as_range

    for fn in (_as_range, _as_pair, _as_peers):
        assert word in fn(f"Built an {word} system")


def test_separators_reach_the_rendered_pdf() -> None:
    """End to end: a hyphen typed by the model must arrive as the right glyph."""
    pdf_bytes, _ = build_resume(
        full_name="Yassine Sinif",
        experience="AI Data Engineer | Aptiv | Jun 2026 - Present | Tangier - Maintenance\n- Did the work.",
        languages="Arabic - Native",
        certifications="Python for Data Science - IBM",
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages)

    assert "Jun 2026 – Present" in text
    assert "Tangier · Maintenance" in text
    assert "Arabic — Native" in text
    assert "Python for Data Science — IBM" in text


# ------------------------------------------------------------- whole page

@pytest.mark.skipif(not REFERENCE.exists(), reason="reference CV not available")
def test_page_size_matches_the_reference() -> None:
    """US Letter, not A4. A4 would reflow every measured position."""
    reference = PdfReader(str(REFERENCE)).pages[0].mediabox
    pdf_bytes, _ = build_resume(full_name="Yassine Sinif")
    mine = PdfReader(io.BytesIO(pdf_bytes)).pages[0].mediabox

    assert (float(mine.width), float(mine.height)) == (
        pytest.approx(float(reference.width)),
        pytest.approx(float(reference.height)),
    )


def test_employer_shares_the_title_line_weight() -> None:
    """The reference sets role and employer in one bold run (see the \\role
    macro). Rendering the employer at body size made it read as a caption."""
    import re

    source = Path(_cvmodern.__file__).read_text(encoding="utf-8")
    inline = re.search(r"if org_inline:\s*\n\s*self\._text\((.*?)\)\n", source, re.S)

    assert inline, "could not locate the inline-employer draw call"
    assert "SANS_B" in inline.group(1)
    assert "ENTRY_TITLE_SIZE" in inline.group(1)


# ------------------------------------------------------------------- naming

@pytest.mark.parametrize(
    "extracted,expected",
    [
        ("YASSINE SINIF", "Yassine Sinif"),
        ("AHMDD SAAH", "Ahmdd Saah"),
        # Already sensible: never touched.
        ("Yassine Sinif", "Yassine Sinif"),
        ("Jean-Luc Picard", "Jean-Luc Picard"),
        # One lowercase anywhere means the case is the person's own choice.
        ("Yassine SINIF", "Yassine SINIF"),
        ("", ""),
    ],
)
def test_all_caps_names_are_normalised(extracted: str, expected: str) -> None:
    """Designed CVs store the name in caps because that is how they print it.
    The modern template applies no case transform, so passing it through gives
    a shouting masthead that does not match the reference."""
    from app.cv.builder import normalise_name

    assert normalise_name(extracted) == expected


def test_normalised_name_reaches_the_pdf() -> None:
    import io as _io

    pdf_bytes, _ = build_resume(full_name="YASSINE SINIF", skills="Languages: Python")
    text = "\n".join(p.extract_text() or "" for p in PdfReader(_io.BytesIO(pdf_bytes)).pages)

    assert "Yassine Sinif" in text
    assert "YASSINE SINIF" not in text


def test_pipes_in_flat_fields_become_dashes() -> None:
    """A pipe is the column delimiter for an entry header; in a flat field it
    is a separator reached for by analogy, and it reaches the page verbatim."""
    from app.cv.builder import _as_pair

    assert _as_pair("Certificate | DeepLearning.AI | 2026") == "Certificate — DeepLearning.AI — 2026"


def test_piped_certifications_do_not_reach_the_pdf() -> None:
    import io as _io

    pdf_bytes, _ = build_resume(
        full_name="Yassine Sinif",
        certifications="Python for Data Science | IBM",
        languages="Arabic | Native",
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(_io.BytesIO(pdf_bytes)).pages)

    assert "|" not in text
    assert "Python for Data Science — IBM" in text
