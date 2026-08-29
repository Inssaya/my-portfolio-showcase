"""The draft behind `cv/yassine-sinif-cv.pdf`, the renderer's design authority.

Transcribed from the reference PDF's own text. It exists so fidelity can be
asserted against a *render* and not only against constants: `test_fidelity.py`
pins fonts, palette and two geometry values, none of which would notice the
vertical rhythm moving. A CV of this density is what the measured spacing was
measured for, so it is the one draft that must come out at exactly the
designed rhythm — see `test_layout.py`.
"""
from __future__ import annotations

REFERENCE_DRAFT = {
    "full_name": "Yassine Sinif",
    "headline": "AI & Data Engineering",
    "contact": (
        "Casablanca, Morocco\n+212 6 23 84 25 35\nyassinsinif4@gmail.com\n"
        "github.com/Inssaya\nsinif-yassine.vercel.app"
    ),
    "profile": (
        "Engineering student in Artificial Intelligence and Data Science, entering "
        "my final year this October, with a strong interest in building AI-powered "
        "and full-stack solutions. I am seeking a 6-month final-year internship "
        "(PFE) starting February 2027, with the opportunity to transition into a "
        "full-time role after graduation."
    ),
    "experience": (
        "AI Data Engineer Intern | Aptiv | Jun 2026 - Present | "
        "Tangier, Morocco - Maintenance Department\n"
        "- Built a maintenance intervention tracking and KPI platform, replacing a "
        "manual Excel workflow, and owned its technical specification end to end.\n"
        "- Designed a predictive maintenance module ranking machines by failure "
        "risk, combining statistical reliability modeling with an ML classifier.\n"
        "- Built an agentic RAG assistant calling retrieval and clustering tools "
        "over past maintenance reports to surface similar cases and suggest likely "
        "causes.\n"
        "- Validated the full pipeline on synthetic data before touching "
        "production, keeping sensitive data on-premise.\n"
        "Software Engineering Intern | Web Agency | 2024 - 2025 - 1 month | "
        "Casablanca, Morocco\n"
        "- Developed a Laravel chatbot with database information retrieval.\n"
        "- Built an automated PDF generation tool."
    ),
    "education": (
        "Engineering Degree, Computer Science & Networks | EMSI, Casablanca | 2022\n"
        "Specialization: AI & Data Science"
    ),
    "skills": (
        "Languages & Frameworks: Python, Django, FastAPI, React, React Native, "
        "JavaScript, TypeScript, Java, C++, C#, ASP.NET\n"
        "Data & ML: pandas, NumPy, scikit-learn, PyTorch, feature engineering, "
        "model evaluation, backtesting\n"
        "LLM & RAG: LangChain, LangGraph, RAG pipelines, embeddings, ChromaDB, "
        "Ollama, prompt engineering\n"
        "Data Engineering: PostgreSQL, SQL Server, SSIS, MySQL, MongoDB, Neo4j, "
        "Cassandra, Hadoop, ETL, Kafka, data warehousing\n"
        "DevOps & Tools: Docker, Git, CI/CD, Linux, REST APIs\n"
        "BI & Cloud: Power BI, Tableau"
    ),
    "languages": "Arabic - Native\nFrench - B2\nEnglish - B2\nSpanish - A2",
    "projects": (
        "Nexora AI - Call-center SaaS with on-premise RAG for automated ticket "
        "handling. FastAPI, React, TypeScript, PostgreSQL, ChromaDB, "
        "sentence-transformers, Ollama.\n"
        "Stock market analytics platform - Real-time streaming ingestion and "
        "processing. Python, Kafka, MySQL, Docker, Streamlit.\n"
        "Medical multi-agent system - Coordinated LLM agents for clinical "
        "workflows. LangGraph, LangChain, FastAPI, MCP, React, Flutter.\n"
        "Plagiarism detection system - Semantic similarity scoring with TF-IDF "
        "and SBERT. Python, Django.\n"
        "Management applications - POS, gym and optics desktop apps with NFC, "
        "facial recognition, QR. Java, JavaFX, MySQL."
    ),
    "certifications": (
        "DeepLearning.AI Data Engineering Professional Certificate - "
        "DeepLearning.AI & AWS, in progress, 2026\n"
        "Python for Data Science, AI & Development - IBM\n"
        "Software Engineering: Design and Project Management - HKUST\n"
        "La recherche documentaire - École Polytechnique"
    ),
}
