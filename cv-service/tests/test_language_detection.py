"""The printed headings must match the language the CV is written in.

A real French CV came back with PROFILE, TECHNICAL SKILLS and EDUCATION
printed above entirely French prose. The renderer has had PROFIL, COMPÉTENCES
TECHNIQUES and FORMATION all along; nothing chose them, because `language`
defaulted to "en" and the only thing that could change it was the model
remembering to.
"""
from __future__ import annotations

import io

import pytest
from pypdf import PdfReader

from app.cv.builder import build_resume
from app.cv.language import detect_draft_language, detect_language
from app.session import store
from app.tools import run_tool

FRENCH_DRAFT = {
    "full_name": "Yassine Amchi",
    "headline": "Technicien Réseaux et Systèmes",
    "profile": (
        "Technicien Spécialisé en Infrastructure Digitale, diplômé de l'OFPPT. "
        "Compétences pratiques en administration systèmes et en cybersécurité."
    ),
    "experience": (
        "Stagiaire - Cybersécurité | Faculté des Lettres Dhar El Mahraz | Mars 2026\n"
        "- Réalisation de scans réseau avec Nmap et analyse des services."
    ),
    "education": "Technicien Spécialisé | OFPPT / IFMOTICA, Fès | 2026",
    "skills": "Réseaux : TCP/IP, VLAN",
}

ENGLISH_DRAFT = {
    "full_name": "Yassine Sinif",
    "headline": "AI & Data Engineering",
    "profile": (
        "Engineering student in Artificial Intelligence and Data Science, "
        "with a strong interest in building AI-powered solutions."
    ),
    "experience": (
        "AI Data Engineer Intern | Aptiv | Jun 2026 | Tangier\n"
        "- Built a maintenance tracking platform, replacing a manual workflow."
    ),
    "education": "Engineering Degree | EMSI, Casablanca | 2022",
}


def _headings(pdf_bytes: bytes) -> str:
    return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(pdf_bytes)).pages)


def test_detects_the_language_of_real_drafts() -> None:
    assert detect_draft_language(FRENCH_DRAFT) == "fr"
    assert detect_draft_language(ENGLISH_DRAFT) == "en"


def test_technology_names_do_not_decide_the_language() -> None:
    """The reason this scores function words and not content. A Moroccan
    networks CV is full of English product names while its prose is French;
    counting those would call every such CV English."""
    assert detect_language(
        "J'ai utilisé Burp Suite et Active Directory pour analyser le réseau"
    ) == "fr"
    assert detect_language(
        "I used Wazuh and Nmap to analyse the network"
    ) == "en"
    # Nothing but proper nouns decides nothing, and falls back to English.
    assert detect_language("Python, Docker, Kubernetes, Active Directory") == "en"


def test_an_empty_draft_falls_back_to_english() -> None:
    assert detect_draft_language({}) == "en"


@pytest.mark.parametrize("style", ["modern", "classic"])
def test_a_french_draft_prints_french_headings(style: str) -> None:
    """End to end through the tool the model actually calls, with no language
    argument — which is exactly how the broken render happened."""
    session = store.create(user_id="u1")
    session.style = style
    for field, content in FRENCH_DRAFT.items():
        session.set_field(field, content)

    run_tool(session, "generate_resume", {})
    text = _headings(session.pdf)

    assert "FORMATION" in text, f"{style} printed English headings on a French CV"
    assert "EDUCATION" not in text
    assert session.language == "fr"


@pytest.mark.parametrize("style", ["modern", "classic"])
def test_an_english_draft_is_unaffected(style: str) -> None:
    session = store.create(user_id="u1")
    session.style = style
    for field, content in ENGLISH_DRAFT.items():
        session.set_field(field, content)

    run_tool(session, "generate_resume", {})
    text = _headings(session.pdf)

    assert "EDUCATION" in text
    assert "FORMATION" not in text


def test_an_explicit_choice_still_wins() -> None:
    """Detection is the default, not a policy: somebody may genuinely want
    English headings on a French CV, and asking for them must work."""
    session = store.create(user_id="u1")
    for field, content in FRENCH_DRAFT.items():
        session.set_field(field, content)

    run_tool(session, "generate_resume", {"language": "en"})

    assert session.language == "en"
    assert "EDUCATION" in _headings(session.pdf)
