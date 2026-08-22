"""The HTTP surface. Uses FastAPI's TestClient, so routing, validation and
serialisation are exercised for real; only the model provider is faked.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import agent as agent_module
from app import llm as llm_module
from app.config import reset_settings
from app.llm import Completion, LLMBusy, LLMNotConfigured, ToolCall
from app.main import app
from app.session import store


@pytest.fixture(autouse=True)
def _clean_sessions():
    store.reset()
    yield
    store.reset()
    reset_settings()
    llm_module.reset_pool()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _reply(monkeypatch, *script: Completion):
    responses = list(script)
    calls = {"n": 0}

    def fake_complete(messages, tools=None, sticky_key=None):
        index = calls["n"]
        calls["n"] += 1
        return responses[min(index, len(responses) - 1)]

    monkeypatch.setattr(agent_module, "complete", fake_complete)


def test_health(client: TestClient) -> None:
    body = client.get("/health").json()
    assert body["ok"] is True
    assert "llm_configured" in body


def test_chat_creates_and_reuses_a_session(monkeypatch, client: TestClient) -> None:
    _reply(monkeypatch, Completion(content="Hi there.", prompt_tokens=50, completion_tokens=5))

    first = client.post("/chat", json={"message": "hello"}).json()
    assert first["reply"] == "Hi there."
    assert first["usage"]["total"] == 55

    second = client.post(
        "/chat", json={"message": "again", "session_id": first["session_id"]}
    ).json()
    assert second["session_id"] == first["session_id"]
    # Usage accumulates across turns rather than resetting — that is what a
    # per-user quota will be enforced against.
    assert second["usage"]["total"] == 110


def test_chat_rejects_an_empty_message(client: TestClient) -> None:
    assert client.post("/chat", json={"message": ""}).status_code == 422


def test_chat_reports_missing_configuration_plainly(monkeypatch, client: TestClient) -> None:
    def unconfigured(messages, tools=None, sticky_key=None):
        raise LLMNotConfigured("no key")

    monkeypatch.setattr(agent_module, "complete", unconfigured)

    response = client.post("/chat", json={"message": "hi"})
    assert response.status_code == 503
    assert response.json()["detail"] == "not_configured"


def test_saturated_key_pool_returns_429_with_retry_after(monkeypatch, client: TestClient) -> None:
    """A busy pool is a wait, not a fault. The UI promises a time, so the
    Retry-After header has to be there and has to be real."""
    def busy(messages, tools=None, sticky_key=None):
        raise LLMBusy(12.0, "All keys are rate-limited.")

    monkeypatch.setattr(agent_module, "complete", busy)

    response = client.post("/chat", json={"message": "hi"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "12"
    # detail is an object on 429: the turn may have saved work before stopping.
    assert "try again" in response.json()["detail"]["message"].lower()


def test_upload_shares_the_chat_error_mapping(monkeypatch, client: TestClient) -> None:
    """Uploading while the pool is saturated must not report a different fault
    than typing a message does."""
    def busy(messages, tools=None, sticky_key=None):
        raise LLMBusy(9.0, "All keys are rate-limited.")

    monkeypatch.setattr(agent_module, "complete", busy)

    response = client.post(
        "/upload",
        files={"file": ("cv.txt", b"Jane Doe\n\nSkills\nPython\n", "text/plain")},
    )
    assert response.status_code == 429
    assert response.headers["retry-after"] == "9"


def test_ops_endpoint_never_exposes_a_secret(monkeypatch, client: TestClient) -> None:
    monkeypatch.setenv("OPENAI_API_KEYS", "sk-supersecret-aaa,sk-supersecret-bbb")
    reset_settings()
    llm_module.reset_pool()

    body = client.get("/ops/keys").text

    assert "supersecret" not in body
    assert "key-1" in body


def test_download_404s_before_anything_is_generated(monkeypatch, client: TestClient) -> None:
    _reply(monkeypatch, Completion(content="Hi."))
    session_id = client.post("/chat", json={"message": "hello"}).json()["session_id"]

    assert client.get(f"/resume/{session_id}.pdf").status_code == 404


def test_full_flow_ends_in_a_downloadable_pdf(monkeypatch, client: TestClient) -> None:
    """The whole point of the service, exercised end to end."""
    _reply(
        monkeypatch,
        Completion(
            content="",
            tool_calls=[
                ToolCall("a", "update_resume", {"field": "full_name", "content": "Jane Doe"}),
                ToolCall("b", "update_resume", {"field": "skills", "content": "Languages: Python"}),
                ToolCall("c", "generate_resume", {}),
            ],
        ),
        Completion(content="Your CV is ready."),
    )

    body = client.post("/chat", json={"message": "build my CV"}).json()
    assert body["pdf_ready"] is True
    assert body["pdf_version"] == 1

    pdf = client.get(f"/resume/{body['session_id']}.pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert "cv-jane-doe.pdf" in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF-")


def test_upload_extracts_and_opens_the_conversation(monkeypatch, client: TestClient) -> None:
    _reply(monkeypatch, Completion(content="I read your CV — you're Jane Doe, right?"))

    cv = b"Jane Doe\njane@example.com\n\nExperience\nBuilt things at Acme.\n"
    response = client.post(
        "/upload",
        files={"file": ("jane.txt", cv, "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert "Jane Doe" in body["reply"]

    # The extracted text must have reached the model's context.
    session = store.get(body["session_id"])
    assert any("Acme" in m.get("content", "") for m in session.history)


def test_upload_rejects_an_unreadable_file(client: TestClient) -> None:
    response = client.post(
        "/upload",
        files={"file": ("broken.pdf", b"%PDF-1.4\nno text here\n", "application/pdf")},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    # Whoever uploaded it has to know what to do next, so the message must name
    # a next step and must not leak an exception class name at them.
    assert "tell me your details" in detail.lower()
    assert "Error" not in detail


def test_upload_rejects_an_empty_file(client: TestClient) -> None:
    response = client.post("/upload", files={"file": ("empty.pdf", b"", "application/pdf")})
    assert response.status_code == 400


def test_draft_endpoint_reports_progress(monkeypatch, client: TestClient) -> None:
    _reply(
        monkeypatch,
        Completion(
            content="",
            tool_calls=[ToolCall("a", "update_resume", {"field": "full_name", "content": "Jane Doe"})],
        ),
        Completion(content="Saved."),
    )
    session_id = client.post("/chat", json={"message": "I'm Jane"}).json()["session_id"]

    draft = client.get(f"/draft/{session_id}").json()
    assert draft["draft"]["full_name"] == "Jane Doe"
    assert "full_name" in draft["filled"]
    assert "experience" in draft["missing"]


def test_draft_404s_for_an_unknown_session(client: TestClient) -> None:
    assert client.get("/draft/nope").status_code == 404


def test_rate_limited_response_carries_session_state(monkeypatch, client: TestClient) -> None:
    """A turn can run tool rounds before hitting the limit, so work may already
    be saved and billed. Reporting only 'try again' would have the UI tell the
    visitor nothing happened while their draft had moved on."""
    def busy(messages, tools=None, sticky_key=None):
        raise LLMBusy(11.0, "All keys are rate-limited.")

    monkeypatch.setattr(agent_module, "complete", busy)

    body = client.post("/chat", json={"message": "hi"}).json()

    assert "message" in body["detail"]
    assert "try again" in body["detail"]["message"].lower()
    assert "usage" in body["detail"] and "pdf_version" in body["detail"]
