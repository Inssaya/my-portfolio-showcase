"""The "bold" CV: single-column, photo masthead, coloured section rules.

A third template alongside `_cvmodern` (teal sidebar) and `_cvdesign`
(serif/taupe). Where those two split the page into a sidebar and a main
column, this one is a single flowing column — the shape widely seen in
mainstream CV-template sites: a circular portrait beside the name, a full-width
contact row under a rule, then sections whose heading is followed by a thin
rule running to the page edge, and a two-up skills/languages footer.

Unlike `_cvmodern.py` / `_cvdesign.py`, this is NOT measured off a printed
reference at fixed DPI — no such reference document exists for this style.
Geometry here is proportioned by eye against the supplied design sample to
read well on US Letter, using the same bundled Inter faces as the other two
templates so the CV builder never falls back to Helvetica.
"""
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as pdfcanvas

from . import _cvmodern
from ._cvmodern import _space, _tracked_width, _wrap

PAGE_W, PAGE_H = 612.0, 792.0

# ---- palette ---------------------------------------------------------------
PAGE_BG = colors.HexColor("#F1F1EF")      # light warm gray, not white
ACCENT = colors.HexColor("#1D4F91")       # name, section rules/headings, dates
TITLE_INK = colors.HexColor("#1D1D1B")
BODY_INK = colors.HexColor("#3C3C39")
META_INK = colors.HexColor("#6B6B67")
HEADLINE_INK = colors.HexColor("#575753")
RULE_COLOR = colors.HexColor("#B9C6DC")   # pale tint of ACCENT, for section rules

# ---- geometry ----------------------------------------------------------
MARGIN_X = 60.0
CONTENT_RIGHT = PAGE_W - MARGIN_X
CONTENT_W = CONTENT_RIGHT - MARGIN_X
BOTTOM_LIMIT = 748.0
PAGE_TOP = 56.0

PHOTO_R = 46.0
PHOTO_CX = MARGIN_X + PHOTO_R
PHOTO_CY_TOP = 100.0                      # top-down y of the photo centre

NAME_X_WITH_PHOTO = MARGIN_X + 2 * PHOTO_R + 26.0
NAME_TOP = 62.0

BULLET_INDENT = 12.0

# ---- type scale --------------------------------------------------------
NAME_SIZE = 22.0
HEADLINE_SIZE = 11.5
CONTACT_SIZE = 8.6
SEC_HEAD_SIZE = 9.5
SEC_HEAD_TRACK = 0.9
ENTRY_TITLE_SIZE = 10.2
BODY_SIZE = 9.0
META_SIZE = 8.4
GRID_LABEL_SIZE = 7.6
GRID_LABEL_TRACK = 1.1
GRID_ITEM_SIZE = 8.6

# ---- vertical rhythm -----------------------------------------------------
BODY_LEAD = 13.6
TIGHT_LEAD = 13.0
ITEM_GAP = 2.6
SEC_GAP = 22.0
SEC_DROP = 17.0
ENTRY_GAP = 15.5
TITLE_TO_META = 12.0
META_TO_BODY = 4.0


def _looks_like_link(text: str) -> bool:
    lowered = text.lower()
    return "@" in lowered or lowered.startswith(("http", "www.")) or lowered.endswith(
        (".com", ".app", ".dev", ".io", ".net", ".me")
    )


