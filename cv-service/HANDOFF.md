# CV Builder — handoff

Written for whoever picks this up next, human or AI. It covers what exists, the
decisions behind it and **why**, the bugs already found (so they are not
rediscovered or reintroduced), and what Phase 2 needs.

Read this before changing anything in `cv-service/`. Several things that look
like obvious simplifications are load-bearing, and the reasons are recorded here
rather than in commit messages.

---

## 1. What this is

A CV builder at `/cv-builder` on the portfolio. A visitor either uploads/pastes
an existing CV or is interviewed from scratch, and gets back a designed PDF that
reproduces Yassine's own CV design.

**Status: Phase 1 complete. Phase 2 auth complete; persistence not started.**
Every route now requires a signed-in Supabase user and a session belongs to
exactly one account (verified live: an unauthenticated request gets a real
401). The draft itself still lives in this process's memory, not Postgres —
that is the next thing to build, detailed in `NEXT.md` Step 2b/2c. 251 tests
pass, hermetic (auth is faked at the network boundary — see
`tests/conftest.py`, `tests/test_auth.py`).

```
portfolio (Vite → Vercel, static)
        │  HTTPS, bearer token
        ▼
cv-service (FastAPI + ReportLab → Render, Docker)
        │                    │
        ▼                    ▼
   OpenAI                Supabase (GET /auth/v1/user — verifies the
(gpt-4o-mini,              token; this service never touches the
 pooled keys)               database directly, see §8)
```

---

## 2. Architecture, and why it is this shape

### The split is forced, not a preference

The frontend is a static Vite build; Vercel does that well. The service **cannot**
go to Vercel: its functions are serverless and stateless, while the entire token
argument depends on the draft living in a long-lived process, and ReportLab needs
a real container. Hence Render.

### The draft lives in server state — this is the central decision

The obvious design has the model hold the CV in the conversation and re-emit it
whenever anything changes. That costs the whole document in input tokens every
turn *and* in output tokens on every edit, which is what drives people to a
frontier model.

Instead the draft is server state (`app/session.py`). The model patches one
section (`update_resume`), reads a summary when it needs to check itself
(`review_draft`), and renders from state (`generate_resume`). A one-line
correction late in a session costs a few dozen output tokens instead of a full
restatement. **That is why `gpt-4o-mini` is enough.**

Almost everything else follows from this:

* History can be **compacted**, because replaying the conversation that produced
  a section is redundant with reading the section.
* The **Build button** can bypass the model entirely — the PDF is a pure
  function of stored state.
* A session that runs out of budget still yields a CV.

### Cost model

Input tokens for a session are `Σ rₜ·(F + Hₜ)` — fixed prefix plus history, per
round. Unbounded, `Hₜ ≈ tΔ`, so total is **O(T²)**; a measured run went
3.3k → 6.0k → 9.2k with the deltas *widening*. `_compact()` in `app/agent.py`
caps `Hₜ`, making it **O(T)**.

The system prompt and tool schemas are held byte-identical and first, so
OpenAI's automatic prefix caching covers ~1.1k tokens of every request after the
first. The PDF-status note is **appended**, never prepended, for exactly this
reason.

### Extraction cascade — three outcomes, not two

`app/cv/quality.py` grades every upload:

| Grade | Meaning | Cost |
|---|---|---|
| `good` | headings and contact found | free |
| `partial` | text fine, structure lost | free — model maps it, told the labels are unreliable |
| `failed` | scan, or a font extracting as gibberish | one vision call |

**Measured on 20 real CVs: 20 `good`, 0 vision calls.** Only `failed` costs money.

> **On TF-IDF:** it was proposed and rejected, deliberately. TF-IDF ranks terms
> by rarity *across a corpus*; here there is one document, so there is no IDF to
> compute. Section segmentation is a parsing problem, and a CV containing
> `## Work Experience` is matched exactly, for free, with certainty. The real
> bug was a matcher that only accepted prefixes — one regex, not a dependency.

---

## 3. Files that matter

| File | Role |
|---|---|
| `app/main.py` | HTTP surface. Routes uploads by content; routes long pasted text through extraction. |
| `app/agent.py` | Tool loop, system prompt, compaction, vision recovery. |
| `app/session.py` | The draft, transcript, token meter. **Repairs mangled line breaks** on write. |
| `app/tools.py` | The three tools + the substance guard. |
| `app/llm.py` | OpenAI client, retry policy, truncation detection. |
| `app/keypool.py` | Key scheduler — 429 = wrong key, 401 = dead key. |
| `app/cv/builder.py` | Draft → PDF. Typography and placeholder scrubbing. |
| `app/cv/_cvmodern.py` | **Vendored renderer.** Measured geometry — do not "tidy". |
| `app/cv/_cvdesign.py` | Vendored classic template. |
| `app/cv/extract.py` | Text extraction + sectioning. |
| `app/cv/quality.py` | The grading gate. |
| `app/cv/photo.py` | Portrait in/out, EXIF handling. |

