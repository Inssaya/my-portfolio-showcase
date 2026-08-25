"""The /admin/resume/{id}.pdf endpoint — admin-only CV download.

The admin never owns a visitor's session, so this route loads the row straight
from Postgres (the admin's JWT passes the "admin read sessions" RLS policy) and
re-renders the PDF from the stored draft, exactly like the Build button. These
tests cover the auth gate and the render/edge paths with db mocked, so no
network or real Supabase is touched.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import AuthUser, require_admin
from app.main import app

ADMIN = AuthUser(id="admin-id", email="yassinsinif4@gmail.com", access_token="admin-token")

_DRAFT = {
    "full_name": "Kenza Mrabet",
    "headline": "Human Resources",
    "experience": "HR Intern | Aptiv | 2024\n- Supported recruitment and onboarding.",
    "education": "Licence RH | Université Hassan II",
    "skills": "HR: recruiting, onboarding",
}


def _row(draft: dict) -> dict:
    return {
        "id": "11111111-1111-4111-8111-111111111111",
        "user_id": "22222222-2222-4222-8222-222222222222",
        "draft": draft,
        "style": "modern",
        "language": "en",
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "pdf_version": 1,
        "cv_messages": [],
    }


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def as_admin():
    """Override the admin gate with a fixed admin, so we exercise the endpoint
    body rather than the (separately tested) email check."""
    app.dependency_overrides[require_admin] = lambda: ADMIN
    yield
    app.dependency_overrides.pop(require_admin, None)


@pytest.fixture
def persistent(monkeypatch):
    monkeypatch.setattr(db, "persistence_configured", lambda: True)


# ------------------------------------------------------------- auth gate

def test_a_non_admin_is_forbidden(client: TestClient) -> None:
    # conftest's fake user is test@example.com — not the admin — so the real
    # require_admin runs and rejects.
    response = client.get("/admin/resume/anything.pdf")
    assert response.status_code == 403


# ------------------------------------------------------------- render path

def test_admin_downloads_a_rendered_pdf(client, as_admin, persistent, monkeypatch) -> None:
    monkeypatch.setattr(db, "load_session_row", lambda sid, token: _row(_DRAFT))

    response = client.get("/admin/resume/11111111-1111-4111-8111-111111111111.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"
    assert "attachment" in response.headers.get("content-disposition", "")


def test_missing_session_is_404(client, as_admin, persistent, monkeypatch) -> None:
    monkeypatch.setattr(db, "load_session_row", lambda sid, token: None)
    assert client.get("/admin/resume/nope.pdf").status_code == 404


def test_a_nameless_draft_is_409(client, as_admin, persistent, monkeypatch) -> None:
    monkeypatch.setattr(db, "load_session_row", lambda sid, token: _row({"skills": "x"}))
    assert client.get("/admin/resume/x.pdf").status_code == 409


def test_without_persistence_it_is_503(client, as_admin, monkeypatch) -> None:
    monkeypatch.setattr(db, "persistence_configured", lambda: False)
    assert client.get("/admin/resume/x.pdf").status_code == 503
