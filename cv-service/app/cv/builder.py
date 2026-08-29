"""Render a resume draft into PDF bytes.

Ported from the Hub's `create_resume` tool. The layout code for `_cvmodern`
and `_cvdesign` is vendored verbatim — geometry there was measured off
reference PDFs and is not something to re-derive. `_cvbold` is a third
template, proportioned (not pixel-measured — no printed reference exists for
it) against a design sample. What changed is the boundary: the Hub stored an
artifact and handed the model a handle, whereas here the caller wants the
bytes, so `build_resume` returns them and the HTTP layer decides what to do.

Two layouts, each with three recolours, plus `bold`:
  modern            teal sidebar, cream page, sans-serif. The house style, default.
  modern-blue       modern's exact layout, recoloured — navy band, blue accent.
  modern-plum       modern's exact layout, recoloured — plum band and accent.
  modern-burgundy   modern's exact layout, recoloured — wine band and accent.
  classic           serif/taupe with a photo header and language bars.
  classic-blue      classic's exact layout, recoloured — slate blue accent.
  classic-green     classic's exact layout, recoloured — forest green accent.
  classic-burgundy  classic's exact layout, recoloured — deep wine accent.
  bold              single column, circular photo masthead, coloured section rules.

The `-colour` variants are not separate renderers. `CVRenderer` takes an
`accent` and `ModernCV` a `sidebar`+`accent` (see `_cvdesign.py` and
`_cvmodern.py`); each variant is the one vendored file recoloured, not another
measured layout to keep in sync by hand. Both base styles pass no colours at
all, so they keep their exact measured palettes.
"""
from __future__ import annotations

import io
import re

from ._cvbold import BoldCV
from ._cvdesign import (
    LABELS,
    CVRenderer,
    Entry,
    _guess_icon,
    parse_entries,
    parse_languages,
)
from ._cvmodern import ModernCV

# The fields a draft is made of, in the order a CV reads. `session.py` and the
# tool schemas both derive from this, so adding a section is a one-line change.
RESUME_FIELDS = (
    "full_name",
    "contact",
    "headline",
    "profile",
    "experience",
    "internships",
    "education",
    "skills",
    "languages",
    "interests",
    "projects",
    "certifications",
)

# Recolours of `classic` — same CVRenderer, same layout, only `accent` differs.
# Kept as a dict rather than three near-duplicate functions so a fourth colour
# is a one-line addition, not a new render path to maintain.
CLASSIC_ACCENTS: dict[str, str] = {
    "classic-blue": "#3C5B74",
    "classic-green": "#3E6B52",
    "classic-burgundy": "#7A3B42",
}

# Recolours of `modern`. Two colours each, not one: this template is carried by
# the sidebar band *and* the accent (headline, section heads, employers, bullet
# dots), and moving only one leaves a plum sidebar with teal headings. The
# portrait ring and link tint are derived from the band inside ModernCV.
#
# Plain `modern` is deliberately absent — it passes neither colour and so keeps
# the exact measured reference palette. See ModernCV.__init__.
MODERN_PALETTES: dict[str, tuple[str, str]] = {
    #                     sidebar band, accent
    "modern-blue": ("#1E3A5F", "#14507A"),
    "modern-plum": ("#3E2A47", "#6E3364"),
    "modern-burgundy": ("#46242A", "#7A3B42"),
}

STYLES = ("modern", *MODERN_PALETTES, "classic", *CLASSIC_ACCENTS, "bold")

# What the visitor may pick from in the UI: the two layouts, each with its
# three recolours. `bold` stays out — the renderer still knows how to draw it
# for stored sessions and tests, but it has no printed reference behind it and
# offering a third layout shape is a different decision from offering colours.
#
# Order matters: this is the order the picker lays cards out in, so each
# layout sits with its own variants rather than interleaved with the other's.
PICKABLE_STYLES = ("modern", *MODERN_PALETTES, "classic", *CLASSIC_ACCENTS)

