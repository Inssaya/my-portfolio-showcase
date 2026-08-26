# Repository guide

Two things live here:

1. **The portfolio** — Vite + React + TypeScript, deployed to Vercel. Content is
   editable through `/admin`, backed by Supabase.
2. **The CV builder** (`cv-service/`) — a FastAPI + ReportLab service that
   interviews a visitor and renders them a designed CV. Deployed separately to
   Render, because it needs a long-lived container.

## Before touching `cv-service/`

Two documents, and they do different jobs:

- **`cv-service/HANDOFF.md`** — what exists and *why*. Architecture, ~18 bugs
  already found and fixed (with regression tests), and the things that look like
  obvious simplifications but are load-bearing. Several decisions are
  counter-intuitive and re-deriving them costs a day. **Read this first.**
- **`cv-service/NEXT.md`** — the work queue. Each step has files to touch,
  schema where relevant, a "done when", and the traps already known. **Start
  here if you are picking up work.**

Phase 1 is complete and tested. Phase 2 auth is done — every route requires a
signed-in Supabase user (`app/auth.py`, verified live: unauthenticated
requests get a real 401). Session **persistence** is done too: `app/db.py`
writes sessions and transcripts through to Postgres and reads them back on a
miss, so a session survives a restart (`app/session.py`). 357 tests pass.

Quick orientation:

- The CV draft lives in **server state**, not in the conversation. That single
  decision is why a small model suffices, why history can be compacted, and why
  the "Build my CV" button can bypass the model entirely.
- **An upload is routed by what it contains, never by its extension.** An image
  may be a portrait *or* a photographed/screenshotted CV, and a PDF may be
  readable, unreadable, or readable-but-scrambled. `app/main.py`'s `/upload`
  cascade and `app/cv/layout.py` document the whole decision tree; the short
  version is that anything the deterministic tier cannot be trusted on gets
  rasterised (`render_pdf_page`) and read by vision rather than guessed at.
- `app/cv/_cvmodern.py` and `_cvdesign.py` are **vendored renderers** with
  geometry measured off a reference PDF. Do not tidy them.
- `cv/yassine-sinif-cv.tex` is the design authority. `tests/test_fidelity.py`
  asserts the renderer still matches it.

## Commands

```bash
# portfolio
npm run dev            # :8080
npm test               # vitest
npm run build

# cv-service (from cv-service/)
docker compose up --build                            # :8000
.venv/Scripts/python -m pytest -q                    # 251 tests, no network
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Python **3.13** for `cv-service` — 3.14 has no wheels for pydantic-core/pillow.

Point the frontend at the service with `VITE_RESUME_API_URL` in `.env.local`
(`http://localhost:8000` locally). Vite inlines env vars at build time, so
changing one needs a rebuild.

## Secrets

`.env.local` and `cv-service/.env` hold live keys and are gitignored. Never
commit them, and never add a `VITE_` prefix to a secret — that ships it to the
browser bundle.
