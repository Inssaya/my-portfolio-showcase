# CV Builder — handoff

Written for whoever picks this up next, human or AI. It covers what exists, the
decisions behind it and **why**, the bugs already found (so they are not
rediscovered or reintroduced), and what Phase 2 needs.

**If you are touching anything to do with accounts, read §10 first.** Most
visitors are now *guests* — real Supabase accounts with no email — and two of
the rules around them are the kind that look like details and are not: a guest
must be converted rather than signed up, and a limit keyed on their account is
not a limit at all.

Read this before changing anything in `cv-service/`. Several things that look
like obvious simplifications are load-bearing, and the reasons are recorded here
rather than in commit messages.

---

## 1. What this is

A CV builder at `/cv-builder` on the portfolio. A visitor either uploads/pastes
an existing CV or is interviewed from scratch, and gets back a designed PDF that
reproduces Yassine's own CV design.

**Status: Phase 1 complete. Phase 2 auth and persistence both built.** Every
route requires a signed-in Supabase user and a session belongs to exactly one
account (verified live: an unauthenticated request gets a real 401). A
session's draft and transcript now write through to Postgres and read back on
a miss (`app/db.py`, `NEXT.md` Step 2b/2c); the schema it needs has been run
against the live project (`supabase/setup.sql` — one file, idempotent, and now
the only SQL in the repo). A visitor no longer has to sign up first: with no
session they are signed in anonymously and build a CV straight away, and the
account becomes permanent — keeping the same id, and so all their work — only
when they choose to save it (**§10**). 393 tests pass, hermetic (auth is faked at the network boundary, and a new
autouse fixture keeps Postgres persistence off by default too — see
`tests/conftest.py`, `tests/test_auth.py`, `tests/test_persistence.py`).

