"""Pull text out of an uploaded CV.

Why this is a tool and not just "paste the PDF into the prompt": a two-page CV
is 1.5-3k tokens of raw dump, most of it layout noise — repeated headers, page
numbers, stray glyphs from a two-column layout. Sectioning it here and capping
each section means the model sees a fraction of that, which is the whole reason
a small model can do this job.

Extraction is heuristic and says so. It never claims a field is right; it hands
the model labelled candidates and the model confirms them with the user.
"""
from __future__ import annotations

import io
import re

from .photo import extract_page_image, extract_portrait, extract_portrait_from_docx
from .quality import Assessment, Grade, assess

# Enough to carry a section's substance, short enough that a padded CV cannot
# blow the context window. Measured against real two-page CVs.
SECTION_CAP = 1200
TOTAL_CAP = 6000

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Anchored on '+' or a leading 0 rather than matching loose digit groups.
# Two reasons. A pattern of fixed-width groups drops the country code on the
# very common '+212 6 23 84 25 35' shape, because the '6' is a single digit —
# and a CV that loses its country code is worse than one with no phone at all.
# Anchoring also keeps '2022-2027' out: a date range starts with neither.
PHONE_RE = re.compile(r"\+\d[\d\s.\-()]{6,20}\d|\b0\d[\d\s.\-()]{6,18}\d")
URL_RE = re.compile(r"\b(?:https?://|www\.)\S+|\b(?:github|linkedin)\.com/\S+", re.I)

# Heading vocabulary, EN + FR — the two languages the templates support.
SECTION_PATTERNS: dict[str, tuple[str, ...]] = {
    # Without this the whole contact block of any CV that labels it — which is
    # most designed ones — was dropped, taking the city and any link that is
    # not an email, phone or URL with it.
    "contact": ("contact", "contacts", "coordonnées", "details", "info"),
    "profile": ("profile", "summary", "about", "objective", "profil", "résumé", "à propos"),
    "experience": ("experience", "employment", "work history", "professional", "expérience", "parcours"),
    "internships": ("internship", "stage", "stages"),
    "education": ("education", "academic", "qualification", "formation", "études", "diplôme"),
    "skills": ("skills", "competencies", "technical", "technologies", "compétences", "outils"),
    "languages": ("languages", "langues"),
    "certifications": ("certification", "certificate", "licences", "certificats"),
    "projects": ("projects", "portfolio", "projets", "réalisations"),
    "interests": ("interests", "hobbies", "centres d'intérêt", "loisirs"),
}


class ExtractionError(Exception):
    """Raised when the file cannot yield text at all."""


def _text_from_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise ExtractionError("PDF support is not installed on the server.") from exc

    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        # The exception name means nothing to whoever uploaded the file, so the
        # message says what to do instead. The type is kept for the log only.
        raise ExtractionError(
            "That PDF appears to be damaged or password-protected, so it could "
            "not be opened. Try re-saving or re-exporting it, or type your "
            "details in the chat and I'll build the CV from those."
        ) from exc


def _text_from_docx(data: bytes) -> str:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise ExtractionError("DOCX support is not installed on the server.") from exc

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(f"Could not read that DOCX ({type(exc).__name__}).") from exc

    parts = [p.text for p in document.paragraphs]
    # Many CVs lay everything out in a table; ignoring tables loses the whole CV.
    for table in document.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


def _looks_letter_spaced(chunk: str) -> bool:
    """True when a chunk reads like "R I C H A R D" — a real word or phrase
    with a space forced between every letter, rather than actual short words.

    Seen on real uploads exported from Canva-style design tools: certain text
    runs in the PDF (a tracked headline, a whole paragraph, a section title —
    inconsistently, depending on the run's embedded font) come out of pypdf's
    extractor with one space per glyph. Left alone, this defeats both the
    section-heading matcher ("P R O F I L E S U M M A R Y" contains no
    contiguous "profile") and the name heuristic (a 14-token "word" fails the
    2-5-word name check, so a later ordinary line — an address, in one real
    case — gets picked as the name instead).

    Guarded to a high single-character ratio over at least 3 tokens so this
    cannot misfire on genuinely short real words ("AI ML NLP dev").
    """
    tokens = chunk.split(" ")
    if len(tokens) < 3:
        return False
    single_char = sum(1 for token in tokens if len(token) == 1)
    return single_char / len(tokens) >= 0.7


