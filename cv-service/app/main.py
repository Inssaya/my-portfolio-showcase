"""HTTP surface for the resume service.

Phase 1: no auth. Sessions are anonymous and identified by an opaque id the
client holds. Phase 2 puts Supabase JWT verification in front of every route
here, ties sessions to a user, persists the transcript, and enforces the token
quota — all of which this module is shaped to accept without rework.
"""
from __future__ import annotations

import logging

from fastapi import Body, FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .agent import SessionBudgetExceeded, recover_by_vision, run_turn, seed_uploaded_cv
from .config import get_settings
from .cv.extract import ExtractionError, extract_cv, extract_everything
from .cv.photo import PhotoError, looks_like_an_image, prepare_uploaded_photo
from .llm import LLMBusy, LLMError, LLMNotConfigured, get_pool
from .session import store
from .tools import ToolError, run_tool

logger = logging.getLogger(__name__)

app = FastAPI(title="Resume service", version="0.1.0")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["content-type"],
    # The client reads the session id off the first response and echoes it back.
    expose_headers=["x-session-id"],
)


# Long enough for a pasted CV. The old 4000 rejected one outright with a
# validation error the UI could not even render — pasting a CV is an obvious
# thing to do and must not be the one input that fails.
MAX_MESSAGE_CHARS = 30_000

# Above this, a message is examined to see whether it is a pasted document
# rather than something said. Comfortably longer than any real chat turn.
PASTED_DOCUMENT_CHARS = 1_200

# And it only counts as one if the parser actually finds structure — otherwise
# it is just somebody who types a lot, and should be answered normally.
PASTED_DOCUMENT_MIN_SECTIONS = 2


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    session_id: str | None = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    actions: list[str] = []
    pdf_ready: bool = False
    pdf_version: int = 0
    usage: dict


def _turn_or_http_error(session, message: str) -> dict:
    """Run a turn, translating model-layer failures into honest HTTP.

    Shared by /chat and /upload so the two cannot drift: a visitor who uploads
    a CV while the key pool is saturated must get the same "busy, try again in
    n seconds" as one who typed a message.
    """
    try:
        return run_turn(session, message)
    except SessionBudgetExceeded as exc:
        # 402-adjacent, but nothing is owed while the service is free, so 429
        # with an explicit reason. The draft survives and /generate still works,
        # so this never means "you lost your CV".
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {
                "message": str(exc),
                "session_id": session.id,
                "usage": session.usage.as_dict(),
                "pdf_version": session.pdf_version,
                "budget_exhausted": True,
            },
        ) from exc
    except LLMNotConfigured as exc:
        # Deliberately explicit: this is the one failure a deployer must fix,
        # and a generic 500 would send them hunting through logs.
        logger.error("resume service is not configured: %s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "not_configured") from exc
    except LLMBusy as exc:
        # Every key is rate-limited. That is a wait, not a fault — say so, and
        # say for how long, so the UI can promise something true.
        #
        # The turn may have got part-way first: tool rounds run before the round
        # that hits the limit, so work can already be saved and billed. Reporting
        # only "try again" would have the UI tell the visitor nothing happened
        # while their draft quietly moved on, so the session's real state rides
        # along on the error.
        seconds = max(1, int(exc.retry_after))
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            {
                "message": (
                    f"Everyone's building CVs right now. Try again in about "
                    f"{seconds} seconds."
                ),
                "session_id": session.id,
                "usage": session.usage.as_dict(),
                "pdf_version": session.pdf_version,
                "partial": bool(session.filled_fields()),
            },
            headers={"Retry-After": str(seconds)},
        ) from exc
    except LLMError as exc:
        logger.error("turn failed for session %s: %s", session.id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "upstream_error") from exc


@app.get("/health")
def health() -> dict:
    """Liveness, plus enough of the pool's state to diagnose it from outside."""
    return {
        "ok": True,
        "llm_configured": get_settings().llm_configured,
        "keys": get_pool().health(),
    }


