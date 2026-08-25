"""The resume agent: a bounded tool loop over session state.

The loop is the same shape as any tool-calling agent — ask the model, run what
it requests, feed results back, repeat — with two constraints that matter here:

* **Bounded rounds.** A confused model that keeps calling `review_draft` costs
  real money. `max_tool_rounds` ends the turn with an honest message instead.
* **Usage is accumulated on the session**, including for rounds that end in a
  tool call rather than a reply, because every one of those was a paid request.
"""
from __future__ import annotations

import json
import logging

from .config import get_settings
from .llm import Completion, LLMError, complete, read_image
from .session import Session
from .tools import TOOL_SCHEMAS, ToolError, run_tool

logger = logging.getLogger(__name__)


class SessionBudgetExceeded(Exception):
    """This session has spent its token ceiling.

    Deliberately not an LLMError: nothing is wrong upstream, and the visitor
    keeps everything they have. The draft is still there and the Build button
    still renders it — which is why that button not depending on the model
    matters more than it first appears.
    """

SYSTEM_PROMPT = """\
You are a resume writer. You interview a visitor and build them a professional \
CV, which is rendered as a PDF by your tools. The visitor is often not technical \
and has never written a CV before.

HOW THE DRAFT WORKS
The draft is stored on the server, not in this conversation. `update_resume` \
writes one section; it replaces that section entirely, so always send the \
section's full new content, never a fragment. You do not need to remember or \
restate what you already saved — call `review_draft` to read it back.

TWO WAYS A SESSION STARTS
1. The visitor uploads an existing CV. Its extracted text appears in the \
conversation as context. SAVE IT FIRST: call `update_resume` for every section \
you can fill — name, contact, headline, profile, experience, education, skills, \
languages, certifications — before you write a single word to the visitor. \
Describing a section is not saving it; a section you only mentioned is not in \
the CV and will not be printed. Once it is saved, tell them what you took and \
ask them to confirm or correct it. Never present extracted text as verified.
A file may be a half-filled template still holding its example values — an \
"@example.com" email, "University of Example", a "123-456-7890" phone, "Your \
Name". These are not the visitor's details: never save them, leave that field \
empty and ask for the real value.
2. The visitor has no CV. Interview them.

INTERVIEWING
Ask about two or three things at a time, never a long form. Start with their \
name, what work they want, and their most recent job or studies. Then fill the \
rest. Use plain language: ask "what did you actually do day to day?", not \
"describe your responsibilities". Save answers as you go with `update_resume` \
rather than waiting until the end.

WRITING THE CV
Turn what they tell you into strong CV prose. Bullets start with a verb and say \
what changed, not what they were assigned.

NEVER WRITE A FACT THEY DID NOT GIVE YOU. This applies especially to years, \
degree names, job titles, employers, grades and numbers. If they said "final \
year at EMSI" you write exactly that — you do not decide it is a "Bachelor's \
Degree" or that it started in 2023. Missing a detail is fine: ask for it, or \
leave it out. A CV with a wrong date is worse than one with no date, because a \
recruiter can check.

LEAVE EMPTY COLUMNS EMPTY. "Role | Employer | Dates | Location" has four slots \
and you will often only know two. Write "Manager Intern | | Feb 2021 |" and \
move on. Never fill a slot with its own name — a CV that prints "Company Name" \
or "Location" tells a recruiter it was written by a machine. If the employer \
matters, ask for it.

Put jobs and internships together under `experience`. Only use `internships` \
when the visitor has both and wants them separated.

Always set `headline` — the short professional title printed under the name \
("AI & Data Engineering", "Marketing Manager"). On an uploaded CV it is usually \
in the `header` text; otherwise take it from the role they are seeking. The \
name looks unfinished without it.

FINISHING
If the visitor has already approved — "yes", "that's correct", "build it", \
"go ahead" — call `generate_resume` straight away. Do not summarise again and \
do not ask a second time; they have answered, and asking again reads as not \
listening.

Otherwise, when the CV looks complete: call `review_draft`, summarise it in a \
few lines, and ask them to approve.

`generate_resume` is the only thing that produces a file. Reviewing, \
summarising and describing the CV do not. Never say the CV is ready, done or \
downloadable unless a generate_resume call in this conversation has just \
succeeded — `review_draft` tells you whether a PDF exists. After it renders, \
say so and offer to change anything; an edit is another `update_resume` \
followed by another `generate_resume`.

STYLE OF YOUR REPLIES
Short. Two or three sentences, then your question. You may use **bold** and \
"- " bullets; they render properly. Never show raw section formatting \
("Role | Employer | Dates") to the visitor — that is for your tool calls only. \
Write in the visitor's language if they write in French or Arabic, else English.
"""


# How many recent messages stay verbatim. Six covers roughly the last three
# exchanges — enough for "no, change that one" to still have its referent.
VERBATIM_WINDOW = 6


