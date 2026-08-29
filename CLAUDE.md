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
miss, so a session survives a restart (`app/session.py`). 480 tests pass.

Signing up is no longer the first thing a visitor meets: with no session they
are signed in **anonymously** and build a CV straight away, and the account
becomes permanent — same id, so all their work carries over — only when they
choose to keep it. Two rules that look like details and are not: a guest must
be *converted* (`updateUser`) and never re-registered with `signUp`, which
would abandon everything they built; and a rate limit keyed on a guest's
account is not a limit, because the account is free to mint — anonymous
callers are rationed by IP instead — and by how fast they may *open*
conversations, without which a per-conversation token ceiling bounds nothing.

The ceilings have different shapes on purpose: a guest is rationed per
conversation (80k) **and** per day per address (200k), an account per rolling
week across every conversation (1M) with no per-session cap at all. The daily
guest figure is not optional decoration — without it the per-conversation one
bounds a single conversation and nothing else, since the next starts at zero.
The two were also 80k-per-conversation against 300k-per-*week*, which meant
signing up reduced what a visitor could spend; `tests/test_limits_are_coherent.py`
now compares them so that cannot silently return. The weekly figure comes from
the `cv_usage` ledger in Postgres, because a week has to survive the restarts
Render does routinely.

One more thing that changed under the surface: `authenticated` in RLS no longer
means "signed up", it means *anyone who opened the site*. Every policy must key
on `is_admin()` or `auth.uid() = user_id`; the schema workflow fails the build
if one does not. `HANDOFF.md` §10 has the whole picture; `app/quota.py` owns the
limits and `src/lib/cv/guest.ts` owns conversion.

Quick orientation:

- The CV draft lives in **server state**, not in the conversation. That single
  decision is what keeps every request small, why history can be compacted, and
  why the "Build my CV" button can bypass the model entirely. It once justified
  a *small* model too; `LLM_MODEL` now defaults to `gpt-4o` because judging
  "these are template placeholders, not your details" is where a small one
  broke. See `HANDOFF.md` §2.
- **An upload is routed by what it contains, never by its extension.** An image
  may be a portrait *or* a photographed/screenshotted CV, and a PDF may be
  readable, unreadable, or readable-but-scrambled. `app/main.py`'s `/upload`
  cascade and `app/cv/layout.py` document the whole decision tree; the short
  version is that anything the deterministic tier cannot be trusted on gets
  rasterised (`render_pdf_page`) and read by vision rather than guessed at.
- `app/cv/_cvmodern.py` and `_cvdesign.py` are **vendored renderers** with
  geometry measured off a reference PDF. Do not tidy them.
- `cv/yassine-sinif-cv.tex` is the design authority. `tests/test_fidelity.py`
  asserts the renderer still matches it — but only its fonts, palette and two
  geometry constants, *not* a single vertical measurement. `tests/test_layout.py`
  covers the rest: the modern layout is fitted to the page within a bounded
  range (`_fit_modern`), and the first test there pins the reference CV to the
  designed spacing, because nothing else would notice it moving.

## Commands

```bash
# portfolio
npm run dev            # :8080
npm test               # vitest
npm run build

# cv-service (from cv-service/)
docker compose up --build                            # :8000
.venv/Scripts/python -m pytest -q                    # 480 tests, no network
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Python **3.13** for `cv-service` — 3.14 has no wheels for pydantic-core/pillow.

Point the frontend at the service with `VITE_RESUME_API_URL` in `.env.local`
(`http://localhost:8000` locally). Vite inlines env vars at build time, so
changing one needs a rebuild.

## Database schema

`supabase/setup.sql` is the whole schema — one idempotent file. Do not run it
by hand: `.github/workflows/supabase-schema.yml` applies it on every push to
`main` that touches it, and fails the build if the RLS verify finds an ungated
write policy. It needs one repository secret, `SUPABASE_DB_URL` (the Supabase
**session pooler** URI — the direct `db.<ref>.supabase.co` one is IPv6-only
and unreachable from GitHub's runners).

Anything the frontend reads from a new column or function should degrade
gracefully until that workflow has run — see `mapAppUser` in
`src/lib/admin-data.ts`, which falls back to the email test when
`is_guest` is absent.

`supabase/test_portfolio_privacy.sql` asserts the publishing rules against a
real database. Run it after touching anything in the published-portfolio
section of the schema — it rolls back, so it is safe anywhere.

## The portfolio builder

A visitor who has built a CV can publish it as a public page at
`/p/<session id>`. It is a **second renderer over the same draft**, not a
copy: editing the CV edits the live page, and `src/lib/portfolio/parse.ts`
mirrors the Python parsers so the page and the PDF read one source
identically.

Two things here are load-bearing and easy to "simplify" into a leak:

- **The public surface is a function, not a policy.** RLS grants whole rows,
  and a `cv_sessions` row holds the phone number, the address, token counts
  and `user_id`. A "public read where published" policy would publish
  somebody's mobile the moment they shared a link, however carefully the page
  avoided rendering it. `public_portfolio()` chooses *columns*, which is the
  granularity the promise needs, and the phone is stripped **there** — where
  the data leaves the server — so the rule holds for anyone reading the API
  and not only for people looking at our page.
- **It does not go through cv-service.** That service never holds
  `service_role` (see `app/db.py`), so it could not read a stranger's row
  anyway — and it sleeps on Render's free tier. A portfolio link somebody put
  on their CV cannot open with a cold start in front of it.

Publishing requires a real account, enforced in `set_portfolio_published()`
rather than in the UI: guests are `authenticated` too, and
`purge_stale_guest_accounts()` deletes idle guest accounts and cascades to
`cv_sessions`, so a guest's public URL is guaranteed to break later.

**`/p/*` is served `portfolio.html`, not `index.html`** — a second Vite entry
point, routed by `vercel.json`. `index.html` is 660 lines of *this site's* SEO:
the owner's name in the title, his face in `og:image`, and five blocks of
JSON-LD declaring the page to be about him. Serving that for a stranger's
portfolio put his name and photograph on their LinkedIn/WhatsApp share card
and told search engines their page was his. None of it is fixable from React —
those crawlers do not run JavaScript, so the tags have to be right in the HTML
that is served. `portfolio.html` is deliberately minimal rather than a copy, so
there is nothing to keep in sync and nothing personal to leak. Per-portfolio
tags would need the route rendered server-side; that is still open.

**`src/lib/portfolio/parse.ts` must agree with the Python parsers**
(`builder.py`, `_cvdesign.py`) — the page and the PDF read one draft, so a
difference does not throw, it silently publishes something other than the
document the visitor downloads. It drifted once, in four places.
`__tests__/__parity.test.ts` diffs the TypeScript against real Python output;
regenerate the fixture with `__tests__/dump_python_fixtures.py` after touching
either side.

Portraits are never persisted, so a published page has no photo and the hero
is designed around that rather than showing a placeholder. Themes live in
`src/lib/portfolio/themes.ts` and are picked by the person — nothing infers
anything about them.

## Secrets

`.env.local` and `cv-service/.env` hold live keys and are gitignored. Never
commit them, and never add a `VITE_` prefix to a secret — that ships it to the
browser bundle.
