"""How the modern CV uses the page it is printed on.

A visitor uploaded a French networks CV and got back two pages, the second
holding three lines of education over a full-height teal sidebar. It read as a
fault in the tool, and it was: the sidebar's content ended at 760.6 against a
limit of 770, so the page it spilled onto never needed to exist.

Two separate defects produced it, and both are guarded here.

  * `_side_room` reserved space against a cursor its caller was about to
    overwrite, and reserved past the block's last baseline into the whitespace
    after it — together over-reserving by 15 to 60 points on every call. Any
    sidebar ending within ~15pt of the foot of the page was broken spuriously.
  * Nothing ever looked at the finished document. `finish()` counted pages by
    the highest index any operation claimed, so one text run on page two cost a
    whole physical sheet, furniture and all.

The suite could not see any of it: `test_builder.py` asserts `pages <= 2` for a
one-page CV, and `test_fidelity.py` pins fonts, palette and two geometry
constants — nothing that notices vertical rhythm moving. So the first test
below is the one that matters most: the reference CV, the document this
renderer exists to reproduce, must come out at exactly the designed spacing.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv import builder
from app.cv._cvmodern import BOTTOM_LIMIT, ModernCV
from app.cv.builder import FIT_CEILING, FIT_FLOOR, build_resume

from reference_draft import REFERENCE_DRAFT

# The CV that was reported. French, from a photographed original, and — the
# point of it — only a few points too tall for one page.
REPORTED = {
    "full_name": "Yassine Amchi",
    "headline": "Technicien Réseaux et Systèmes | Cybersécurité",
    "contact": (
        "Fès, Maroc\n+212 6 21 60 21 82\nyassinamchi@gmail.com\n"
        "linkedin.com/in/yassine-amchi\ngithub.com/yassineamchi"
    ),
    "profile": (
        "Technicien Spécialisé en Infrastructure Digitale – Systèmes et Réseaux, "
        "diplômé de l'OFPPT. Compétences pratiques en administration systèmes, "
        "réseaux Cisco, support IT, Python et cybersécurité. Expérience en "
        "maintenance informatique, diagnostic, analyse réseau et évaluation de "
        "sécurité. Certifié Cisco en réseaux, cybersécurité et DevNet."
    ),
    "experience": (
        "Stagiaire - Cybersécurité et Réseaux | Faculté des Lettres Dhar El Mahraz "
        "| Mars 2026 | Fès\n"
        "- Réalisation de scans réseau avec Nmap : identification des hôtes, ports "
        "et services.\n"
        "- Analyse des services réseau, notamment DNSSEC et transfert de zone AXFR.\n"
        "- Évaluation de la sécurité d'une application Web dans un environnement "
        "autorisé.\n"
        "- Documentation et rédaction de recommandations de sécurité.\n"
        "Stagiaire - Support Informatique | Faculté des Lettres Dhar El Mahraz | "
        "Oct. 2021 - Fév. 2022 | Fès\n"
        "- Installation et configuration de systèmes Windows et Linux.\n"
        "- Assistance aux utilisateurs et résolution des incidents informatiques.\n"
        "- Maintenance du matériel, des logiciels et des équipements réseau."
    ),
    "education": (
        "Technicien Spécialisé - Infrastructure Digitale | OFPPT / IFMOTICA, Fès | 2026\n"
        "Option : Systèmes et Réseaux\n"
        "Baccalauréat - Sciences de la Vie et de la Terre | | 2015"
    ),
    "skills": (
        "Réseaux : TCP/IP, VLAN, Routage, Commutation, DNS, DHCP, VPN, Cisco IOS, "
        "Nmap, Wireshark\n"
        "Systèmes : Linux, Kali Linux, Ubuntu, Debian, Windows Server, Active "
        "Directory, PowerShell, Bash\n"
        "Cybersécurité : Reconnaissance, Énumération, Pentest Web/Réseau, OWASP "
        "Top 10, Analyse de vulnérabilités, Wazuh, MITRE ATT&CK\n"
        "Outils : Burp Suite, OWASP ZAP, Nuclei, ffuf, Metasploit, SQLMap, Hydra, "
        "Hashcat, Git/GitHub\n"
        "Programmation : Python, Bash, PowerShell, HTML/CSS, automatisation réseau\n"
        "Bureautique : Microsoft Word, Excel, PowerPoint, Canva"
    ),
    "languages": "Arabe - Avancé\nFrançais - Intermédiaire\nAnglais - Technique",
    "projects": (
        "CTF et Cyber Labs - Hack The Box, TryHackMe, Root-Me, PortSwigger "
        "Academy, CTFtime.\n"
        "Pratique de la reconnaissance, énumération, sécurité Web, Linux, Windows, "
        "DFIR et analyse des vulnérabilités."
    ),
    "certifications": (
        "Cisco - CCNP Core Networking, CCNA Switching Routing and Wireless "
        "Essentials, CCNA Introduction to Networks\n"
        "DevNet Associate, Junior Cybersecurity Analyst, Ethical Hacker, Python "
        "Essentials 1\n"
        "API Security Certified Associate - Wallarm\n"
        "Network Virtualization Concepts - Broadcom"
    ),
}


@pytest.fixture
def rhythms(monkeypatch):
    """Every (main, side) rhythm the fit pass actually rendered, in order."""
    seen: list[tuple[float, float]] = []
    original = ModernCV.finish

    def spy(self):
        seen.append((self.main_rhythm, self.side_rhythm))
        return original(self)

    monkeypatch.setattr(ModernCV, "finish", spy)
    return seen


def _chars_per_page(pdf_bytes: bytes) -> list[int]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [len((page.extract_text() or "").strip()) for page in reader.pages]


def _drawing_commands(pdf_bytes: bytes) -> str:
    """The decompressed content streams — everything actually painted, and
    nothing that varies between two identical runs."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(
        page.get_contents().get_data().decode("latin-1") for page in reader.pages
    )


