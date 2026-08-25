"""Catching years the model invented rather than transcribed.

The system prompt forbids inventing facts (`app/agent.py`, "NEVER WRITE A FACT
THEY DID NOT GIVE YOU") and it still happens: told "final year at EMSI", a real
session produced "ESM · 2023" — a year nobody said. The placeholder scrubber in
`cv/builder.py` cannot catch this the way it catches "Company Name", because
2023 *looks* exactly like real data; there is no lexical tell.

What this checks instead: not whether text looks fabricated, but whether a
specific year traces back to something the visitor actually typed or uploaded.
A CV with a wrong date is worse than one with no date, because a recruiter can
check it in thirty seconds.

WHY THIS RUNS AT WRITE TIME, NOT AFTER THE TURN
------------------------------------------------
`POST /generate` (the Build button, `app/main.py`) renders straight from
`session.draft` and calls the model not at all — that is the whole point of it,
see HANDOFF.md. So verification has to happen at the only place content enters
the draft, which is `update_resume` in `tools.py`. Checking "after a turn"
would leave a window where the button renders unverified content.
"""
from __future__ import annotations

import re

YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")

# Separators worth cleaning up around a removed year, so "ESM · 2023" becomes
# "ESM" rather than "ESM ·" or "ESM  ".
_SEPARATORS = r"[\s,·|\-–—]"


def input_years(transcript: list[dict]) -> set[str]:
    """Every year mentioned in what the visitor actually said or uploaded.

    Covers user turns and the seeded upload/paste text (`role: "system"`,
    `kind: "upload"` — see `agent.seed_uploaded_cv`), but deliberately not the
    model's own prior replies: if the model invents a year in one turn, that
    reply must not become the "input" that justifies the same year later.
    """
    years: set[str] = set()
    for entry in transcript:
        role = entry.get("role")
        if role == "user" or (role == "system" and entry.get("kind") == "upload"):
            years |= set(YEAR_RE.findall(str(entry.get("content", ""))))
    return years


def strip_invented_years(content: str, allowed: set[str]) -> tuple[str, set[str]]:
    """Remove any year in `content` that is not in `allowed`.

    Returns the cleaned text and the years actually removed, so the caller can
    tell the model what happened — silently editing what it just wrote would
    only invite it to re-add the same guess next turn.
    """
    found = set(YEAR_RE.findall(content))
    invented = found - allowed
    if not invented:
        return content, set()

    cleaned = content
    for year in invented:
        cleaned = re.sub(rf"{_SEPARATORS}*\b{year}\b{_SEPARATORS}*", " ", cleaned)

    lines = []
    for line in cleaned.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        # A separator left dangling at the end of a line once its year is gone
        # ("Casablanca —" with nothing after it) reads as more broken than
        # having removed it too.
        line = re.sub(rf"{_SEPARATORS}+$", "", line).strip()
        lines.append(line)
    cleaned = "\n".join(lines)
    return cleaned, invented


# --------------------------------------------------------- template placeholders
# A different failure from an invented year, but the same class: content that
# never came from the visitor. When someone uploads a CV *template* they only
# half-filled, its own placeholder junk ("kenza@example.com", "University of
# Example", "123-456-7890") is extracted and — unless caught — saved verbatim.
# The model has also been seen to confabulate exactly these values when an
# upload extracted little real text and it was told to "save every section".
#
# builder.py's _PLACEHOLDERS catches single-word labels ("Company Name"); this
# catches the multi-token, structured placeholders that slip past it. Unlike a
# year, these DO have a lexical tell, so a pattern is enough — no need to trace
# them back to the transcript.

# RFC 2606 reserves example.com/.net/.org for documentation — never a real
# inbox — plus the literal "your email" local part templates lean on, plus
# reallygreatsite.com: Canva's own placeholder domain, shipped unchanged in
# its resume templates. Same failure as "kenza@example.com" above, a
# different design tool's default left in place by a real upload.
_PLACEHOLDER_EMAIL_RE = re.compile(
    r"\b(?:[\w.+-]+@(?:example\.(?:com|org|net)|reallygreatsite\.com)"
    r"|your[._]?e?mail@[\w.-]+)\b",
    re.IGNORECASE,
)

# Keyboard-walk and reserved-fictional phone numbers. 555-01xx is the range
# Hollywood/US docs use precisely because it can never be a real line.
_PLACEHOLDER_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s.-]?)?"
    r"(?:123[\s.-]?456[\s.-]?7890|\(?555\)?[\s.-]?01\d\d|1234567890|0{7,})"
)

# Whole-value template strings. A value equal to one of these (or a line made
# only of it) is dropped.
_PLACEHOLDER_TEXT_RE = re.compile(
    # Deliberately NOT "John/Jane Doe" — those read as placeholders but are
    # plausible real names, and blanking someone's actual name is far worse
    # than leaving a template one for them to correct. Only unambiguous markers.
    r"\b(?:"
    r"university of example|example university|your university|your school|"
    r"your name|your full name|full name here|name here|"
    r"your company|company name here|your address|your city|"
    # Canva's default resume-template address ("123 Anywhere St., Any City,
    # ST 12345") — the digits/state/zip vary by template, so only the two
    # invariant phrases are matched.
    r"123 anywhere st|any city|"
    r"lorem ipsum"
    r")\b",
    re.IGNORECASE,
)

# A line left holding only a label ("Email:", "Phone -") once its placeholder
# value is gone is noise, not data — drop it rather than print a bare label.
_LABEL_ONLY_RE = re.compile(r"^[A-Za-z /]{1,24}[:\-–—]$")

# A line (or line remnant) with nothing but leftover punctuation — e.g. a
# trailing ", ." after "123 Anywhere St., Any City" loses both phrases and
# leaves only the comma and full stop that used to separate them.
_PUNCT_ONLY_RE = re.compile(r"^[\s,.\-–—·|]*$")


def strip_placeholder_values(content: str) -> tuple[str, list[str]]:
    """Remove template/example values a real CV never contains.

    Returns the cleaned text and the snippets removed, so the caller can tell
    the model to ask the visitor for the real value instead of silently
    blanking it — the same reason strip_invented_years reports what it took.
    """
    removed: list[str] = []

    def _capture(pattern: re.Pattern[str], text: str) -> str:
        def repl(match: re.Match[str]) -> str:
            removed.append(match.group(0).strip())
            return ""
        return pattern.sub(repl, text)

    cleaned = content
    for pattern in (_PLACEHOLDER_EMAIL_RE, _PLACEHOLDER_PHONE_RE, _PLACEHOLDER_TEXT_RE):
        cleaned = _capture(pattern, cleaned)

    if not removed:
        return content, []

    lines = []
    for line in cleaned.split("\n"):
        line = re.sub(r"[ \t]+", " ", line)
        line = re.sub(rf"{_SEPARATORS}+$", "", line).strip()
        line = re.sub(rf"^{_SEPARATORS}+", "", line).strip()
        # Drop a line that is now empty, just a dangling "Label:", or nothing
        # but leftover punctuation from a removed value's neighbours — but
        # keep real headings ("EXPERIENCE", "Skills"), which carry neither.
        if line == "" or _LABEL_ONLY_RE.match(line) or _PUNCT_ONLY_RE.match(line):
            continue
        lines.append(line)
    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip("\n")
    return cleaned, removed
