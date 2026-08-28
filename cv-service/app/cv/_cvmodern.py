"""The "modern" CV: teal sidebar, cream page, sans-serif, no boxes.

This is the house style — the one the assistant should produce by default. It
differs from the classic template in more than colour:

  * Education and skills live in the sidebar, so the main column is nothing but
    evidence: profile, experience, projects, certifications.
  * Skills are *grouped* under their own small headings rather than listed flat,
    which is what makes a long stack readable and what an ATS keyword scan
    actually rewards.
  * Each role carries a quiet meta line (location · team) under its title, so
    the title line itself stays "Role — Company ............ dates".
  * Nothing is boxed or ruled. Hierarchy comes from weight, colour and space.

Every measurement below was read off the reference PDF's own text spans.
"""
from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas

# US Letter: the reference is set on it, and a CV that prints on both sides of
# the Atlantic is better off on Letter than on A4.
PAGE_W, PAGE_H = 612.0, 792.0

# ---- palette ---------------------------------------------------------------
SIDEBAR_BG = colors.HexColor("#254553")   # deep slate teal
PAGE_BG = colors.HexColor("#FAF9F5")      # warm cream, not white
ACCENT = colors.HexColor("#0F5B52")       # headline, section heads, employers
NAME_INK = colors.HexColor("#12241F")
TITLE_INK = colors.HexColor("#1A1A18")
BODY_INK = colors.HexColor("#3A3835")
META_INK = colors.HexColor("#7A7772")
SIDE_HEAD = colors.HexColor("#C2C6CF")
SIDE_BODY = colors.HexColor("#E4E6EA")
SIDE_LINK = colors.HexColor("#CFE0DC")
SIDE_STRONG = colors.white
PHOTO_RING = colors.HexColor("#3D6070")   # hairline lifting the portrait off the band


def _toward_white(hex_colour: str, amount: float):
    """Blend a colour toward white — how the derived sidebar tints are made.

    The photo ring and the link tint are both lighter relatives of the sidebar
    band, not independent choices. Deriving them means a recolour picks two
    colours (band + accent) instead of four, and cannot end up with a ring
    that belongs to a different palette than the band it sits on.
    """
    base = colors.HexColor(hex_colour)
    return colors.Color(
        base.red + (1.0 - base.red) * amount,
        base.green + (1.0 - base.green) * amount,
        base.blue + (1.0 - base.blue) * amount,
    )

# ---- geometry --------------------------------------------------------------
SIDEBAR_W = 202.3
SIDE_X = 19.5
SIDE_RIGHT = 183.0
SIDE_W = SIDE_RIGHT - SIDE_X

MAIN_X = 229.5
MAIN_RIGHT = 582.5
MAIN_W = MAIN_RIGHT - MAIN_X
BULLET_X = 238.5                          # bullet text; the dot sits left of it

PHOTO_CX, PHOTO_CY, PHOTO_R = 101.1, 72.3, 44.2

NAME_Y = 54.8
SIDE_TOP = 144.0                          # first sidebar heading, clear of the photo
MAIN_TOP = 54.8
BOTTOM_LIMIT = 770.0
PAGE_MARGIN_TOP = 54.0   # where a continued column resumes

# ---- type scale ------------------------------------------------------------
NAME_SIZE = 24.0
HEADLINE_SIZE = 9.75
SEC_HEAD_SIZE = 8.25
SEC_HEAD_TRACK = 1.4
ENTRY_TITLE_SIZE = 10.12
BODY_SIZE = 9.0
META_SIZE = 7.88

SIDE_HEAD_SIZE = 7.88
SIDE_HEAD_TRACK = 1.66
SIDE_SUB_SIZE = 7.12
SIDE_SUB_TRACK = 0.9
SIDE_BODY_SIZE = 8.62
SIDE_CONTACT_SIZE = 8.25

