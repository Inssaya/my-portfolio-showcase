"""HTTP surface for the resume service.

Every route except /health and /ping sits behind Supabase auth (see
app/auth.py): `Depends(get_current_user)` verifies the bearer token and every
session is owned by the user who created it (`app/session.py`'s SessionStore
checks ownership on every lookup, not just on creation). A session lives in
this process first, with Postgres (app/db.py) as a write-through, read-on-miss
backup — nobody can read or render a session that is not theirs, and a
session now survives this process restarting too.
"""
from __future__ import annotations

import logging

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db
from .agent import SessionBudgetExceeded, recover_by_vision, run_turn, seed_uploaded_cv
from .auth import AuthUser, get_current_user, require_admin
from .config import get_settings
from .cv.builder import RESUME_FIELDS, build_resume, safe_filename
from .cv.extract import ExtractionError, extract_cv, extract_everything
from .cv.photo import PhotoError, looks_like_an_image, prepare_uploaded_photo
from .llm import LLMBusy, LLMError, LLMNotConfigured, get_pool
from .ratelimit import (
    CHAT_PER_USER,
    GENERATE_PER_USER,
    UPLOAD_PER_USER,
    GlobalIpRateLimitMiddleware,
    limit_by_user,
)
from .session import Session, store
from .tools import ToolError, run_tool

logger = logging.getLogger(__name__)

app = FastAPI(title="Resume service", version="0.1.0")

settings = get_settings()

# Order here is not cosmetic. Starlette's add_middleware() inserts at the
# *front* of its internal list, and the middleware built from that list wraps
# outside-in from the end — net effect: **the middleware added last ends up
# outermost**, seeing every request first and every response last. (Verified
# against Starlette 0.41's actual build_middleware_stack(); the intuitive
# guess — first added, outermost — is backwards.)
#
# GlobalIpRateLimitMiddleware has to go first, CORSMiddleware second, so CORS
# ends up outermost and wraps *everything* on the way back out — including a
# 429 the rate limiter returns without ever reaching the route. Added in the
# opposite order, a rate-limited response skips CORS entirely and a visitor's
# browser shows a CORS error instead of the real "too many requests" message,
# which is exactly what shipped here the first time (caught by
# test_ratelimit.py's test_global_limit_response_carries_cors_headers).
app.add_middleware(GlobalIpRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    # "authorization" carries the Supabase bearer token on every request now
    # that routes are gated — omitting it does not error, it just makes the
    # browser silently drop the header on preflight, which reads as a random
    # 401 with no clue why.
    allow_headers=["content-type", "authorization"],
    # The client reads the session id off the first response and echoes it
    # back. content-disposition carries the PDF's filename, which the browser
    # only exposes to JS if the server explicitly allows reading it — needed
    # once downloads go through fetch()+blob instead of a plain <a href>,
    # which a bearer-token-gated endpoint can no longer be.
    expose_headers=["x-session-id", "content-disposition"],
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


def _turn_or_http_error(session, message: str, access_token: str | None = None) -> dict:
    """Run a turn, translating model-layer failures into honest HTTP.

    Shared by /chat and /upload so the two cannot drift: a visitor who uploads
    a CV while the key pool is saturated must get the same "busy, try again in
    n seconds" as one who typed a message.

    Saves to Postgres in a `finally`, not just on the success path: tool
    rounds run and can patch the draft before the round that actually fails
    (budget exceeded, the pool busy), so a raised error must not also mean
    that already-real progress never reaches Postgres — see the comments on
    SessionBudgetExceeded and LLMBusy below, which say the same thing about
    what the *response* carries.
    """
    try:
        try:
            return run_turn(session, message)
        except SessionBudgetExceeded as exc:
            # 402-adjacent, but nothing is owed while the service is free, so
            # 429 with an explicit reason. The draft survives and /generate
            # still works, so this never means "you lost your CV".
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
            # Deliberately explicit: this is the one failure a deployer must
            # fix, and a generic 500 would send them hunting through logs.
            logger.error("resume service is not configured: %s", exc)
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "not_configured") from exc
        except LLMBusy as exc:
            # Every key is rate-limited. That is a wait, not a fault — say so,
            # and say for how long, so the UI can promise something true.
            #
            # The turn may have got part-way first: tool rounds run before the
            # round that hits the limit, so work can already be saved and
            # billed. Reporting only "try again" would have the UI tell the
            # visitor nothing happened while their draft quietly moved on, so
            # the session's real state rides along on the error.
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
    finally:
        store.save(session, access_token)


