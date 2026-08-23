"""The model-free render path.

The agent is supposed to call generate_resume when the visitor approves. Twice
in real use it instead announced "your CV is ready" having called nothing,
leaving somebody with a finished draft and no file. Prompt wording cannot make
that impossible, so this route exists: server state in, PDF out, no model.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app.llm import Completion
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


def test_generate_renders_without_calling_the_model(monkeypatch, client: TestClient) -> None:
    def explode(*args, **kwargs):
        raise AssertionError("the model must not be called on this path")

    monkeypatch.setattr(agent_module, "complete", explode)

    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("experience", "Manager Intern | Acme | Feb 2021\n- Managed cash flow.")

    body = client.post(f"/generate/{session.id}").json()

    assert body["pdf_ready"] is True
    assert body["pdf_version"] == 1
    assert body["actions"] == ["Built the CV"]

    pdf = client.get(f"/resume/{session.id}.pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")


def test_generate_costs_no_tokens(client: TestClient) -> None:
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("skills", "Finance: Budgeting, Cash Flow Management")

    body = client.post(f"/generate/{session.id}").json()

    assert body["usage"]["total"] == 0


def test_generate_rejects_a_name_only_draft(client: TestClient) -> None:
    """The same substance rule as the tool: never hand somebody a blank CV."""
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")

    response = client.post(f"/generate/{session.id}")

    assert response.status_code == 409
    assert "only a name" in response.json()["detail"]


def test_generate_404s_for_an_unknown_session(client: TestClient) -> None:
    assert client.post("/generate/nope").status_code == 404


def test_rebuild_bumps_the_version(client: TestClient) -> None:
    session = store.create(user_id=TEST_USER_ID)
    session.set_field("full_name", "Ahmed Sefriui")
    session.set_field("skills", "Finance: Budgeting")

    client.post(f"/generate/{session.id}")
    second = client.post(f"/generate/{session.id}").json()

    assert second["pdf_version"] == 2