def _compact(session: Session) -> list[dict]:
    """Cap the transcript sent upstream, replacing old turns with the draft.

    THE COST ARGUMENT
    -----------------
    Input tokens for a session are

        total = Σ_t r_t · (F + H_t)

    where F is the fixed prefix (system prompt + tool schemas), H_t the history
    at turn t, and r_t the rounds in that turn. Left alone H_t grows by roughly
    a constant Δ per turn, so H_t ≈ tΔ and the sum is **O(T²)** — which is why
    the measured run went 3.3k → 6.0k → 9.2k with the deltas widening.

    Bounding H_t by a constant makes it **O(T)**.

    WHY DROPPING HISTORY IS SAFE HERE, AND NOT IN GENERAL
    -----------------------------------------------------
    Normally truncation loses information. It does not here, because the
    information was never only in the transcript: the moment the model calls
    `update_resume`, the content is authoritative server state. Replaying the
    conversation that produced a section is strictly redundant with reading the
    section. So old turns collapse into one digest of what is actually stored —
    which is *more* reliable than the transcript, since it reflects the final
    value of each field rather than every intermediate revision.

    This is the payoff of putting the draft in `session.py` rather than in the
    prompt: it makes the transcript disposable.

    The cut lands on a user message. OpenAI requires every `tool_calls` message
    to be followed by its matching `tool` results, so slicing at an arbitrary
    index can orphan a tool call and get the request rejected outright.
    """
    history = session.history
    if len(history) <= VERBATIM_WINDOW:
        return history

    # Walk back to the newest user message at or before the window boundary, so
    # the kept slice always begins a turn rather than mid tool-exchange.
    cut = len(history) - VERBATIM_WINDOW
    while cut > 0 and history[cut].get("role") != "user":
        cut -= 1
    if cut <= 0:
        return history

    digest = (
        "[Earlier in this conversation. The sections below are what is actually "
        "saved on the server right now — treat this as the truth, not your memory "
        "of what was said.]\n" + session.draft_summary()
    )
    return [{"role": "user", "content": digest}, *history[cut:]]


def _pdf_status(session: Session) -> dict:
    """A one-line statement of whether a file exists, injected every turn.

    `review_draft` already reports this, but only to a model that calls it — and
    a model that has decided it is finished calls nothing. It then announces
    "your CV is ready" with nothing to download, which happened to a real
    visitor. Ten tokens a turn buys the ground truth unconditionally.
    """
    if session.pdf is None:
        note = (
            "[System: no PDF exists yet. The visitor has nothing to download. "
            "Do not tell them their CV is ready — call generate_resume.]"
        )
    else:
        note = (
            f"[System: a PDF exists, version {session.pdf_version}. Edits since "
            "then need another generate_resume call to reach the visitor.]"
        )
    return {"role": "system", "content": note}


def _wire_messages(session: Session) -> list[dict]:
    """The system prompt stays byte-identical and first, and the tool schemas
    never change, so together they form a stable prefix. OpenAI caches prefixes
    over 1024 tokens automatically and bills cached input at a discount — worth
    roughly half of F on every request after the first, for free, provided
    nothing variable is ever prepended ahead of them."""
    # The PDF status goes last, after the history: appending keeps the cached
    # prefix intact, where inserting it near the front would invalidate the
    # cache on every turn.
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *_compact(session),
        _pdf_status(session),
    ]


def _record_assistant_turn(session: Session, result: Completion) -> None:
    """Append the model's tool request to history in wire format."""
    session.history.append(
        {
            "role": "assistant",
            "content": result.content or "",
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                }
                for call in result.tool_calls
            ],
        }
    )