# ------------------------------------------------------- the design authority

def test_the_reference_cv_renders_at_the_designed_rhythm(rhythms) -> None:
    """The one draft that must never be re-spaced.

    `cv/yassine-sinif-cv.pdf` is what every measurement in `_cvmodern.py` was
    read off. A fit pass that quietly stretched or squeezed *it* would defeat
    the renderer's whole purpose, and no other test in this suite would notice:
    none of them assert a single vertical constant.

    It renders once, at 1.0/1.0 — not "ends up equivalent to", but never
    re-rendered at all.
    """
    _, pages = build_resume(style="modern", **REFERENCE_DRAFT)

    assert pages == 1
    assert rhythms == [(1.0, 1.0)], (
        f"the reference CV was re-spaced: {rhythms}. It sits at ~92% of the main "
        "column, which is a full page, so no fitting should have been attempted."
    )


def test_a_comfortable_cv_is_left_alone(rhythms) -> None:
    """Fitting is for pages that are badly used, not for every render."""
    build_resume(style="modern", **REFERENCE_DRAFT)
    assert len(rhythms) == 1


# --------------------------------------------------------- the reported bug

def test_the_reported_cv_fits_one_page() -> None:
    """It was two pages, the second holding three lines.

    Its sidebar's natural extent is 760.6 against a 770 limit for the shorter
    variant, and a few points over for this one — either way a second sheet is
    the wrong answer.
    """
    pdf_bytes, pages = build_resume(style="modern", language="fr", **REPORTED)

    assert pages == 1, f"still {pages} pages: {_chars_per_page(pdf_bytes)}"


@pytest.mark.parametrize(
    "style", ["modern", "modern-blue", "modern-plum", "modern-burgundy"]
)
def test_no_page_is_nearly_empty(style: str) -> None:
    """The defect, stated as a property rather than as one CV.

    A second sheet carrying three lines reads as a fault in the tool. If a CV
    genuinely needs two pages it may have them — but not a page that is 17%
    full, and `pages <= 2` in test_builder.py is not the assertion that catches
    that, because two pages was never the complaint.
    """
    pdf_bytes, pages = build_resume(style=style, language="fr", **REPORTED)
    per_page = _chars_per_page(pdf_bytes)

    if pages > 1:
        assert min(per_page) > 400, (
            f"{style} shipped a nearly-empty page: {per_page}"
        )


def test_a_sidebar_heading_is_never_the_last_thing_on_a_page() -> None:
    """Keep-with-next, at the one position where it decides the outcome.

    Placed so the heading itself clears the limit by 5pt but its first item
    cannot. Reserving only the heading — which is what `side_heading` used to
    do — leaves it alone at the foot of the page with its content overleaf.
    """
    from app.cv._cvmodern import SIDE_HEAD_GAP

    cv = ModernCV(io.BytesIO(), title="t")
    cv.side_fresh = False
    cv.side_last = cv.side_y = BOTTOM_LIMIT - SIDE_HEAD_GAP - 5.0

    cv.side_heading("FORMATION")

    assert cv.side_page == 1, (
        "the heading was left at the foot of the page; only its own glyphs "
        "were reserved, not the first line of what it introduces"
    )


