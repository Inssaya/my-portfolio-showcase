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

## Step 2 — Supabase auth + persistence

This is the big one. Everything after it depends on it. **Decided already:**
Supabase Auth, not a port of `projectAntiv`'s FastAPI auth — that one issues
8-digit *codes* while the requirement is verification *links*, and it needs a
persistent server. Supabase does links, JWT and password reset natively and is
already wired into the portfolio (`src/lib/supabase.ts`).

### 2a. Supabase dashboard

- Authentication → Providers → **Email** on, **Confirm email** on.
- Authentication → URL Configuration → Site URL = the Vercel URL; add
  `https://<vercel-url>/cv-builder` to redirect allow-list.
- Project Settings → Auth → SMTP → **Brevo**. Supabase's built-in mailer is rate
  limited to a handful of messages an hour and will silently throttle a launch.
  Brevo's API-key transport is in `projectAntiv/backend/app/mailer.py`; read the
  errno 101 comment there before choosing SMTP over the HTTPS API.

### 2b. Schema

Add to `supabase/schema.sql` (it is already idempotent — follow its style):

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

### 2c. Service changes

- New `app/auth.py`: verify the Supabase JWT on every request. Supabase signs
  with the project's JWT secret — verify signature and `exp`, then read `sub` as
  the user id. `jose` is already a frontend dependency; on the Python side use
  `pyjwt` (add to `requirements.txt`).
- `app/main.py`: add the dependency to every route. The module is already shaped
  for this — every handler takes a session and nothing assumes anonymity.
- `app/session.py`: back `SessionStore` with Postgres instead of the in-process
  dict. `Session` is a plain dataclass specifically so it maps to a row. Keep
  the in-memory store as the fallback when Supabase is unconfigured, exactly as
  `src/lib/admin-data.ts` falls back to localStorage.
- Persist `session.transcript` to `cv_messages` as it grows.

### 2d. Frontend

- `/cv-builder` requires a session: redirect to sign-in when absent.
- Reuse `src/components/admin/ProtectedRoute.tsx` — it already does
  `onAuthStateChange`.
- Send the access token as `Authorization: Bearer <token>` from
  `src/lib/resume/api.ts`. Note `allow_credentials=False` in the CORS config;
  a bearer header works with it, cookies would not.

**Done when:** signing out and back in on a different browser shows the same
draft, and Render restarting no longer loses it.

**Traps:**
- `numInstances: 1` in `render.yaml` exists *because* state was per-process.
  Once state is in Postgres, that comment is stale — update it and the matching
  note in `HANDOFF.md` §5, or the next person will believe it.
- The key pool stays per-process. It is not session state and does not belong in
  the database.

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

## Step 4 — Rate limiting

Port the *algorithm* from `projectAntiv/backend/app/ratelimit.py`, **not** the
storage. That implementation documents itself as an in-process sliding window
correct only for a single worker; on more than one Render instance it would
count to one forever.

Back it with a Postgres table or Supabase, keyed on user id and route.

**Done when:** a script firing 50 requests in 10 seconds gets 429s with a real
`Retry-After`, and a normal conversation never does.

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

## How to verify you have not broken anything

```bash
cd cv-service
.venv/Scripts/python -m pytest -q      # 222 tests, no network, no API key
docker compose up --build              # then build one real CV
```

The test suite is fast and hermetic — it never calls OpenAI. But every bug that
actually mattered in Phase 1 was found by running a real CV through Docker, not
by reading code or running tests. **Do both.**