# ------------------------------------------------------------- typography ---
# The reference CV distinguishes three separators that a model — and most
# people — type as a plain hyphen:
#
#   en dash    2022 – 2027        a span between two values
#   em dash    Arabic — Native    one thing set against another
#   mid dot    Tangier · Ops      two peers on one quiet line
#
# Normalising here rather than instructing the model is deliberate. It is
# deterministic, it costs no tokens, and it cannot be forgotten halfway through
# a long session. The patterns require whitespace on both sides, so hyphenated
# words ("on-premise", "final-year") and bullet markers are never touched.
EN_DASH, EM_DASH, MIDDOT = "–", "—", "·"

_LOOSE_HYPHEN = re.compile(r"\s+[-–—]\s+")


def _as_range(text: str) -> str:
    """Date spans: 'Jun 2026 - Present' -> 'Jun 2026 – Present'.

    Only the first separator is the span. A second one is a qualifier beside it
    — '2024 - 2025 - 1 month' means a range *and* a duration — so it becomes a
    mid dot, matching the reference's '2024 – 2025 · 1 month'.

    Split-and-rejoin rather than two passes of `sub`: the pattern matches dashes
    it has already inserted, so a second `sub` would overwrite the en dash from
    the first with a mid dot.
    """
    parts = _LOOSE_HYPHEN.split(text or "")
    if len(parts) < 2:
        return text or ""
    joined = f"{parts[0]} {EN_DASH} {parts[1]}"
    for qualifier in parts[2:]:
        joined += f" {MIDDOT} {qualifier}"
    return joined


def _as_pair(text: str) -> str:
    """'Arabic - Native', 'Python for X - IBM' -> em dash.

    Pipes count as the same mistake. A pipe is the column delimiter for an
    *entry* header ("Role | Employer | Dates"), so in a flat one-per-line field
    it is only ever a separator the model reached for by analogy — and it
    reaches the page verbatim, printing "Certificate | Issuer | 2026".
    """
    return _LOOSE_HYPHEN.sub(f" {EM_DASH} ", (text or "").replace("|", EM_DASH))


def _as_peers(text: str) -> str:
    """Meta lines: 'Tangier, Morocco - Maintenance' -> ' · '."""
    return _LOOSE_HYPHEN.sub(f" {MIDDOT} ", text or "")


# An entry title is drawn on one line without wrapping, because a real one is
# short ("AI Data Engineer Intern"). Anything past this is not a title.
MAX_TITLE_CHARS = 70

# The `Role | Employer | Dates | Location` format has four slots, and a model
# handed three facts fills the fourth with the slot's own name — printing
# "Manager Intern — Company Name" and a location line reading "Location".
#
# The prompt already forbids inventing facts, and this is not quite inventing:
# it is filling in a template. Either way a recruiter reads it as obviously
# machine-written, which is worse than a gap, so it is removed here where it
# cannot be argued with.
#
# Matched whole-field and case-insensitively. Never as a substring: somebody
# genuinely worked at "Location Services Ltd", and a real title can contain the
# word "Manager".
_PLACEHOLDERS = frozenset(
    {
        "company name", "company", "employer", "employer name", "organisation",
        "organization", "location", "city", "city, country", "address",
        "job title", "role", "position", "title", "your name", "full name",
        "school", "school name", "university", "institution", "degree",
        "n/a", "na", "tbd", "tba", "unknown", "none", "-", "--", "...",
        "xxx", "xx", "date", "dates", "year", "years",
    }
)


def _is_placeholder(text: str) -> bool:
    cleaned = (text or "").strip().strip("[](){}<>").strip().lower()
    if cleaned in _PLACEHOLDERS:
        return True
    # Nothing but punctuation left is the same as empty — e.g. a stray "."
    # is what remains of an org field after verify.strip_placeholder_values
    # removes "Wardiere Inc" from "Wardiere Inc." and leaves the trailing
    # stop behind. Rather than growing the frozenset above with every
    # possible punctuation remnant, anything with no letter or digit at all
    # is treated the same way as the explicit "-"/"--"/"..." entries already
    # are.
    return not any(character.isalnum() for character in cleaned)


