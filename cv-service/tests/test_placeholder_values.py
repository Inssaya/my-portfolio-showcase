"""Catching template/example values a real CV never contains.

Regression coverage for a real failure: a visitor uploaded a half-filled CV
template and the draft was saved holding its placeholder junk —
"kenza@example.com", "University of Example", "123-456-7890". builder.py's
_PLACEHOLDERS scrubs single-word labels ("Company Name") but not these
multi-token, structured placeholders, so they reached the rendered CV.

Like the invented-year check, this runs at write time in tools.update_resume,
because POST /generate renders straight from session.draft without the model —
the only way to protect that path is to never let a placeholder into the draft.
"""
from __future__ import annotations

import pytest

from app.cv.verify import strip_placeholder_values
from app.session import Session, store
from app.tools import run_tool
from conftest import TEST_USER_ID


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def session() -> Session:
    return store.create(user_id=TEST_USER_ID)


# ------------------------------------------------- strip_placeholder_values

def test_example_email_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("Email: kenza@example.com")
    assert cleaned == ""
    assert removed == ["kenza@example.com"]


def test_keyboard_walk_phone_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("Phone: 123-456-7890")
    assert cleaned == ""
    assert "123-456-7890" in removed


def test_template_university_is_removed_but_column_kept_empty() -> None:
    cleaned, removed = strip_placeholder_values(
        "Bachelor's Degree | University of Example | 2023"
    )
    assert "University of Example" in removed
    assert "University of Example" not in cleaned
    # The empty column stays empty rather than collapsing the whole line —
    # matches the system prompt's "LEAVE EMPTY COLUMNS EMPTY".
    assert "Bachelor's Degree" in cleaned


def test_real_contact_details_are_left_alone() -> None:
    text = "Email: kenza.mrabet0908@gmail.com\nPhone: +212 612345678"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


# ---------------------------------------------------- Canva's default template
# A real upload (a "reallygreatsite.com" Canva resume template a visitor only
# partly personalised) exposed a second gap of the same shape as
# kenza@example.com: Canva's own placeholder domain and its boilerplate
# "123 Anywhere St., Any City" address are shipped, unchanged, in real
# templates and were not caught by any existing pattern.

def test_canva_placeholder_email_is_removed() -> None:
    cleaned, removed = strip_placeholder_values("hello@reallygreatsite.com")
    assert cleaned == ""
    assert removed == ["hello@reallygreatsite.com"]


def test_canva_placeholder_address_is_removed_cleanly() -> None:
    cleaned, removed = strip_placeholder_values("123 Anywhere St., Any City")
    assert cleaned == ""
    assert "123 Anywhere St" in removed
    assert "Any City" in removed


def test_a_real_street_address_is_left_alone() -> None:
    text = "12 Rue Ibn Sina, Casablanca"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


# --------------------------------------------------------------- Lorem Ipsum
# A second real upload had "About Me" and every "Experience" bullet as
# unedited Lorem Ipsum. The marker-phrase check only strips the two words
# "Lorem ipsum" from the front of a line — leaving the rest of the Latin
# filler ("dolor sit amet, consectetur adipiscing elit...") sitting in the
# field, which is worse than a wrong contact detail: it's immediately,
# visibly wrong to anyone who reads it.

def test_a_lorem_ipsum_paragraph_is_removed_whole_not_just_its_opener() -> None:
    text = (
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n"
        "Nullam pharetra in lorem at laoreet. Donec hendrerit libero\n"
        "eget est tempor, quis tempus arcu elementum. In\n"
        "elementum elit at dui tristique feugiat."
    )
    cleaned, removed = strip_placeholder_values(text)
    assert cleaned == ""
    assert "dolor sit amet" not in cleaned
    assert "adipiscing" not in cleaned


def test_a_lorem_ipsum_line_with_no_leading_marker_phrase_is_still_caught() -> None:
    """The opener ("Lorem ipsum") might be on an earlier, separate line — or
    edited away — leaving a line that is still recognisably Latin filler with
    no literal "lorem ipsum" bigram in it at all."""
    text = "Nullam pharetra in lorem at laoreet. Donec hendrerit libero eget est tempor."
    cleaned, removed = strip_placeholder_values(text)
    assert cleaned == ""
    assert removed


def test_a_short_wrapped_lorem_ipsum_remnant_is_still_caught() -> None:
    """A wrapped Lorem Ipsum sentence split across lines can leave a
    two-word tail on its own line ("tristique feugiat.") — too short for
    the 35%-of-words ratio check, so it needs the stricter all-vocabulary
    check for short lines."""
    cleaned, removed = strip_placeholder_values("tristique feugiat.")
    assert cleaned == ""
    assert removed


def test_short_real_skill_phrases_are_never_mistaken_for_lorem_ipsum() -> None:
    for phrase in ("Digital Marketing", "Critical Thinking", "Management Skills"):
        cleaned, removed = strip_placeholder_values(phrase)
        assert removed == [], f"{phrase!r} was wrongly flagged as filler"
        assert cleaned == phrase


def test_wardiere_canvas_fake_employer_is_removed() -> None:
    """Confirmed recurring across two independent Canva templates: 'Wardiere
    University' in one, 'Wardiere Inc.' in another — Canva's own 'Acme
    Corp'."""
    cleaned, removed = strip_placeholder_values("Wardiere University | 2020")
    assert "Wardiere University" not in cleaned
    assert removed

    cleaned, removed = strip_placeholder_values("Wardiere Inc. / CEO")
    assert "Wardiere Inc" not in cleaned
    assert removed