@app.get("/ops/keys")
def ops_keys() -> dict:
    """Per-key health for operating the pool.

    Carries no part of any secret — only labels, counters and cooldowns — so it
    is safe to read while debugging. Phase 2 puts this behind admin auth along
    with the rest of the tracking views.
    """
    return {"keys": get_pool().snapshot()}


def _as_pasted_document(text: str) -> dict | None:
    """Structure a pasted CV, or None if this is an ordinary message.

    Plenty of people paste their CV into the box instead of uploading a file,
    and until now that text went to the model raw: several thousand tokens of
    Markdown, unstructured, every turn it stayed in context.

    Running it through the same extractor an upload gets makes paste and upload
    the same operation — sectioned, capped, and graded — which is both cheaper
    and better, because the model receives labelled sections rather than a wall
    of text it has to segment itself.

    The guard is deliberately conservative: length alone is not enough, because
    somebody describing their career at length is still talking to you. Only
    text the parser can actually find sections in is treated as a document.
    """
    if len(text) < PASTED_DOCUMENT_CHARS:
        return None
    try:
        extraction = extract_cv(text.encode("utf-8"), "pasted.md")
    except ExtractionError:
        return None

    named = [
        key for key in (extraction.get("sections") or {})
        if key not in ("full_text", "header")
    ]
    if len(named) < PASTED_DOCUMENT_MIN_SECTIONS:
        return None
    return extraction


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest = Body(...)) -> ChatResponse:
    session = store.get_or_create(payload.session_id)
    message = payload.message.strip()

    pasted = _as_pasted_document(message)
    if pasted is not None:
        logger.info(
            "session %s: treating a %d-char message as a pasted CV (%d sections)",
            session.id, len(message), len(pasted.get("sections") or {}),
        )
        seed_uploaded_cv(session, pasted, "the CV you pasted")
        message = (
            "That's my CV, pasted above. Save every section you can into the "
            "draft with update_resume, then tell me what you got."
        )

    outcome = _turn_or_http_error(session, message)

    return ChatResponse(
        session_id=session.id,
        reply=outcome["reply"],
        actions=outcome["actions"],
        pdf_ready=outcome["pdf_ready"],
        pdf_version=session.pdf_version,
        usage=session.usage.as_dict(),
    )


@app.post("/upload", response_model=ChatResponse)
async def upload(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
) -> ChatResponse:
    """Accept a CV, extract it, and let the agent open the conversation on it."""
    limits = get_settings()
    data = await file.read()
    if len(data) > limits.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"That file is larger than {limits.max_upload_bytes // (1024 * 1024)}MB.",
        )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is empty.")

    filename = file.filename or "your CV"

    # One drop target, routed by content. A visitor with a photo and a visitor
    # with a CV both reach for the same button, and telling them "unsupported
    # file type" for their own headshot would be absurd.
    #
    # No model call: attaching a photo needs no reasoning, so spending a turn on
    # it would be pure cost. The reply is written here.
    if looks_like_an_image(filename):
        session = store.get_or_create(session_id)
        try:
            session.photo = prepare_uploaded_photo(data, filename)
        except PhotoError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

        note = "Photo added — it'll appear on your CV."
        if session.pdf is not None:
            note += " Hit Rebuild to see it."
        return ChatResponse(
            session_id=session.id,
            reply=note,
            actions=["Added the photo"],
            pdf_ready=False,
            pdf_version=session.pdf_version,
            usage=session.usage.as_dict(),
        )

    try:
        extraction = extract_everything(data, filename)
    except ExtractionError as exc:
        # An unsupported format is the visitor's problem to solve and the
        # message says how, so it is a 400 with real text rather than a 500.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    session = store.get_or_create(session_id)
    if extraction.get("photo"):
        session.photo = extraction["photo"]

    # --- the extraction cascade -------------------------------------------
    # Deterministic parsing handles most CVs for free. Only a file that yielded
    # no usable text is worth a vision call, which costs several times a text
    # turn. See app/cv/quality.py for the grading.
    assessment = extraction.get("assessment") or {}
    if assessment.get("grade") == "failed":
        page_image = extraction.get("page_image")
        recovered = recover_by_vision(session, page_image) if page_image else None
        if recovered:
            logger.info("session %s: recovered %s by vision", session.id, filename)
            extraction["sections"] = {"full_text": recovered}
            extraction["assessment"] = {**assessment, "grade": "recovered"}
        else:
            # Nothing readable by either route. Say what to do instead — an
            # error page would leave the visitor stuck holding a file.
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "I couldn't read any text from that file — it looks like a scan "
                "or an image. Try exporting it as a text-based PDF, or just tell "
                "me your details in the chat and I'll build the CV from those.",
            )

    seed_uploaded_cv(session, extraction, filename)

    # Phrased as an instruction to save, not to report. "Tell me what you found"
    # invites the model to describe the extraction in prose and stop — which
    # leaves the draft empty and produced a CV containing only a name.
    outcome = _turn_or_http_error(
        session,
        "I've uploaded my CV. Save every section you can into the draft with "
        "update_resume, then tell me what you got.",
    )

    return ChatResponse(
        session_id=session.id,
        reply=outcome["reply"],
        actions=outcome["actions"],
        pdf_ready=outcome["pdf_ready"],
        pdf_version=session.pdf_version,
        usage=session.usage.as_dict(),
    )