def _drop_placeholder(text: str) -> str:
    return "" if _is_placeholder(text) else (text or "")


def _polish_entries(entries: list) -> list:
    """Apply the right separator to each part of a parsed entry.

    Bullets and notes are left alone: they are prose, where a writer's own dash
    is a deliberate choice rather than a mistyped separator.

    Also demotes an absurdly long title into a note. Titles are drawn unwrapped
    on a single line, so when a whole mangled experience block collapsed into
    one "title" the text ran straight off both edges of the page and over the
    rest of the CV. Notes wrap, so this degrades to ugly instead of destroyed —
    the input is already wrong by then, and a public service should not render
    a broken page because of it.
    """
    for entry in entries:
        entry.title = _drop_placeholder(entry.title)
        entry.org = _drop_placeholder(entry.org)
        entry.dates = _as_range(_drop_placeholder(entry.dates))
        # A meta line is comma- or dot-separated peers; scrub each so
        # "Casablanca · Location" keeps the half that means something.
        entry.meta = _as_peers(
            ", ".join(
                part.strip()
                for part in _drop_placeholder(entry.meta).split(",")
                if part.strip() and not _is_placeholder(part)
            )
        )
        entry.bullets = [b for b in entry.bullets if not _is_placeholder(b)]
        entry.notes = [n for n in entry.notes if not _is_placeholder(n)]

        if len(entry.title) > MAX_TITLE_CHARS:
            entry.notes = [entry.title, *entry.notes]
            entry.title = ""
    return entries


def _lines_of(block: str) -> list[str]:
    """Split a flat field into lines, dropping template placeholders.

    Applies everywhere because the same reflex that fills an entry's empty
    column also produces a contact line reading "City" or a certification
    reading "N/A".
    """
    return [
        stripped
        for item in (block or "").splitlines()
        if (stripped := item.strip().lstrip("-*• ").strip())
        and not _is_placeholder(stripped)
    ]


def _split_lead(line: str) -> tuple[str, str]:
    """"Name - description" -> ("Name", "description")."""
    for separator in ("—", " - ", ": "):
        if separator in line:
            head, _, rest = line.partition(separator)
            return head.strip(), rest.strip()
    return line.strip(), ""


def _skill_groups(block: str) -> list[tuple[str, str]]:
    """"CATEGORY: a, b, c" -> a labelled group; a bare line joins the last."""
    groups: list[tuple[str, str]] = []
    for line in _lines_of(block):
        if ":" in line:
            label, _, members = line.partition(":")
            groups.append((label.strip(), members.strip()))
        elif groups:
            groups[-1] = (groups[-1][0], f"{groups[-1][1]}, {line}")
        else:
            groups.append(("", line))
    return groups


def normalise_name(name: str) -> str:
    """Undo a source CV's all-caps styling on the person's name.

    Designed CVs often *render* the name in caps while the text layer stores it
    that way too, so extraction yields "YASSINE SINIF". The modern template
    applies no case transform of its own — it sets the name in Playfair as
    given — so passing that straight through prints a shouting masthead that
    does not match the reference.

    Only fires when the name has no lowercase at all — that is, when the
    capitalisation carries no information and can only have come from styling.
    A name the visitor typed themselves is never touched.

    Limitation, accepted deliberately: "MCDONALD" becomes "Mcdonald", because
    recovering "McDonald" needs a name database and would still guess wrong for
    somebody actually called Mcdonald. Since the visitor confirms their name in
    the conversation and can correct it in one message, a rare wrong capital is
    a better trade than a masthead that shouts.
    """
    stripped = (name or "").strip()
    if not stripped or any(character.islower() for character in stripped):
        return stripped
    return stripped.title()


