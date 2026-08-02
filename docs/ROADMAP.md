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
| ✅ | **Tour narration script** — 18 segments, ~3 min, grounded in `admin-data.ts` and the ANTIV README. |
| ✅ | **Voice generation pipeline** — `scripts/generate-voices.mjs`, hash-guarded, negotiates model access, falls back to estimated timings. Windows one-shot `.bat` included. |
| ✅ | **Tour playback engine** — state machine with injected audio, timing maths, React binding. 38 tests. |
| ✅ | **Entry gate + routing** — `/`, `/classic`, `/experience`, all deep-linkable. |
| ✅ | **Tour player UI** — caption, stage, project chooser, transport controls. Verified end-to-end in a browser against a fixture manifest. |
| ✅ | **Route-level code splitting** — one 525 kB bundle became a 444 kB shared vendor chunk plus small per-route chunks. |
| ✅ | **The assistant** — grounded system prompt built from `admin-data`, four tools, edge API route, floating widget on both modes, tour interrupt wired. |
| ✅ | **SEO and link previews** — generated OG card, full Open Graph/Twitter tags, structured data, sitemap, robots. |
| ✅ | **CV downloads** — hero, contact section and tour closing screen. |
| ✅ | **Real README** replacing the Lovable placeholder. |

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

### A1 · Script — **done**, pending sign-off
- [x] `src/lib/tour/script.ts` — 18 segments.
- [x] Aptiv deep-dive written from the ANTIV README.
- [ ] **Owner: read the script and correct anything you'd say differently.**
- [ ] Deep-dives for Nexora AI, the stock platform and the medical multi-agent
      system — blocked on source material for those three.

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

### A4 · Experience UI — **working, awaiting design**
- [x] Gate, stage, captions, chooser, controls, paused state.
- [x] Preloading, skip, mute, tab-hide pause, keyboard shortcuts.
- [ ] Restyle from Claude Design's output (`docs/DESIGN_BRIEFS.md`).
- [ ] Wire project screenshots into the deep-dive once they exist.

### A5 · Assistant — **built**, needs a key
- [x] `api/chat.ts`, four tools, grounded prompt, widget on both modes,
      interrupt/status-report/resume wiring, 11 grounding tests.
- [ ] **Owner: set `ASSISTANT_API_KEY` in the Vercel project.** Until then the
      widget shows a friendly "not switched on" state rather than failing.

### A6 · Ship
- [ ] Playwright E2E: gate → tour → checkpoint → deep-dive → interrupt → ask →
      resume → CV download.
- [ ] Mobile audio behaviour, slow-network buffering, Vercel config.

---

## Track B — Portfolio hardening (small, high return)

Cheap wins that make the site work harder during the internship hunt.

- [x] SEO, link previews, sitemap, structured data.
- [x] Bundle split.
- [x] CV downloads.
- [x] Real README.
- [ ] **Populate the LinkedIn link** — empty in `admin-data.ts`, so the icon is
      suppressed everywhere. One line, and recruiters look for it.
- [ ] **Consolidate lockfiles** — `bun.lock`, `bun.lockb` and
      `package-lock.json` all coexist, leaving the package manager ambiguous.
- [ ] **Fix the CV education line** — reads "EMSI, Casablanca · 2022" where the
      site says 2022–2027.
- [ ] **Confirm the Vercel project** — the live site is
      `my-portfolio-three-tau-68.vercel.app`, while the CV and metadata say
      `sinif-yassine.vercel.app`. Pick one and make the other redirect.

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
