# What to do next

Actionable steps. `HANDOFF.md` explains the system and why it is shaped the way
it is — read that first. This file is the work queue.

Each step below gives: **the goal**, **files to touch**, **done when**, and the
traps already known. Do them in order; each depends on the one before.

---

## Step 0 — Deploy what exists (do this first)

Phase 1 is finished and tested. Deploy before building more: it is ~30 minutes,
it derisks everything after it, and real visitors find things no test does.

1. **Render** → New → Blueprint → this repo. `render.yaml` is committed. It
   prompts for:
   - `OPENAI_API_KEY` — the live key
   - `ALLOWED_ORIGINS` — `https://<your-app>.vercel.app`, exact, **no trailing
     slash**. A trailing slash blocks every browser request while curl keeps
     working, which is a confusing hour.
2. Wait for the health check to pass, then open `https://<render-url>/health`.
   Expect `llm_configured: true` and `keys.ready: 1`.
3. **Vercel** → add `VITE_RESUME_API_URL` = the Render URL → **redeploy**. Vite
   inlines env vars at build time; changing the variable without a rebuild does
   nothing at all.
4. Open `/cv-builder` on the deployed site and build one CV end to end.

**Done when:** a CV downloads from the public URL on a phone.

**Expect:** ~50s cold start after idle on Render's free tier, and sleeping wipes
in-flight drafts. Both are documented in `README.md`. If real people start using
it, the $7/mo Starter plan fixes the first and Step 2 below fixes the second.

---

## Step 1 — Invented dates — DONE

Fixed in `app/cv/verify.py`, wired into `update_resume` in `app/tools.py`.
15 tests in `tests/test_verify.py`. Verified live against OpenAI: replaying
the exact "2nd year at ESM, no year given" input that used to produce
`ESM · 2023` now produces `Student | ESM Ecole Scientifique Marocaine` with no
year at all.

**Why it runs at write time, not "after a turn" as originally planned here:**
`POST /generate` (the Build button) renders straight from `session.draft` with
no model call — that is the whole point of it. Checking only in the chat flow
would leave that path unprotected, since a session could reach Build without
ever passing back through a post-turn check. `update_resume` in `tools.py` is
the one place both paths go through, so that is where `strip_invented_years`
runs.

**Known limitation, accepted deliberately:** if the visitor reads back a
year the model invented and says "yes, that's right", the confirmation text
("yes") does not itself contain the digits, so `input_years` never learns
them and a later edit to that same field would strip the year again. Fixing
this needs detecting approval of a specific claim, not just presence of a
year — left for whoever hits it in practice, since it has not shown up in
testing yet.

---

## Step 2 — Supabase auth + persistence — BOTH DONE

