"""Tools the resume agent can call, and the dispatcher that runs them.

Unlike the portfolio widget — where every tool is a UI action and the client
executes it — these are real server-side operations on session state. The model
decides *that* a field should change; this module is what changes it.

Only three tools, deliberately. Every extra tool is another thing a small model
can pick wrongly, and the whole design depends on a small model being enough.
Uploading is not a tool: the file arrives over HTTP, is extracted before the
model is ever called, and lands in the transcript as context (see main.py).
"""
from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager, suppress

from .cv.builder import PICKABLE_STYLES, RESUME_FIELDS, STYLES, build_resume, safe_filename
from .cv.verify import (
    drop_duplicate_entries,
    input_years,
    strip_invented_years,
    strip_placeholder_values,
)
from .session import Session

# Compressed on purpose. This text is re-sent on every request of every round,
# so each word costs tokens once per model call for the whole session — the
# prose version of this guide was 385 tokens a call. Only the formats that are
# not guessable are spelled out; the self-evident ones (full_name, headline)
# are omitted entirely rather than described.
FIELD_FORMATS = (
    "contact/languages/interests/projects/certifications: one per line "
    "('Arabic - Native', 'Nexora AI - what it does, tech'). "
    "experience/internships: 'Role | Employer | Dates | Location' then '- ' bullets. "
    "education: 'Qualification | School | Year' then detail lines. "
    "skills: 'CATEGORY: item, item'. "
    "profile: one paragraph."
)

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "update_resume",
            "description": (
                "Write one section of the resume draft, replacing whatever that section "
                "held before. Call it once per section — several calls in the same turn "
                "are fine and preferred. Use it both to fill a section the first time and "
                "to correct one the visitor wants changed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {
                        "type": "string",
                        "enum": list(RESUME_FIELDS),
                        "description": "Which section to write.",
                    },
                    "content": {
                        "type": "string",
                        "description": (
                            "The section's full new content, in that section's format. "
                            + FIELD_FORMATS
                        ),
                    },
                },
                "required": ["field", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_draft",
            "description": (
                "Read back what the draft currently holds and which sections are still "
                "empty. Call this before asking the visitor to approve, so you describe "
                "what is actually stored rather than what you remember writing."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_resume",
            "description": (
                "Render the draft to a PDF and give it to the visitor. Only call this "
                "once they have approved the content. Calling it again after an edit "
                "produces a new version."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "style": {
                        "type": "string",
                        "enum": list(PICKABLE_STYLES),
                        "description": (
                            "Two layouts, each with three recolours. 'modern' is the default "
                            "house style: teal sidebar, cream page, sans-serif — with "
                            "'modern-blue', 'modern-plum' and 'modern-burgundy' as the same "
                            "layout in another colour. 'classic' is serif with a photo "
                            "banner and taupe accent — with 'classic-blue', 'classic-green' "
                            "and 'classic-burgundy' likewise. Only pass this if the visitor "
                            "expressed a preference — the picker in the UI is where they "
                            "usually make this choice."
                        ),
                    },
                    "language": {
                        "type": "string",
                        "enum": ["en", "fr"],
                        "description": "Language of the section headings on the PDF.",
                    },
                },
                "required": [],
            },
        },
    },
]


class ToolError(Exception):
    """A tool failed in a way the model should hear about and can recover from."""


@contextmanager
def _portrait_path(photo: bytes | None):
    """Expose in-memory PNG bytes as a file path for the duration of a render.

    Deleted on the way out, including when the render raises: the portrait is
    personal data whose lifetime should match the session, not the filesystem.
    """
    if not photo:
        yield ""
        return

    handle = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        handle.write(photo)
        handle.close()
        yield handle.name
    finally:
        with suppress(OSError):
            os.unlink(handle.name)


