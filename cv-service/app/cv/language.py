"""Which language is this CV written in?

The renderer has always had French section headings — PROFIL, FORMATION,
COMPÉTENCES TECHNIQUES — and choosing them was left to the model, which
defaults to English when it does not decide. A French CV therefore came back
with PROFILE and TECHNICAL SKILLS printed over entirely French content.

Telling the model to set it was the first fix and it is not enough: the same
class of mistake as every other "the prompt says so" rule in this codebase.
The draft is right there and the answer is deterministic, so it is decided
here and the model's choice becomes an override rather than the source.

Scored on FUNCTION WORDS, not content. A Moroccan networks CV is full of
English technical terms — Active Directory, Burp Suite, Windows Server,
penetration testing — while its prose is French; counting those would call it
English every time. Articles and prepositions are what actually carry the
language of the writing, and they are almost never borrowed.
"""
from __future__ import annotations

import re

# Deliberately short, and deliberately words with no common English reading.
# "des", "les" and "une" cannot be mistaken for English; "on", "an" and "son"
# are French words that are also English ones, so they are left out entirely
# rather than risk a false vote.
_FRENCH = frozenset(
    """
    le la les un une des du de au aux et ou en dans sur pour par avec sans
    sous chez vers depuis pendant selon entre ce cette ces cet qui que quoi
    dont où est sont était étaient été être avoir avait ont eu fait faire
    plus très bien aussi ainsi donc mais car ne pas plusieurs leur leurs
    mes mon ma nos notre votre vos ses sa son
    """.split()
)

_ENGLISH = frozenset(
    """
    the and or of in on at to for with from by as is are was were be been
    being have has had do does did will would can could should this that
    these those which who whom whose while during through about into over
    my our your their its it they them he she his her
    """.split()
)

# Accented letters that English essentially never uses but French does
# constantly. A weak signal on its own — a single "café" proves nothing — so
# it only breaks a tie rather than deciding.
_FRENCH_ACCENTS = re.compile(r"[àâçèéêëîïôùûüœ]", re.I)

_WORD = re.compile(r"[a-zà-ÿœ]+", re.I)

SUPPORTED = ("en", "fr")


def detect_language(*blocks: str) -> str:
    """'fr' or 'en' for the CV these blocks belong to. Defaults to 'en'.

    English is the fallback for anything genuinely ambiguous — an empty draft,
    a CV that is nothing but technology names, or a language this renderer has
    no headings for. Printing English headings on an Arabic CV is wrong either
    way; printing French ones would be wrong *and* surprising.
    """
    text = "\n".join(block for block in blocks if block)
    if not text.strip():
        return "en"

    french = english = 0
    for word in _WORD.findall(text.lower()):
        if word in _FRENCH:
            french += 1
        elif word in _ENGLISH:
            english += 1

    if french != english:
        return "fr" if french > english else "en"

    # Tied — including the common "no function words at all" case, where a
    # draft is only names and technologies. Accents are the tiebreak.
    return "fr" if _FRENCH_ACCENTS.search(text) else "en"


def detect_draft_language(draft: dict[str, str]) -> str:
    """The language of a session draft.

    Reads only the fields that hold the visitor's own prose. `skills` is
    excluded on purpose — it is a list of proper nouns ("Burp Suite, OWASP
    ZAP, Wireshark") in every language — and so are `contact`, `full_name` and
    `headline`, which are short and often deliberately English even on a
    French CV ("Software Engineer").
    """
    return detect_language(
        draft.get("profile", ""),
        draft.get("experience", ""),
        draft.get("internships", ""),
        draft.get("education", ""),
        draft.get("projects", ""),
    )