`cv/yassine-sinif-cv.tex` (repo root) is the **design authority** — colours and
geometry were sampled from the reference PDF into it. `tests/test_fidelity.py`
asserts the renderer still matches it.

---

## 4. Bugs already found and fixed — do not reintroduce

Each has a regression test. This list exists because most were invisible until
something real was run through the system.

**Extraction**
1. Phone regex dropped country codes: `+212 6 23 84 25 35` → `23 84 25 35`. Fixed-width digit groups cannot match the single-digit `6`.
2. Page-number stripping used unbounded `\d+`, which **deleted** phone numbers written without separators (`0623842535`).
3. The preamble — holding the name *and* the professional title — was collected then discarded, so every rebuild had a bare name.
4. `contact` was missing from the heading vocabulary entirely; the whole block was dropped, taking the city with it.
5. `Work Experience` was not recognised, because matching was exact-or-prefix and it does not *begin* with "experience". Probably the commonest heading in an English CV.
6. Markdown headings (`## Work Experience`, `**SKILLS**`) matched nothing.

**Model behaviour**
7. Announced "Your CV is ready!" having never called `generate_resume`. Happened **twice**. Fixed structurally: PDF status injected every turn, plus the model-free Build button.
8. Described an uploaded CV in prose without saving it, then rendered — a CV containing one line.
9. Invented `Bachelor's Degree … 2023` from "final year at EMSI".
10. Printed literal `Company Name` and `Location` — filling template slots with their own names.
11. Truncated at `max_tokens=700` with `finish_reason: length` after 7 tool calls; projects, certifications and interests were silently never written.

**Infrastructure**
12. Single-key pools got **zero** retries on a dropped connection (`min(4, len(pool))` = 1).
13. A 1-second cooldown surfaced as "Everyone's building CVs right now" — with one key there is nothing to fail over to.
14. Port 8000 hardcoded in the Dockerfile; Render assigns `$PORT` and health-checks *that*. **Would have failed the deploy with no useful error.**
15. Tests read the developer's real `.env`, so they passed or failed depending on local config.

**Data mangling**
16. The model double-escapes JSON, so `\n` arrived as two characters — every line-oriented field became one unbroken run that overflowed the page.
17. `contact` arrived pipe-separated (`A | B | C`) because the model borrowed the entry-header delimiter.
18. All-caps names (`YASSINE SINIF`) printed shouting, because designed CVs store the name the way they render it.

**Auth — not bugs, but both cost real time discovering live and are worth knowing before you hit them again**
19. `<img src>` and `<a href>` cannot carry a custom `Authorization` header — a plain browser navigation just drops it. The PDF download and photo thumbnail both had to switch from pointing straight at the endpoint to fetching it with `fetch()` + the bearer header and handing the browser a local `blob:` URL instead (`downloadResume`, `fetchPhotoUrl` in `src/lib/resume/api.ts`).
20. Supabase's own email deliverability check rejects reserved test domains (`@example.com`) with `email_address_invalid` before your code even runs — not a bug, but a wasted debugging session if you don't know it. Use a real-shaped domain (`@gmail.com` works fine as a *format*, even for an address nobody reads) when testing signup by hand.
21. Supabase's **built-in mailer rate-limits hard** — confirmed live: a real signup attempt hit `over_email_send_rate_limit` on the second or third try. This is why 2a in `NEXT.md` calls out Brevo SMTP as still outstanding, not optional polish.

---

## 5. Things that look wrong but are deliberate

* **One worker, one instance.** Sessions and the key pool are per-process. A second would strand drafts on the wrong machine and double effective rate limits. Auth is now verified against Supabase (network call, stateless), but the draft itself is not yet in Postgres — so this constraint has not gone away, it has just moved: it now applies to session state specifically, not "everything", and Step 2b/2c in `NEXT.md` is what removes it.
* **Auth verifies against a live Supabase endpoint, not a locally-checked JWT.** `GET /auth/v1/user` per request (cached 30s) rather than decoding the token with a shared secret — trades a network round trip for zero secret management and instant revocation. See `app/auth.py`'s docstring.
* **This service never holds the Supabase `service_role` key.** Only the anon key, same as the frontend. It is enough because verification goes through Supabase's own endpoint rather than a direct database read — see the point above. When persistence lands (`NEXT.md` 2c), it stays this way: writes go through PostgREST authenticated as the visitor's own token, and RLS enforces isolation at the database, not service_role bypassing it.
* **Fonts vendored in `app/cv/fonts/`,** not installed from the system. The old `/usr/share/fonts` path failed silently everywhere but Linux, falling back to Helvetica/Times. The Docker build now *fails* if they do not load.
* **pypdf, not PyMuPDF.** PyMuPDF is better but AGPL: hosting it obliges publishing the service's source. This is intended to become paid.
* **`_cvmodern.py` / `_cvdesign.py` are vendored verbatim.** Geometry was measured off reference PDFs at 110dpi. Only two deliberate edits exist (font registration, employer weight), both tested.
* **Placeholder scrubbing is whole-field only.** Substring matching would kill "Location Services Ltd".
* **`MAX_SESSION_TOKENS = 60000`,** not 30k. Measured: ~12.7k by upload, ~34.7k by interview. 30k cuts a real interview off partway — draft written, no PDF.
* **`llm_max_tokens = 2000`.** A ceiling, not a charge; 700 was costing whole sections.