@app.get("/health")
def health() -> dict:
    """Liveness, plus enough of the pool's state to diagnose it from outside."""
    return {
        "ok": True,
        "llm_configured": get_settings().llm_configured,
        "keys": get_pool().health(),
    }


@app.get("/ping")
def ping() -> dict:
    """The keep-warm endpoint. Deliberately does nothing.

    /health touches settings and the key pool to answer something useful for
    a human debugging a deploy. A scheduled job hitting this every few minutes
    for months needs the opposite property: the smallest possible amount of
    work per call, since its entire purpose is spending a request, not
    learning anything from the response. See .github/workflows/keep-warm.yml.
    """
    return {"pong": True}


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


@app.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[limit_by_user(CHAT_PER_USER, "chat", "chat messages")],
)
def chat(payload: ChatRequest = Body(...), user: AuthUser = Depends(get_current_user)) -> ChatResponse:
    session = store.get_or_create(payload.session_id, user.id, user.access_token)
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

    outcome = _turn_or_http_error(session, message, user.access_token)

    return ChatResponse(
        session_id=session.id,
        reply=outcome["reply"],
        actions=outcome["actions"],
        pdf_ready=outcome["pdf_ready"],
        pdf_version=session.pdf_version,
        usage=session.usage.as_dict(),
    )


@app.post(
    "/upload",
    response_model=ChatResponse,
    dependencies=[limit_by_user(UPLOAD_PER_USER, "upload", "uploads")],
)
async def upload(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    user: AuthUser = Depends(get_current_user),
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
        session = store.get_or_create(session_id, user.id, user.access_token)
        try:
            session.photo = prepare_uploaded_photo(data, filename)
        except PhotoError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

        # The photo itself is not a persisted column (see to_row's docstring),
        # so nothing here actually changes what save() would write — skipped
        # rather than spending a Postgres round trip on a no-op.
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

    session = store.get_or_create(session_id, user.id, user.access_token)

    # Keep the original file so the admin can later download exactly what the
    # visitor uploaded, to review chatbot quality. Best-effort — the session
    # row exists by now (get_or_create wrote it), so the FK holds; a failure
    # here must not break the upload the visitor is waiting on.
    if db.persistence_configured():
        db.store_upload(
            session.id, user.id, filename, file.content_type or "", data, user.access_token
        )

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
        user.access_token,
    )

    return ChatResponse(
        session_id=session.id,
        reply=outcome["reply"],
        actions=outcome["actions"],
        pdf_ready=outcome["pdf_ready"],
        pdf_version=session.pdf_version,
        usage=session.usage.as_dict(),
    )