Split into two halves. **Auth is done and verified live.** Persisting
sessions to Postgres — the other half, below — is now built too (not yet
verified against a live deploy — see 2c's "Done when").

### 2a. Supabase dashboard — partly done

- Authentication → Providers → **Email** on, **Confirm email** on — **done**.
- Authentication → URL Configuration → Site URL set to the Vercel root — **done**.
  Not yet added: `https://<vercel-url>/cv-builder/login` to the redirect
  allow-list specifically. Without it, a password-reset link falls back to
  landing on the site root instead of the login page — the session still gets
  set correctly (see `CvSignIn.tsx`'s comment on this), it just takes one extra
  manual visit to `/cv-builder/login` to reach the "set a new password" form.
  Small, but worth the thirty seconds to add.
- Project Settings → Auth → SMTP → **Brevo — NOT done, and confirmed to matter
  in practice, not just in theory.** Live-tested against the real project: a
  signup attempt from a real email address returned
  `over_email_send_rate_limit` immediately. Supabase's built-in mailer allows
  only a handful of emails an hour; the frontend now shows a clear message for
  it (`CvSignUp.tsx`/`CvSignIn.tsx`'s `messageFor`) rather than a confusing
  generic failure, but real signups will keep hitting this wall until SMTP is
  switched to Brevo. Brevo's API-key transport is in
  `projectAntiv/backend/app/mailer.py`; read the errno 101 comment there before
  choosing SMTP over the HTTPS API.

### 2a-continued. Auth verification — DONE, differently than planned below

Built as `app/auth.py`. **Deliberately not** the JWT-secret approach originally
sketched here: verification goes through Supabase's own `GET /auth/v1/user`
endpoint (one HTTP call, using the anon key you already have) rather than
decoding the JWT locally with a shared signing secret. Two reasons, both in the
module's own docstring: no secret to manage (newer Supabase projects rotate an
asymmetric key over JWKS, older ones use a shared HS256 secret — plumbing
either correctly is one more thing to get wrong), and instant revocation (a
locally verified JWT reads as valid until it expires even after a ban; asking
Supabase applies its own revocation immediately). A verified token is cached
30s in-process so a burst of frontend calls in one turn does not re-verify on
every one.

Also done, not originally split out as its own item: **session ownership**.
`Session` now carries `user_id`; `SessionStore.get`/`get_or_create` in
`app/session.py` refuse to return a session that belongs to someone else,
indistinguishably from "does not exist" (never leaks whether an id is real but
foreign — see the tests in `test_auth.py`). Every route in `main.py` sits
behind `Depends(get_current_user)` except `/health` (Render's health check
carries no bearer token) and `/ops/keys` (unchanged from Phase 1 — putting it
behind *admin* auth specifically is still Step 5, not this one).

Frontend: `CvSignUp.tsx`, `CvSignIn.tsx` (sign in, forgot-password, and the
"set new password" recovery view all live in one file — see its docstring for
why), `CvProtectedRoute.tsx`, `CvTerms.tsx`. Every call in
`src/lib/resume/api.ts` now carries a bearer header read fresh from
`supabase.auth.getSession()` on each call, which is what makes supabase-js's
background token refresh actually take effect for this service's calls too. The
PDF download and photo thumbnail could not stay a plain `<a href>`/`<img src>`
once their endpoints required a header a browser navigation cannot send — both
now fetch as an authenticated blob and hand the browser a local `blob:` URL
instead (`downloadResume`, `fetchPhotoUrl` in `api.ts`).

**Verified live, not just by the test suite:** rebuilt the Docker image,
confirmed an unauthenticated request now gets a real 401, and drove signup
through an actual browser against the real Supabase project — which is what
surfaced the Brevo gap above.

251 backend tests (was 237), all hermetic — `app/auth.py` is faked at the
`httpx.get` boundary in `test_auth.py`, and every other test gets a fixed fake
user for free from the autouse override in `tests/conftest.py`.

### 2b. Schema for session persistence — DONE

Added to `supabase/schema.sql`, following its existing style exactly (still
idempotent, still DROP-then-CREATE for policies). `cv_devices` from the
original sketch below is **not** included — that belongs to Step 5
(fingerprinting), not persistence, and adding it now with nothing reading or
writing it yet would just be dead schema. Add it when Step 5 actually needs
it.

**Not yet run against the live project.** This is SQL in the repo, not SQL
that has executed — paste `supabase/schema.sql` into Supabase Dashboard → SQL
Editor → Run before deploying the code below, or every request will 500 with
a "relation does not exist" from PostgREST.

Original sketch, kept for reference (matches what actually shipped):

```sql
-- One row per CV conversation.
create table if not exists public.cv_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  style text not null default 'modern',
  language text not null default 'en',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  pdf_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cv_sessions_user_idx on public.cv_sessions(user_id, updated_at desc);

-- Every turn, kept verbatim. This is the training corpus.
create table if not exists public.cv_messages (
  id bigserial primary key,
  session_id uuid not null references public.cv_sessions(id) on delete cascade,
  role text not null,               -- user | assistant | tool | system
  content text not null default '',
  tool_name text,
  tool_arguments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cv_messages_session_idx on public.cv_messages(session_id, id);

-- Device fingerprints, for blocking abuse (Step 5).
create table if not exists public.cv_devices (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  blocked boolean not null default false
);
create index if not exists cv_devices_fp_idx on public.cv_devices(fingerprint);
```

RLS: a user reads and writes **only their own** rows
(`auth.uid() = user_id`). `cv_messages` inherits through `session_id`. Copy the
policy shape already used in that file.

### 2c. Service changes — the persistence half — DONE

Built as `app/db.py` (the PostgREST client) plus changes to `app/session.py`
and `app/main.py`. This is the part that makes a session outlive one Render
process, which is what actually fixes the "sleeping wipes every draft"
problem in `README.md`.

- `app/db.py`: `load_session_row`, `create_session_row`, `update_session_row`,
  `append_messages` — thin wrappers over `httpx` against Supabase's PostgREST
  endpoint (`{SUPABASE_URL}/rest/v1/...`), authenticated with the **visitor's
  own access token** (`AuthUser.access_token`), never `service_role`. RLS
  (2b's policies) enforces per-user isolation at the database itself — this
  service still never needs `service_role`, the same boundary `app/auth.py`
  already keeps. Every function catches `httpx.HTTPError` and returns
  `None`/`False` rather than raising: a Postgres hiccup must never turn into a
  500 for a visitor mid-chat.
- `app/session.py`: `SessionStore` is unchanged in shape — still the
  in-process dict as the fast path, exactly as before — with Postgres as a
  **write-through, read-on-miss backup** behind it, not a replacement.
  `.create`/`.get`/`.get_or_create`/`.save` all take an optional
  `access_token: str | None = None`; with no token (every existing direct
  test-suite call) or with Supabase unconfigured, behaviour is byte-for-byte
  the old in-memory-only code path — this is what keeps the 267 original
  tests hermetic with zero changes to them. `Session.to_row()`/`.from_row()`
  map the dataclass to a `cv_sessions` row; `photo`/`pdf` bytes are
  deliberately excluded (see the note atop `supabase/schema.sql`) — a
  restored session has its draft and transcript back, but a photo needs
  re-upload and a PDF needs one click on Build, both cheap. `Session.id`
  switched from `secrets.token_urlsafe(16)` to a real `uuid.uuid4()` to match
  the `uuid primary key` column — confirmed nothing else assumed the old
  format.
- `app/main.py`: every route now passes `user.access_token` through to the
  store. `_turn_or_http_error` (shared by `/chat` and `/upload`) saves in a
  `finally`, not just on success — tool rounds can patch the draft before the
  round that actually fails (budget exceeded, pool busy), so a raised error
  must not also mean that real progress never reaches Postgres.
- `session.transcript` persists to `cv_messages`, but only the tail Postgres
  doesn't have yet (`Session._persisted_message_count`, an in-memory cursor,
  not a column) — a session is never re-sent whole on every turn.
- Restoring a session leaves `history` (the wire-format sent to the model)
  empty on purpose, rather than replaying `cv_messages` into it. The draft is
  this app's real memory of what the visitor said — the model picks the
  conversation back up from `draft_summary()`, not from a replayed
  transcript. Simpler, and avoids re-litigating `_compact()`'s token-cost
  logic against a restored history shaped differently than a live one.

**Done when:** signing out and back in on a different browser shows the same
draft, and Render restarting no longer loses it. Logic is unit-tested against
faked `httpx` calls (`tests/test_persistence.py`, 22 tests) — this has **not**
yet been proven against the live Supabase project or a real Render restart,
because that needs 2b's SQL actually run first. Do that (dashboard → SQL
Editor → paste `supabase/schema.sql` → Run — safe to re-run, every statement
is idempotent), redeploy, then verify for real: start a CV, restart the
Render service from its dashboard, reload `/cv-builder` and confirm the draft
is still there.

**Traps:**
- `numInstances: 1` in `render.yaml` is still 1, but the comment now explains
  a narrower reason — session state itself is fine to scale out; the API-key
  pool and the rate limiter are not (Step 4's still-open DB-backed half).
  Read the updated comment before assuming persistence alone clears the way
  to a second instance.
- `tests/conftest.py` gained `_no_real_supabase`, an autouse fixture that
  blanks `SUPABASE_URL`/`SUPABASE_ANON_KEY` for every test by default. Without
  it, a developer's real local `.env` would make `settings.auth_configured`
  true during `pytest`, and every HTTP-level test would attempt a real
  network call the moment it touched `SessionStore` with the fake bearer
  token `conftest.py` hands out. If a future test needs a *configured* fake
  project, do what `test_auth.py`'s `_configure(monkeypatch)` and
  `test_persistence.py`'s copy of it do — set fake env vars and
  `reset_settings()` inside that specific test.

---

## Step 3 — Per-user quota

`session.usage` already accumulates and is returned on every response, and
`MAX_SESSION_TOKENS` already enforces a per-*session* ceiling in `app/agent.py`.
This generalises it to per-user-per-day.

- Sum `prompt_tokens + completion_tokens` across the user's sessions for the
  last 24h.
- Measured cost of one finished CV: **~12.7k** by upload, **~34.7k** by full
  interview. A daily quota of **50k** allows one comfortable CV plus revisions.
  Do not set 30k — it cuts a real interview off partway, with the draft written
  and no PDF, which is the worst possible moment.
- Reuse the `SessionBudgetExceeded` path in `app/main.py`; it already returns
  the draft state alongside the error so the UI does not imply work was lost.

**Done when:** a user over quota gets a clear message and **can still press
Build** — that path never calls the model, and a test pins it.

---

## Step 4 — Rate limiting — DONE for one instance; DB-backed version still needed to scale out

Built as `app/ratelimit.py` — the algorithm ported from
`projectAntiv/backend/app/ratelimit.py` (sliding-window log, same reasoning,
same in-process boundary), the *rules* rewritten for what this service
actually needs to protect: a global per-IP backstop on every route
(`GLOBAL_PER_IP`, applied by `GlobalIpRateLimitMiddleware` — deliberately a
middleware, not a per-route dependency, so nothing added later can forget to
wire it in), plus tighter per-user limits on `/chat`, `/upload` and
`/generate` — the three that spend real OpenAI tokens or real CPU.

**Verified live against the actual Render deployment, not just tests**:
flooded `/ping` past `GLOBAL_PER_IP`, confirmed a real 429 with `Retry-After`,
confirmed it carried the correct CORS header, waited out the window, confirmed
it recovered cleanly.

**A real bug this caught, worth knowing before touching this file again:**
Starlette's `add_middleware()` inserts at the *front* of its internal list,
and the stack it builds wraps outside-in from the end — net effect, **the
middleware added *last* ends up *outermost***. The intuitive guess (first
added = outermost, like a decorator) is backwards. Getting this wrong made the
rate limiter's 429 skip CORS entirely, so a rate-limited browser saw a CORS
error instead of the real message — caught by
`test_ratelimit.py::test_global_limit_response_carries_cors_headers`. The
correct order, and why, is spelled out in `app/main.py` right where the two
middlewares are added; read that comment before reordering anything there.

**Still not done — the DB-backed part.** This is in-process, same as
`session.py` and `keypool.py`, correct for `render.yaml`'s `numInstances: 1`
and wrong the moment that becomes more than one — each replica would get its
own counters and the effective limit would multiply by the replica count. That
upgrade is the same Postgres move as Step 2c, on the same timeline: back
`SlidingWindow` with a table keyed on user id and route instead of an
in-process dict once persistence lands.

**Done when** (this part): a script firing 50 requests in 10 seconds gets
429s with a real `Retry-After`, and a normal conversation never does. ✅

---

## Step 5 — Admin, fingerprinting, terms

- **Admin pages** under the existing `/admin` shell: registered users, their
  sessions, full transcripts. Follow `src/pages/admin/AdminMessages.tsx`.
- **Put `/ops/keys` behind admin auth.** It is unauthenticated today. It leaks
  no secret — only labels and counters — but it should not be public once there
  is an admin surface.
- **Device fingerprint** recorded at register and each login into `cv_devices`;
  block by fingerprint, not only by user, so a blocked abuser cannot simply
  register again.
- **Terms popup** on first sign-in: a question, a link, confirm/decline. Store
  acceptance against the user row.

**Done when:** you can see every user, open any transcript, and block a device.

---

## Smaller things worth doing

Each is contained and independently useful:

- **Projects render flat** when pasted with `###` sub-headings — the name,
  description and technologies become sibling bullets instead of one entry.
  `_split_lead` in `app/cv/builder.py`.
- **Soft skills merge into the wrong group.** The model appends them to the last
  `CATEGORY:` line rather than starting a new one. `_skill_groups`, same file.
- **`MCDONALD` → `Mcdonald`.** `normalise_name` in `app/cv/builder.py` documents
  the trade-off; fixing it properly needs a name list.
- **A second template.** `classic` exists and is tested but nothing exposes it —
  `generate_resume` accepts `style`, and the UI never offers it.
- **`X-Session-Id` is in `expose_headers`** but never actually sent. Either send
  it or drop it from the CORS config in `app/main.py`.

---

## Layout: what the fit pass does not reach

`_fit_modern` (`app/cv/builder.py`) deleted the phantom second page — see
HANDOFF §4.22-25 — but two cases still ship a page under 30% full. Both are
measured, neither is a regression, and both need a decision rather than a
patch, which is why they are here and not fixed.

**1. A sidebar that cannot fit any page (`modern`).** Rhythm scaling only
moves the space *between* blocks, so its authority over a column that is
mostly wrapped lines is limited. Measured on the reported CV plus synthetic
skill groups, sidebar natural extent against the 770 limit:

| draft | gaps at 1.0 | gaps at 0.72 | gap buys |
|---|---|---|---|
| as reported | 817.2 | 699.2 | 118.0 → **fits** |
| + 2 skill groups | 910.8 | 774.2 | 136.6 → over by 4.2 |
| + 5 skill groups | 1051.2 | 886.6 | 164.6 → over by 116.6 |

So roughly two extra skill groups past the reported CV is where one page stops
being reachable. Scaling the leading as well buys only another ~20pt — not
worth breaking the "never the leading, never the type size" rule that
`test_layout.py` pins, since it rescues only the knife-edge case.

The lever with real authority is the one thing that changes what the template
*is*: the same skills text is **135pt shorter set at `MAIN_W` than at
`SIDE_W`** (a 2.16× width ratio), and the main column typically has ~165pt
free. Moving a trailing sidebar section into the main column on overflow would
fix it — and would mean EDUCATION sometimes appears on the right, so a visitor
who adds one line gets a different-shaped document. `_cvmodern.py`'s docstring
states the split ("education and skills live in the sidebar, so the main
column is nothing but evidence") as the design, so this is the owner's call.

**2. `classic` has the same symptom from the opposite cause.** 12 bullets past
the reported CV gives 2 pages with 277 characters on the second. It is not the
same bug: `_cvdesign.py` uses *shared* pagination (`_new_page()` advances both
columns at once, line 451/513), so a main column overrunning by a few points
takes the sidebar with it. It needs its own analysis, not a copy of
`_fit_modern`.

`bold` also renders the reported CV as 2 pages where `modern` and `classic`
manage one, but that is by design: `two_up_footer` keeps the skills/languages
footer atomic and jumps to a fresh page rather than splitting it.

Reproduce any of this with a sweep over drafts × styles, asserting no page
holds under ~400 characters when the page count is above one — the shape of
`test_no_page_is_nearly_empty` in `tests/test_layout.py`.

---

## How to verify you have not broken anything

```bash
cd cv-service
.venv/Scripts/python -m pytest -q      # 222 tests, no network, no API key
docker compose up --build              # then build one real CV
```

The test suite is fast and hermetic — it never calls OpenAI. But every bug that
actually mattered in Phase 1 was found by running a real CV through Docker, not
by reading code or running tests. **Do both.**
