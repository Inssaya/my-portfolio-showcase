"""An uploaded CV must reach the draft, not just the context window.

The bug this pins came in from a real French CV. Extraction was perfect —
profile, skills, experience, education, certifications, projects and
languages all found with the right content — and the model saved the name
and the contact, then asked the visitor what job they were looking for and
what they had done most recently. Both answers were on screen in front of
it.

The system prompt already says to save every section before writing a word
to the visitor. That is a prompt, and the model is free to decide it has
done enough; nothing checked. These tests are the check.
"""
from __future__ import annotations

import pytest

from app import agent as agent_module
from app.agent import run_turn, seed_uploaded_cv
from app.llm import Completion, ToolCall
from app.session import store

EXTRACTION = {
    "estimated_name": "Yassine Amchi",
    "sections": {
        "header": "YASSINE AMCHI\nTechnicien Réseaux et Systèmes",
        "profile": "Technicien Spécialisé en Infrastructure Digitale.",
        "skills": "Réseaux : TCP/IP, VLAN\nSystèmes : Linux, Kali Linux",
        "experience": "Stagiaire - Cybersécurité | Faculté des Lettres | Mars 2026",
        "education": "Technicien Spécialisé | OFPPT | 2026",
        "certifications": "CCNA Introduction to Networks — Cisco",
        "languages": "Arabe - Avancé\nFrançais - Intermédiaire",
    },
}


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


def _save(field: str, content: str = "something real") -> ToolCall:
    return ToolCall(
        id=f"c-{field}", name="update_resume",
        arguments={"field": field, "content": content},
    )


def _script(monkeypatch, *turns: Completion):
    """Answer each round from `turns`, repeating the last one after that."""
    seen = {"n": 0}

    def fake_complete(messages, tools=None, sticky_key=None):
        index = min(seen["n"], len(turns) - 1)
        seen["n"] += 1
        return turns[index]

    monkeypatch.setattr(agent_module, "complete", fake_complete)
    return seen


def test_replying_with_the_upload_unsaved_is_sent_back(monkeypatch) -> None:
    """The exact shape of the reported failure: two fields saved, then a
    friendly summary and a question the CV already answers."""
    session = store.create(user_id="u1")
    seed_uploaded_cv(session, EXTRACTION, "cv.pdf")

    _script(
        monkeypatch,
        # Round 1 — what the model actually did.
        Completion(content="", tool_calls=[_save("full_name", "Yassine Amchi"),
                                           _save("contact", "yassinamchi@gmail.com")]),
        # Round 2 — the premature reply.
        Completion(content="I've saved your name and contact. What job are you seeking?"),
        # Round 3 — after the nudge, it saves the rest.
        Completion(content="", tool_calls=[
            _save("profile"), _save("skills"), _save("experience"),
            _save("education"), _save("certifications"), _save("languages"),
        ]),
        Completion(content="Saved everything from your CV."),
    )

    result = run_turn(session, "here is my CV")

    for field in ("profile", "skills", "experience", "education",
                  "certifications", "languages"):
        assert session.draft.get(field), f"{field} never reached the draft"
    assert result["reply"] == "Saved everything from your CV."


def test_the_nudge_names_the_sections_that_were_skipped(monkeypatch) -> None:
    """"You missed some" is not actionable — the model has to be told which,
    and the list costs nothing to compute."""
    session = store.create(user_id="u1")
    seed_uploaded_cv(session, EXTRACTION, "cv.pdf")

    _script(
        monkeypatch,
        Completion(content="", tool_calls=[_save("full_name", "Yassine Amchi")]),
        Completion(content="Done! Anything else?"),
        Completion(content="", tool_calls=[
            _save("profile"), _save("skills"), _save("experience"),
            _save("education"), _save("certifications"), _save("languages"),
        ]),
        Completion(content="All saved."),
    )
    run_turn(session, "here is my CV")

    nudge = next(
        m for m in session.history
        if m.get("role") == "system" and "have not saved" in str(m.get("content"))
    )
    for field in ("profile", "skills", "experience", "education",
                  "certifications", "languages"):
        assert field in nudge["content"], f"the nudge did not name {field}"


def test_it_gives_up_rather_than_arguing_forever(monkeypatch) -> None:
    """A model that keeps refusing — because it judges a section to be
    template junk, say — must not trap the visitor in a loop. The nudge is
    capped, and the turn still returns the model's own words."""
    session = store.create(user_id="u1")
    seed_uploaded_cv(session, EXTRACTION, "cv.pdf")

    _script(monkeypatch, Completion(content="That CV is all placeholder text."))

    result = run_turn(session, "here is my CV")

    assert result["reply"] == "That CV is all placeholder text."
    # And it does not keep nagging on the next message.
    assert session.pending_upload_fields == set()


def test_a_conversation_with_no_upload_is_untouched(monkeypatch) -> None:
    """Someone being interviewed from scratch must still be able to get a
    short answer to a short question."""
    session = store.create(user_id="u1")
    _script(monkeypatch, Completion(content="Sure — what's your name?"))

    assert run_turn(session, "hi")["reply"] == "Sure — what's your name?"


# ------------------------------------------- the text has to still be there ---

def test_the_upload_survives_compaction_until_it_is_saved() -> None:
    """The nudge above is an instruction to save sections from a document. If
    that document has been compacted out of context by the time the model
    acts on it, the instruction becomes an instruction to invent.

    That is not hypothetical — it is what shipped. A real CV came back with
    "Software Developer — XYZ Company" and "Intern — ABC Corp" under the
    visitor's own name and phone number, because history had grown past
    VERBATIM_WINDOW between the upload and the save.
    """
    from app.agent import UPLOAD_MARKER, _compact

    session = store.create(user_id="u1")
    seed_uploaded_cv(session, EXTRACTION, "cv.pdf")
    session.history.append({"role": "user", "content": "here is my CV"})
    # Well past the verbatim window.
    for index in range(6):
        session.history.append({"role": "assistant", "content": f"turn {index}"})
        session.history.append({"role": "user", "content": f"ok {index}"})

    def upload_in_context() -> bool:
        return any(
            str(m.get("content", "")).startswith(UPLOAD_MARKER) for m in _compact(session)
        )

    assert upload_in_context(), "the CV text was compacted away while still unsaved"

    # Once the draft holds it, the digest is the truth and the text is
    # redundant — the architecture's own argument. It must not stay pinned.
    for field in EXTRACTION["sections"]:
        if field != "header":
            session.set_field(field, "the real content")
    assert not upload_in_context(), "the CV text stayed pinned after being saved"


def test_a_conversation_with_no_upload_pins_nothing() -> None:
    """The pin must not cost anything on an ordinary interview."""
    from app.agent import _compact

    session = store.create(user_id="u1")
    for index in range(10):
        session.history.append({"role": "user", "content": f"q{index}"})
        session.history.append({"role": "assistant", "content": f"a{index}"})

    assert len(_compact(session)) <= 8