# ------------------------------------------------- fragments left behind
# From a real run: a visitor uploaded a screenshot of a Canva template and the
# rendered CV printed a contact block reading ". , , ST 12345" over two lines
# holding just "+", next to a live-looking "www.reallygreatsite.com". Each
# individual scrub had worked; what nobody asked was whether the *line* still
# meant anything once its fake parts were gone.

def test_a_fake_address_leaves_no_fragment_behind() -> None:
    """The remainder of a mostly-fake line is fake too. "ST 12345" is part of
    the same invented address as the phrases removed around it."""
    cleaned, removed = strip_placeholder_values("123 Anywhere St., Any City, ST 12345")

    assert cleaned == ""
    assert "ST 12345" not in cleaned
    assert removed == ["123 Anywhere St., Any City, ST 12345"]


def test_a_placeholder_phone_takes_its_plus_with_it() -> None:
    cleaned, _ = strip_placeholder_values("+123-456-7890")
    assert cleaned == "", "a contact line reading just '+' reached the CV"


def test_a_placeholder_site_is_removed_like_the_placeholder_inbox() -> None:
    """Catching only the email host left the template's website printed on the
    finished CV as if it were the visitor's own."""
    cleaned, _ = strip_placeholder_values("www.reallygreatsite.com")
    assert cleaned == ""


def test_the_whole_canva_contact_block_comes_out_empty() -> None:
    """End to end on the block that produced the broken render."""
    block = (
        "123 Anywhere St., Any City, ST 12345\n"
        "+123-456-7890\n+123-456-7890\n"
        "hello@reallygreatsite.com\nwww.reallygreatsite.com"
    )
    cleaned, removed = strip_placeholder_values(block)

    assert cleaned.strip() == ""
    assert removed, "nothing was reported, so the model would not know to ask"


def test_a_real_contact_block_is_untouched() -> None:
    """The counterweight: none of the above may touch real details."""
    block = (
        "Casablanca, Morocco\n+212 6 23 84 25 35\n"
        "yassinsinif4@gmail.com\ngithub.com/Inssaya\nwww.yassine-sinif.vercel.app"
    )
    cleaned, removed = strip_placeholder_values(block)

    assert removed == []
    assert cleaned == block


def test_a_half_fake_entry_keeps_its_real_half() -> None:
    """Under the majority threshold, so the real qualification and year stay
    and only the invented school is blanked."""
    cleaned, _ = strip_placeholder_values("Bachelor's Degree | University of Example | 2023")

    assert "Bachelor's Degree" in cleaned
    assert "2023" in cleaned
    assert "University of Example" not in cleaned


def test_rendering_without_contact_still_works_but_says_so(session: Session) -> None:
    """The end state of the Isabel run: every contact detail on the uploaded
    template was fake, all of it was correctly discarded, and the CV rendered
    with nobody able to reply to it.

    Rendering must still succeed — the Build button is the guarantee that a
    visitor is never left with a finished draft and no file — but the model
    has to be told, or it announces a finished CV and never asks.
    """
    run_tool(session, "update_resume", {"field": "full_name", "content": "Isabel Schumacher"})
    run_tool(session, "update_resume", {"field": "headline", "content": "Sales Representative"})
    run_tool(
        session, "update_resume",
        {"field": "experience", "content": "Sales Agent | Ingoude Company"},
    )
    run_tool(
        session, "update_resume",
        {"field": "contact", "content": "hello@reallygreatsite.com\n+123-456-7890"},
    )
    assert session.draft.get("contact", "") == "", "fake contact details were kept"

    out = run_tool(session, "generate_resume", {})

    assert session.pdf is not None, "the Build escape hatch must never be blocked"
    assert "no contact details" in out


def test_a_cv_with_real_contact_gets_no_such_warning(session: Session) -> None:
    run_tool(session, "update_resume", {"field": "full_name", "content": "Yassine Sinif"})
    run_tool(
        session, "update_resume",
        {"field": "contact", "content": "yassinsinif4@gmail.com\n+212 6 23 84 25 35"},
    )
    run_tool(session, "update_resume", {"field": "skills", "content": "Python, SQL"})

    out = run_tool(session, "generate_resume", {})

    assert session.pdf is not None
    assert "no contact details" not in out


def test_genuine_prose_is_never_mistaken_for_lorem_ipsum() -> None:
    text = (
        "Built a maintenance intervention tracking and KPI platform, "
        "replacing a manual Excel workflow, and owned its technical "
        "specification end to end."
    )
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


def test_real_headings_and_content_survive() -> None:
    text = "EXPERIENCE\nIntern | Aptiv | Feb 2024\nSkills: Python, Java"
    cleaned, removed = strip_placeholder_values(text)
    assert removed == []
    assert cleaned == text


# ----------------------------------------------------- via update_resume

def test_update_resume_scrubs_template_contact(session: Session) -> None:
    out = run_tool(
        session,
        "update_resume",
        {"field": "contact", "content": "Email: kenza@example.com\nPhone: 123-456-7890"},
    )
    assert "example.com" not in session.draft.get("contact", "")
    assert "123-456-7890" not in session.draft.get("contact", "")
    assert "template placeholder" in out


def test_update_resume_keeps_a_real_email(session: Session) -> None:
    out = run_tool(
        session,
        "update_resume",
        {"field": "contact", "content": "kenza.mrabet0908@gmail.com"},
    )
    assert "kenza.mrabet0908@gmail.com" in session.draft["contact"]
    assert "template placeholder" not in out


def test_the_build_button_never_sees_a_template_placeholder(session: Session) -> None:
    run_tool(session, "update_resume", {"field": "full_name", "content": "Kenza Mrabet"})
    run_tool(session, "update_resume", {"field": "contact", "content": "kenza@example.com"})
    assert "example.com" not in session.draft.get("contact", "")