def test_a_long_sidebar_breaks_without_orphaning_a_heading() -> None:
    """The same rule end to end, on a CV whose sidebar honestly needs a second
    page — the case the fit pass deliberately does not paper over."""
    draft = dict(REPORTED)
    draft["skills"] = REPORTED["skills"] + "\n" + "\n".join(
        f"Domaine {n} : outil, outil, outil, outil, outil, outil, outil, outil"
        for n in range(8)
    )
    reader = PdfReader(io.BytesIO(build_resume(style="modern", language="fr", **draft)[0]))
    pages = [page.extract_text() or "" for page in reader.pages]
    assert len(pages) > 1, "this draft is meant to overflow"

    for index, text in enumerate(pages):
        lines = [line for line in text.splitlines() if line.strip()]
        for heading in ("FORMATION", "LANGUES", "COMPÉTENCES TECHNIQUES"):
            if lines and lines[-1].strip() == heading:
                raise AssertionError(
                    f"{heading} is alone at the foot of page {index + 1}"
                )


def test_education_is_not_split_from_its_heading() -> None:
    """FORMATION stranded at the foot of page one with its degrees overleaf.

    `side_heading` reserved room for the heading and nothing for the first line
    of what it introduces — the main column has always kept a role's title with
    its first line of evidence; the sidebar never got the equivalent.
    """
    reader = PdfReader(io.BytesIO(build_resume(
        style="modern", language="fr", **REPORTED)[0]))
    pages = [page.extract_text() or "" for page in reader.pages]

    for index, text in enumerate(pages):
        if "FORMATION" in text:
            assert "OFPPT" in text, (
                f"the FORMATION heading is alone on page {index + 1}"
            )


# ------------------------------------------------------------- the bounds

def test_fitting_never_leaves_the_honest_range(rhythms) -> None:
    """Spacing is a design parameter with a range, not a free variable.

    Below the floor sections stop reading as separate; above the ceiling the
    page reads as padded. A CV that cannot be fitted inside the range is
    supposed to come out long, not squeezed.
    """
    for draft in (REFERENCE_DRAFT, REPORTED, _very_long_draft()):
        rhythms.clear()
        build_resume(style="modern", **draft)
        for main, side in rhythms:
            assert FIT_FLOOR <= main <= FIT_CEILING
            assert FIT_FLOOR <= side <= FIT_CEILING


def test_a_genuinely_long_cv_is_not_squeezed(rhythms) -> None:
    """Three pages of content is three pages. The fit pass exists to delete a
    page nobody asked for, never to compress a CV that earned its length —
    which is why an unsuccessful search returns the *first* render and not the
    tightest one it tried."""
    pdf_bytes, pages = build_resume(style="modern", **_very_long_draft())

    assert pages > 1
    assert rhythms[0] == (1.0, 1.0)
    # Whatever it probed, the document it shipped is the measured one. Compared
    # on the content streams, not the bytes: ReportLab stamps a creation time
    # into every file, so two identical renders are never byte-equal.
    assert _drawing_commands(pdf_bytes) == _drawing_commands(
        build_resume(style="modern", **_very_long_draft())[0]
    )


def _tightest_setting(draft: dict, main_rhythm: float, side_rhythm: float) -> dict:
    """Smallest baseline-gap ÷ type-size in each column, for one render.

    Right-aligned runs reach `_text` with `x=0` and have their real x computed
    inside it, so the column has to be worked out the same way — otherwise
    every date in the main column is counted as a sidebar line sitting on top
    of a contact detail.
    """
    from app.cv import _cvmodern
    from app.cv.builder import LABELS, RESUME_FIELDS, _lay_out_modern

    runs: list[tuple[int, str, float, float]] = []
    original = ModernCV._text

    def spy(self, page, x, top_down, text, font, size, color, track=0.0, right=None):
        if right is not None:
            x = right - _cvmodern._tracked_width(text, font, size, track)
        if text.strip():
            runs.append((page, "side" if x < _cvmodern.SIDEBAR_W else "main",
                         top_down, size))
        return original(self, page, x, top_down, text, font, size, color, track, right)

    ModernCV._text = spy
    try:
        cv = ModernCV(io.BytesIO(), title="t", main_rhythm=main_rhythm,
                      side_rhythm=side_rhythm)
        _lay_out_modern(cv, LABELS["fr"], photo="",
                        **{f: draft.get(f, "") for f in RESUME_FIELDS})
        cv.finish()
    finally:
        ModernCV._text = original

    tightest = {}
    for column in ("side", "main"):
        for page in {r[0] for r in runs}:
            lines = sorted((r for r in runs if r[0] == page and r[1] == column),
                           key=lambda r: r[2])
            for above, below in zip(lines, lines[1:]):
                gap = below[2] - above[2]
                if gap <= 0.01:
                    continue        # chained runs sharing one baseline
                ratio = gap / max(above[3], below[3])
                tightest[column] = min(tightest.get(column, ratio), ratio)
    return tightest