@app.post(
    "/generate/{session_id}",
    response_model=ChatResponse,
    dependencies=[limit_by_user(GENERATE_PER_USER, "generate", "renders")],
)
def generate(session_id: str, user: AuthUser = Depends(get_current_user)) -> ChatResponse:
    """Render the draft directly, with no model involved.

    The escape hatch. The agent is supposed to call `generate_resume` when the
    visitor approves, and twice now it has instead announced "your CV is ready"
    having called nothing — leaving somebody with a finished draft, no file and
    no way forward. Prompt wording cannot make that impossible.

    So the UI offers a button, and the button lands here: pure server state in,
    PDF out. It costs no tokens, cannot be talked out of it, and works whatever
    the model does.
    """
    session = store.get(session_id, user.id, user.access_token)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session has expired.")

    result = run_tool(session, "generate_resume", {})
    store.save(session, user.access_token)
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
def download(session_id: str, user: AuthUser = Depends(get_current_user)) -> Response:
    """The rendered PDF.

    Auth here means a plain `<a href>` can no longer trigger the download — a
    browser navigation does not carry a custom Authorization header. The
    frontend fetches this with the bearer token and saves the response as a
    blob instead (see `src/lib/resume/api.ts`, `downloadResume`).
    """
    session = store.get(session_id, user.id, user.access_token)
    if session is None or session.pdf is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No CV has been generated yet.")
    return Response(
        content=session.pdf,
        media_type="application/pdf",
        headers={"content-disposition": f'attachment; filename="{session.pdf_name}"'},
    )


@app.get("/admin/resume/{session_id}.pdf")
def admin_download(session_id: str, admin: AuthUser = Depends(require_admin)) -> Response:
    """Render any user's CV from its stored draft, for the admin panel.

    The admin never owns these sessions, so the in-memory store won't hold
    them and the visitor-scoped /resume path can't reach them. Instead we load
    the row straight from Postgres — the admin's own JWT passes the "admin read
    sessions" RLS policy (see supabase/admin-cv-access.sql) — and re-render
    from the draft, exactly as the Build button does. No model call, no photo
    (the portrait is never persisted), no mutation of the user's session.
    """
    if not db.persistence_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Persistence is not configured.")

    row = db.load_session_row(session_id, admin.access_token)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session was not found.")

    session = Session.from_row(row)
    if not session.draft.get("full_name", "").strip():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This draft has no name yet — there is nothing to render.",
        )

    payload = {field: session.draft.get(field, "") for field in RESUME_FIELDS}
    try:
        pdf_bytes, _pages = build_resume(
            style=session.style, language=session.language, photo="", **payload
        )
    except Exception as exc:  # noqa: BLE001 — reportlab raises a wide family
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"The PDF renderer failed: {type(exc).__name__}: {exc}",
        ) from exc

    filename = safe_filename(session.draft.get("full_name", ""))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/sessions")
def list_sessions(user: AuthUser = Depends(get_current_user)) -> dict:
    """Every CV this visitor has started, for the "My Data" page.

    Reads straight from Postgres rather than this process's in-memory store —
    that only ever holds sessions this instance has touched, never the whole
    history. An empty list when persistence is not configured is honest: no
    per-process store can answer "everything I've ever started" at all.
    """
    if not db.persistence_configured():
        return {"sessions": []}
    rows = db.list_session_rows(user.access_token)
    return {
        "sessions": [
            {
                "id": row["id"],
                "name": (row.get("draft") or {}).get("full_name", "").strip() or None,
                "style": row.get("style"),
                "language": row.get("language"),
                "pdf_version": row.get("pdf_version", 0),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]
    }


@app.get("/draft/{session_id}")
def draft(session_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """What the session currently holds. Powers the live preview panel."""
    session = store.get(session_id, user.id, user.access_token)
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
def photo(session_id: str, user: AuthUser = Depends(get_current_user)) -> Response:
    """The attached portrait, for the UI's thumbnail.

    A plain `<img src>` cannot carry a bearer token either — same reason as
    the PDF download — so the frontend fetches this and turns the response
    into an object URL rather than pointing an <img> straight at it.
    """
    session = store.get(session_id, user.id, user.access_token)
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
def remove_photo(session_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    """Detach the portrait.

    Needed because a photo can arrive without being asked for — lifted out of an
    uploaded CV — and not everyone wants one on the rebuild. Some countries
    advise against photos on a CV entirely, so this is not a nicety.
    """
    session = store.get(session_id, user.id, user.access_token)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session has expired.")
    session.photo = None
    return {"has_photo": False}