def _repair_letter_spacing(raw_line: str) -> str:
    """Undo `_looks_letter_spaced` runs, using the one signal that still
    distinguishes "space between letters" from "space between words" at this
    point: pypdf's extractor renders the former as a single space and the
    latter as a double space (or more), because it derives spacing from the
    glyphs' actual on-page gaps. That distinction is lost the moment this
    line's whitespace gets collapsed to single spaces (`_clean`'s next step),
    so the repair has to happen first, on the still-doubled-space raw line.
    """
    chunks = re.split(r" {2,}", raw_line.strip())
    repaired = [
        chunk.replace(" ", "") if _looks_letter_spaced(chunk) else chunk
        for chunk in chunks
    ]
    return " ".join(repaired)


def _clean(text: str) -> str:
    """Drop layout noise that survives extraction."""
    lines: list[str] = []
    seen_header: dict[str, int] = {}
    for raw in text.splitlines():
        line = " ".join(_repair_letter_spacing(raw).split())
        if not line:
            continue
        # Bare page numbers, and "Page 1 of 3". Bounded to four digits: an
        # unbounded \d+ also matches a phone number written without separators
        # ("0623842535"), which would silently delete it from the CV.
        if re.fullmatch(r"(page\s*)?\d{1,4}(\s*(/|of|sur)\s*\d{1,4})?", line, re.I):
            continue
        # A short line repeated on every page is a running header or footer.
        if len(line) < 60:
            seen_header[line] = seen_header.get(line, 0) + 1
            if seen_header[line] > 2:
                continue
        lines.append(line)
    return "\n".join(lines)


def _looks_like_heading(line: str) -> str | None:
    """Return the canonical section name if this line reads as its heading.

    Two things this has to survive, both found on real CVs:

    * **Markdown.** People paste CVs written in Markdown, where the heading is
      "## Work Experience" or "**SKILLS**". The markers carry the meaning — they
      are what makes it a heading — so they are stripped, not matched against.
    * **Qualified headings.** The needle can sit anywhere in the phrase.
      "Work Experience" is probably the commonest heading in an English CV and
      it does not *begin* with "experience", so prefix matching missed it
      entirely and dropped the whole section.

    Matched on whole words, so "Experienced professional" is not a heading and
    "Skills" inside a sentence cannot open a section. Length still bounds it:
    a heading is a label, not a paragraph.
    """
    stripped = line.strip()
    # Markdown heading and emphasis markers, plus a trailing colon.
    stripped = re.sub(r"^\s*#{1,6}\s*", "", stripped)
    stripped = stripped.strip("*_ \t").strip().rstrip(":").strip("*_ \t").strip()
    if not stripped or len(stripped) > 40:
        return None
    # Digits mean a date or a bullet, not a section label.
    if any(character.isdigit() for character in stripped):
        return None

    lowered = stripped.lower()
    for name, needles in SECTION_PATTERNS.items():
        for needle in needles:
            if re.search(rf"(?<![\w']){re.escape(needle)}s?(?![\w'])", lowered):
                return name
    return None