def test_no_rhythm_sets_a_line_tighter_than_the_design_does() -> None:
    """Fitting cannot make two lines collide, and this says why.

    Every gap the rhythm scales is *between* blocks; the leading inside one is
    a fixed constant. So the closest two baselines ever come is decided by the
    design and not by the fit pass — measured here against the reference render
    rather than against a guess, because the reference itself sets a 24pt name
    on 20.2pt of lead, and any "gap smaller than the type size" rule would call
    its own masthead a collision.
    """
    design = _tightest_setting(REFERENCE_DRAFT, 1.0, 1.0)

    for draft in (REFERENCE_DRAFT, REPORTED):
        for side in (FIT_CEILING, 1.0, 0.88, FIT_FLOOR):
            for main in (FIT_CEILING, 1.0, FIT_FLOOR):
                got = _tightest_setting(draft, main, side)
                for column, ratio in got.items():
                    assert ratio >= design[column] - 1e-9, (
                        f"main={main} side={side} sets a {column} line at "
                        f"{ratio:.3f}x its type size, tighter than the design's "
                        f"own {design[column]:.3f}x"
                    )


def test_type_size_and_leading_are_never_scaled() -> None:
    """Fitting spends the space *between* blocks. Shrinking the type or the
    leading to win a page is how a CV becomes unreadable to fit a rule, and it
    is the one thing this must not do — so the body constants are read
    straight from the module, never through an instance."""
    from app.cv import _cvmodern

    source = (_cvmodern.__file__)
    text = open(source, encoding="utf-8").read()
    body = text.split("# -- sidebar ---", 1)[1]

    for scaled in ("BODY_LEAD", "TIGHT_LEAD", "BODY_SIZE", "SIDE_BODY_SIZE"):
        assert f"self.{scaled.lower()}" not in body, (
            f"{scaled} became scalable — leading and type size must not move"
        )


# ------------------------------------------------- the reservation arithmetic

def test_a_block_that_fits_is_not_pushed_to_the_next_page() -> None:
    """The bug in one assertion.

    A block whose last baseline lands exactly on the limit fits. The old code
    measured to where the cursor ended up *after* the block — whitespace that
    is never inked — and broke the page for it.
    """
    cv = ModernCV(io.BytesIO(), title="t")
    cv.side_page, cv.side_y, cv.side_last = 0, BOTTOM_LIMIT - 40.0, BOTTOM_LIMIT - 40.0

    cv._side_place(cv.side_y, 40.0)

    assert cv.side_page == 0, "a block ending exactly on the limit was broken"
    assert cv.side_y == BOTTOM_LIMIT - 40.0


def test_a_block_that_does_not_fit_still_breaks() -> None:
    cv = ModernCV(io.BytesIO(), title="t")
    cv.side_page, cv.side_y, cv.side_last = 0, BOTTOM_LIMIT - 40.0, BOTTOM_LIMIT - 40.0

    cv._side_place(cv.side_y, 41.0)

    assert cv.side_page == 1
    assert cv.side_y == pytest.approx(54.0)


def test_the_reservation_is_measured_from_where_the_block_lands() -> None:
    """The second half of the arithmetic bug: the old callers tested the cursor
    from *before* their own leading gap was applied, then moved the cursor —
    checking a number they were about to discard."""
    cv = ModernCV(io.BytesIO(), title="t")
    cv.side_page = 0
    cv.side_last = cv.side_y = BOTTOM_LIMIT - 30.0

    # The block sits 20pt below `side_last`, so it runs to 775 and must break.
    # Measured from the stale cursor it would come to 755 and appear to fit —
    # which is precisely the check the old code was making.
    cv._side_place(cv.side_last + 20.0, 15.0)

    assert cv.side_page == 1, (
        "the block was placed using the cursor from before its leading gap"
    )


def _very_long_draft() -> dict:
    """A CV that honestly needs more than one page."""
    draft = dict(REFERENCE_DRAFT)
    draft["experience"] = "\n".join(
        f"Senior Engineer {n} | Employer {n} | 20{n:02d} - 20{n + 1:02d} | City\n"
        f"- Delivered a platform component and owned it end to end.\n"
        f"- Reduced processing time substantially through profiling and redesign.\n"
        f"- Mentored engineers and ran the design review for the team."
        for n in range(10, 22)
    )
    return draft
