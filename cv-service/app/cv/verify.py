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
