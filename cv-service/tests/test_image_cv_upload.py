"""A photographed, scanned or screenshotted CV must be read as a CV.

The failure this covers was total and silent: uploads were routed by file
extension alone, so every image went down the "this is a portrait" branch.
Someone who photographed their CV — the only option for a paper one, and an
ordinary thing to do from a phone — got "Photo added — it'll appear on your
CV", their picture filed as a headshot, and the CV itself never read.

Routing now looks at the image. A local ink/whitespace gate answers the easy
"that is obviously a photograph of a person" case for free, and anything else
goes to vision, which transcribes a document or says NOT_A_DOCUMENT.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import agent as agent_module
from app.cv.photo import looks_like_a_document
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


def _page_image() -> bytes:
    """Something shaped like a page of text: mostly paper, a little ink."""
    page = Image.new("RGB", (800, 1100), (252, 252, 250))
    draw = ImageDraw.Draw(page)
    for row in range(40):
        top = 90 + row * 24
        draw.rectangle([80, top, 80 + (620 if row % 5 else 300), top + 9], fill=(25, 25, 25))
    buffer = io.BytesIO()
    page.save(buffer, format="PNG")
    return buffer.getvalue()


def _portrait_image() -> bytes:
    """A continuous mid-tone subject, the way an ordinary photo reads."""
    buffer = io.BytesIO()
    Image.new("RGB", (600, 800), (96, 120, 150)).save(buffer, format="PNG")
    return buffer.getvalue()


def _vision(monkeypatch, content: str):
    def fake_read_image(prompt, image_png, sticky_key=None):
        return Completion(content=content, prompt_tokens=800, completion_tokens=120)

    monkeypatch.setattr(agent_module, "read_image", fake_read_image)


def _text_replies(monkeypatch, *script: Completion):
    responses = list(script)
    calls = {"n": 0}

    def fake_complete(messages, tools=None, sticky_key=None):
        index = calls["n"]
        calls["n"] += 1
        return responses[min(index, len(responses) - 1)]

    monkeypatch.setattr(agent_module, "complete", fake_complete)


# ----------------------------------------------------------- the local gate

def test_the_gate_sends_a_page_of_text_to_vision() -> None:
    assert looks_like_a_document(_page_image())


def test_the_gate_keeps_an_ordinary_portrait_away_from_vision() -> None:
    assert not looks_like_a_document(_portrait_image())


# -------------------------------------------------------------- the routing

def test_a_photographed_cv_is_read_as_a_cv_not_filed_as_a_headshot(
    monkeypatch, client: TestClient
) -> None:
    _vision(
        monkeypatch,
        "RICHARD SANCHEZ\nMarketing Manager\n\nEXPERIENCE\n"
        "Marketing Manager | Borcelle Studio | 2030 - PRESENT",
    )
    _text_replies(monkeypatch, Completion(content="Got it — I've saved what I could read."))

    body = client.post(
        "/upload", files={"file": ("cv-photo.jpg", _page_image(), "image/jpeg")}
    ).json()

    assert "Photo added" not in body["reply"], "a photographed CV was filed as a headshot"

    session = store.get(body["session_id"], TEST_USER_ID)
    assert session.photo is None, "the CV image must not become the portrait"
    # The transcription reached the model as upload context, which is what
    # lets it fill the draft.
    seeded = "\n".join(
        entry.get("content", "")
        for entry in session.transcript
        if entry.get("kind") == "upload"
    )
    assert "RICHARD SANCHEZ" in seeded
    assert "Borcelle Studio" in seeded


def test_the_transcription_is_flagged_as_read_from_an_image(
    monkeypatch, client: TestClient
) -> None:
    """Vision output is not ground truth — names, dates and numbers have to be
    confirmed, and the model is told so rather than left to assume."""
    _vision(monkeypatch, "OLIVIA SANCHEZ\nProduct Designer\n\nEXPERIENCE\nArowwai Industries")
    _text_replies(monkeypatch, Completion(content="Saved."))

    body = client.post(
        "/upload", files={"file": ("scan.png", _page_image(), "image/png")}
    ).json()

    session = store.get(body["session_id"], TEST_USER_ID)
    seeded = "\n".join(
        entry.get("content", "")
        for entry in session.transcript
        if entry.get("kind") == "upload"
    )
    assert "transcribed" in seeded.lower() or "confirm" in seeded.lower()


def test_an_image_vision_says_is_not_a_document_becomes_the_portrait(
    monkeypatch, client: TestClient
) -> None:
    """A studio headshot on a white backdrop trips the local gate, so vision
    gets the final say — and its answer must route it back to the photo path."""
    _vision(monkeypatch, agent_module.NOT_A_DOCUMENT)

    body = client.post(
        "/upload", files={"file": ("me.png", _page_image(), "image/png")}
    ).json()

    assert "Photo added" in body["reply"]
    assert store.get(body["session_id"], TEST_USER_ID).photo is not None


def test_a_portrait_costs_the_one_look_and_no_reasoning_turn(
    monkeypatch, client: TestClient
) -> None:
    """Routing an image costs exactly one vision call. Once it answers "not a
    document" the reply is written server-side, so no chat turn follows."""
    _vision(monkeypatch, agent_module.NOT_A_DOCUMENT)

    def explode(*args, **kwargs):
        raise AssertionError("attaching a photo must not spend a reasoning turn")

    monkeypatch.setattr(agent_module, "complete", explode)

    body = client.post(
        "/upload", files={"file": ("me.png", _portrait_image(), "image/png")}
    ).json()

    assert "Photo added" in body["reply"]
    assert body["usage"]["total"] == 920  # the single vision look, nothing more


def test_the_cheap_gate_is_off_because_it_loses_dark_and_sidebar_cvs() -> None:
    """Why `cheap_image_routing` defaults to off, pinned as a fact rather than
    left in a comment.

    The local heuristic keys on "mostly paper, a little ink", which a
    dark-theme template inverts and a coloured-sidebar design dilutes — this
    service's own `modern` style among them. With the gate on, a screenshot of
    either is filed as the visitor's headshot and their CV is never read. Only
    vision separates these reliably, which is why it is the default path.
    """
    dark = Image.new("RGB", (800, 1100), (28, 30, 36))
    draw = ImageDraw.Draw(dark)
    for row in range(38):
        top = 90 + row * 25
        draw.rectangle([80, top, 80 + (600 if row % 5 else 300), top + 9], fill=(235, 235, 240))
    buffer = io.BytesIO()
    dark.save(buffer, format="PNG")

    assert not looks_like_a_document(buffer.getvalue()), (
        "if this ever passes, the cheap gate has become safe enough to reconsider"
    )


def test_vision_being_unavailable_falls_back_to_the_photo_path(
    monkeypatch, client: TestClient
) -> None:
    """A deployment with no vision configured must still accept photos rather
    than failing the upload outright."""
    def unconfigured(*args, **kwargs):
        raise LLMNotConfigured("no key")

    monkeypatch.setattr(agent_module, "read_image", unconfigured)

    body = client.post(
        "/upload", files={"file": ("me.png", _page_image(), "image/png")}
    ).json()

    assert "Photo added" in body["reply"]
    assert store.get(body["session_id"], TEST_USER_ID).photo is not None
