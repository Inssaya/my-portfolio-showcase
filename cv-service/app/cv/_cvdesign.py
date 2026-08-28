"""Canvas-level renderer for the two-column CV.

Why a canvas and not Platypus: this layout is a *painted* design, not a text
flow. A full-height dark sidebar, a banner that cuts a white notch out of it, a
circular photo, filled section labels and proportional language bars are all
things you draw at coordinates. Trying to express them as flowables means
fighting the frame model for every one of them.

The two columns keep independent cursors and each spills onto a new page on its
own, which is what a CV actually wants: a long experience list must not push the
skills sidebar down with it.

Geometry and colour were measured off a reference CV rendered at 110 dpi, so the
numbers below are deliberate rather than tuned by eye.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas

PAGE_W, PAGE_H = A4

# ---- palette ---------------------------------------------------------------
DARK = colors.HexColor("#282830")        # sidebar band
TAUPE = colors.HexColor("#B59E96")       # banner, section labels, accents
SIDE_TEXT = colors.HexColor("#E0E0E1")   # body text on the dark sidebar
BODY = colors.HexColor("#1A1A1A")        # main-column body text
SUBTLE = colors.HexColor("#8A8A8A")      # employer / school line
WHITE = colors.white

# ---- geometry (points, measured from the reference) ------------------------
SIDEBAR_W = 200.0
SIDE_X = 40.0                            # sidebar text left edge
SIDE_RIGHT = 181.0                       # sidebar text right edge
SIDE_W = SIDE_RIGHT - SIDE_X

MAIN_X = 220.0                           # main column left edge
MAIN_RIGHT = 555.0                       # main column right edge
MAIN_W = MAIN_RIGHT - MAIN_X

BANNER_X, BANNER_Y, BANNER_W, BANNER_H = 40.0, 40.0, 514.5, 148.0
NOTCH_X, NOTCH_Y = 29.5, 29.5            # white inset that cuts the sidebar
NOTCH_H = 168.5

PHOTO_CX, PHOTO_CY, PHOTO_R = 121.0, 106.0, 46.0

# ---- type scale and vertical rhythm ---------------------------------------
# Every one of these came out of the reference PDF's text spans rather than off
# a screenshot: it sets body copy at 9pt on a 9.9pt leading, section labels at
# 10.8pt tracked 1pt, and spaces every block as a multiple of that one leading.
BODY_SIZE = 9.0
HEAD_SIZE = 10.8
NAME_SIZE = 30.0
HEAD_TRACK = 1.0

LEADING = 9.9          # baseline to baseline inside a block
BLOCK_GAP = 10.0       # extra between items/entries, giving a 19.9pt pitch
HEADING_DROP = 20.3    # heading baseline to the first line beneath it
HEADING_LIFT = 21.6    # extra above a heading (31.5pt from the last baseline)
FIRST_HEADING = 10.1   # from CONTENT_TOP to the first heading baseline

CONTENT_TOP = 218.0                      # where both columns start on page 1
PAGE_TOP = 48.0                          # where both columns start on later pages
BOTTOM_LIMIT = 800.0                     # last usable y (top-down)

# ---- fonts -----------------------------------------------------------------
# The reference CV is set in Liberation Serif. Register the real thing when the
# host has it (it ships with most Linux distributions) and fall back to Times,
# which is metric-similar enough that the layout still holds.
SERIF, SERIF_B, SERIF_I = "Times-Roman", "Times-Bold", "Times-Italic"
_FONTS_READY = False


def _register_fonts() -> None:
    global SERIF, SERIF_B, SERIF_I, _FONTS_READY
    if _FONTS_READY:
        return
    _FONTS_READY = True
    base = "/usr/share/fonts/truetype/liberation"
    faces = [
        ("LiberationSerif", f"{base}/LiberationSerif-Regular.ttf"),
        ("LiberationSerif-Bold", f"{base}/LiberationSerif-Bold.ttf"),
        ("LiberationSerif-Italic", f"{base}/LiberationSerif-Italic.ttf"),
    ]
    try:
        for name, path in faces:
            pdfmetrics.registerFont(TTFont(name, path))
    except Exception:  # noqa: BLE001 — missing font is not a failure, Times works
        return
    SERIF, SERIF_B, SERIF_I = (
        "LiberationSerif", "LiberationSerif-Bold", "LiberationSerif-Italic",
    )


# ---- text helpers ----------------------------------------------------------
def _wrap(text: str, font: str, size: float, width: float) -> list[str]:
    """Greedy word wrap. A word longer than the column is left to overhang
    rather than hyphenated — an overhang is visible and fixable, a silent
    truncation is not."""
    words = str(text).split()
    if not words:
        return []
    lines: list[str] = []
    line = words[0]
    for word in words[1:]:
        candidate = f"{line} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def _spaced_width(text: str, font: str, size: float, char_space: float) -> float:
    return pdfmetrics.stringWidth(text, font, size) + char_space * max(0, len(text) - 1)


# ---- contact icons ---------------------------------------------------------
# Drawn as vectors rather than shipped as bitmaps: six glyphs at 8pt do not
# justify an asset pipeline, and vectors stay sharp at any zoom.
def _icon(c: pdfcanvas.Canvas, kind: str, x: float, y: float, s: float) -> None:
    """Draw `kind` in an s×s box whose bottom-left corner is (x, y)."""
    c.saveState()
    c.setFillColor(WHITE)
    c.setStrokeColor(WHITE)
    c.setLineWidth(max(0.45, s * 0.075))
    c.setLineJoin(1)

    if kind == "mail":
        c.rect(x, y + s * 0.18, s, s * 0.64, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(x, y + s * 0.82)
        p.lineTo(x + s * 0.5, y + s * 0.46)
        p.lineTo(x + s, y + s * 0.82)
        c.drawPath(p, stroke=1, fill=0)

    elif kind == "phone":
        # A handset reads as a thick diagonal stroke with two swollen ends.
        c.setLineWidth(s * 0.26)
        c.setLineCap(1)
        p = c.beginPath()
        p.moveTo(x + s * 0.22, y + s * 0.80)
        p.lineTo(x + s * 0.78, y + s * 0.22)
        c.drawPath(p, stroke=1, fill=0)
        c.circle(x + s * 0.22, y + s * 0.80, s * 0.17, stroke=0, fill=1)
        c.circle(x + s * 0.78, y + s * 0.22, s * 0.17, stroke=0, fill=1)

    elif kind == "home":
        p = c.beginPath()
        p.moveTo(x, y + s * 0.52)
        p.lineTo(x + s * 0.5, y + s)
        p.lineTo(x + s, y + s * 0.52)
        c.drawPath(p, stroke=1, fill=0)
        c.rect(x + s * 0.16, y, s * 0.68, s * 0.52, stroke=1, fill=0)

    elif kind == "calendar":
        c.rect(x, y, s, s * 0.84, stroke=1, fill=0)
        c.line(x, y + s * 0.60, x + s, y + s * 0.60)
        c.line(x + s * 0.28, y + s * 0.84, x + s * 0.28, y + s)
        c.line(x + s * 0.72, y + s * 0.84, x + s * 0.72, y + s)
        for col in (0.25, 0.5, 0.75):
            for row in (0.18, 0.40):
                c.circle(x + s * col, y + s * row, s * 0.055, stroke=0, fill=1)

    elif kind == "car":
        c.rect(x, y + s * 0.20, s, s * 0.34, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(x + s * 0.16, y + s * 0.54)
        p.lineTo(x + s * 0.30, y + s * 0.84)
        p.lineTo(x + s * 0.70, y + s * 0.84)
        p.lineTo(x + s * 0.84, y + s * 0.54)
        c.drawPath(p, stroke=1, fill=0)
        c.circle(x + s * 0.24, y + s * 0.16, s * 0.11, stroke=0, fill=1)
        c.circle(x + s * 0.76, y + s * 0.16, s * 0.11, stroke=0, fill=1)

    elif kind == "people":
        c.circle(x + s * 0.32, y + s * 0.74, s * 0.20, stroke=1, fill=0)
        c.circle(x + s * 0.78, y + s * 0.76, s * 0.15, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(x + s * 0.06, y + s * 0.10)
        p.curveTo(x + s * 0.06, y + s * 0.46, x + s * 0.58, y + s * 0.46, x + s * 0.58, y + s * 0.10)
        c.drawPath(p, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(x + s * 0.62, y + s * 0.12)
        p.curveTo(x + s * 0.64, y + s * 0.40, x + s * 0.98, y + s * 0.40, x + s * 0.98, y + s * 0.12)
        c.drawPath(p, stroke=1, fill=0)

    else:  # a neutral marker beats crashing on an unknown kind
        c.circle(x + s * 0.5, y + s * 0.5, s * 0.32, stroke=1, fill=0)

    c.restoreState()


_ICON_RULES = [
    ("mail", re.compile(r"[\w.+-]+@[\w-]+\.\w+")),
    ("home", re.compile(r"\b(rue|avenue|av\.|bd|boulevard|street|road|apt|quartier)\b", re.I)),
    ("calendar", re.compile(r"\b(19|20)\d{2}\b.*\b(jan|f[ée]v|mar|avr|mai|juin|juil|ao[ûu]t|sep|oct|nov|d[ée]c)|"
                            r"\b(jan|f[ée]v|mar|avr|mai|juin|juil|ao[ûu]t|sep|oct|nov|d[ée]c)\w*\s+\d{4}", re.I)),
    ("phone", re.compile(r"^\+?[\d\s().-]{8,}$")),
    ("people", re.compile(r"\b(mari[ée]|c[ée]libataire|divorc[ée]|single|married|divorced)\b", re.I)),
]


def _guess_icon(line: str) -> str:
    """Pick a contact icon from the line's shape.

    Explicit `icon|text` always wins; this only runs when the caller did not
    say. Order matters — an address containing a year must still read as an
    address, so `home` is tested before `calendar`.
    """
    text = line.strip()
    for kind, pattern in _ICON_RULES:
        if pattern.search(text):
            return kind
    if re.fullmatch(r"[A-Z]{1,3}\d?", text):   # a driving licence category
        return "car"
    if re.fullmatch(r"\d{1,2}\s+\w+\s+\d{4}", text):
        return "calendar"
    return "people"


# ---- content model ---------------------------------------------------------
@dataclass
class Entry:
    """One job, internship or qualification."""
    title: str = ""
    org: str = ""
    dates: str = ""
    # A quiet fourth line — location, team, department — kept apart from the
    # employer so the title line stays "Role — Employer .......... dates".
    meta: str = ""
    bullets: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def parse_entries(block: str) -> list[Entry]:
    """Parse the `Title | Org | Dates` + `- bullet` mini-format.

    Lines that are neither a header nor a bullet attach to the current entry as
    plain notes, which is how "diplôme obtenu avec mention BIEN" sits under a
    qualification without becoming a bullet point.
    """
    entries: list[Entry] = []
    current: Entry | None = None
    for raw in (block or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(("- ", "* ", "• ")):
            if current is None:
                current = Entry(title="")
                entries.append(current)
            current.bullets.append(line[2:].strip())
        elif "|" in line:
            parts = [p.strip() for p in line.split("|")]
            current = Entry(
                title=parts[0],
                org=parts[1] if len(parts) > 1 else "",
                dates=parts[2] if len(parts) > 2 else "",
                meta=parts[3] if len(parts) > 3 else "",
            )
            entries.append(current)
        else:
            if current is None:
                current = Entry(title=line)
                entries.append(current)
            else:
                current.notes.append(line)
    return entries


def parse_languages(block: str) -> list[tuple[str, float]]:
    """`Arabe | 100`, `Arabe — natif` or bare `Arabe` → (name, 0..1)."""
    words = {
        "natif": 1.0, "native": 1.0, "maternelle": 1.0, "bilingue": 1.0, "c2": 1.0,
        "courant": 0.75, "fluent": 0.75, "avancé": 0.75, "avance": 0.75, "c1": 0.8,
        "professionnel": 0.6, "professional": 0.6, "intermédiaire": 0.5,
        "intermediaire": 0.5, "intermediate": 0.5, "b2": 0.6, "b1": 0.45,
        "notions": 0.3, "débutant": 0.25, "debutant": 0.25, "basic": 0.25, "a2": 0.3,
        "a1": 0.2,
    }
    out: list[tuple[str, float]] = []
    for raw in (block or "").splitlines():
        line = raw.strip().lstrip("-*• ").strip()
        if not line:
            continue
        name, level = line, None
        for sep in ("|", "—", " - ", ":"):
            if sep in line:
                name, _, rest = line.partition(sep)
                name, rest = name.strip(), rest.strip()
                number = re.search(r"\d{1,3}", rest)
                if number:
                    level = min(1.0, int(number.group()) / 100.0)
                else:
                    level = words.get(rest.lower())
                break
        out.append((name, 0.6 if level is None else level))
    return out


LABELS = {
    "fr": {
        "skills": "COMPÉTENCES TECHNIQUES", "languages": "LANGUES", "interests": "CENTRES D'INTÉRÊT",
        "profile": "PROFIL", "education": "FORMATION",
        "experience": "EXPÉRIENCE PROFESSIONNELLE", "internships": "STAGES",
        "certifications": "CERTIFICATIONS", "projects": "PROJETS",
        "contact": "CONTACT",
    },
    "en": {
        "skills": "TECHNICAL SKILLS", "languages": "LANGUAGES", "interests": "INTERESTS",
        "profile": "PROFILE", "education": "EDUCATION",
        "experience": "PROFESSIONAL EXPERIENCE", "internships": "INTERNSHIPS",
        "certifications": "CERTIFICATIONS", "projects": "KEY PROJECTS",
        "contact": "CONTACT",
    },
}


# ---- the renderer ----------------------------------------------------------
class CVRenderer:
    """Paints the CV. Coordinates are given top-down and flipped on the way out,
    because every measurement taken off the reference is top-down."""

    def __init__(self, buffer, title: str, accent: str | None = None):
        _register_fonts()
        self.c = pdfcanvas.Canvas(buffer, pagesize=A4)
        self.c.setTitle(title)
        self.pages = 1
        # The banner, section badges, side headings and language bars are all
        # painted in one colour. Parameterising it here — rather than adding a
        # second copy of this file per palette — is what lets `classic-blue`,
        # `classic-green` etc. exist as one recolour each instead of three
        # more vendored renderers to keep in sync with this one forever.
        self.accent = colors.HexColor(accent) if accent else TAUPE
        self._paint_page_furniture()
        self.side_y = CONTENT_TOP
        self.main_y = CONTENT_TOP
        # A heading opening a column needs less air above it than one following
        # a section, so each column tracks whether it has drawn anything yet.
        self.side_fresh = True
        self.main_fresh = True
        self.main_last = CONTENT_TOP
        self.side_last = CONTENT_TOP

    # -- primitives ----------------------------------------------------------
    def _y(self, top_down: float) -> float:
        return PAGE_H - top_down

    def _paint_page_furniture(self) -> None:
        self.c.setFillColor(DARK)
        self.c.rect(0, 0, SIDEBAR_W, PAGE_H, stroke=0, fill=1)

    def _new_page(self) -> None:
        self.c.showPage()
        self.pages += 1
        self._paint_page_furniture()
        self.side_y = PAGE_TOP
        self.main_y = PAGE_TOP
        self.side_fresh = True
        self.main_fresh = True
        self.main_last = PAGE_TOP
        self.side_last = PAGE_TOP

    def _text(self, x: float, top_down: float, text: str, font: str, size: float,
              color, char_space: float = 0.0, right: float | None = None) -> None:
        if right is not None:
            x = right - _spaced_width(text, font, size, char_space)
        self.c.saveState()
        self.c.setFillColor(color)
        # A text object rather than drawString: letter spacing lives on the text
        # state, and the tracked capitals in the headings depend on it.
        obj = self.c.beginText(x, self._y(top_down))
        obj.setFont(font, size)
        obj.setCharSpace(char_space)
        obj.textOut(text)
        self.c.drawText(obj)
        self.c.restoreState()

    # -- page 1 header -------------------------------------------------------
    def header(self, full_name: str, headline: str, contact_lines: list[tuple[str, str]],
               photo_path: str = "") -> None:
        c = self.c
        # The notch: white paint over the sidebar so the banner appears to float
        # clear of it. Drawn before the banner, after the sidebar.
        c.setFillColor(WHITE)
        c.rect(NOTCH_X, self._y(NOTCH_Y + NOTCH_H), PAGE_W - NOTCH_X, NOTCH_H, stroke=0, fill=1)

        c.setFillColor(self.accent)
        c.rect(BANNER_X, self._y(BANNER_Y + BANNER_H), BANNER_W, BANNER_H, stroke=0, fill=1)

        if photo_path:
            self._photo(photo_path)

        text_x = MAIN_X
        self._text(text_x, 90.4, full_name.upper(), SERIF_B, NAME_SIZE, WHITE)

        top = 117.2
        if headline:
            self._text(text_x, top, headline, SERIF, 11.0, WHITE)
            top += 15.0

        for kind, text in contact_lines:
            _icon(c, kind, text_x, self._y(top) - 0.5, 8.2)
            self._text(text_x + 15.0, top, text, SERIF, BODY_SIZE, WHITE)
            top += LEADING

    def _photo(self, path: str) -> None:
        """Centre-cropped circular portrait with a white ring."""
        from reportlab.lib.utils import ImageReader

        try:
            from PIL import Image

            image = Image.open(path).convert("RGB")
            side = min(image.size)
            left = (image.width - side) // 2
            # Bias the crop upward: on a portrait the head sits above centre.
            top = max(0, int((image.height - side) * 0.35))
            image = image.crop((left, top, left + side, top + side))
            source = ImageReader(image)
        except Exception:  # noqa: BLE001 — a bad photo must not lose the CV
            return

        c = self.c
        cy = self._y(PHOTO_CY)
        c.saveState()
        path_ = c.beginPath()
        path_.circle(PHOTO_CX, cy, PHOTO_R)
        c.clipPath(path_, stroke=0, fill=0)
        c.drawImage(source, PHOTO_CX - PHOTO_R, cy - PHOTO_R,
                    2 * PHOTO_R, 2 * PHOTO_R, mask="auto")
        c.restoreState()

        c.saveState()
        c.setStrokeColor(WHITE)
        c.setLineWidth(3.2)
        c.circle(PHOTO_CX, cy, PHOTO_R + 1.6, stroke=1, fill=0)
        c.restoreState()

    # -- sidebar -------------------------------------------------------------
    def _side_room(self, needed: float) -> None:
        if self.side_y + needed > BOTTOM_LIMIT:
            self._new_page()

    def _side_line(self, leading: float = LEADING) -> None:
        self.side_last = self.side_y
        self.side_y += leading

    def side_heading(self, text: str) -> None:
        self._side_room(34)
        self.side_y = (
            CONTENT_TOP + FIRST_HEADING if self.side_fresh
            else self.side_last + LEADING + HEADING_LIFT
        )
        self.side_fresh = False
        self._text(SIDE_X, self.side_y, text.upper(), SERIF, HEAD_SIZE, self.accent,
                   char_space=HEAD_TRACK)
        self.side_last = self.side_y
        self.side_y += HEADING_DROP

    def side_items(self, lines: list[str]) -> None:
        for item in lines:
            wrapped = _wrap(item, SERIF, BODY_SIZE, SIDE_W)
            self._side_room(len(wrapped) * LEADING + 6)
            for line in wrapped:
                self._text(SIDE_X, self.side_y, line, SERIF, BODY_SIZE, SIDE_TEXT)
                self._side_line()
            self.side_y += BLOCK_GAP

    def side_languages(self, pairs: list[tuple[str, float]]) -> None:
        """Name on one line, its proficiency bar on the next, so a language
        occupies exactly two lines of the same rhythm as everything else."""
        for name, level in pairs:
            self._side_room(2 * LEADING + BLOCK_GAP)
            self._text(SIDE_X, self.side_y, name, SERIF, BODY_SIZE, SIDE_TEXT)
            self.side_y += LEADING
            y = self._y(self.side_y - 4.5)
            self.c.setFillColor(WHITE)
            self.c.rect(SIDE_X, y, SIDE_W, 2.8, stroke=0, fill=1)
            self.c.setFillColor(self.accent)
            self.c.rect(SIDE_X, y, SIDE_W * max(0.0, min(1.0, level)), 2.8, stroke=0, fill=1)
            self._side_line()
            self.side_y += BLOCK_GAP

    def side_marked(self, lines: list[str]) -> None:
        """Interests: a small accent-coloured square instead of a bullet."""
        for item in lines:
            wrapped = _wrap(item, SERIF, BODY_SIZE, SIDE_W - 11.2)
            self._side_room(len(wrapped) * LEADING + 6)
            self.c.setFillColor(self.accent)
            self.c.rect(SIDE_X, self._y(self.side_y), 6.0, 6.0, stroke=0, fill=1)
            for line in wrapped:
                self._text(SIDE_X + 11.2, self.side_y, line, SERIF, BODY_SIZE, SIDE_TEXT)
                self._side_line()
            self.side_y += BLOCK_GAP

    # -- main column ---------------------------------------------------------
    #
    # Spacing is measured from the previous *baseline*, never by accumulating
    # each block's trailing leading: blocks end on different kinds of line, and
    # adding a gap on top of whatever the last one left behind is what put every
    # section below the first out of register.
    def _main_room(self, needed: float) -> None:
        if self.main_y + needed > BOTTOM_LIMIT:
            self._new_page()

    def _main_line(self, leading: float = LEADING) -> None:
        self.main_last = self.main_y
        self.main_y += leading

    def main_heading(self, text: str) -> None:
        self._main_room(44)
        self.main_y = (
            CONTENT_TOP + FIRST_HEADING if self.main_fresh
            else self.main_last + LEADING + HEADING_LIFT
        )
        self.main_fresh = False
        label = text.upper()
        # The box is positioned off the baseline, not the other way round: it has
        # to clear the cap height above and leave a little air below, or the
        # capitals get sliced by their own background.
        width = _spaced_width(label, SERIF, HEAD_SIZE, HEAD_TRACK) + 8.9
        self.c.setFillColor(self.accent)
        self.c.rect(MAIN_X, self._y(self.main_y + 2.8), width, 11.4, stroke=0, fill=1)
        self._text(MAIN_X + 4.0, self.main_y, label, SERIF, HEAD_SIZE, WHITE,
                   char_space=HEAD_TRACK)
        self.main_last = self.main_y
        self.main_y += HEADING_DROP

    def main_paragraph(self, text: str, italic: bool = False) -> None:
        font = SERIF_I if italic else SERIF
        for line in _wrap(text, font, BODY_SIZE, MAIN_W):
            self._main_room(12)
            self._text(MAIN_X, self.main_y, line, font, BODY_SIZE, BODY)
            self._main_line()

    def main_entries(self, entries: list[Entry]) -> None:
        for index, entry in enumerate(entries):
            self._main_room(40)
            if index:
                self.main_y = self.main_last + LEADING + BLOCK_GAP
            if entry.title:
                self._text(MAIN_X, self.main_y, entry.title, SERIF_B, BODY_SIZE, BODY)
            if entry.dates:
                self._text(0, self.main_y, entry.dates, SERIF, BODY_SIZE, BODY,
                           right=MAIN_RIGHT)
            if entry.title or entry.dates:
                self._main_line()
            if entry.org:
                self._text(MAIN_X, self.main_y, entry.org, SERIF, BODY_SIZE, SUBTLE)
                self._main_line()
            for note in entry.notes:
                for line in _wrap(note, SERIF, BODY_SIZE, MAIN_W):
                    self._main_room(12)
                    self._text(MAIN_X, self.main_y, line, SERIF, BODY_SIZE, BODY)
                    self._main_line()
            for bullet in entry.bullets:
                wrapped = _wrap(bullet, SERIF, BODY_SIZE, MAIN_W - 20)
                self._main_room(len(wrapped) * LEADING + 4)
                self.c.setFillColor(BODY)
                self.c.circle(MAIN_X + 11, self._y(self.main_y) + 2.5, 2.1, stroke=0, fill=1)
                for line in wrapped:
                    self._text(MAIN_X + 20, self.main_y, line, SERIF, BODY_SIZE, BODY)
                    self._main_line()

    def finish(self) -> int:
        self.c.save()
        return self.pages
