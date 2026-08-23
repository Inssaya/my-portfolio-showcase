"""Decide whether a deterministic extraction is good enough to trust.

WHY A GATE AT ALL
-----------------
Extraction has three outcomes, not two, and they want different handling:

  GOOD     headings found, contact found, plenty of text.
           The cheap path. Hand the model tidy labelled sections.

  PARTIAL  text came out, but the structure did not — a two-column layout
           interleaved, or a designer's CV with graphical headings.
           Still cheap: give the model the raw text and let it do the mapping
           it is already good at. No extra call.

  FAILED   almost no text. A scan, an image-only export, a picture of a CV.
           No amount of prompting recovers what is not there. This is the only
           case worth spending a vision call on.

Routing on measured signals rather than sending everything to a vision model is
the difference between paying for OCR on every upload and paying for it on the
few percent that need it. It is the same principle as the server-side draft:
spend tokens only where they buy something.

The thresholds below are deliberately conservative — misrouting a readable CV
to vision wastes money, while misrouting a scan to the text path produces a
confusing "I couldn't read that" for a file the visitor can plainly see.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

# Below this, no CV worth the name came out. A one-page CV is 1500+ characters;
# a scanned page typically yields a few stray ligatures or nothing at all.
MIN_USABLE_CHARS = 350

# Enough text but no recognised headings means the structure was lost, not the
# content — the model can still map it.
MIN_SECTIONS_FOR_GOOD = 2

# Extraction of a broken embedded font produces long runs of glyphs that are
# not words. If most "words" fail to look like words, the text is noise.
MIN_WORDLIKE_RATIO = 0.55

_WORDLIKE = re.compile(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-]*$")


class Grade(str, Enum):
    GOOD = "good"
    PARTIAL = "partial"
    FAILED = "failed"


@dataclass
class Assessment:
    grade: Grade
    reasons: list[str] = field(default_factory=list)
    characters: int = 0
    sections: int = 0
    wordlike_ratio: float = 0.0
    has_contact: bool = False

    @property
    def needs_vision(self) -> bool:
        """True when only an image-based read can recover this CV."""
        return self.grade is Grade.FAILED

    def as_dict(self) -> dict:
        return {
            "grade": self.grade.value,
            "reasons": self.reasons,
            "characters": self.characters,
            "sections": self.sections,
            "wordlike_ratio": round(self.wordlike_ratio, 2),
            "has_contact": self.has_contact,
        }


def _wordlike_ratio(text: str) -> float:
    """Share of tokens that look like real words.

    Catches the failure that raw character counts miss: a PDF whose font has a
    broken encoding extracts plenty of characters, all of them gibberish.
    """
    tokens = [t for t in re.split(r"\s+", text) if len(t) > 2][:600]
    if not tokens:
        return 0.0
    hits = sum(1 for token in tokens if _WORDLIKE.match(token.strip(".,;:()[]|·—–")))
    return hits / len(tokens)


def assess(extraction: dict) -> Assessment:
    """Grade a deterministic extraction. Pure function of its input."""
    sections = extraction.get("sections") or {}
    # Neither of these is evidence that the layout parsed: `full_text` is the
    # fallback bucket, and `header` is just the text above the first heading —
    # present even when no heading was recognised at all. Counting either would
    # let an unstructured CV grade GOOD and skip the "read this yourself"
    # warning the model needs.
    named = [key for key in sections if key not in ("full_text", "header")]
    body = "\n".join(sections.values())
    characters = extraction.get("characters") or len(body)
    has_contact = bool(extraction.get("contact_candidates"))
    ratio = _wordlike_ratio(body)

    reasons: list[str] = []

    # Anything we could recognise — a real heading, an email, a phone number —
    # proves the text layer came through. A CV can legitimately be short (a
    # student's first one often is), and rejecting it as "a scan" for that
    # reason would send a perfectly readable file down the vision path or, worse,
    # refuse it outright. Structure outranks length.
    has_structure = bool(named) or has_contact

    if characters < MIN_USABLE_CHARS and not has_structure:
        reasons.append(
            f"only {characters} characters and nothing recognisable — the file is "
            "almost certainly a scan or an image-only export"
        )
        return Assessment(Grade.FAILED, reasons, characters, len(named), ratio, has_contact)

    # The ratio is only meaningful over enough tokens to average out; on a
    # handful of words a couple of acronyms would look like gibberish.
    if characters >= MIN_USABLE_CHARS and ratio < MIN_WORDLIKE_RATIO:
        reasons.append(
            f"only {ratio:.0%} of tokens look like words — the embedded font "
            "extracts as gibberish"
        )
        return Assessment(Grade.FAILED, reasons, characters, len(named), ratio, has_contact)

    if len(named) >= MIN_SECTIONS_FOR_GOOD and has_contact:
        reasons.append(f"{len(named)} sections and contact details recognised")
        return Assessment(Grade.GOOD, reasons, characters, len(named), ratio, has_contact)

    if not named:
        reasons.append("no section headings recognised; text is readable but unstructured")
    else:
        reasons.append(f"only {len(named)} section(s) recognised")
    if not has_contact:
        reasons.append("no email or phone found")
    return Assessment(Grade.PARTIAL, reasons, characters, len(named), ratio, has_contact)