@app.post("/generate/{session_id}", response_model=ChatResponse)
def generate(session_id: str) -> ChatResponse:
    """Render the draft directly, with no model involved.

    The escape hatch. The agent is supposed to call `generate_resume` when the
    visitor approves, and twice now it has instead announced "your CV is ready"
    having called nothing — leaving somebody with a finished draft, no file and
    no way forward. Prompt wording cannot make that impossible.

    So the UI offers a button, and the button lands here: pure server state in,
    PDF out. It costs no tokens, cannot be talked out of it, and works whatever
    the model does.
    """
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session has expired.")

    result = run_tool(session, "generate_resume", {})
    if session.pdf is None:
        # run_tool reports refusals as text for the model; here the same text is
        # the honest explanation for the visitor.
        raise HTTPException(status.HTTP_409_CONFLICT, result)

    return ChatResponse(
        session_id=session.id,
        reply="Here's your CV — download it below. Tell me if you'd like anything changed.",
        actions=["Built the CV"],
        pdf_ready=True,
        pdf_version=session.pdf_version,
        usage=session.usage.as_dict(),
    )


@app.get("/resume/{session_id}.pdf")
def download(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None or session.pdf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No CV has been generated yet.")
    return Response(
        content=session.pdf,
        media_type="application/pdf",
        headers={"content-disposition": f'attachment; filename="{session.pdf_name}"'},
    )


@app.get("/draft/{session_id}")
def draft(session_id: str) -> dict:
    """What the session currently holds. Powers the live preview panel."""
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session has expired.")
    return {
        "session_id": session.id,
        "draft": session.draft,
        "style": session.style,
        "language": session.language,
        "filled": session.filled_fields(),
        "missing": session.missing_fields(),
        "pdf_ready": session.pdf is not None,
        "pdf_version": session.pdf_version,
        "has_photo": session.photo is not None,
        "usage": session.usage.as_dict(),
    }


@app.get("/photo/{session_id}")
def photo(session_id: str) -> Response:
    """The attached portrait, for the UI's thumbnail."""
    session = store.get(session_id)
    if session is None or session.photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No photo attached.")
    return Response(
        content=session.photo,
        media_type="image/png",
        # It changes only when the visitor replaces it, and the session id is
        # already unguessable, so a short private cache is safe and stops the
        # thumbnail refetching on every render.
        headers={"cache-control": "private, max-age=60"},
    )


@app.delete("/photo/{session_id}")
def remove_photo(session_id: str) -> dict:
    """Detach the portrait.

    Needed because a photo can arrive without being asked for — lifted out of an
    uploaded CV — and not everyone wants one on the rebuild. Some countries
    advise against photos on a CV entirely, so this is not a nicety.
    """
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session has expired.")
    session.photo = None
    return {"has_photo": False}
