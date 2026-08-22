# CV service

The backend for the portfolio's CV builder (`/cv-builder`). A FastAPI service
that interviews a visitor — or reads the CV they upload — and renders a designed
PDF.

It is deployed **separately** from the portfolio. The renderer is ReportLab, and
the two CV templates are ~1,000 lines of measured canvas layout; keeping Python
was worth a second deploy.

```
portfolio (Vite → Vercel)  ──HTTPS──▶  cv-service (FastAPI → Render/Railway/Fly)
                                              │
                                              └──▶ OpenAI (pooled keys)
```

## Why it is built this way

**The draft lives in server state, not in the prompt.** The obvious design has
the model hold the whole CV in the conversation and re-emit it whenever anything
changes — paying for the entire document on every turn, and again on every edit.
Here the model patches one section at a time (`update_resume`), reads back a
summary when it needs to check itself (`review_draft`), and renders from state
(`generate_resume`). A one-line correction late in a long session costs a few
dozen output tokens instead of a full restatement. That is what keeps
`gpt-4o-mini` sufficient. See `app/session.py`.

**Uploads go through a cascade, cheapest tier first.** Extraction has three
outcomes, not two, and they cost very different amounts:

| Grade | What it means | What it costs |
|---|---|---|
| `good` | headings and contact found | free — tidy sections handed to the model |
| `partial` | text fine, structure lost | free — model maps it, and is told the labels are unreliable |
| `failed` | scan, or a font that extracts as gibberish | one vision call |

`app/cv/quality.py` grades it; only `failed` spends money. **Measured on 19 real
CVs (PDF and DOCX, EN and FR): 19 `good`, 0 vision calls.** Photos are lifted
straight out of the file — `word/media/` for DOCX, embedded images for PDF — so
a rebuilt CV keeps the person's face.

**History is compacted, which is what stops cost growing quadratically.**
Input tokens for a session are `Σ r·(F + Hₜ)` — fixed prefix plus history, per
round. Unbounded, `Hₜ ≈ tΔ` and the total is O(T²); a measured run went
3.3k → 6.0k → 9.2k with the deltas widening. `_compact()` in `app/agent.py`
caps `Hₜ`, making it O(T). Dropping old turns is safe *here specifically*
because the draft is server state: replaying the conversation that produced a
section is redundant with reading the section.

The system prompt and tool schemas are held byte-identical and first, so
OpenAI's automatic prefix caching applies to roughly 1.1k tokens of every
request after the first.

**Keys are pooled and scheduled.** OpenAI rate-limits per key, so one key caps
concurrent sessions long before the service is under load. `app/keypool.py`
spreads work across every configured key, parks any key that returns 429 for as
long as OpenAI asks, and permanently drops one that returns 401. A rate limit is
treated as *wrong key*, not *failed request* — the caller retries elsewhere and
the visitor never sees it.

## Running locally

```bash
cd cv-service
python -m venv .venv                  # Python 3.13 (3.14 has no wheels yet)
.venv/Scripts/python -m pip install -r requirements.txt
cp .env.example .env                  # then put real keys in it
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Point the frontend at it with `VITE_RESUME_API_URL=http://localhost:8000` in the
portfolio's `.env.local`, then `npm run dev`.

```bash
.venv/Scripts/python -m pytest -q     # 81 tests, no network, no API key needed
```

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEYS` | one of these | Comma-separated. Quick to paste. |
| `OPENAI_API_KEY_1` … `_20` | one of these | One per key. Preferred with ~10 keys: rotating one does not mean re-pasting a 600-character line. |
| `OPENAI_API_KEY` | — | Singular fallback, for a single key. |
| `ALLOWED_ORIGINS` | yes | Comma-separated. Must include the deployed portfolio origin, no trailing slash. |
| `LLM_MODEL` | no | Default `gpt-4o-mini`. |
| `MAX_TOOL_ROUNDS` | no | Default 8. |

All three key shapes merge, and duplicates are collapsed — a repeated key is not
extra capacity, it shares one rate limit.

## Deploying

**The split is not a preference.** The frontend is a static Vite build and
Vercel does that well. This service cannot go there: Vercel's functions are
serverless and stateless, while the whole token argument depends on the draft
living in a long-lived process (`app/session.py`), and ReportLab needs a real
container. So the frontend stays on Vercel and this runs on Render.

```
portfolio (Vercel, static)  ──HTTPS──▶  cv-service (Render, Docker)  ──▶  OpenAI
```

### Render

The repo carries `cv-service/render.yaml`, so: **New → Blueprint → pick this
repo**. Render builds the Dockerfile and prompts for two values:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | your key (stored encrypted; never commit it) |
| `ALLOWED_ORIGINS` | `https://<your-app>.vercel.app` — exact origin, **no trailing slash** |