def run_tool(session: Session, name: str, arguments: dict | None = None) -> str:
    """Execute one tool call against the session. Returns what the model sees.

    Never raises for bad model input: a wrong field name or an empty draft is
    something the model should be told about so it can correct itself, not a
    500 for the visitor.
    """
    arguments = arguments or {}

    if name == "update_resume":
        field = str(arguments.get("field", "")).strip()
        content = arguments.get("content", "")
        if field not in RESUME_FIELDS:
            return (
                f"'{field}' is not a section. Valid sections: {', '.join(RESUME_FIELDS)}."
            )
        if not isinstance(content, str):
            return "content must be a string."

        # Catches the failure the placeholder scrubber cannot: an invented
        # year looks exactly like a real one, so it has to be checked against
        # what the visitor actually said rather than how it reads. This runs
        # here, at write time, because it is the only path into session.draft —
        # the Build button renders from draft state without calling the model
        # at all, so verifying "after a turn" would leave it unprotected.
        # Duplicates go first, while the lines are still byte-identical: the
        # scrubbers below rewrite them (a removed school leaves a different
        # remnant each time), after which two copies of the same entry no
        # longer match and both survive.
        content, duplicate_entries = drop_duplicate_entries(content)
        content, removed_years = strip_invented_years(content, input_years(session.transcript))
        # Then strip template/example junk — an uploaded half-filled template's
        # "kenza@example.com" / "University of Example" placeholders, or the same
        # values confabulated from a thin extraction. See cv/verify.py.
        content, removed_placeholders = strip_placeholder_values(content)

        session.set_field(field, content)
        stored = session.draft.get(field, "")
        if not stored:
            note = f"Cleared {field}."
        else:
            line_count = len([line for line in stored.splitlines() if line.strip()])
            note = f"Saved {field} ({line_count} line{'s' if line_count != 1 else ''})."
        if removed_years:
            note += (
                f" Removed unconfirmed year(s) {', '.join(sorted(removed_years))} — "
                "the visitor never gave a year for this. Ask them if it matters; "
                "do not guess another one."
            )
        if duplicate_entries:
            note += (
                f" Dropped {duplicate_entries} duplicate entr"
                f"{'y' if duplicate_entries == 1 else 'ies'} — the same line appeared "
                "more than once, which is what an unedited template looks like. "
                "Check with the visitor that nothing real was repeated."
            )
        if removed_placeholders:
            note += (
                f" Removed template placeholder(s) {', '.join(removed_placeholders)} — "
                "these are example values from a blank template, not the visitor's "
                "real details. Do not save them; ask the visitor for the real value."
            )
        return note

    if name == "review_draft":
        # State the file's existence as fact, every time. A live run had the
        # model read a full draft back and announce "Your CV is ready!" without
        # ever calling generate_resume — the visitor would have been told their
        # CV was done with nothing to download. Reviewing is not rendering, and
        # the model is far more reliable when told so by a tool result than when
        # asked to remember it from the system prompt.
        if session.pdf is None:
            status = (
                "\n\nNO PDF EXISTS YET. Reviewing is not rendering — the visitor "
                "has no file and nothing to download until you call "
                "generate_resume. Do not tell them their CV is ready."
            )
        else:
            status = (
                f"\n\nA PDF exists (version {session.pdf_version}, "
                f"{session.pdf_pages} page(s)). Any edit since then needs a new "
                "generate_resume call to reach the visitor."
            )
        return session.draft_summary() + status

    if name == "generate_resume":
        if not session.draft.get("full_name", "").strip():
            return (
                "Cannot render yet — full_name is empty. Ask the visitor for their "
                "name and save it with update_resume first."
            )
        # A name alone is not a CV. This fired for real: the model described an
        # uploaded CV in prose without calling update_resume, then rendered —
        # producing a one-page document containing a single line. Prompt wording
        # is not a strong enough guarantee against handing somebody that, so the
        # substance check lives here where it cannot be talked out of.
        substantive = [f for f in session.filled_fields() if f not in ("full_name", "headline")]
        if not substantive:
            return (
                "Refusing to render: the draft holds only a name. Describing a "
                "section is not saving it — call update_resume for the profile, "
                "experience, education and skills first, then generate."
            )


        style = str(arguments.get("style") or session.style).strip()
        if style not in STYLES:
            style = "modern"
        language = str(arguments.get("language") or session.language).strip()
        if language not in ("en", "fr"):
            language = "en"
        session.style, session.language = style, language

        payload = {name_: session.draft.get(name_, "") for name_ in RESUME_FIELDS}

        # The renderer takes a path, but the portrait lives in memory (see
        # Session.photo). Write it for exactly the length of the render and
        # delete it afterwards, so personal data never outlives the call.
        with _portrait_path(session.photo) as photo_path:
            try:
                pdf_bytes, pages = build_resume(
                    style=style, language=language, photo=photo_path, **payload
                )
            except Exception as exc:  # noqa: BLE001 — reportlab raises a wide family
                # The model can often fix this itself (a malformed entry block),
                # so describe it rather than failing the request.
                raise ToolError(
                    f"The PDF renderer failed: {type(exc).__name__}: {exc}"
                ) from exc

        session.pdf = pdf_bytes
        session.pdf_name = safe_filename(session.draft.get("full_name", ""))
        session.pdf_pages = pages
        session.pdf_version += 1
        note = (
            f"Rendered a {pages}-page {style} CV. The visitor now has a download "
            f"button for it — tell them it is ready, and offer to change anything."
        )

        # A CV nobody can reply to cannot do the one thing a CV is for. This
        # became reachable the moment placeholder scrubbing started working: a
        # visitor uploaded a template whose every contact detail was fake
        # ("hello@reallygreatsite.com", "+123-456-7890", "123 Anywhere St."),
        # all of it was correctly discarded, and the CV rendered with an empty
        # contact block.
        #
        # Reported rather than refused, deliberately. Rendering is the one path
        # that must always work — the Build button exists precisely so a
        # visitor is never left with a finished draft and no file, whatever the
        # model does — so this hands the model the fact and lets it ask, rather
        # than withholding a document somebody may have wanted anyway.
        if not session.draft.get("contact", "").strip():
            note += (
                " IMPORTANT: the CV has no contact details, so a recruiter reading "
                "it would have no way to reply. If an uploaded template's example "
                "details were discarded, that is why. Ask the visitor for a real "
                "email and phone number, save them, and generate again."
            )
        return note

    return f"Unknown tool: {name}"
