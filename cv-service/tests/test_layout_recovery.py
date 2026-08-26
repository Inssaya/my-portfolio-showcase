"""Reading order, and what happens when it cannot be trusted.

The failure these pin down came from a real upload. `pypdf` emits text in the
order the PDF draws it, and a sidebar CV template draws every section *label*
before any section *body*. The splitter therefore produced four
confidently-labelled sections — "contact", "skills", "profile", "education" —
whose contents belonged to entirely different parts of the page, with
"contact" holding the single word "Language".

That is the worst possible input to hand a model: it looks parsed, so nothing
downstream doubts it, and the model fills a CV from someone else's sections.
Three defences are tested here, in the order they fire:

  1. reading-order reconstruction  (layout.py) — fix the order where possible,
     and only when it demonstrably reads better than what we already had.
  2. coherence check               (extract.py) — if a section plainly does not
     contain what its heading promises, throw the whole split away rather than
     pass off a wrong one as right.
  3. vision escalation             (main.py)   — read the page as an image.
     A text PDF has no embedded image, so the page is rasterised.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app import main as main_module
from app.cv import layout
from app.cv.builder import build_resume
from app.cv.extract import _looks_like_heading, extract_cv
from app.cv.photo import render_pdf_page
from app.llm import Completion, LLMNotConfigured
from app.main import app
from app.session import store
from conftest import TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------ scoring order

def test_a_scrambled_order_scores_below_a_readable_one() -> None:
    """The metric that decides whether a reconstruction is kept at all."""
    scrambled = ["Contact", "Skills", "Experience", "a@b.com", "Python", "Aptiv"]
    readable = ["Contact", "a@b.com", "+212 600000", "Skills", "Python", "SQL"]

    assert layout.score_layout(readable, _looks_like_heading) > layout.score_layout(
        scrambled, _looks_like_heading
    )


def test_a_heading_with_no_body_earns_nothing() -> None:
    assert layout.score_layout(["Skills", "Experience"], _looks_like_heading) == 0


# ------------------------------------------------------------ gutter finding

def _chunk(x: float, y: float, text: str = "x") -> layout.Chunk:
    return layout.Chunk(x=x, y=y, text=text, size=10.0, space=1.0)


def test_two_real_columns_are_detected() -> None:
    chunks = [_chunk(50, i * 12) for i in range(20)]
    chunks += [_chunk(400, i * 12) for i in range(20)]
    assert layout._find_gutter(chunks) is not None


def test_right_aligned_dates_are_not_mistaken_for_a_column() -> None:
    """The false positive worth guarding: a single-column CV whose dates sit
    against the right margin. Too few of them, over too little of the page,
    to be a column — and treating them as one would split every entry from
    its own date."""
    body = [_chunk(50, i * 12) for i in range(30)]
    dates = [_chunk(520, i * 90) for i in range(4)]
    assert layout._find_gutter(body + dates) is None


# --------------------------------------------------------- phantom removal

def test_a_masthead_repeated_by_nested_transforms_survives_once() -> None:
    """`visitor_text` does not compose a Form XObject's placement matrix, so
    the same string is reported once per nesting level, at coordinates that
    cannot be compared. Left in, the masthead prints three times."""
    chunks = [
        layout.Chunk(x=100, y=10, text="EXPERIENCE", size=12, space=3.13),
        layout.Chunk(x=100, y=30, text="Aptiv", size=12, space=3.13),
        layout.Chunk(x=0, y=0, text="RICHARD SANCHEZ", size=12, space=2.65),
        layout.Chunk(x=0, y=0, text="RICHARD SANCHEZ", size=12, space=1.0),
        layout.Chunk(x=0, y=0, text="RICHARD SANCHEZ", size=12, space=0.7),
    ]
    kept = layout._drop_phantoms(chunks)

    assert sum(1 for c in kept if c.text == "RICHARD SANCHEZ") == 1
    assert {"EXPERIENCE", "Aptiv"} <= {c.text for c in kept}


def test_genuine_repetition_inside_one_space_is_kept() -> None:
    """A CV that really does list the same university twice draws both copies
    in the page's own coordinate space — dropping one would delete a degree."""
    chunks = [
        layout.Chunk(x=10, y=10, text="Wardiere University", size=12, space=3.13),
        layout.Chunk(x=10, y=40, text="Wardiere University", size=12, space=3.13),
        layout.Chunk(x=10, y=70, text="Bachelor", size=12, space=3.13),
    ]
    assert sum(1 for c in layout._drop_phantoms(chunks) if c.text == "Wardiere University") == 2


# ------------------------------------------------------- coherence check