def extract_cv(data: bytes, filename: str) -> dict:
    """Turn an uploaded CV into labelled, capped sections.

    Returns a dict with `sections` (only those found), `contact` candidates,
    and `notes` describing what the heuristics did — the model is told to treat
    all of it as unconfirmed and check with the user.
    """
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        raw = _text_from_pdf(data)
    elif name.endswith((".docx", ".doc")):
        raw = _text_from_docx(data)
    elif name.endswith((".txt", ".md")):
        raw = data.decode("utf-8", errors="replace")
    else:
        raise ExtractionError(
            "Unsupported file type. Upload a PDF, DOCX, TXT or MD file."
        )

    text = _clean(raw)
    if not text.strip():
        raise ExtractionError(
            "That file has no extractable text — it is probably a scan or an "
            "image-only PDF. Type the details instead and I'll build from those."
        )

    lines = text.splitlines()

    # --- contact candidates, gathered from the whole document ---------------
    emails = EMAIL_RE.findall(text)
    urls = URL_RE.findall(text)
    # Phone matching is noisy: dates and ID numbers match too. Require enough
    # digits to be a real number, and prefer a line that looks like contact.
    phones = [p.strip() for p in PHONE_RE.findall(text) if len(re.sub(r"\D", "", p)) >= 8]

    # The name is nearly always the first substantial line that is not contact.
    estimated_name = ""
    for line in lines[:6]:
        if EMAIL_RE.search(line) or URL_RE.search(line):
            continue
        if len(re.sub(r"\D", "", line)) >= 6:
            continue
        if 2 <= len(line.split()) <= 5 and len(line) <= 50:
            estimated_name = line
            break

    # --- split into sections by heading ------------------------------------
    sections: dict[str, list[str]] = {}
    current: str | None = None
    preamble: list[str] = []
    for line in lines:
        heading = _looks_like_heading(line)
        if heading:
            current = heading
            sections.setdefault(current, [])
            continue
        (sections[current] if current else preamble).append(line)

    trimmed = {
        key: "\n".join(value).strip()[:SECTION_CAP]
        for key, value in sections.items()
        if "\n".join(value).strip()
    }
    notes: list[str] = []
    if estimated_name:
        notes.append(f"Name is probably '{estimated_name}' (first line).")

    if not trimmed:
        # No heading matched, so every line ended up in `preamble` — the whole
        # CV. It goes through the fallback bucket, which has the larger cap;
        # treating it as a masthead would truncate the document to SECTION_CAP.
        notes.append(
            "No section headings were recognised, so the text is unsplit under "
            "'full_text'. Read it and map it to the CV fields yourself."
        )
        trimmed["full_text"] = text[:TOTAL_CAP]
    else:
        # Everything above the first heading. This was collected and then
        # dropped, which quietly lost the masthead — the name and, right under
        # it, the professional title ("MARKETING MANAGER", "AI & Data
        # Engineering"). That title has nowhere else to come from, so every
        # rebuilt CV came out with a bare name.
        masthead = "\n".join(preamble).strip()
        if masthead:
            # First, because it is the top of the page and reads that way.
            trimmed = {"header": masthead[:SECTION_CAP], **trimmed}
            notes.append(
                "'header' is the text above the first heading: it usually holds "
                "the name and the professional title that belongs in `headline`."
            )
        notes.append(f"Recognised sections: {', '.join(sorted(trimmed))}.")

    contact_bits: list[str] = []
    if emails:
        contact_bits.append(emails[0])
    if phones:
        contact_bits.append(phones[0].strip())
    for url in urls[:2]:
        contact_bits.append(url.rstrip(".,);"))

    result = {
        "estimated_name": estimated_name,
        "contact_candidates": contact_bits,
        "sections": trimmed,
        "notes": notes,
        "characters": len(text),
    }
    result["assessment"] = assess(result).as_dict()
    return result


def extract_everything(data: bytes, filename: str) -> dict:
    """Full first pass over an upload: text, quality grade, and the portrait.

    This is the deterministic tier of the cascade — no model is called here.
    The caller reads `assessment.grade` to decide whether that was enough
    (`good` / `partial`) or whether the file needs the vision fallback
    (`failed`). See `cv/quality.py` for why that split is worth making.

    A photo is a bonus, never a requirement: failing to find one is silent,
    and failing to *read* one must not fail the upload.
    """
    is_pdf = (filename or "").lower().endswith(".pdf")

    try:
        result = extract_cv(data, filename)
    except ExtractionError:
        if not is_pdf:
            raise
        # No text at all. Not fatal on its own — a scanned CV still has pixels,
        # and the vision tier can read them — so report it as a failed grade
        # rather than an error and let the caller decide.
        result = {
            "estimated_name": "",
            "contact_candidates": [],
            "sections": {},
            "notes": ["No text could be extracted from this PDF."],
            "characters": 0,
            "assessment": Assessment(
                Grade.FAILED,
                ["no extractable text at all — the file is an image or a scan"],
            ).as_dict(),
        }

    if is_pdf:
        result["photo"] = extract_portrait(data)
    elif (filename or "").lower().endswith(".docx"):
        result["photo"] = extract_portrait_from_docx(data)
    else:
        result["photo"] = None
    # Only fetched when the text tier failed: it is only ever used as vision
    # input, and decoding a full page raster costs real memory.
    needs_vision = (result.get("assessment") or {}).get("grade") == "failed"
    result["page_image"] = extract_page_image(data) if (is_pdf and needs_vision) else None
    return result
