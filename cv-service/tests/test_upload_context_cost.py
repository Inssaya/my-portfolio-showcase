"""What an uploaded document costs to keep in the conversation.

A visitor uploaded the same screenshot three times and exhausted an 80k guest
allowance in four messages. Every part of that had a cause:

* the uploads were *failing on their phone* — a vision call plus a full tool
  loop does not finish inside a mobile connection's patience — while the
  server completed the work and billed for it, so they retried;
* each retry injected another full copy of the extracted text as a message;
* `_compact` keeps the last six messages verbatim, so all three copies sat in
  the window at once;
* and the whole window is re-sent on *every round* of the tool loop, up to
  eight per turn.

Three documents times eight rounds, every turn. These tests measure the size
of what actually goes on the wire, because the behavioural version of this
test passed the whole time it was broken.
"""
from __future__ import annotations

import pytest

from app.agent import UPLOAD_MARKER, _wire_messages, seed_uploaded_cv
from app.session import store

LONG_SECTION = "Ahmed did a great many things at this employer. " * 200


def _extraction(tag: str) -> dict:
    return {
        "sections": {"experience": f"{tag} {LONG_SECTION}"},
        "assessment": {"grade": "good"},
    }


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


def _wire_size(session) -> int:
    return sum(len(str(message.get("content", ""))) for message in _wire_messages(session))


def test_a_second_upload_does_not_double_the_context() -> None:
    session = store.create(user_id="u")

    seed_uploaded_cv(session, _extraction("ZZOLDERZZ"), "cv.pdf")
    after_one = _wire_size(session)
    seed_uploaded_cv(session, _extraction("ZZNEWESTZZ"), "cv.pdf")
    after_two = _wire_size(session)

    # Not "smaller than double" — barely bigger at all. The first document is
    # replaced by a one-line pointer to the draft, which is where its content
    # already lives.
    assert after_two < after_one * 1.2


def test_the_newest_upload_is_still_there_in_full() -> None:
    """The collapse must not eat the document the model has not read yet."""
    session = store.create(user_id="u")

    seed_uploaded_cv(session, _extraction("ZZOLDERZZ"), "cv.pdf")
    seed_uploaded_cv(session, _extraction("ZZNEWESTZZ"), "cv.pdf")

    wire = "\n".join(str(m.get("content", "")) for m in _wire_messages(session))
    assert "ZZNEWESTZZ" in wire
    assert "ZZOLDERZZ" not in wire


def test_five_uploads_cost_about_the_same_as_one() -> None:
    """The shape of the fix: cost stops tracking the number of uploads."""
    session = store.create(user_id="u")
    seed_uploaded_cv(session, _extraction("one"), "cv.pdf")
    baseline = _wire_size(session)

    for index in range(4):
        seed_uploaded_cv(session, _extraction(f"more-{index}"), "cv.pdf")

    assert _wire_size(session) < baseline * 1.5


def test_a_single_enormous_upload_is_capped() -> None:
    """One document may not dominate the context either. A vision
    transcription of a dense screenshot can run far longer than a CV, and it
    is re-sent on every round."""
    session = store.create(user_id="u")

    seed_uploaded_cv(
        session, {"sections": {"everything": "x" * 200_000}}, "huge.pdf"
    )

    assert _wire_size(session) < 20_000


def test_the_visitor_is_told_when_their_document_was_cut() -> None:
    """Silently truncating produces a half CV that nobody knows is half. Told
    the text stops early, the model asks for the rest."""
    session = store.create(user_id="u")

    seed_uploaded_cv(
        session, {"sections": {"everything": "x" * 200_000}}, "huge.pdf"
    )

    blob = next(
        m["content"] for m in session.history
        if str(m.get("content", "")).startswith(UPLOAD_MARKER)
    )
    assert "too long to include" in blob
