"""Recover a PDF's *reading* order, not its drawing order.

THE PROBLEM
-----------
`pypdf`'s `extract_text()` emits text in the order the PDF happens to draw it,
which for a single-column document is the reading order and for a two-column
one is not. A real upload (a sidebar-layout CV template) came out with every
section *label* — "Contact", "Language", "Skills", "Experience", "About Me" —
emitted consecutively before any section *body*, so the section splitter in
`extract.py` produced four confidently-labelled sections whose contents
belonged to entirely different parts of the page. Downstream that is worse
than no structure at all: the model is handed something that looks parsed and
is wrong, which is exactly the condition under which it starts inventing.

THE APPROACH, AND WHY IT IS SAFE
--------------------------------
Reconstructing columns from glyph positions is genuinely hard, and a
half-right reconstructor that silently makes *currently working* files worse
would be a bad trade. So this module never asserts it is right: it produces a
candidate ordering, and `score_layout` scores that candidate against the naive
one on a property both can be measured by — how many recognised headings are
actually followed by a body. `extract.py` keeps whichever wins. A file this
module cannot improve falls back to exactly today's behaviour.

WHY POSITIONS ARE APPROXIMATE
-----------------------------
`extract_text(visitor_text=...)` hands back the text matrix and the current
transform, but does not compose the placement matrix of a nested Form XObject,
so a minority of chunks land at coordinates that are internally consistent but
wrong relative to the page. This is a known limitation of reading positions
through this API rather than a full renderer, and it is the main reason the
scoring gate above exists instead of trusting the output outright.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median

# A gutter has to be a real vertical channel, not the ragged right edge of a
# single column: wide relative to the text block, with substantial content and
# substantial vertical extent on *both* sides. Right-aligned dates (a very
# common single-column shape) fail the count and width tests, which is the
# specific false positive these thresholds exist to prevent.
MIN_GUTTER_FRACTION = 0.08
MIN_SIDE_CHUNK_SHARE = 0.20
MIN_SIDE_HEIGHT_SHARE = 0.30
MIN_CHUNKS_FOR_COLUMNS = 12


@dataclass
class Chunk:
    x: float
    y: float          # already normalised so that "smaller sorts earlier" == higher up
    text: str
    size: float
    space: float      # coordinate-space signature; see _drop_phantoms


def _collect(page) -> list[Chunk]:
    """Positioned text chunks for one page, or [] if positions are unavailable."""
    raw: list[tuple[float, float, str, float, bool, float]] = []

    def visitor(text, cm, tm, font_dict, font_size):  # noqa: ANN001 - pypdf callback
        if not text or not text.strip():
            return
        try:
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            # PDF user space has y increasing upward, but a page drawn through
            # a flipping transform (Canva and friends emit tm[3] = -1 under a
            # positive cm, or the reverse) inverts that. The sign of the
            # composed vertical scale says which way this page runs.
            flipped = (tm[3] * cm[3]) < 0
            scale = abs(cm[3] or 1)
            size = abs(float(font_size or 0)) * scale
        except (TypeError, IndexError, ValueError):
            return
        raw.append((float(x), float(y), text, size, flipped, round(scale, 2)))

    try:
        page.extract_text(visitor_text=visitor)
    except Exception:  # noqa: BLE001 — any parse failure just means "no positions"
        return []

    if not raw:
        return []

    # One page uses one convention; take the majority so a stray chunk cannot
    # invert the whole document.
    flips = sum(1 for item in raw if item[4])
    page_flipped = flips * 2 > len(raw)

    chunks = [
        Chunk(x=x, y=(y if page_flipped else -y), text=text, size=size, space=space)
        for x, y, text, size, _, space in raw
    ]
    return _drop_phantoms(chunks)


def _drop_phantoms(chunks: list[Chunk]) -> list[Chunk]:
    """Remove duplicate chunks left behind by an un-composed nested transform.

    `visitor_text` does not compose the placement matrix of a Form XObject, so
    text drawn inside one is reported in that object's own coordinate space:
    a second copy of the same string, at coordinates that cannot be compared
    with the rest of the page. Ordering a page with both copies present prints
    everything twice.

    Dropping every minority-space chunk outright would risk losing text whose
    *only* copy lives there, so minority chunks are kept — but only one per
    distinct string, and only when the majority space does not already have
    it. A masthead drawn through three nested objects therefore survives once
    instead of three times, while genuine repetition inside the majority space
    (a CV that really does list one university twice) is left untouched,
    because both of those copies share the page's own coordinate space.
    """
    if not chunks:
        return chunks
    counts: dict[float, int] = {}
    for chunk in chunks:
        counts[chunk.space] = counts.get(chunk.space, 0) + 1
    majority = max(counts, key=lambda space: counts[space])

    kept = [c for c in chunks if c.space == majority]
    seen = {c.text.strip() for c in kept}
    for chunk in chunks:
        if chunk.space == majority:
            continue
        text = chunk.text.strip()
        if text in seen:
            continue
        seen.add(text)
        kept.append(chunk)
    return kept


def _find_gutter(chunks: list[Chunk]) -> float | None:
    """The x of a genuine column gutter, or None for a single column."""
    if len(chunks) < MIN_CHUNKS_FOR_COLUMNS:
        return None

    xs = sorted(chunk.x for chunk in chunks)
    span = xs[-1] - xs[0]
    if span <= 0:
        return None

    ys = [chunk.y for chunk in chunks]
    total_height = max(ys) - min(ys)
    if total_height <= 0:
        return None

    best: tuple[float, float] | None = None
    for index in range(len(xs) - 1):
        gap = xs[index + 1] - xs[index]
        if gap < span * MIN_GUTTER_FRACTION:
            continue
        split = (xs[index] + xs[index + 1]) / 2
        left = [c for c in chunks if c.x < split]
        right = [c for c in chunks if c.x >= split]
        if min(len(left), len(right)) < len(chunks) * MIN_SIDE_CHUNK_SHARE:
            continue
        left_height = max(c.y for c in left) - min(c.y for c in left)
        right_height = max(c.y for c in right) - min(c.y for c in right)
        if min(left_height, right_height) < total_height * MIN_SIDE_HEIGHT_SHARE:
            continue
        if best is None or gap > best[0]:
            best = (gap, split)

    return best[1] if best else None


def _to_lines(chunks: list[Chunk]) -> list[str]:
    """Group chunks sharing a baseline into lines, in reading order.

    Chunks on one line are joined with a double space rather than a single
    one, because that is the separator `extract._repair_letter_spacing` reads
    as a real word boundary — joining with a single space would make two
    adjacent fragments indistinguishable from per-glyph letter spacing.
    """
    if not chunks:
        return []

    sizes = [c.size for c in chunks if c.size > 0]
    tolerance = (median(sizes) * 0.6) if sizes else 3.0

    ordered = sorted(chunks, key=lambda c: (c.y, c.x))
    lines: list[list[Chunk]] = []
    current: list[Chunk] = []
    baseline: float | None = None

    for chunk in ordered:
        if baseline is None or abs(chunk.y - baseline) <= tolerance:
            if baseline is None:
                baseline = chunk.y
            current.append(chunk)
        else:
            lines.append(current)
            current = [chunk]
            baseline = chunk.y
    if current:
        lines.append(current)

    out: list[str] = []
    for line in lines:
        text = "  ".join(c.text.strip() for c in sorted(line, key=lambda c: c.x) if c.text.strip())
        if text.strip():
            out.append(text)
    return out


def text_in_reading_order(data: bytes) -> str:
    """Best-effort reading-order text for a PDF, or "" if positions are unusable.

    Never raises: the caller treats "" as "no candidate", and falls back to
    whatever `extract_text()` already gave it.
    """
    try:
        from pypdf import PdfReader
        import io

        reader = PdfReader(io.BytesIO(data))
    except Exception:  # noqa: BLE001
        return ""

    out: list[str] = []
    for page in reader.pages:
        try:
            chunks = _collect(page)
        except Exception:  # noqa: BLE001
            continue
        if not chunks:
            continue
        gutter = _find_gutter(chunks)
        if gutter is None:
            out.extend(_to_lines(chunks))
        else:
            # Whole left column, then whole right column — the way a person
            # reads a sidebar CV, and the order the section splitter needs.
            out.extend(_to_lines([c for c in chunks if c.x < gutter]))
            out.extend(_to_lines([c for c in chunks if c.x >= gutter]))
    return "\n".join(out)


def score_layout(lines: list[str], is_heading) -> int:
    """How much this ordering *reads* like a CV: headings that own a body.

    A heading followed immediately by another heading contributes nothing —
    that is the signature of drawing-order scrambling, where every label is
    emitted before any content. A heading followed by real lines scores. This
    is deliberately a comparison metric between two orderings of the *same*
    text, not an absolute quality judgement.
    """
    score = 0
    index = 0
    while index < len(lines):
        if is_heading(lines[index]):
            body = 0
            cursor = index + 1
            while cursor < len(lines) and not is_heading(lines[cursor]):
                if lines[cursor].strip():
                    body += 1
                cursor += 1
            if body >= 2:
                score += 1
            index = cursor
        else:
            index += 1
    return score
