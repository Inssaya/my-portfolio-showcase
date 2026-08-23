"""Attaching a portrait directly.

Extraction only recovers a photo from a CV that already had one. Somebody
starting from scratch, or whose CV had none, needs a way to add one — and
somebody whose photo was lifted out of an upload needs a way to remove it.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.cv.photo import PhotoError, looks_like_an_image, prepare_uploaded_photo
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


def _image(width: int = 600, height: int = 800, fmt: str = "PNG", **save) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (90, 120, 150)).save(buffer, format=fmt, **save)
    return buffer.getvalue()


def test_routing_by_extension() -> None:
    assert looks_like_an_image("me.JPG") and looks_like_an_image("photo.webp")
    assert not looks_like_an_image("cv.pdf") and not looks_like_an_image("cv.docx")


def test_a_photo_upload_attaches_without_calling_the_model(monkeypatch, client: TestClient) -> None:
    """Attaching a photo needs no reasoning, so it must cost no tokens."""
    from app import agent as agent_module

    monkeypatch.setattr(
        agent_module, "complete",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("model must not run")),
    )

    body = client.post("/upload", files={"file": ("me.png", _image(), "image/png")}).json()

    assert "Photo added" in body["reply"]
    assert body["actions"] == ["Added the photo"]
    assert body["usage"]["total"] == 0

    session = store.get(body["session_id"], TEST_USER_ID)
    assert session.photo is not None


def test_uploaded_photo_reaches_the_rendered_cv(client: TestClient) -> None:
    from app.cv.photo import extract_portrait

    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("skills", "Finance: Budgeting")

    client.post(
        "/upload",
        files={"file": ("me.png", _image(), "image/png")},
        data={"session_id": session.id},
    )
    client.post(f"/generate/{session.id}")

    assert extract_portrait(session.pdf) is not None, "photo did not reach the PDF"


def test_photo_can_be_fetched_and_removed(client: TestClient) -> None:
    body = client.post("/upload", files={"file": ("me.png", _image(), "image/png")}).json()
    sid = body["session_id"]

    fetched = client.get(f"/photo/{sid}")
    assert fetched.status_code == 200
    assert fetched.headers["content-type"] == "image/png"

    assert client.delete(f"/photo/{sid}").json() == {"has_photo": False}
    assert client.get(f"/photo/{sid}").status_code == 404
    assert client.get(f"/draft/{sid}").json()["has_photo"] is False


def test_exif_orientation_is_applied() -> None:
    """A phone records rotation in EXIF rather than in the pixels. Without
    applying it the portrait renders sideways and the circular crop cuts
    through the person's face."""
    tall = Image.new("RGB", (400, 600), (10, 20, 30))
    buffer = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6  # orientation: rotate 90° clockwise
    tall.save(buffer, format="JPEG", exif=exif)

    out = prepare_uploaded_photo(buffer.getvalue(), "me.jpg")
    restored = Image.open(io.BytesIO(out))

    # Orientation 6 swaps the axes, so a 400x600 source becomes 600x400.
    assert restored.width > restored.height


def test_exif_is_stripped() -> None:
    """Camera metadata routinely carries GPS coordinates of where the photo was
    taken. A CV goes to strangers; the location must not go with it."""
    buffer = io.BytesIO()
    exif = Image.Exif()
    exif[271] = "SecretCameraMake"
    Image.new("RGB", (600, 600), (5, 5, 5)).save(buffer, format="JPEG", exif=exif)

    out = prepare_uploaded_photo(buffer.getvalue(), "me.jpg")

    assert b"SecretCameraMake" not in out
    assert not Image.open(io.BytesIO(out)).getexif()


def test_a_tiny_image_is_refused_with_a_reason() -> None:
    with pytest.raises(PhotoError, match="150 pixels"):
        prepare_uploaded_photo(_image(60, 60), "me.png")


def test_a_non_image_is_refused() -> None:
    with pytest.raises(PhotoError):
        prepare_uploaded_photo(b"this is not an image at all", "me.png")


def test_a_broken_image_gives_an_actionable_message(client: TestClient) -> None:
    response = client.post(
        "/upload", files={"file": ("me.png", b"\x89PNG\r\n\x1a\nbroken", "image/png")}
    )

    assert response.status_code == 400
    assert "JPG" in response.json()["detail"]


def test_large_photos_are_downscaled() -> None:
    """The renderer draws at ~88pt, so a 4000px original is pure weight."""
    from app.cv.photo import TARGET_EDGE_PX

    out = prepare_uploaded_photo(_image(3000, 4000), "me.png")
    image = Image.open(io.BytesIO(out))

    assert max(image.size) <= TARGET_EDGE_PX