# ---- vertical rhythm -------------------------------------------------------
BODY_LEAD = 14.3          # wrapped prose
TIGHT_LEAD = 13.5         # wrapped bullets and project lines
ITEM_GAP = 3.0            # extra between bullets
SEC_GAP = 27.0            # last baseline to the next section heading
SEC_DROP = 19.5           # section heading to its first line
TITLE_TO_META = 10.4
META_TO_BODY = 15.0
ENTRY_GAP = 21.7          # last line of an entry to the next entry's title

SIDE_HEAD_DROP = 20.2
SIDE_HEAD_GAP = 31.5
SIDE_SUB_GAP = 18.3       # last item to the next sub-heading
SIDE_FIRST_SUB = 17.2     # section heading straight to its first sub-heading
SIDE_SUB_DROP = 15.0
SIDE_PITCH = 15.8         # contact / language lines

SANS, SANS_B, SANS_SB, SERIF_B = (
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Bold",
    "Times-Bold",
)
_READY = False

# The faces the reference CV actually embeds — Inter for everything and
# Playfair Display for the name. They are bundled in `fonts/` beside this
# module rather than read from a system path, because the previous approach
# (/usr/share/fonts/truetype/liberation) silently fell back to Helvetica and
# Times-Bold anywhere that path did not exist — Windows, macOS, a slim
# container — and the name is the most conspicuous thing on the page to get
# wrong. Bundling makes the output identical on every host.
#
# Both families are SIL Open Font License; the licences ship alongside them.
_FONT_DIR = Path(__file__).resolve().parent / "fonts"

_FACES = (
    ("Inter", "Inter-Regular.ttf"),
    ("Inter-Bold", "Inter-Bold.ttf"),
    ("Inter-SemiBold", "Inter-SemiBold.ttf"),
    # Variable font: ReportLab renders its default instance, which for this
    # family is wght 400 — measured within 1.2% of the reference's
    # PlayfairDisplay-Regular, i.e. indistinguishable at 24pt.
    ("PlayfairDisplay", "PlayfairDisplayVF.ttf"),
)


def _register_fonts() -> None:
    """Register the bundled faces, falling back to Base-14 if any is missing.

    A missing font must degrade rather than crash: the layout still holds with
    Helvetica, it simply stops matching the reference.
    """
    global SANS, SANS_B, SANS_SB, SERIF_B, _READY
    if _READY:
        return
    _READY = True
    try:
        for name, filename in _FACES:
            pdfmetrics.registerFont(TTFont(name, str(_FONT_DIR / filename)))
    except Exception:  # noqa: BLE001 — Base-14 still lays out correctly
        return
    SANS, SANS_B, SANS_SB, SERIF_B = (
        "Inter",
        "Inter-Bold",
        "Inter-SemiBold",
        "PlayfairDisplay",
    )


def fonts_are_authentic() -> bool:
    """True when the bundled faces loaded, so output matches the reference.

    Exposed so a health check can report a silent fallback instead of leaving
    it to be noticed in a rendered CV.
    """
    _register_fonts()
    return SANS == "Inter"


def _wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words = str(text).split()
    if not words:
        return []
    lines, line = [], words[0]
    for word in words[1:]:
        candidate = f"{line} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def _space(font: str, size: float) -> float:
    return pdfmetrics.stringWidth(" ", font, size)


def _tracked_width(text: str, font: str, size: float, track: float) -> float:
    return pdfmetrics.stringWidth(text, font, size) + track * max(0, len(text) - 1)


def _looks_like_link(text: str) -> bool:
    """Contact lines that are addresses or URLs are tinted; a city is not."""
    lowered = text.lower()
    return "@" in lowered or lowered.startswith(("http", "www.")) or (
        "." in lowered and "/" in lowered
    ) or lowered.endswith((".com", ".app", ".dev", ".io", ".net", ".me"))


