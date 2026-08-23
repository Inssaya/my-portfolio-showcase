"""Pasting a CV into the chat box.

People do this instead of uploading a file, and it used to be the one input
that failed outright: a 4000-character cap rejected a normal CV with a
validation error the UI could not even render.

It now goes through the same extractor an upload gets — sectioned, capped and
graded — which is both cheaper and better, because the model receives labelled
sections instead of a wall of Markdown it has to segment itself.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.cv.extract import _looks_like_heading, extract_everything
from app.llm import Completion
from app.main import _as_pasted_document
from app.main import app
from app.session import store

SAMPLE = Path(__file__).parent / "data" / "pasted_cv.md"


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


# ------------------------------------------------------------------ headings

@pytest.mark.parametrize(
    "line,expected",
    [
        # Markdown: the markers are what make it a heading, so they are stripped.
        ("## Work Experience", "experience"),
        ("### Technical Skills", "skills"),
        ("**SKILLS**", "skills"),
        ("__Languages__", "languages"),
        ("Certifications:", "certifications"),
        # Qualified headings. "Work Experience" does not *begin* with the
        # needle, and prefix matching dropped the section entirely — probably
        # the commonest heading in an English CV.
        ("Work Experience", "experience"),
        ("Professional Summary", "profile"),
        ("Core Projects", "projects"),
        ("Expérience Professionnelle", "experience"),
    ],
)
def test_headings_are_recognised(line: str, expected: str) -> None:
    assert _looks_like_heading(line) == expected


@pytest.mark.parametrize(
    "line",
    [
        "**Programming:** Python, JavaScript",   # a skills sub-label, not a section
        "**Full Name:** Adam Benali",
        "* Developed web applications using React",
        "Experienced professional with five years in the field",
        "**Casablanca, Morocco | January 2025 - July 2026**",
        "2021 - 2024",
    ],
)
def test_non_headings_are_rejected(line: str) -> None:
    """Whole-word matching and a digit check keep body text out."""
    assert _looks_like_heading(line) is None


# ------------------------------------------------------------------ routing

def test_a_pasted_markdown_cv_is_fully_sectioned() -> None:
    result = extract_everything(SAMPLE.read_bytes(), "pasted.md")

    assert result["assessment"]["grade"] == "good"
    assert {"experience", "education", "skills", "languages", "projects"} <= set(
        result["sections"]
    )
    assert "NovaTech Solutions" in result["sections"]["experience"]


def test_a_long_message_with_structure_is_treated_as_a_document() -> None:
    extraction = _as_pasted_document(SAMPLE.read_text(encoding="utf-8"))

    assert extraction is not None
    assert "experience" in extraction["sections"]


def test_a_long_message_without_structure_stays_a_message() -> None:
    """Somebody describing their career at length is still talking to you."""
    rambling = (
        "So basically I have been working for a while now and I really enjoy "
        "building things, mostly websites but also some other bits and pieces. "
    ) * 12

    assert _as_pasted_document(rambling) is None


def test_a_short_message_is_never_a_document() -> None:
    assert _as_pasted_document("hi, I'm Adam and I need a CV") is None


def test_pasting_a_cv_no_longer_422s(monkeypatch, client: TestClient) -> None:
    """Regression: a 4269-character CV was rejected by a 4000 cap, with an
    error shape the frontend could not render."""
    monkeypatch.setattr(
        agent_module, "complete", lambda *a, **k: Completion(content="Got your CV.")
    )

    response = client.post("/chat", json={"message": SAMPLE.read_text(encoding="utf-8")})

    assert response.status_code == 200
    assert response.json()["reply"] == "Got your CV."


def test_the_pasted_text_reaches_the_model_as_sections(monkeypatch, client: TestClient) -> None:
    """The point of routing it: labelled sections, not a wall of Markdown."""
    seen: list[list[dict]] = []

    def capture(messages, tools=None, sticky_key=None):
        seen.append(messages)
        return Completion(content="Saved.")

    monkeypatch.setattr(agent_module, "complete", capture)
    client.post("/chat", json={"message": SAMPLE.read_text(encoding="utf-8")})

    blob = "\n".join(str(m.get("content", "")) for m in seen[0])
    assert "--- experience ---" in blob
    assert "--- skills ---" in blob
    # The raw Markdown headings must not be what the model reads.
    assert "## Work Experience" not in blob


def test_an_over_long_paste_is_still_bounded(client: TestClient) -> None:
    from app.main import MAX_MESSAGE_CHARS

    response = client.post("/chat", json={"message": "x" * (MAX_MESSAGE_CHARS + 1)})
    assert response.status_code == 422
