"""Regenerate py.json — the parser output the TypeScript is diffed against.

    cd cv-service && python3 ../src/lib/portfolio/__tests__/dump_python_fixtures.py \
        > ../src/lib/portfolio/__tests__/py.json

Run this after changing any parser in builder.py or _cvdesign.py. If
__parity.test.ts then fails, the portfolio and the PDF have started reading
the same draft differently — which is silent in production: nothing throws,
the published page simply stops matching the document the visitor downloads.

The cases below are not arbitrary. Each divergence a review found is
represented: the "Company Name"/"Location" placeholders, "Arabic | Native",
"2024 - 2025 - 1 month", and a bare em dash with no spaces around it.
"""
import json, sys
sys.path.insert(0, ".")
from app.cv.builder import _lines_of, _skill_groups, _split_lead, _as_pair, _polish_entries
from app.cv._cvdesign import parse_entries

ENTRIES = [
  "AI Data Engineer Intern | Aptiv | Jun 2026 - Present | Tangier, Morocco\n- Built a KPI platform.\n- Designed a module.",
  "Manager | Company Name | 2023 | Location",
  "Manager | Location Services Ltd | 2023",
  "Engineering Degree | EMSI, Casablanca | 2022\nSpecialization: AI & Data Science",
  "Intern | Web Agency | 2024 - 2025 - 1 month",
  "Role A | Org A | 2024\n- one\nRole B | Org B | 2025\n- two",
  "- an orphan bullet",
  "x"*120 + " | Org | 2024",
  "",
]
FLAT = ["N/A\nCity\n-\nReal thing", "- one\n\n• two\n  * three  ", "- • Nexora AI", ""]
SKILLS = ["Languages & Frameworks: Python, Django\nData & ML: pandas, NumPy",
          "Data: PostgreSQL, Kafka\nETL, Airflow", "Python, SQL"]
LEADS = ["Nexora AI — Call-center SaaS", "Nexora AI - Call-center SaaS",
         "Nexora AI—Call-center SaaS", "Call-center tooling", "Just a project name"]
PAIRS = ["AWS Solutions Architect | Amazon | 2024", "Arabic | Native", "Arabic - Native"]

def entry_json(e):
    return {"title": e.title, "org": e.org, "dates": e.dates, "meta": e.meta,
            "bullets": list(e.bullets), "notes": list(e.notes)}

print(json.dumps({
  "entries": [[entry_json(e) for e in _polish_entries(parse_entries(b))] for b in ENTRIES],
  "flat": [_lines_of(b) for b in FLAT],
  "skills": [_skill_groups(b) for b in SKILLS],
  "leads": [list(_split_lead(l)) for l in LEADS],
  "pairs": [[_as_pair(x) for x in _lines_of(b)] for b in PAIRS],
}, ensure_ascii=False))