class ModernCV:
    """Draws into a deferred op list rather than straight onto the canvas.

    The two columns have to paginate *independently*: a long skills sidebar must
    not push the profile onto page two, and a three-page work history must not
    drag the sidebar with it. A canvas cannot return to a page it has already
    shown, so each column records what it wants drawn against its own page
    number and everything is replayed in page order at the end.
    """

    def __init__(self, buffer, title: str, sidebar: str | None = None,
                 accent: str | None = None):
        _register_fonts()
        self.c = pdfcanvas.Canvas(buffer, pagesize=(PAGE_W, PAGE_H))
        self.c.setTitle(title)
        self.ops: list[tuple[int, object]] = []

        # Two colours carry this template: the sidebar band and the accent used
        # for the headline, section heads, employers and bullet dots. The ring
        # around the portrait and the link tint are lighter relatives of the
        # band, derived rather than passed, so a variant cannot half-recolour.
        #
        # Passing neither reproduces the reference palette *exactly* — the
        # measured hexes, not a re-derivation of them — because `modern` is the
        # house style and matches a printed reference (tests/test_fidelity.py).
        # A recolour must not be able to move it by a shade.
        self.sidebar_bg = colors.HexColor(sidebar) if sidebar else SIDEBAR_BG
        self.accent = colors.HexColor(accent) if accent else ACCENT
        self.photo_ring = _toward_white(sidebar, 0.14) if sidebar else PHOTO_RING
        self.side_link = _toward_white(sidebar, 0.80) if sidebar else SIDE_LINK

        self.side_page = 0
        self.side_y = SIDE_TOP
        self.side_last = SIDE_TOP
        self.side_fresh = True

        self.main_page = 0
        self.main_y = MAIN_TOP
        self.main_last = MAIN_TOP
        self.main_fresh = True

    # -- primitives ----------------------------------------------------------
    def _y(self, top_down: float) -> float:
        return PAGE_H - top_down

    def _furniture(self) -> None:
        self.c.setFillColor(PAGE_BG)
        self.c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        self.c.setFillColor(self.sidebar_bg)
        self.c.rect(0, 0, SIDEBAR_W, PAGE_H, stroke=0, fill=1)

    def _emit(self, page: int, draw) -> None:
        self.ops.append((page, draw))

    def _text(self, page: int, x: float, top_down: float, text: str, font: str,
              size: float, color, track: float = 0.0,
              right: float | None = None) -> float:
        """Queue one run and return the x it ends at, so runs can be chained."""
        width = _tracked_width(text, font, size, track)
        if right is not None:
            x = right - width

        def draw(c, _x=x, _y=self._y(top_down)):
            c.saveState()
            c.setFillColor(color)
            obj = c.beginText(_x, _y)
            obj.setFont(font, size)
            obj.setCharSpace(track)
            obj.textOut(text)
            c.drawText(obj)
            c.restoreState()

        self._emit(page, draw)
        return x + width

    def _dot(self, page: int, x: float, top_down: float, radius: float) -> None:
        def draw(c, _y=self._y(top_down), _accent=self.accent):
            c.saveState()
            c.setFillColor(_accent)
            c.circle(x, _y + 2.6, radius, stroke=0, fill=1)
            c.restoreState()

        self._emit(page, draw)

    # -- sidebar -------------------------------------------------------------
    def photo(self, path: str) -> None:
        from reportlab.lib.utils import ImageReader

        try:
            from PIL import Image

            image = Image.open(path).convert("RGB")
            side = min(image.size)
            left = (image.width - side) // 2
            top = max(0, int((image.height - side) * 0.30))
            image = image.crop((left, top, left + side, top + side))
            # Re-encode as JPEG rather than handing ReportLab raw pixels: the
            # portrait is drawn at ~88pt, so anything past ~300px is invisible,
            # and an uncompressed bitmap otherwise makes up most of the file.
            image.thumbnail((300, 300), Image.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, "JPEG", quality=82, optimize=True)
            encoded.seek(0)
            source = ImageReader(encoded)
        except Exception:  # noqa: BLE001 — a bad photo must not lose the CV
            return

        cy = self._y(PHOTO_CY)

        def draw(c, _ring=self.photo_ring):
            c.saveState()
            clip = c.beginPath()
            clip.circle(PHOTO_CX, cy, PHOTO_R)
            c.clipPath(clip, stroke=0, fill=0)
            c.drawImage(source, PHOTO_CX - PHOTO_R, cy - PHOTO_R,
                        2 * PHOTO_R, 2 * PHOTO_R, mask="auto")
            c.restoreState()
            # A hairline ring lifts the portrait off the sidebar without framing it.
            c.saveState()
            c.setStrokeColor(_ring)
            c.setLineWidth(1.6)
            c.circle(PHOTO_CX, cy, PHOTO_R + 0.8, stroke=1, fill=0)
            c.restoreState()

        self._emit(0, draw)

    def _side_room(self, needed: float) -> None:
        if self.side_y + needed > BOTTOM_LIMIT:
            self.side_page += 1
            self.side_y = self.side_last = PAGE_MARGIN_TOP

    def side_heading(self, text: str) -> None:
        self._side_room(46)
        if not self.side_fresh:
            self.side_y = self.side_last + SIDE_HEAD_GAP
            self._side_room(26)
        self.side_fresh = False
        self._text(self.side_page, SIDE_X, self.side_y, text.upper(), SANS_B,
                   SIDE_HEAD_SIZE, SIDE_HEAD, track=SIDE_HEAD_TRACK)
        self.side_last = self.side_y
        self.side_y += SIDE_HEAD_DROP

    def side_lines(self, lines: list[str], link_tint: bool = False) -> None:
        """One entry per line, on the wide sidebar pitch (contact, languages)."""
        for item in lines:
            colour = self.side_link if (link_tint and _looks_like_link(item)) else SIDE_BODY
            wrapped = _wrap(item, SANS, SIDE_CONTACT_SIZE, SIDE_W)
            self._side_room(len(wrapped) * TIGHT_LEAD + 6)
            for index, line in enumerate(wrapped):
                self._text(self.side_page, SIDE_X, self.side_y, line, SANS,
                           SIDE_CONTACT_SIZE, colour)
                self.side_last = self.side_y
                self.side_y += TIGHT_LEAD if index < len(wrapped) - 1 else SIDE_PITCH

    def side_groups(self, groups: list[tuple[str, str]]) -> None:
        """Skills as `LABEL` plus its comma-separated members underneath."""
        for index, (label, members) in enumerate(groups):
            wrapped = _wrap(members, SANS, SIDE_BODY_SIZE, SIDE_W)
            self._side_room(len(wrapped) * TIGHT_LEAD + (SIDE_SUB_DROP if label else 0) + 6)
            # The first group sits closer to its section heading than a later
            # group sits to the group above it.
            self.side_y = self.side_last + (SIDE_SUB_GAP if index else SIDE_FIRST_SUB)
            if label:
                self._text(self.side_page, SIDE_X, self.side_y, label.upper(), SANS_B,
                           SIDE_SUB_SIZE, SIDE_HEAD, track=SIDE_SUB_TRACK)
                self.side_last = self.side_y
                self.side_y += SIDE_SUB_DROP
            for line in wrapped:
                self._text(self.side_page, SIDE_X, self.side_y, line, SANS,
                           SIDE_BODY_SIZE, SIDE_BODY)
                self.side_last = self.side_y
                self.side_y += TIGHT_LEAD

    def side_education(self, entries: list) -> None:
        for index, entry in enumerate(entries):
            title_lines = _wrap(entry.title, SANS_B, SIDE_BODY_SIZE, SIDE_W)
            self._side_room(len(title_lines) * 12.0 + 24)
            if index:
                self.side_y = self.side_last + SIDE_SUB_GAP
            for line in title_lines:
                self._text(self.side_page, SIDE_X, self.side_y, line, SANS_B,
                           SIDE_BODY_SIZE, SIDE_STRONG)
                self.side_last = self.side_y
                self.side_y += 12.0
            detail = " \u00b7 ".join(part for part in (entry.org, entry.dates) if part)
            for text in ([detail] if detail else []) + entry.notes:
                for line in _wrap(text, SANS, META_SIZE, SIDE_W):
                    self._text(self.side_page, SIDE_X, self.side_y, line, SANS,
                               META_SIZE, SIDE_HEAD)
                    self.side_last = self.side_y
                    self.side_y += 9.8

    # -- main column ---------------------------------------------------------
    def _main_room(self, needed: float) -> None:
        if self.main_y + needed > BOTTOM_LIMIT:
            self.main_page += 1
            self.main_y = self.main_last = PAGE_MARGIN_TOP

    def masthead(self, full_name: str, headline: str) -> None:
        self.main_y = NAME_Y
        self._text(0, MAIN_X, self.main_y, full_name, SERIF_B, NAME_SIZE, NAME_INK)
        self.main_last = self.main_y
        if headline:
            self.main_y += 20.2
            self._text(0, MAIN_X, self.main_y, headline, SANS_B, HEADLINE_SIZE, self.accent)
            self.main_last = self.main_y

    def heading(self, text: str) -> None:
        self.main_y = self.main_last + SEC_GAP
        self._main_room(30)
        self._text(self.main_page, MAIN_X, self.main_y, text.upper(), SANS_B,
                   SEC_HEAD_SIZE, self.accent, track=SEC_HEAD_TRACK)
        self.main_last = self.main_y
        self.main_y += SEC_DROP
        self.main_fresh = True

    def paragraph(self, text: str) -> None:
        for line in _wrap(text, SANS, BODY_SIZE, MAIN_W):
            self._main_room(18)
            self._text(self.main_page, MAIN_X, self.main_y, line, SANS, BODY_SIZE, BODY_INK)
            self.main_last = self.main_y
            self.main_y += BODY_LEAD
        self.main_fresh = False

    def _bullet_block(self, items: list[str], first_gap: float) -> None:
        for index, item in enumerate(items):
            wrapped = _wrap(item, SANS, BODY_SIZE, MAIN_RIGHT - BULLET_X)
            self.main_y = self.main_last + (first_gap if index == 0
                                            else TIGHT_LEAD + ITEM_GAP)
            self._main_room(len(wrapped) * TIGHT_LEAD + 4)
            self._dot(self.main_page, BULLET_X - 7.0, self.main_y, 1.7)
            for line in wrapped:
                self._text(self.main_page, BULLET_X, self.main_y, line, SANS,
                           BODY_SIZE, BODY_INK)
                self.main_last = self.main_y
                self.main_y += TIGHT_LEAD

    def entries(self, items: list) -> None:
        for index, entry in enumerate(items):
            self.main_y = self.main_last + (SEC_DROP if index == 0 else ENTRY_GAP)
            # Keep a role's title with at least its first line of evidence.
            self._main_room(48)
            end = MAIN_X
            if entry.title:
                end = self._text(self.main_page, MAIN_X, self.main_y, entry.title,
                                 SANS_B, ENTRY_TITLE_SIZE, TITLE_INK)

            # The dates own the right edge. If the employer will not fit in the
            # gap that leaves, it drops to the meta line rather than running
            # underneath the dates — a long role title must not cost legibility.
            date_width = (_tracked_width(entry.dates, SANS, META_SIZE, 0)
                          if entry.dates else 0.0)
            # The employer sits on the title line in the same weight and size as
            # the title, only in the accent colour \u2014 the reference sets the whole
            # run in bold (see the \role macro in cv/yassine-sinif-cv.tex).
            # Rendering it in regular body size made it read as a caption instead
            # of as part of the heading.
            room = (MAIN_RIGHT - date_width - 10.0) - (end + _space(SANS_B, ENTRY_TITLE_SIZE))
            org_inline = bool(entry.org) and pdfmetrics.stringWidth(
                f"\u2014 {entry.org}", SANS_B, ENTRY_TITLE_SIZE) <= room

            if org_inline:
                self._text(self.main_page, end + _space(SANS_B, ENTRY_TITLE_SIZE), self.main_y,
                           f"\u2014 {entry.org}", SANS_B, ENTRY_TITLE_SIZE, self.accent)
            if entry.dates:
                self._text(self.main_page, 0, self.main_y, entry.dates, SANS,
                           META_SIZE, META_INK, right=MAIN_RIGHT)
            self.main_last = self.main_y

            meta = entry.meta
            if entry.org and not org_inline:
                meta = f"{entry.org} \u00b7 {meta}" if meta else entry.org
            if meta:
                self.main_y = self.main_last + TITLE_TO_META
                self._text(self.main_page, MAIN_X, self.main_y, meta, SANS,
                           META_SIZE, META_INK)
                self.main_last = self.main_y

            first = META_TO_BODY if meta else TITLE_TO_META + 4.6
            for note in entry.notes:
                self.main_y = self.main_last + first
                for line in _wrap(note, SANS, BODY_SIZE, MAIN_W):
                    self._main_room(16)
                    self._text(self.main_page, MAIN_X, self.main_y, line, SANS,
                               BODY_SIZE, BODY_INK)
                    self.main_last = self.main_y
                    self.main_y += TIGHT_LEAD
                first = TIGHT_LEAD
            if entry.bullets:
                self._bullet_block(entry.bullets, first)
        self.main_fresh = False

    def lead_in_list(self, items: list[tuple[str, str]]) -> None:
        """`Name \u2014 description`: the name is what the eye scans, so it is set
        in the title ink and the description flows on inline from it."""
        for index, (lead, rest) in enumerate(items):
            probe = _wrap(f"{lead} \u2014 {rest}", SANS, BODY_SIZE, MAIN_RIGHT - BULLET_X)
            self.main_y = self.main_last + (SEC_DROP if index == 0 and self.main_fresh
                                            else TIGHT_LEAD + ITEM_GAP)
            self._main_room(len(probe) * TIGHT_LEAD + 4)
            self._dot(self.main_page, BULLET_X - 7.0, self.main_y, 1.7)

            if not rest:
                for line in _wrap(lead, SANS, BODY_SIZE, MAIN_RIGHT - BULLET_X):
                    self._text(self.main_page, BULLET_X, self.main_y, line, SANS,
                               BODY_SIZE, BODY_INK)
                    self.main_last = self.main_y
                    self.main_y += TIGHT_LEAD
                continue

            end = self._text(self.main_page, BULLET_X, self.main_y, lead, SANS_B,
                             BODY_SIZE, TITLE_INK)
            tail = f"\u2014 {rest}"
            room = MAIN_RIGHT - (end + _space(SANS, BODY_SIZE))
            head = ""
            for word in tail.split():
                candidate = f"{head} {word}".strip()
                if pdfmetrics.stringWidth(candidate, SANS, BODY_SIZE) <= room:
                    head = candidate
                else:
                    break
            if head:
                self._text(self.main_page, end + _space(SANS, BODY_SIZE), self.main_y, head, SANS,
                           BODY_SIZE, BODY_INK)
            self.main_last = self.main_y
            self.main_y += TIGHT_LEAD
            for extra in _wrap(tail[len(head):].strip(), SANS, BODY_SIZE,
                               MAIN_RIGHT - BULLET_X):
                self._main_room(16)
                self._text(self.main_page, BULLET_X, self.main_y, extra, SANS,
                           BODY_SIZE, BODY_INK)
                self.main_last = self.main_y
                self.main_y += TIGHT_LEAD
        self.main_fresh = False

    def finish(self) -> int:
        """Replay every queued op in page order, painting the furniture first."""
        pages = max([page for page, _ in self.ops], default=0) + 1
        for page in range(pages):
            self._furniture()
            for owner, draw in self.ops:
                if owner == page:
                    draw(self.c)
            self.c.showPage()
        self.c.save()
        return pages