def safe_filename(full_name: str) -> str:
    safe = re.sub(r"[^\w\-]", "-", (full_name or "").lower()).strip("-") or "resume"
    return f"cv-{safe}.pdf"


def build_resume(
    *,
    full_name: str,
    contact: str = "",
    headline: str = "",
    profile: str = "",
    experience: str = "",
    internships: str = "",
    education: str = "",
    skills: str = "",
    languages: str = "",
    interests: str = "",
    projects: str = "",
    certifications: str = "",
    photo: str = "",
    style: str = "modern",
    language: str = "en",
) -> tuple[bytes, int]:
    """Render a resume. Returns (pdf_bytes, page_count).

    Field formats (these are also what the model is told in the tool schema):
      contact         one item per line - city, phone, email, github, website
      experience      "Role | Employer | Dates | Location", then "- " bullets
      education       "Qualification | School | Year", then detail lines
      skills          one group per line, "CATEGORY: item, item, item"
      languages       one per line, "English - B2"
      projects        one per line, "Project name - what it does and the tech"
      certifications  one per line, "Name - issuer, year"
    """
    if style == "classic" or style in CLASSIC_ACCENTS:
        return _build_classic(
            full_name=full_name, contact=contact, headline=headline, profile=profile,
            experience=experience, internships=internships, education=education,
            skills=skills, languages=languages, interests=interests,
            projects=projects, certifications=certifications, photo=photo,
            language=language, accent=CLASSIC_ACCENTS.get(style),
        )
    if style == "bold":
        return _build_bold(
            full_name=full_name, contact=contact, headline=headline, profile=profile,
            experience=experience, internships=internships, education=education,
            skills=skills, languages=languages, interests=interests,
            projects=projects, certifications=certifications, photo=photo,
            language=language,
        )

    labels = LABELS.get(language, LABELS["en"])
    full_name = normalise_name(full_name)
    buffer = io.BytesIO()
    # `modern` itself passes neither colour, so it keeps the exact reference
    # palette rather than a re-derivation of it (tests/test_fidelity.py).
    sidebar, accent = MODERN_PALETTES.get(style, (None, None))
    cv = ModernCV(buffer, title=f"{full_name} - CV", sidebar=sidebar, accent=accent)

    if photo:
        cv.photo(photo)
    if contact.strip():
        cv.side_heading(labels["contact"])
        cv.side_lines(_lines_of(contact), link_tint=True)
    if skills.strip():
        cv.side_heading(labels["skills"])
        cv.side_groups(_skill_groups(skills))
    if languages.strip():
        cv.side_heading(labels["languages"])
        cv.side_lines([_as_pair(line) for line in _lines_of(languages)])
    # Education before interests: if the sidebar runs long, interests are what
    # should be pushed down, never a qualification.
    if education.strip():
        cv.side_heading(labels["education"])
        cv.side_education(_polish_entries(parse_entries(education)))
    if interests.strip():
        cv.side_heading(labels["interests"])
        cv.side_lines(_lines_of(interests))

    cv.masthead(full_name, headline)
    if profile.strip():
        cv.heading(labels["profile"])
        cv.paragraph(" ".join(profile.split()))
    if experience.strip():
        cv.heading(labels["experience"])
        cv.entries(_polish_entries(parse_entries(experience)))
    if internships.strip():
        cv.heading(labels["internships"])
        cv.entries(_polish_entries(parse_entries(internships)))
    if projects.strip():
        cv.heading(labels["projects"])
        cv.lead_in_list([_split_lead(p) for p in _lines_of(projects)])
    if certifications.strip():
        # Certifications read as plain lines: the issuer is not a headline the
        # way a project name is, so nothing here is set in bold.
        cv.heading(labels["certifications"])
        cv.lead_in_list([(_as_pair(c), "") for c in _lines_of(certifications)])

    pages = cv.finish()
    return buffer.getvalue(), pages