class BoldCV:
    """Single flowing column; `_room()` breaks to a new page when it runs out."""

    def __init__(self, buffer, title: str):
        _cvmodern._register_fonts()
        # Read the globals *after* registration rather than importing them by
        # name at module load — those names are reassigned in place inside
        # _register_fonts(), so a plain `from ._cvmodern import SANS` copied
        # at import time (likely before any CV has been built yet) would
        # freeze on the Helvetica fallback forever.
        self.sans = _cvmodern.SANS
        self.sans_b = _cvmodern.SANS_B
        self.sans_sb = _cvmodern.SANS_SB

        self.c = pdfcanvas.Canvas(buffer, pagesize=(PAGE_W, PAGE_H))
        self.c.setTitle(title)
        self.ops: list[tuple[int, object]] = []
        self.page = 0
        self.y = PAGE_TOP
        self.last = PAGE_TOP
        self.fresh = True

    # -- primitives ------------------------------------------------------
    def _yy(self, top_down: float) -> float:
        return PAGE_H - top_down

    def _furniture(self) -> None:
        self.c.setFillColor(PAGE_BG)
        self.c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    def _emit(self, page: int, draw) -> None:
        self.ops.append((page, draw))

    def _room(self, needed: float) -> None:
        if self.y + needed > BOTTOM_LIMIT:
            self.page += 1
            self.y = self.last = PAGE_TOP

    def _text(self, x: float, top_down: float, text: str, font: str, size: float,
               color, track: float = 0.0, right: float | None = None) -> float:
        width = _tracked_width(text, font, size, track)
        if right is not None:
            x = right - width

        def draw(c, _x=x, _y=self._yy(top_down)):
            c.saveState()
            c.setFillColor(color)
            obj = c.beginText(_x, _y)
            obj.setFont(font, size)
            obj.setCharSpace(track)
            obj.textOut(text)
            c.drawText(obj)
            c.restoreState()

        self._emit(self.page, draw)
        return x + width

    def _dot(self, x: float, top_down: float, radius: float) -> None:
        def draw(c, _y=self._yy(top_down)):
            c.saveState()
            c.setFillColor(ACCENT)
            c.circle(x, _y + 2.4, radius, stroke=0, fill=1)
            c.restoreState()

        self._emit(self.page, draw)

    def _rule(self, x0: float, x1: float, top_down: float, weight: float = 1.1,
               color=RULE_COLOR) -> None:
        def draw(c, _y=self._yy(top_down)):
            c.saveState()
            c.setStrokeColor(color)
            c.setLineWidth(weight)
            c.line(x0, _y, x1, _y)
            c.restoreState()

        self._emit(self.page, draw)

    # -- masthead ----------------------------------------------------------
    def _photo(self, path: str) -> None:
        from reportlab.lib.utils import ImageReader

        try:
            from PIL import Image

            image = Image.open(path).convert("RGB")
            side = min(image.size)
            left = (image.width - side) // 2
            top = max(0, int((image.height - side) * 0.30))
            image = image.crop((left, top, left + side, top + side))
            image.thumbnail((300, 300), Image.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, "JPEG", quality=82, optimize=True)
            encoded.seek(0)
            source = ImageReader(encoded)
        except Exception:  # noqa: BLE001 — a bad photo must not lose the CV
            return

        cy = self._yy(PHOTO_CY_TOP)

        def draw(c):
            c.saveState()
            clip = c.beginPath()
            clip.circle(PHOTO_CX, cy, PHOTO_R)
            c.clipPath(clip, stroke=0, fill=0)
            c.drawImage(source, PHOTO_CX - PHOTO_R, cy - PHOTO_R,
                        2 * PHOTO_R, 2 * PHOTO_R, mask="auto")
            c.restoreState()
            c.saveState()
            c.setStrokeColor(ACCENT)
            c.setLineWidth(2.4)
            c.circle(PHOTO_CX, cy, PHOTO_R + 1.6, stroke=1, fill=0)
            c.restoreState()

        self._emit(0, draw)

    def header(self, full_name: str, headline: str, contact_items: list[str],
                photo_path: str = "") -> None:
        has_photo = bool(photo_path)
        if has_photo:
            self._photo(photo_path)
        name_x = NAME_X_WITH_PHOTO if has_photo else MARGIN_X

        y = NAME_TOP
        self._text(name_x, y, full_name.upper(), self.sans_b, NAME_SIZE, ACCENT,
                   track=0.4)
        if headline:
            y += 18.0
            self._text(name_x, y, headline, self.sans, HEADLINE_SIZE, HEADLINE_INK)

        rule_y = max(y + 24.0, PHOTO_CY_TOP + PHOTO_R + 12.0 if has_photo else 0.0)
        self._rule(MARGIN_X, CONTENT_RIGHT, rule_y, weight=1.4, color=ACCENT)

        contact_y = rule_y + 20.0
        if contact_items:
            line = "     |     ".join(contact_items)
            for wrapped in _wrap(line, self.sans, CONTACT_SIZE, CONTENT_W):
                self._text(MARGIN_X, contact_y, wrapped, self.sans, CONTACT_SIZE,
                           META_INK)
                contact_y += TIGHT_LEAD

        self.y = self.last = contact_y + 6.0
        self.fresh = True

    # -- sections ------------------------------------------------------------
    def heading(self, text: str) -> None:
        self.y = self.last + (SEC_GAP if not self.fresh else 0.0)
        self._room(28)
        label = text.upper()
        end = self._text(MARGIN_X, self.y, label, self.sans_b, SEC_HEAD_SIZE,
                         ACCENT, track=SEC_HEAD_TRACK)
        self._rule(end + 10.0, CONTENT_RIGHT, self.y - 3.0)
        self.last = self.y
        self.y += SEC_DROP
        self.fresh = False

    def paragraph(self, text: str) -> None:
        for line in _wrap(text, self.sans, BODY_SIZE, CONTENT_W):
            self._room(18)
            self._text(MARGIN_X, self.y, line, self.sans, BODY_SIZE, BODY_INK)
            self.last = self.y
            self.y += BODY_LEAD

    def bullets(self, items: list[str]) -> None:
        """Plain bullet list under a heading (used for interests)."""
        self._bullets(items, SEC_DROP)
        self.fresh = False

    def _bullets(self, items: list[str], first_gap: float) -> None:
        for index, item in enumerate(items):
            wrapped = _wrap(item, self.sans, BODY_SIZE, CONTENT_W - BULLET_INDENT)
            self.y = self.last + (first_gap if index == 0 else TIGHT_LEAD + ITEM_GAP)
            self._room(len(wrapped) * TIGHT_LEAD + 4)
            self._dot(MARGIN_X + 3.0, self.y, 1.6)
            for line in wrapped:
                self._text(MARGIN_X + BULLET_INDENT, self.y, line, self.sans,
                           BODY_SIZE, BODY_INK)
                self.last = self.y
                self.y += TIGHT_LEAD

    def entries(self, items: list) -> None:
        for index, entry in enumerate(items):
            self.y = self.last + (SEC_DROP if index == 0 else ENTRY_GAP)
            self._room(46)

            head = entry.title
            if entry.org:
                head = f"{head}  |  {entry.org}" if head else entry.org
            date_width = _tracked_width(entry.dates, self.sans, META_SIZE, 0) if entry.dates else 0.0
            head_room = CONTENT_W - date_width - (12.0 if entry.dates else 0.0)
            head_lines = _wrap(head, self.sans_b, ENTRY_TITLE_SIZE, head_room) if head else []

            if head_lines:
                self._text(MARGIN_X, self.y, head_lines[0], self.sans_b,
                           ENTRY_TITLE_SIZE, TITLE_INK)
            if entry.dates:
                self._text(0, self.y, entry.dates, self.sans, META_SIZE, ACCENT,
                           right=CONTENT_RIGHT)
            self.last = self.y
            for extra in head_lines[1:]:
                self.y = self.last + TIGHT_LEAD
                self._text(MARGIN_X, self.y, extra, self.sans_b, ENTRY_TITLE_SIZE,
                           TITLE_INK)
                self.last = self.y

            if entry.meta:
                self.y = self.last + TITLE_TO_META
                self._text(MARGIN_X, self.y, entry.meta, self.sans, META_SIZE,
                           META_INK)
                self.last = self.y

            first = META_TO_BODY + TITLE_TO_META if not entry.meta else META_TO_BODY + 4.0
            for note in entry.notes:
                self.y = self.last + first
                for line in _wrap(note, self.sans, BODY_SIZE, CONTENT_W):
                    self._room(16)
                    self._text(MARGIN_X, self.y, line, self.sans, BODY_SIZE, BODY_INK)
                    self.last = self.y
                    self.y += TIGHT_LEAD
                first = TIGHT_LEAD
            if entry.bullets:
                self._bullets(entry.bullets, first)
        self.fresh = False

    def lead_in_list(self, items: list[tuple[str, str]]) -> None:
        for index, (lead, rest) in enumerate(items):
            self.y = self.last + (SEC_DROP if index == 0 else TIGHT_LEAD + ITEM_GAP)
            self._room(20)
            self._dot(MARGIN_X + 3.0, self.y, 1.6)
            if not rest:
                for line in _wrap(lead, self.sans, BODY_SIZE, CONTENT_W - BULLET_INDENT):
                    self._text(MARGIN_X + BULLET_INDENT, self.y, line, self.sans,
                               BODY_SIZE, BODY_INK)
                    self.last = self.y
                    self.y += TIGHT_LEAD
                continue

            end = self._text(MARGIN_X + BULLET_INDENT, self.y, lead, self.sans_b,
                             BODY_SIZE, TITLE_INK)
            tail = f"— {rest}"
            room = CONTENT_RIGHT - (end + _space(self.sans, BODY_SIZE))
            head_text = ""
            for word in tail.split():
                candidate = f"{head_text} {word}".strip()
                if pdfmetrics.stringWidth(candidate, self.sans, BODY_SIZE) <= room:
                    head_text = candidate
                else:
                    break
            if head_text:
                self._text(end + _space(self.sans, BODY_SIZE), self.y, head_text,
                           self.sans, BODY_SIZE, BODY_INK)
            self.last = self.y
            self.y += TIGHT_LEAD
            for extra in _wrap(tail[len(head_text):].strip(), self.sans, BODY_SIZE,
                               CONTENT_W - BULLET_INDENT):
                self._room(16)
                self._text(MARGIN_X + BULLET_INDENT, self.y, extra, self.sans,
                           BODY_SIZE, BODY_INK)
                self.last = self.y
                self.y += TIGHT_LEAD
        self.fresh = False

    # -- footer: skills (grouped list) + languages (2-up grid), side by side --
    def two_up_footer(self, skills_label: str, skill_groups: list[tuple[str, str]],
                        lang_label: str, lang_items: list[str]) -> None:
        """Skills and languages need different shapes: a skillset varies from
        four items to sixty across several categories, so it renders as
        wrapped `LABEL: comma, list` blocks — a flat bullet grid would either
        truncate a long category or repeat its label on every item. Languages
        are always short "Name — Level" pairs, so they suit the reference's
        flat two-column bullet grid directly."""
        if not skill_groups and not lang_items:
            return
        gap = 28.0
        half = (CONTENT_W - gap) / 2
        left_x = MARGIN_X
        right_x = MARGIN_X + half + gap

        self.y = self.last + SEC_GAP
        # Section-level break, not per-block: the two columns must land on the
        # same page, so this estimates the whole footer's height up front and
        # jumps to a fresh page if the space remaining here can't hold it.
        # Capped at one page's worth so a skillset that could never fit on a
        # single page still breaks once rather than requesting the impossible.
        page_capacity = BOTTOM_LIMIT - PAGE_TOP - 28.0
        needed = min(self._estimate_skill_height(skill_groups, half), page_capacity)
        self._room(28 + needed)
        top_y = self.y
        for label, x in ((skills_label, left_x), (lang_label, right_x)):
            if not label:
                continue
            end = self._text(x, top_y, label.upper(), self.sans_b, SEC_HEAD_SIZE,
                             ACCENT, track=SEC_HEAD_TRACK)
            self._rule(end + 10.0, x + half, top_y - 3.0)
        self.y = top_y + SEC_DROP
        self.last = self.y

        skills_bottom = self._skill_blocks(skill_groups, left_x, half, self.y)
        lang_bottom = self._grid(lang_items, right_x, half)
        self.y = self.last = max(skills_bottom, lang_bottom)
        self.fresh = False

    def _estimate_skill_height(self, groups: list[tuple[str, str]], width: float) -> float:
        y = 0.0
        for index, (label, members) in enumerate(groups):
            wrapped = _wrap(members, self.sans, GRID_ITEM_SIZE, width)
            if index:
                y += 8.0
            if label:
                y += 11.0
            y += len(wrapped) * TIGHT_LEAD
        return y

    def _skill_blocks(self, groups: list[tuple[str, str]], x: float, width: float,
                        start_y: float) -> float:
        y = start_y
        for index, (label, members) in enumerate(groups):
            wrapped = _wrap(members, self.sans, GRID_ITEM_SIZE, width)
            if index:
                y += 8.0
            if label:
                self._text(x, y, label.upper(), self.sans_b, GRID_LABEL_SIZE,
                           ACCENT, track=GRID_LABEL_TRACK)
                y += 11.0
            for line in wrapped:
                self._text(x, y, line, self.sans, GRID_ITEM_SIZE, BODY_INK)
                y += TIGHT_LEAD
        return y

    def _grid(self, items: list[str], x: float, width: float, cols: int = 2) -> float:
        """Bullet items filling `cols` sub-columns, top-to-bottom then across."""
        if not items:
            return self.y
        col_w = (width - 10.0 * (cols - 1)) / cols
        rows = -(-len(items) // cols)  # ceil
        y = self.y
        max_y = y
        for index, item in enumerate(items):
            col = index // rows
            row = index % rows
            cx = x + col * (col_w + 10.0)
            cy = y + row * TIGHT_LEAD
            self._dot(cx + 3.0, cy, 1.5)
            for line in _wrap(item, self.sans, GRID_ITEM_SIZE, col_w - BULLET_INDENT)[:1]:
                self._text(cx + BULLET_INDENT, cy, line, self.sans, GRID_ITEM_SIZE,
                           BODY_INK)
            max_y = max(max_y, cy)
        return max_y

    # -- output ----------------------------------------------------------
    def finish(self) -> int:
        pages = max([page for page, _ in self.ops], default=0) + 1
        for page in range(pages):
            self._furniture()
            for owner, draw in self.ops:
                if owner == page:
                    draw(self.c)
            self.c.showPage()
        self.c.save()
        return pages