```
portfolio (Vite → Vercel, static)
        │  HTTPS, bearer token
        ▼
cv-service (FastAPI + ReportLab → Render, Docker)
        │                    │
        ▼                    ▼
   OpenAI                Supabase (GET /auth/v1/user — verifies the
(gpt-4o,                   token; this service never touches the
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
restatement. **That is what keeps every request small, whatever model runs.**

The default was `gpt-4o-mini` on exactly that argument, and for the mechanical
work it holds. Judgement is where it broke: handed an unedited template it
saved "123 Anywhere St., Any City", "hello@reallygreatsite.com" and four Lorem
Ipsum job descriptions as the visitor's own details, where a frontier model
reads the same page and asks for the real ones. `cv/verify.py` exists to catch
that deterministically and does catch the placeholders we can enumerate — it
cannot catch the ones nobody has seen yet. The default is now `gpt-4o`;
`LLM_MODEL` still switches it back where cost outweighs judgement.

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

#### A fourth outcome: readable, but in the wrong order

The table above assumes text that comes out is text that can be trusted. Two
real uploads showed that is not so. `pypdf` emits text in *drawing* order, and
a sidebar template draws every section **label** before any section **body** —
so the splitter produced four confidently-labelled sections holding entirely
different parts of the page, with `contact` containing the single word
"Language". That grades `good`. It is the most dangerous input the model can
get: it looks parsed, so nothing downstream doubts it.

Three defences now sit in front of that, in the order they fire:

1. **Reading-order reconstruction** (`app/cv/layout.py`). Positions come from
   `extract_text(visitor_text=…)`, columns are found by locating a real
   gutter, and each column is emitted whole. This is *never trusted blindly* —
   it is scored against the naive ordering on "headings that own a body", and
   must also preserve the original word count, so a reconstruction that drops
   or duplicates content loses to the text we already had.
2. **Coherence check** (`app/cv/extract.py`). If a section plainly contradicts
   its own heading — `contact` with no email, phone or link — the entire split
   is discarded rather than passed off as correct, and the document is handed
   over unsplit with a note saying so. Sets `layout_unreliable`.
3. **Vision escalation** (`app/main.py`). `layout_unreliable` now reaches
   vision just like `failed` does. A scrambled CV is a *text* PDF with no
   embedded image, so `photo.render_pdf_page` rasterises the page (pypdfium2,
   self-contained wheels) to give vision something to read.

**Uploads are routed by content, never by extension.** An image used to go
straight down the "this is a portrait" branch, so anyone who photographed or
screenshotted their CV — the only option for a paper one — had it filed as
their headshot and the CV never read, with a cheerful "Photo added" in reply.
`agent.read_uploaded_image` looks at it and either transcribes a document or
returns `NOT_A_DOCUMENT`. A local ink/whitespace heuristic exists
(`photo.looks_like_a_document`) and is **off** (`Settings.cheap_image_routing`):
it is a pure cost lever and it is measurably wrong on dark-theme and
coloured-sidebar CVs — including this service's own `modern` style — which it
reads as "not a document". `tests/test_image_cv_upload.py` pins that.

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
| `app/cv/layout.py` | Reading-order reconstruction for two-column PDFs. Self-scoring: it only wins if it reads better *and* preserves the text. |
| `app/cv/photo.py` | Portrait extraction, plus `render_pdf_page` (rasterise for vision) and `looks_like_a_document` (the off-by-default cost gate). |
| `app/cv/verify.py` | Write-time scrubbing of invented years and template placeholders. |
| `app/cv/_cvbold.py` | Third template: single column, photo masthead, coloured rules. |
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

* **Still one worker, one instance — but narrower than before.** A session's draft/transcript now survives this process dying (`app/db.py` writes through to Postgres, `app/session.py` reads back on a miss). What still doesn't scale past one instance: the key pool and the rate limiter, both still per-process in-memory state with no Postgres backing (`NEXT.md` Step 4's still-open DB-backed half). See `render.yaml`'s `numInstances` comment, which was stale about this and has been corrected.
* **Auth verifies against a live Supabase endpoint, not a locally-checked JWT.** `GET /auth/v1/user` per request (cached 30s) rather than decoding the token with a shared secret — trades a network round trip for zero secret management and instant revocation. See `app/auth.py`'s docstring.
* **This service never holds the Supabase `service_role` key.** Only the anon key, same as the frontend. Persistence (`app/db.py`) keeps the same boundary: every read/write goes through PostgREST authenticated as the visitor's own access token, and RLS (`supabase/schema.sql`'s `cv_sessions`/`cv_messages` policies) enforces per-user isolation at the database — this service still never needs service_role.
* **Photo and PDF bytes are not persisted.** `Session.to_row()` sends only `draft`/`style`/`language`/token counts/`pdf_version` — a `bytea` column or a Storage bucket both work, but a restored session losing its photo (re-upload) or its rendered PDF (one click on Build regenerates it from the restored draft) is a small, honest trade against sending binary payloads on every turn. Revisit only if that trade stops feeling small.
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

cd cv-service && .venv/Scripts/python -m pytest -q  # 368 tests, no network needed
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

---

## 10. Guests — letting people in before they sign up

The drop-off was at email verification. Visitors were being asked to leave the
page, open their inbox and click a link for a product they had not yet seen do
anything. Most did not come back.

So `/cv-builder` no longer turns anyone away. A visitor with no session is
signed in **anonymously** (`signInAnonymously()`, in
`src/components/cv/CvProtectedRoute.tsx`) and starts building immediately. The
account only becomes permanent when they have a finished CV in hand and choose
to keep it (`CvSaveWorkPrompt`).

### Why anonymous auth and not a device fingerprint

A fingerprint was the other candidate and it is worse on every axis that
matters here:

* **Fingerprints collide.** Two visitors on the same phone model, browser and
  OS can hash to the same value. Here that means opening the app and finding
  *somebody else's* CV — with their name, phone number and address in it.
* **They are unstable.** A browser update changes the fingerprint and the
  visitor silently loses their account.
* **They are identification without consent**, which puts them under
  GDPR/ePrivacy in the same bracket as cookies — for a feature whose entire
  purpose is to avoid a consent step.

Anonymous sign-in has none of those. It mints a *real* Supabase account: a
unique id and a valid JWT, with no email. That is why the backend needed no
new concept of a guest to be safe — session ownership, the RLS policies and
the per-user checks all key on the id, exactly as before.

### Converting keeps the id — this is the load-bearing part

`updateUser({ email, password })` attaches credentials to the account that
already exists. **The user id does not change**, so every CV, session,
transcript and upload built as a guest stays attached with nothing to migrate
and no "claim your data" step.

The corollary is a trap worth stating plainly: a guest must never be sent
through `signUp()`. That mints a *second* account and swaps the session to it,
silently abandoning everything they built. `src/pages/cv/CvSignUp.tsx`
branches on this — guests convert, everyone else signs up — and
`src/lib/cv/guest.ts` is the one place that knows how.

Two related consequences, both handled:

* A guest holds a session, so "is there a session?" stopped being the same
  question as "do they have an account?". Both `CvSignIn` and `CvSignUp` had
  an `alreadyIn` redirect that would otherwise bounce a returning member away
  from the sign-in form and a guest away from the sign-up form.
* Signing in to a *different* account from a guest session swaps sessions
  rather than converting, so the guest CV stays behind. The sign-in page says
  so rather than letting them find out afterwards.

### Two ceilings, deliberately different shapes

Not one number with a discount for signing up — the *question* being asked is
different for each, and that is the whole design (`app/quota.py`):

| | Guest | Account |
|---|---|---|
| Rationed per | **conversation** (`GUEST_SESSION_TOKENS`, 80k) | **rolling week**, across every conversation (`ACCOUNT_WEEKLY_TOKENS`, 300k) |
| Per-session ceiling | yes | **none** |
| Weekly ceiling | none | yes |
| Where the figure lives | the session in memory | the `cv_usage` ledger in Postgres |

A guest has no account worth attaching a longer-term total to — the identity
is one request old and free to mint — so a weekly figure keyed on it would
measure nothing. What a per-conversation ceiling does buy is a hard stop on
one runaway session.

Somebody who came back is the opposite case: they should be able to start as
many CVs as they like and revise one for as long as it takes, and the only
thing that runs out is the week.

**The weekly figure is read from Postgres, not from memory.** A rolling week
has to survive the restarts a single Render instance does routinely; in-process
state would reset the window on every deploy, which is the same as having no
weekly limit at all. It is a *ledger* (`cv_usage`) and not a counter on the
session row, because summing sessions would attribute everything a long-lived
conversation ever cost to whenever it was last touched.

`weekly_token_total` returns `None` — not 0 — when it cannot get an answer, and
`quota.check` **lets the visitor through** on it. Failing closed would refuse
service over a database hiccup that has nothing to do with them, and the
rate limiter below still caps requests, so an outage cannot become unbounded
spend. `tests/test_weekly_quota.py` pins both halves of that, including that
`None` is never quietly read as zero.

### What an anonymous identity costs, and what pays for it

An anonymous account is **free to mint**. Every limit that rations by account
therefore stops being a limit — a script that signs in again before each
request never hits one, while spending real OpenAI budget every call. Three
defences, all in this repo rather than in a prompt:

1. **Rationed by IP, not by account.** `limit_by_account`
   (`app/ratelimit.py`) keys anonymous callers on `ANON_*_PER_IP` and
   signed-up ones on the existing per-account rules — members legitimately
   share an IP (a school, an office, CGNAT); guests are the ones whose
   "account" is worthless as a subject.
2. **A cap on opening conversations, not just on using them.**
   `ANON_SESSION_PER_IP` (5/hour) exists because of the table above: a guest
   ceiling that is per-conversation bounds one conversation and nothing else,
   and opening the next one costs nothing. Without this rule, N conversations
   is N allowances and the ceiling is decorative. `_session_for` in
   `app/main.py` is deliberately not `store.get_or_create` so that *opening*
   can be charged while *continuing* is free — rationing a guest for answering
   questions in the conversation they already have would be exactly backwards.
   Members are exempt: their limit is weekly and account-wide, so opening
   conversations gains them nothing.
3. **The per-conversation token ceiling** itself, applied in `quota.check`
   from `session.is_anonymous`. The flag is **re-stamped from the verified
   token on every request**, never persisted — which is what makes signing up
   change the limit mid-session without touching the session object.

`GLOBAL_PER_IP` still sits above all of it, but it is a flood backstop, not an
economic control: 120 requests a minute of a model that bills per call is not
a budget.

### The security consequence nobody sees coming

`authenticated` used to mean "someone who signed up and confirmed an email".
It now means **anybody who opened the site** — a guest holds a valid JWT with
that exact role. So every RLS grant to bare `authenticated` became a grant to
the public internet, for reads as much as for writes.

Everything in `supabase/setup.sql` was already keyed on `is_admin()` or
`auth.uid() = user_id`, so nothing was actually exposed — but the invariant is
now load-bearing in a way it was not, and it is one `create policy` away from
being lost. The verify block at the end of that file has a second check for
exactly this (ungated *reads* of `messages`, `cv_sessions`, `cv_messages`,
`cv_uploads`, `cv_usage`), and `.github/workflows/supabase-schema.yml` runs
both as a build failure.

The other half is session ownership: `/chat` and `/upload` resolve sessions
through `_session_for` now rather than `store.get_or_create`, and a rewrite
like that is exactly where an ownership check goes missing. Someone else's
session id must read as one that does not exist — not an error, which would
let ids be enumerated by the shape of the response. Pinned in
`tests/test_anonymous_visitors.py`.

### Housekeeping

Guests accumulate one `auth.users` row per visitor who never converts, and
Supabase clears none of it. `public.purge_stale_guest_accounts(interval)` in
`supabase/setup.sql` deletes anonymous, never-converted accounts idle for the
whole retention window — measured from last CV activity, not signup, so
work in progress survives. The delete cascades to `cv_sessions`,
`cv_messages` and `cv_uploads`, which is the point: it clears the drafts too.

The admin User Management page labels these rows **Guest** rather than showing
a blank email (`admin_list_users()` now returns `is_guest`).

### One thing that is not in this repo

Anonymous sign-in is a **project setting**: Supabase → Authentication →
Providers → Anonymous. With it off, `signInAnonymously()` errors and
`CvProtectedRoute` falls back to the sign-in page — the old behaviour, so
nothing breaks, but nothing improves either. Turning on CAPTCHA protection
alongside it is worth doing: it is the cheapest brake on automated guest
creation, and it sits in front of everything above.