def _build_bold(
    *, full_name, contact, headline, profile, experience, internships, education,
    skills, languages, interests, projects, certifications, photo, language,
) -> tuple[bytes, int]:
    """Single-column photo-masthead template — see `_cvbold.py`."""
    labels = LABELS.get(language, LABELS["en"])
    full_name = normalise_name(full_name)

    buffer = io.BytesIO()
    cv = BoldCV(buffer, title=f"{full_name} - CV")
    cv.header(full_name, headline, _lines_of(contact), photo_path=photo)

    if profile.strip():
        cv.heading(labels["profile"])
        cv.paragraph(" ".join(profile.split()))
    if experience.strip():
        cv.heading(labels["experience"])
        cv.entries(_polish_entries(parse_entries(experience)))
    if internships.strip():
        cv.heading(labels["internships"])
        cv.entries(_polish_entries(parse_entries(internships)))
    if education.strip():
        cv.heading(labels["education"])
        cv.entries(_polish_entries(parse_entries(education)))
    if projects.strip():
        cv.heading(labels["projects"])
        cv.lead_in_list([_split_lead(p) for p in _lines_of(projects)])
    if certifications.strip():
        cv.heading(labels["certifications"])
        cv.lead_in_list([(_as_pair(c), "") for c in _lines_of(certifications)])
    if interests.strip():
        cv.heading(labels["interests"])
        cv.bullets(_lines_of(interests))

    if skills.strip() or languages.strip():
        cv.two_up_footer(
            labels["skills"] if skills.strip() else "",
            _skill_groups(skills),
            labels["languages"] if languages.strip() else "",
            [_as_pair(line) for line in _lines_of(languages)],
        )

    pages = cv.finish()
    return buffer.getvalue(), pages


def _build_classic(
    *, full_name, contact, headline, profile, experience, internships, education,
    skills, languages, interests, projects, certifications, photo, language,
    accent: str | None = None,
) -> tuple[bytes, int]:
    """The serif/photo-banner template, and its colour variants.

    `accent` is None for plain `classic` (taupe, CVRenderer's own default) and
    a hex string for a `classic-*` variant — same layout, same everything
    else, only the banner/badges/bars colour changes.
    """
    # English fallback like the other two templates. This used to default to
    # French here alone, so an unrecognised language code printed French
    # headings on classic and English ones on modern from the same draft.
    labels = LABELS.get(language, LABELS["en"])
    full_name = normalise_name(full_name)

    contact_lines: list[tuple[str, str]] = []
    for raw in (contact or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if "|" in line:
            kind, _, text = line.partition("|")
            kind, text = kind.strip().lower(), text.strip()
        else:
            kind, text = "", line
        contact_lines.append((kind or _guess_icon(text), text))

    buffer = io.BytesIO()
    cv = CVRenderer(buffer, title=f"{full_name} - CV", accent=accent)
    cv.header(full_name, headline, contact_lines, photo)

    if skills.strip():
        cv.side_heading(labels["skills"])
        cv.side_items(_lines_of(skills))
    if languages.strip():
        cv.side_heading(labels["languages"])
        cv.side_languages(parse_languages(languages))
    if interests.strip():
        cv.side_heading(labels["interests"])
        cv.side_marked(_lines_of(interests))

    if profile.strip():
        cv.main_heading(labels["profile"])
        cv.main_paragraph(" ".join(profile.split()), italic=True)
    if education.strip():
        cv.main_heading(labels["education"])
        cv.main_entries(parse_entries(education))
    if experience.strip():
        cv.main_heading(labels["experience"])
        cv.main_entries(parse_entries(experience))
    if internships.strip():
        cv.main_heading(labels["internships"])
        cv.main_entries(parse_entries(internships))
    if projects.strip():
        cv.main_heading(labels["projects"])
        cv.main_entries([Entry(bullets=_lines_of(projects))])
    if certifications.strip():
        cv.main_heading(labels["certifications"])
        cv.main_entries([Entry(bullets=_lines_of(certifications))])

    pages = cv.finish()
    return buffer.getvalue(), pages