Then set `VITE_RESUME_API_URL` on Vercel to the Render URL and redeploy the
frontend. Vite inlines env vars at build time, so a redeploy is required — a
changed variable alone does nothing.

Verify with `GET /health`: `llm_configured: true` and `keys.ready: 1`.

### What the free plan actually costs you

Render's free web services **sleep after 15 minutes idle**, and that interacts
badly with this design in a way worth knowing before launch, not after:

* **~50s cold start.** The first visitor after a quiet spell waits, with no
  indication anything is happening.
* **Sleeping wipes every session.** Sessions are in-process, so a sleep discards
  every draft in flight. Somebody mid-interview loses their CV.

For a beta that is survivable — and it is why the **Build button matters**: a
visitor can render at any point rather than being asked to trust that the
conversation will still be there. The moment real people use it, the $7/month
Starter plan removes both problems, and Phase 2's move of sessions into Supabase
removes the second permanently.

Run **one** instance. Session state and the key pool are per-process by design:
with N replicas each keeps its own view, drafts strand on the wrong machine, and
effective rate limits multiply by N.

## Operating

- `GET /health` — liveness, whether keys are configured, and pool counts.
- `GET /ops/keys` — per-key state, in-flight count, cooldowns, disabled reasons.
  Contains no part of any secret. Goes behind admin auth in Phase 2.

If a key shows `disabled`, OpenAI rejected it (401/403): revoked, mistyped, or
without access to the model. It will not be retried until the service restarts.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/chat` | One turn. `{message, session_id?}` → reply, actions, usage. |
| `POST` | `/upload` | Multipart CV. Extracts, then opens the conversation on it. |
| `GET` | `/resume/{session_id}.pdf` | The rendered CV. |
| `GET` | `/draft/{session_id}` | Current draft, filled/missing sections, usage. |

Errors are meant to be shown to the visitor: `429` carries `Retry-After` and a
real wait; `400` on upload explains what to do about a scanned or damaged PDF;
`503` means the service has no usable key and a human must act.

## Still to do — Phase 2

Phase 1 has no auth and no quota. Deliberately: the token cost of one CV had to
be measured before a limit could be chosen, and that needs the real flow.

1. **Measured, on gpt-4o-mini, end to end:**

   | Path | Tokens for one finished CV |
   |---|---|
   | Upload → confirm → generate | **~12,700** |
   | Full interview, 8 turns → generate | **~34,700** |

   The interview is the expensive path and sets the quota. **50k per user per
   day** is the tier to start on — 20k would cut off a real interview partway,
   which is worse than being slightly generous while the service is free.

   Re-measure after any prompt change: `usage.total` on the last response, or
   `GET /draft/{id}`.

   **Before opening this up, raise the project rate limit.** The limit that
   matters is not on the key:

   ```
   x-ratelimit-limit-project-requests: 3       ← 3 requests/minute, project-wide
   x-ratelimit-limit-requests:         10000   ← the key itself is fine
   ```

   One turn costs 2–3 requests, so at 3 RPM a single visitor exhausts the
   project. **Ten keys created inside this same project would all share that
   cap and buy nothing** — the pool only helps once the project limit is raised
   (OpenAI dashboard → project → Limits) or the keys live in separate projects.

2. **Supabase auth in front of every route** — register, email verification
   *link*, JWT, reset. Brevo as custom SMTP.
3. **Persist sessions and transcripts** to Postgres, which also becomes the
   training corpus.
4. **Per-user quota** from step 1, plus DB-backed rate limiting (the Aptiv
   sliding-window algorithm, backed by a table rather than process memory).
5. **Admin tracking pages** — registered users, their sessions, full transcripts.
6. **Device fingerprint** recorded at register and each login, for blocking
   abuse.
7. **Terms popup** on first sign-in.