def test_a_section_that_contradicts_its_heading_discards_the_whole_split() -> None:
    """"Contact" holding one word and no email, phone or link is proof the
    labels did not come from the text beneath them."""
    scrambled = "Contact\nLanguage\nSkills\nExperience\nPython\nSQL\n"
    result = extract_cv(scrambled.encode("utf-8"), "cv.txt")

    assert list(result["sections"]) == ["full_text"], "a wrong split was passed off as right"
    assert result["layout_unreliable"] is True
    assert any("split looked wrong" in note for note in result["notes"])


def test_a_coherent_split_is_left_alone() -> None:
    good = (
        "Contact\nyassinsinif4@gmail.com\n+212 6 23 84 25 35\n"
        "Skills\nPython, SQL\nLanguages\nArabic - Native\nFrench - B2\n"
    )
    result = extract_cv(good.encode("utf-8"), "cv.txt")

    assert not result["layout_unreliable"]
    assert {"contact", "skills", "languages"} <= set(result["sections"])


# ------------------------------------------------------- page rasterisation

def test_a_text_pdf_can_be_rasterised_for_vision() -> None:
    """A scrambled CV is a *text* PDF: it has no embedded image, so before
    this there was nothing to send vision and the tier could never fire."""
    pdf_bytes, _ = build_resume(full_name="Yassine Sinif", skills="Languages: Python")

    png = render_pdf_page(pdf_bytes)

    assert png is not None
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_rasterising_rubbish_returns_none_rather_than_raising() -> None:
    assert render_pdf_page(b"not a pdf at all") is None


# --------------------------------------------------------- vision escalation

def _unreliable_extraction() -> dict:
    return {
        "estimated_name": "",
        "contact_candidates": [],
        "sections": {"full_text": "Contact Language Skills Experience"},
        "notes": ["The heading split looked wrong"],
        "characters": 40,
        "assessment": {"grade": "partial", "reasons": ["scrambled"]},
        "layout_unreliable": True,
        "photo": None,
        "page_image": b"fake-png-bytes",
    }


def test_a_scrambled_pdf_escalates_to_vision_and_uses_the_transcription(
    monkeypatch, client: TestClient
) -> None:
    monkeypatch.setattr(main_module, "extract_everything", lambda d, f: _unreliable_extraction())
    monkeypatch.setattr(
        agent_module, "read_image",
        lambda *a, **k: Completion(
            content="OLIVIA SANCHEZ\nProduct Designer\n\nEXPERIENCE\nArowwai Industries | 2020 - 2022",
            prompt_tokens=900, completion_tokens=150,
        ),
    )
    monkeypatch.setattr(
        agent_module, "complete", lambda *a, **k: Completion(content="Saved what I could read.")
    )

    body = client.post("/upload", files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")}).json()

    session = store.get(body["session_id"], TEST_USER_ID)
    seeded = "\n".join(
        entry.get("content", "") for entry in session.transcript if entry.get("kind") == "upload"
    )
    assert "Arowwai Industries" in seeded, "the vision read never reached the model"
    assert "Contact Language Skills" not in seeded, "the scrambled text was used anyway"


def test_a_scrambled_pdf_keeps_its_raw_text_when_vision_is_unavailable(
    monkeypatch, client: TestClient
) -> None:
    """Degrading to the scrambled-but-complete text — already collapsed to
    unsplit `full_text` with a warning — beats refusing a file the visitor
    can plainly read."""
    monkeypatch.setattr(main_module, "extract_everything", lambda d, f: _unreliable_extraction())
    monkeypatch.setattr(
        agent_module, "read_image",
        lambda *a, **k: (_ for _ in ()).throw(LLMNotConfigured("no key")),
    )
    monkeypatch.setattr(agent_module, "complete", lambda *a, **k: Completion(content="Noted."))

    response = client.post(
        "/upload", files={"file": ("cv.pdf", b"%PDF-1.4 fake", "application/pdf")}
    )

    assert response.status_code == 200, "a readable file was refused"
    session = store.get(response.json()["session_id"], TEST_USER_ID)
    seeded = "\n".join(
        entry.get("content", "") for entry in session.transcript if entry.get("kind") == "upload"
    )
    assert "Contact Language Skills" in seeded


def test_a_scan_with_no_vision_still_reports_it_cannot_be_read(
    monkeypatch, client: TestClient
) -> None:
    """The pre-existing contract for a genuinely unreadable file is unchanged:
    an honest error naming what to do, not a silent empty CV."""
    failed = {**_unreliable_extraction(), "layout_unreliable": False}
    failed["assessment"] = {"grade": "failed", "reasons": ["no text"]}
    failed["page_image"] = None
    monkeypatch.setattr(main_module, "extract_everything", lambda d, f: failed)

    response = client.post(
        "/upload", files={"file": ("scan.pdf", b"%PDF-1.4 fake", "application/pdf")}
    )

    assert response.status_code == 400
    assert "couldn't read any text" in response.json()["detail"]
