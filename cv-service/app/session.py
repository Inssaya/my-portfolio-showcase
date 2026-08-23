"""In-memory session state: the draft, the transcript, and the token meter.

WHY THE DRAFT LIVES HERE AND NOT IN THE PROMPT
----------------------------------------------
The obvious design has the model hold the whole CV in the conversation and
re-emit it whenever something changes. That costs the entire CV in input tokens
on every turn *and* the entire CV in output tokens whenever one bullet is
edited — which is exactly what makes people reach for a frontier model.

Instead the draft is server state. The model patches one field at a time
(`update_resume`), asks for a summary when it needs to check itself
(`review_draft`), and renders from state (`generate_resume`). A one-line
correction near the end of a long session costs a few dozen output tokens
rather than a full restatement, and a small model stays sufficient.

Sessions are per-process and expire. That is correct for a single dyno and is
the deliberate boundary before Phase 2 moves this into Supabase, where the
transcript also becomes the training corpus the user asked for.
"""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field

from .cv.builder import RESUME_FIELDS

# Long enough that somebody can walk away mid-CV and come back; short enough
# that abandoned sessions do not accumulate on a small dyno.
SESSION_TTL_SECONDS = 3 * 60 * 60
SWEEP_EVERY_SECONDS = 600
# One session cannot pin unbounded memory: a CV is text, and 64k of it is
# already far more than any real CV.
MAX_FIELD_CHARS = 8000


@dataclass
class TokenUsage:
    """What this session has spent. Phase 2 turns this into the user quota."""

    prompt: int = 0
    completion: int = 0

    @property
    def total(self) -> int:
        return self.prompt + self.completion

    def add(self, prompt: int, completion: int) -> None:
        self.prompt += prompt
        self.completion += completion

    def as_dict(self) -> dict:
        return {"prompt": self.prompt, "completion": self.completion, "total": self.total}


@dataclass
class Session:
    id: str
    # The Supabase user id that owns this session. Required: every route now
    # sits behind auth (see app/auth.py), so a session with no owner should
    # never be constructible.
    user_id: str
    created_at: float = field(default_factory=time.time)
    touched_at: float = field(default_factory=time.time)

    # The CV under construction. Keys are RESUME_FIELDS; values are the
    # block-formatted strings the renderer expects.
    draft: dict[str, str] = field(default_factory=dict)
    style: str = "modern"
    language: str = "en"

    # Wire-format transcript sent to the model each turn.
    history: list[dict] = field(default_factory=list)
    # Everything said, kept verbatim for the Phase 2 training corpus.
    transcript: list[dict] = field(default_factory=list)

    usage: TokenUsage = field(default_factory=TokenUsage)

    # Which pool key last served this session. A hint for the scheduler, never
    # a reservation — see KeyPool.acquire. Holds a label ("key-3"), not a secret.
    key_label: str | None = None

    # Portrait lifted from an uploaded CV, as PNG bytes. Held in memory with
    # the rest of the session rather than written to disk on upload: it is
    # personal data with the same lifetime as the session, and a temp file
    # would outlive it on any crash.
    photo: bytes | None = None

    # The most recent render, held so the browser can download it by session
    # without us needing a blob store yet.
    pdf: bytes | None = None
    pdf_name: str = "resume.pdf"
    pdf_pages: int = 0
    # Bumped on every successful render so the client can tell a new PDF from
    # a re-offer of the one it already has.
    pdf_version: int = 0

    def touch(self) -> None:
        self.touched_at = time.time()

    def set_field(self, name: str, value: str) -> None:
        """Store one section, repairing the two ways a model mangles line breaks.

        Both were observed in a real run and both silently destroy the CV,
        because every renderer field is line-oriented: one unbroken line becomes
        one unwrapped run that overflows the page.

        1. **Literal backslash-n.** The model double-escapes its JSON arguments,
           so "Arabic — Native\\nFrench — B2" arrives as a two-character
           sequence rather than a newline. Nothing on a CV legitimately contains
           one, so unescaping is unambiguous.
        2. **Pipes instead of lines in `contact`.** The model borrows the
           column delimiter from the entry-header format. Safe to split on for
           this field alone: a city, phone, email or URL never contains a pipe,
           whereas in `experience` the pipe is load-bearing.
        """
        if name not in RESUME_FIELDS:
            raise KeyError(name)

        text = value or ""
        if "\\n" in text or "\\r" in text or "\\t" in text:
            text = (
                text.replace("\\r\\n", "\n")
                .replace("\\n", "\n")
                .replace("\\r", "\n")
                .replace("\\t", " ")
            )
        if name == "contact" and "\n" not in text and "|" in text:
            text = "\n".join(part.strip() for part in text.split("|") if part.strip())

        self.draft[name] = text.strip()[:MAX_FIELD_CHARS]

    def filled_fields(self) -> list[str]:
        return [f for f in RESUME_FIELDS if self.draft.get(f, "").strip()]

    def missing_fields(self) -> list[str]:
        return [f for f in RESUME_FIELDS if not self.draft.get(f, "").strip()]

    def draft_summary(self) -> str:
        """A compact, readable view of the draft for the model to check.

        Long fields are shown as a count plus their first line rather than in
        full: the model needs to know a section exists and roughly what is in
        it, not to re-read every bullet it just wrote.
        """
        if not self.filled_fields():
            return "The draft is empty."
        lines = [f"style: {self.style}, language: {self.language}"]
        for name in RESUME_FIELDS:
            value = self.draft.get(name, "").strip()
            if not value:
                continue
            entries = [line for line in value.splitlines() if line.strip()]
            if len(value) <= 160:
                lines.append(f"{name}: {value}")
            else:
                lines.append(
                    f"{name}: {len(entries)} lines, starting \"{entries[0][:80]}\""
                )
        missing = self.missing_fields()
        if missing:
            lines.append(f"still empty: {', '.join(missing)}")
        return "\n".join(lines)


class SessionStore:
    """Thread-safe session map with TTL. FastAPI runs sync handlers in a
    threadpool, so the lock is required rather than defensive."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()

    def create(self, user_id: str) -> Session:
        session = Session(id=secrets.token_urlsafe(16), user_id=user_id)
        with self._lock:
            self._maybe_sweep()
            self._sessions[session.id] = session
        return session

    def get(self, session_id: str, user_id: str) -> Session | None:
        """The session, or None if it does not exist, has expired, **or
        belongs to someone else**.

        Ownership is checked here rather than by the caller, so every route
        gets it for free and none can forget it. A mismatch returns the same
        None as "does not exist" — distinguishing them would let one user
        probe for another's session ids by the shape of the error.
        """
        with self._lock:
            self._maybe_sweep()
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if time.time() - session.touched_at > SESSION_TTL_SECONDS:
                del self._sessions[session_id]
                return None
            if session.user_id != user_id:
                return None
            session.touch()
            return session

    def get_or_create(self, session_id: str | None, user_id: str) -> Session:
        if session_id:
            existing = self.get(session_id, user_id)
            if existing is not None:
                return existing
        return self.create(user_id)

    def _maybe_sweep(self) -> None:
        """Drop expired sessions. Caller holds the lock."""
        now = time.monotonic()
        if now - self._last_sweep < SWEEP_EVERY_SECONDS:
            return
        self._last_sweep = now
        cutoff = time.time() - SESSION_TTL_SECONDS
        for key in [k for k, s in self._sessions.items() if s.touched_at < cutoff]:
            del self._sessions[key]

    def reset(self) -> None:
        """Clear everything. Used by the test suite between tests."""
        with self._lock:
            self._sessions.clear()
            self._last_sweep = time.monotonic()


store = SessionStore()