def run_turn(session: Session, user_message: str) -> dict:
    """Run one visitor turn to completion. Returns what the API should send back.

    Raises LLMError if the provider is unusable; every other failure is turned
    into something the model or the visitor can act on.
    """
    settings = get_settings()

    # Checked before the turn, not during: stopping mid-turn would bill for the
    # rounds already spent and still leave the visitor without an answer.
    budget = settings.max_session_tokens
    if budget and session.usage.total >= budget:
        raise SessionBudgetExceeded(
            "This conversation has reached its limit. Your draft is saved — use "
            "the Build button to get your CV, or start over for a fresh session."
        )

    session.history.append({"role": "user", "content": user_message})
    session.transcript.append({"role": "user", "content": user_message})

    actions: list[str] = []
    pdf_version_before = session.pdf_version

    for _round in range(settings.max_tool_rounds):
        result = complete(_wire_messages(session), TOOL_SCHEMAS, sticky_key=session.key_label)
        session.usage.add(result.prompt_tokens, result.completion_tokens)
        session.key_label = result.key_label or session.key_label

        # No tools requested: this is the final answer for this turn.
        if not result.tool_calls:
            session.history.append({"role": "assistant", "content": result.content})
            session.transcript.append({"role": "assistant", "content": result.content})
            return {
                "reply": result.content,
                "actions": actions,
                "pdf_ready": session.pdf_version > pdf_version_before,
            }

        _record_assistant_turn(session, result)

        for call in result.tool_calls:
            try:
                output = run_tool(session, call.name, call.arguments)
            except ToolError as exc:
                output = str(exc)
            except Exception as exc:  # noqa: BLE001 — a tool bug must not 500 the chat
                output = f"That tool failed: {type(exc).__name__}."

            session.history.append(
                {"role": "tool", "tool_call_id": call.id, "content": output}
            )
            session.transcript.append(
                {"role": "tool", "name": call.name, "arguments": call.arguments, "content": output}
            )
            if call.name == "generate_resume" and session.pdf_version > pdf_version_before:
                actions.append("Built the CV")

        if result.truncated:
            # The response hit max_tokens mid-flight, so there are sections it
            # never got to write. Left alone the model reads its own tool
            # results, decides the job is done and replies — losing the rest
            # silently, which is how projects, certifications and interests
            # vanished from a real pasted CV. Say what happened.
            logger.info("session %s: response truncated, prompting to continue", session.id)
            session.history.append(
                {
                    "role": "system",
                    "content": (
                        "[System: your previous response was cut off before you "
                        "finished. Continue where you stopped — save any sections "
                        "you had not yet written. Do not repeat ones already saved.]"
                    ),
                }
            )

    # Out of rounds. Say so rather than looping on the visitor's money.
    message = (
        "Sorry — I got tangled up there. Could you tell me again what you'd like "
        "changed?"
    )
    session.history.append({"role": "assistant", "content": message})
    session.transcript.append({"role": "assistant", "content": message})
    return {"reply": message, "actions": actions, "pdf_ready": session.pdf_version > pdf_version_before}


VISION_PROMPT = (
    "This is a page from someone's CV that could not be read as text. "
    "Transcribe everything you can see, preserving the sections and their order. "
    "Output plain text under headings. Do not invent anything that is not "
    "visible; if a part is unreadable, write [unreadable] there."
)


def recover_by_vision(session: Session, image_png: bytes) -> str | None:
    """Read a CV that yielded no text, using the vision endpoint.

    The expensive tier of the extraction cascade, and the reason the cheap ones
    exist: this is reached only when `cv/quality.py` grades the deterministic
    pass as FAILED. Returns transcribed text, or None if that also fails —
    in which case the visitor is asked to type their details instead, which is
    a better outcome than an error page.
    """
    try:
        result = read_image(VISION_PROMPT, image_png, sticky_key=session.key_label)
    except LLMError as exc:
        logger.info("vision recovery failed for session %s: %s", session.id, exc)
        return None

    session.usage.add(result.prompt_tokens, result.completion_tokens)
    session.key_label = result.key_label or session.key_label
    text = (result.content or "").strip()
    return text or None


def seed_uploaded_cv(session: Session, extraction: dict, filename: str) -> None:
    """Put an uploaded CV's extracted text into the conversation as context.

    Injected as a user-role message rather than a tool result because there was
    no tool call to answer: the file arrived over HTTP, before the model ran.
    Extracting first is the point — the model sees capped, labelled sections
    instead of a raw two-page dump.
    """
    parts = [f"[The visitor uploaded a CV: {filename}]", ""]

    grade = (extraction.get("assessment") or {}).get("grade")
    if grade == "partial":
        # Say so plainly. Told the structure is unreliable, the model reads the
        # text and maps it itself; left to assume the sections are correct, it
        # propagates whatever the heading heuristics got wrong.
        parts.append(
            "NOTE: the layout did not parse cleanly, so the sections below may "
            "be mislabelled or run together. Read the text and decide for "
            "yourself which part is which."
        )
        parts.append("")
    elif grade == "recovered":
        parts.append(
            "NOTE: this CV had no machine-readable text and was transcribed "
            "from the page image, so wording may be imperfect. Confirm names, "
            "dates and numbers with the visitor before relying on them."
        )
        parts.append("")

    if extraction.get("estimated_name"):
        parts.append(f"Name (unconfirmed): {extraction['estimated_name']}")
    if extraction.get("contact_candidates"):
        parts.append("Contact found: " + ", ".join(extraction["contact_candidates"]))
    if extraction.get("photo"):
        # The model cannot see it and must not claim otherwise, but it should
        # know the rebuilt CV will keep the portrait.
        parts.append(
            "A photo was found in the file and will be used automatically. "
            "Do not ask them to send one."
        )
    parts.append("")
    for name, content in (extraction.get("sections") or {}).items():
        parts.append(f"--- {name} ---")
        parts.append(content)
        parts.append("")
    if extraction.get("notes"):
        parts.append("Extraction notes: " + " ".join(extraction["notes"]))

    blob = "\n".join(parts)
    session.history.append({"role": "user", "content": blob})
    session.transcript.append({"role": "system", "content": blob, "kind": "upload"})
