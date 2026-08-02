# Roadmap

Single source of truth for what is done, what is next, and what is blocked.
Supersedes the sequencing in `AI_VOICE_GUIDE_PLAN.md` (that file remains the
detailed spec for the voice tour itself).

**Goal that ranks above all others:** land a 6-month PFE internship starting
February 2027. Every item below is judged by whether it moves that forward.

---

## Done

| | Delivered |
|---|---|
| ✅ | **Visual redesign** — scroll-driven 3D morphing background, cinematic preloader, cursor glow, magnetic buttons, tilt cards, word-by-word reveals, tech marquee, animated stat counters, timeline. |
| ✅ | **Data-binding fixes** — About, Skills, Experience and Education were rendering hardcoded copy while the same content sat in `admin-data.ts`; admin panel edits now actually reach the page. |
| ✅ | **CV rebuilt in LaTeX** (`cv/`) — pixel-matched to the original, real text layer, `+`-glyph extraction bug fixed, 278 KB → 118 KB. |
| ✅ | **Real hero portrait** replacing the AI-generated illustration. |
| ✅ | **`package-lock.json` repaired** — was missing six declared dependencies including `framer-motion`, breaking every `npm ci`. |

---

## Track A — The voice-guided tour (primary)

This is the differentiator. A recruiter who opens it remembers it.
Full spec: `AI_VOICE_GUIDE_PLAN.md`. Design briefs: `DESIGN_BRIEFS.md`.

### A0 · Inputs *(blocked on owner)*
- [ ] **OpenAI API key** → voice generation via `gpt-4o-mini-tts`, alignment via
      `whisper-1` word timestamps. Full tour costs cents, not dollars.
- [ ] **Project screenshots** — one folder per project, each image named after
      the interface it shows. The interface names become narration.
- [ ] **Script sign-off** before any TTS spend.
- [ ] **Language decision** — Arabic greeting then English body, or English
      throughout.

### A1 · Script *(unblocked — can start now)*
- [ ] Author `src/lib/tour/script.ts` from `admin-data.ts` + the ANTIV repo docs.
      Segments of 5–15 s. First-person guide voice.
- [ ] Per featured project: intro + one segment per screenshot + tech-stack close.
- [ ] Define visual cues against the script.

### A2 · Voice pipeline
- [ ] `scripts/generate-voices.ts` — TTS per segment, then Whisper word
      timestamps, then character interpolation. Hash-guarded so unchanged
      segments never re-spend.
- [ ] Generate 2–3 voice candidates → owner picks → generate all.

### A3 · Tour engine
- [ ] `src/lib/tour/engine.ts` state machine: `idle → playing → checkpoint →
      interrupted → ended`, with `pause()`, `getStatusReport()`, `resume()`.
- [ ] Caption renderer driven by `audio.currentTime` against alignment data.
- [ ] Entry gate routing: `/` gate, `/classic`, `/experience`.
- [ ] Unit tests for the state machine and timing math.

### A4 · Experience UI
- [ ] Build from Claude Design's output: gate, stage, captions, project chooser,
      deep-dive, paused state.
- [ ] Preloading, skip control, mute mode, reduced-motion, mobile.

### A5 · Live AI widget
- [ ] `api/chat.ts` serverless agent loop, pattern ported from
      `My_assistance/hub/app/core/agent.py`.
- [ ] Five tools: `send_cv`, `open_github`, `show_project`, `resume_tour`,
      `get_profile`. Grounded strictly in real data.
- [ ] Widget UI on both modes; interrupt → status report → resume wiring.

### A6 · Ship
- [ ] Playwright E2E: gate → tour → checkpoint → deep-dive → interrupt → ask →
      resume → CV download.
- [ ] Mobile audio behaviour, slow-network buffering, Vercel config.

---

## Track B — Portfolio hardening (small, high return)

Cheap wins that make the site work harder during the internship hunt.

- [ ] **SEO and link previews** — real `<title>`, meta description, Open Graph
      and Twitter card images. Right now a shared link renders as a bare URL,
      which matters because links get pasted into recruiter chats.
- [ ] **Bundle split** — the JS bundle is 525 KB (161 KB gzipped) in one chunk.
      Route-level lazy loading, especially for `/admin`, which no visitor needs.
- [ ] **CV download button** in the hero and contact section, pointing at
      `/cv/yassine-sinif-cv.pdf`.
- [ ] **Populate the LinkedIn link** — it is empty in `admin-data.ts`, so the
      icon is currently suppressed.
- [ ] **Rewrite `README.md`** — still says "Welcome to your Lovable project."
- [ ] **Consolidate lockfiles** — `bun.lock`, `bun.lockb` and
      `package-lock.json` all coexist, leaving the package manager ambiguous.
- [ ] **Fix the CV education line** — reads "EMSI, Casablanca · 2022" where the
      site says 2022–2027.

---

## Track C — Multi-tenant portfolio platform (later, separate)

Users sign up, upload a CV, an LLM parses it, they get a hosted page.

**Deliberately not part of this site.** It goes on its own domain, and this
portfolio links to it as a project. Reasons in the opinion already given:
recruiter confusion, liability for strangers' personal data under a domain that
identifies Yassine personally, and content moderation.

Start only after Track A ships. Agreed shape when it does:

- Supabase for auth, email verification, Postgres and storage — deletes almost
  all the full-stack work.
- Vercel for the app. No Render until a workload actually needs a worker; CV
  parsing is one vision-model call, not a queue workload.
- Pages at `/p/username`, not wildcard subdomains.
- Static generation on approval — data never changes, so pages never need a
  runtime fetch.
- **Signed one-click approve link**, never approve-by-email-reply (`From`
  headers are forgeable).
- Parse *after* approval, so spam signups cost nothing.
- Two exceptions to "cannot modify": re-upload CV, and delete my page.
- Vision model for parsing, not text extraction — image-based CVs are common.

---

## Order of work

1. **A1 script** — unblocked, and it is the input everything else waits on.
2. **Claude Design Brief A** (entry gate) in parallel.
3. **A2 voice pipeline** once the key arrives.
4. **A3 engine**, then **A4 UI** once designs land.
5. **A5 widget** — parallelizable after A3's interrupt contract exists.
6. **Track B** items as filler between blocking waits.
7. **Track C** after Track A ships.