---

## 6. Running it

```bash
# backend
cd cv-service && docker compose up --build          # :8000
# or: .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000

# frontend (repo root)
npm run dev                                          # :8080 → /cv-builder

cd cv-service && .venv/Scripts/python -m pytest -q  # 251 tests, no network needed
```

Python **3.13** — 3.14 has no wheels for pydantic-core/pillow and tries to
compile Rust.

`cv-service/.env` holds the key and is gitignored. `.env.example` documents
every variable, including `SUPABASE_URL`/`SUPABASE_ANON_KEY` — the same values
the frontend's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` use, not new ones to
generate.

### Deploying

Frontend: Vercel (already). Set `VITE_RESUME_API_URL` to the Render URL **and
redeploy** — Vite inlines env vars at build time.

Backend: Render → New → Blueprint → this repo. `render.yaml` is committed; it
prompts for `OPENAI_API_KEY` and `ALLOWED_ORIGINS` (exact origin, no trailing
slash) and pre-fills `SUPABASE_URL`/`SUPABASE_ANON_KEY` — safe to commit, they
already ship in the frontend's browser bundle (see `render.yaml`'s comment).

Every route requiring sign-in means the deploy checklist now includes
Supabase, not just Render/Vercel: Authentication → Providers → Email must be
on (it is, on the live project), and Brevo SMTP should be configured before
directing real traffic at it — see the bug list above, item 21.

**Free tier caveat:** Render sleeps after 15 min idle. ~50s cold start, and
sleeping **wipes every in-flight draft** because sessions are in-process. This is
part of why the Build button matters. $7/mo Starter removes both; Phase 2
removes the second permanently.

---

## 7. Known-imperfect, not yet fixed

* **Skill invention on request.** Asked to "add some skills that fit", it does. Defensible, but the visitor may not realise they are now claiming them.
* Projects render flat when pasted with `###` sub-headings.
* Soft skills sometimes merge into the wrong skills group.
* An all-caps name is title-cased, so `MCDONALD` → `Mcdonald`.

---

## 8. Phase 2 — the plan

> **The actionable version is `NEXT.md`** — schema, files to touch, and a
> "done when" for each step. What follows is the shape and the reasoning; go
> there to actually work.

Decided already: **Supabase Auth** (not a port of `projectAntiv`'s FastAPI auth,
which is code-based while the requirement is verification *links*, and needs a
persistent server). Supabase is already wired into the portfolio and does links,
JWT, and reset natively, with Brevo as custom SMTP.

Order matters — each step depends on the one before:

1. **Supabase JWT verification in front of every route in `main.py`.** The module is already shaped for this: every handler takes a session and nothing assumes anonymity.
2. **Move sessions and transcripts into Postgres.** This is what makes >1 instance safe, survives Render's sleep, and creates the training corpus. `Session` is a plain dataclass specifically so it maps to a row.
3. **Per-user quota** using `session.usage` (already accumulated and returned on every response).
4. **DB-backed rate limiting.** Port the *algorithm* from `projectAntiv/backend/app/ratelimit.py`, not the storage — it is an in-process sliding window and documents that it only works for one worker.
5. **Admin tracking pages** — registered users, sessions, full transcripts. `/ops/keys` already exists and needs putting behind admin auth at this point.
6. **Device fingerprint** at register and each login, for blocking abuse.
7. **Terms popup** on first sign-in.

Reusable from `projectAntiv` (`C:/Users/yassi/projectAntiv`): `mailer.py`'s Brevo
HTTPS transport (SMTP ports are blocked on most managed hosts — the errno 101
explanation there is worth reading), the rate-limit rules, and the JWT patterns.

**Do not** port `codes.py` — it issues 8-digit codes, and the requirement is
verification links, which Supabase does natively.

---

## 9. How to work on this

* **Run the real thing.** Every bug in §4 that mattered was found by running a real CV through Docker, not by reading code. The test suite passes on all of them *now*; it did not catch them first.
* **Prefer a deterministic fix over a prompt fix.** Prompt wording failed twice on the "CV is ready" lie. The scrubber, the substance guard and the Build button cannot be talked out of it.
* **When the model misbehaves, ask whether the interface invited it.** "Tell me what you found" produced prose instead of saved sections. `Role | Employer | Dates | Location` invited filling every slot.
* **Test with real files.** `C:/Users/yassi/Downloads/*CV*.pdf` is a corpus of ~19; `tests/data/pasted_cv.md` is the Markdown case.
* **Never commit `cv-service/.env`.** It holds live keys and is gitignored twice.
