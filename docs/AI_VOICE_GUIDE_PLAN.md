# Master Plan — "Modern Experience": AI-Voice-Guided Portfolio

**Project lead (chef de projet):** Fable 5
**Executors:** Claude Design (visual design) · Opus (architecture-heavy code) · Sonnet (component implementation & polish)
**Repo:** `Inssaya/my-portfolio-showcase` — branch `claude/portfolio-ai-voice-guide-affxgu`
**Reference repos (read-only source material):**
- `Inssaya/My_assistance` — the agent/tool-calling logic to port for the live AI widget (`hub/app/core/agent.py`, `hub/app/tools/`, `hub/app/providers/`)
- `Inssaya/ANTIV-COMPANY-PROJECT` — content source for the Aptiv/ANTIV project deep-dive narration (`CahierDesCharges.md`, `PredictiveMaintenanceGuide.md`, `guidENgineeryassine.md`, `yassineRV.md`)

---

## 1. The concept (what we are building)

When a visitor opens the site they see an **entry gate** with two doors:

1. **Classic Portfolio** — the existing site, untouched.
2. **Modern Experience (التجربة الحديثة)** — a cinematic, voice-guided tour of Yassine's profile.

### The Modern Experience, beat by beat

1. Visitor clicks the "Modern" door (this click is the user gesture that legally unlocks audio autoplay in every browser).
2. **"مرحباً / Hello"** appears on screen *while the same words are heard* in a pre-generated AI voice. Text renders **character-by-character, synchronized to the voice** using character-level timestamps.
3. The voice begins an introduction series: *"Let me introduce myself. I'm Yassine Sinif…"* — skills, experience, education — short, punchy, never boring. Visuals (photos, key facts, animated highlights) appear and disappear in sync with the narration, choreographed so it *feels* like a live AI is presenting.
4. When the tour reaches **projects**, the voice presents them while a **list appears: one image + title + a "follow" button per project**. Then the voice says: *"Choose a project that sparks your curiosity."* → the tour **pauses at a checkpoint** and waits for the visitor's choice.
5. On selection, the list dissolves and a **per-project deep-dive** begins: the voice walks through how the project was built, what's inside it, and the tech used — **image by image**, each photo appearing in sync with the narration. Concise, engaging, recruiter-oriented.
6. After a deep-dive, the tour returns to the checkpoint (choose another project, or continue to the closing beat: contact / CV download).
7. **At any moment**, a floating **AI widget** (bottom corner) lets the visitor interrupt: voice stops, everything freezes, and a **status report** (current segment, current project, progress, what's been narrated so far) is handed to the *live* AI chat as context. The visitor can ask anything a recruiter would ask about Yassine or about that specific project, grounded in real profile data. The widget has tools: **send/download CV (PDF)**, **open GitHub**, **show a specific project**, **resume the tour**.

### The crucial trick — "it's not AI, it just looks like AI"

Nothing in the tour is generated at runtime. **All voices are generated ONCE** (offline, using the TTS API key the owner provides), stored as static files, and replayed with their timestamp data. All photos are provided by the owner and registered in a manifest. The tour is a deterministic, scripted playback engine that *performs* like a live AI. Zero runtime AI cost, works on free static hosting.

The **only** live AI is the interrupt widget (one small serverless endpoint) — and that is the feature already scoped in the previous session (port the agent logic from `My_assistance`).

**Everything must be registered:** every audio file, every timestamp file, every photo, every script segment lives in a single versioned manifest. Nothing ad-hoc.

---

## 2. Current state of the codebase (ground truth)

- React 18 + TypeScript + Vite + Tailwind + shadcn/ui + react-router. No backend.
- All profile content lives in `src/lib/admin-data.ts` (localStorage-backed): hero, about, skills, education, experience, 12+ projects incl. 3 featured (Nexora AI, Stock Market Analytics Platform, Medical Multi-Agent System), certificates, links.
- Routes: `/` (Index), `/projects/:slug` (ProjectDetail), `/admin/*` (content admin).
- Existing visual language: dark, glass-card, accent-red, particles background.
- `My_assistance/hub` is a Python FastAPI hub: agent loop with tool retrieval, provider router over free LLM providers (Groq, Gemini, OpenRouter, Cerebras), tool packs. This is the **reference** for the widget's agent loop — it will be *re-implemented small*, not lifted wholesale (we need ~5 tools, not 200, so the tool-retrieval machinery is unnecessary).

---

## 3. Architecture

### 3.1 New routes & entry gate

```
/            → EntryGate (two doors) — remembers choice in localStorage,
               small switcher always available to change modes
/classic     → existing Index (current portfolio, unchanged)
/experience  → the Modern Experience (voice-guided tour)
/projects/:slug, /admin/* → unchanged
```

Direct links to `/classic` and `/experience` must work (shareable). The gate is shown on first visit; returning visitors can be fast-tracked to their remembered choice with a visible way back to the gate.

### 3.2 Tour content model — the single source of truth

`src/lib/tour/manifest.ts` (typed) + generated `public/tour/manifest.json`:

```ts
interface TourManifest {
  version: string;
  segments: TourSegment[];
}

interface TourSegment {
  id: string;                    // "intro-hello", "about-skills", "project-nexora-1"…
  kind: "narration" | "checkpoint" | "project-intro" | "project-slide" | "closing";
  text: string;                  // exact narrated text (EN; the script may open with Arabic "مرحباً")
  audio: string;                 // /tour/audio/<id>.mp3
  alignment: string;             // /tour/audio/<id>.alignment.json  (char-level timestamps)
  visuals: VisualCue[];          // what appears/disappears, keyed to character offsets or ms
  next: string | null;           // linear next, or null when a checkpoint takes over
  projectSlug?: string;          // for project segments
}

interface VisualCue {
  atMs: number;                  // when it appears (derived from alignment at authoring time)
  outMs?: number;                // when it disappears
  type: "image" | "fact" | "list" | "title" | "component";
  src?: string;                  // /tour/projects/<slug>/<n>.jpg for images
  payload?: unknown;             // e.g. the project list for the checkpoint
}
```

Asset layout (all static, all committed):

```
public/tour/
  manifest.json
  audio/<segment-id>.mp3
  audio/<segment-id>.alignment.json
  projects/<slug>/1.jpg, 2.jpg, …
cv/yassine-sinif-cv.pdf          (public/cv/)
```

### 3.3 Voice generation pipeline (one-time, offline)

`scripts/generate-voices.ts` (run locally / in CI by the owner or by us once the key is provided — the key is **never committed**, read from `ELEVENLABS_API_KEY` env var):

1. Reads the tour script (`src/lib/tour/script.ts` — all narration text, authored in Phase 1).
2. Calls ElevenLabs `text-to-speech/:voiceId/with-timestamps` per segment → mp3 + **character-level alignment JSON** (this is what powers the letter-by-letter sync — no estimation needed).
3. Writes audio + alignment into `public/tour/audio/`, regenerates `manifest.json` with real durations.
4. Idempotent: hashes each segment's text; only regenerates changed segments (protects the API quota).
5. Fallback path: if a provider without timestamps is ever used, the engine falls back to duration-proportional character timing — the engine must accept both.

Voice choice: pick a warm, professional multilingual voice (must pronounce the Arabic "مرحباً" opening and English body well). Generate 2–3 voice candidates for the first segment and let the owner pick before generating everything.

### 3.4 Tour playback engine (the heart)

`src/lib/tour/engine.ts` — a state machine, UI-agnostic, fully testable:

```
idle → playing(segment) → { checkpoint(waiting for choice)
                          | interrupted(by AI widget)
                          | ended }
```

- Owns one `HTMLAudioElement`; drives captions via `requestAnimationFrame` reading `audio.currentTime` against the alignment data (char-by-char reveal), and fires `VisualCue`s at their `atMs`.
- Checkpoint segments stop linear flow and render interactive UI (project chooser); the visitor's pick maps to that project's segment chain; on completion, control returns to the checkpoint.
- **Interrupt contract** (used by the AI widget):
  - `pause()` → freezes audio + captions + visuals instantly.
  - `getStatusReport()` → `{ mode: "experience", currentSegmentId, projectSlug?, narratedSoFar: string[], progressPct }`.
  - `resume()` → continues exactly where it stopped.
- Handles tab-hidden (pause), seeking/skip (a subtle "skip →" affordance per segment — recruiters are impatient), replays, and preloads the next segment's audio while the current one plays.
- Reduced-motion & no-audio accessibility: captions are real text (screen-reader friendly); a mute toggle keeps captions running on timing alone.

### 3.5 Live AI widget (port from My_assistance)

- **Backend:** one Vercel serverless function `api/chat.ts` (the repo deploys to Vercel; zero other infra). It implements a compact agent loop inspired by `hub/app/core/agent.py`: system prompt built from `admin-data.ts` content + the tour **status report**, small tool list, provider call, tool-call loop, streamed response.
- **Model provider:** default **Groq free tier** (as in My_assistance's router) with the key in a Vercel env var; the provider client mirrors `hub/app/providers/openai_compat.py` in TypeScript. Keep the interface provider-agnostic so a key swap is a config change.
- **Tools (5, defined once, shared client/server):**
  1. `send_cv` — returns the CV download link (`/cv/yassine-sinif-cv.pdf`), client triggers download.
  2. `open_github` — opens the GitHub profile/repo link from admin-data links.
  3. `show_project(slug)` — client navigates/spotlights that project (in-tour: jumps to its deep-dive).
  4. `resume_tour` — hands control back to the engine.
  5. `get_profile(section)` — server-side lookup into the profile data so answers stay grounded (the system prompt already embeds a digest; this tool fetches full detail on demand).
- **Grounding rule in the system prompt:** answer ONLY from provided profile/tour data; if unknown, say so and offer the CV or contact — never invent facts.
- The widget lives on **both** modes (classic + experience). In classic mode the status report is simply `{ mode: "classic", visibleSection }`.
- Widget UX: floating button (bottom corner, glass, accent-red pulse), expands to a chat panel; opening it while the tour plays calls `engine.pause()` and shows "Tour paused — ask me anything"; closing offers *Resume tour*.

### 3.6 What we deliberately do NOT port from My_assistance

Tool-retrieval over 200 schemas, the context broker, artifact handles, the multi-provider router UI — all built for an 8k-token constraint and 200 tools. Our widget has 5 tools and one provider; a direct small loop is simpler and more reliable. Port the *ideas* (loop structure, grounding, tool contract), not the machinery.

---

## 4. Design track — instructions for Claude Design

Claude Design owns the visual language of the Modern Experience. **Brief it with the concept and constraints, not with prescriptive styling** — it decides the how.

**The brief to give it (context, goals, constraints — no style dictation):**

> A personal portfolio for Yassine Sinif (AI & Data Engineering student, Casablanca) is adding a second, cinematic mode: a voice-guided tour where pre-generated narration plays while synchronized text reveals character-by-character and visuals (photos, facts, project imagery) appear and disappear in time with the voice — it should feel like a live AI is presenting him to a recruiter. The existing site is dark, glass-card, accent-red, particle-textured (screens attached). Needed screens/states:
> 1. **Entry gate** — the two-door choice (Classic / Modern Experience) — first impression of the whole site.
> 2. **Tour stage** — the canvas where narration text reveals in sync with voice, with room for visuals to enter/exit; include its paused/interrupted state.
> 3. **Caption treatment** — how the character-by-character synced text looks and behaves (this is the signature element).
> 4. **Project chooser checkpoint** — list of projects, one image + title + follow button each, in a "the voice just asked you to choose" moment.
> 5. **Project deep-dive** — image-by-image narrated walkthrough layout.
> 6. **AI widget** — floating button + open chat panel, including its "tour paused" state.
> 7. Mobile and desktop for all of the above.
> Constraints: must coexist with the existing classic mode's identity (recruiters may see both), audio-first pacing, works when muted (captions carry it), and everything must be implementable in React + Tailwind + shadcn/ui.

Deliverables: designs for the 7 items above → implemented by Sonnet with Opus reviewing structure. Design decisions (motion language, typography of captions, transition choreography) are Claude Design's call.

---

## 5. Work breakdown & sequencing

### Phase 0 — Inputs & decisions (BLOCKED ON OWNER — see §6)
Owner provides keys/assets; script language confirmed; voice candidate chosen.

### Phase 1 — Script & content *(Sonnet, review by Fable/Opus)*
1. Author the full tour script in `src/lib/tour/script.ts`, grounded strictly in `admin-data.ts` + the ANTIV repo docs for the Aptiv project deep-dive. Tone: first-person AI guide ("Let me introduce…"), short segments (5–15 s each), zero fluff. Opening beat in Arabic ("مرحباً…") then English body (recruiter audience) — **confirm with owner**.
2. Per featured project: intro segment + 3–6 slide segments (one per photo) + tech-stack segment. Non-featured projects get one list mention.
3. Define every `VisualCue` against the script (what appears at which words).
4. Owner reviews/edits the script **before** any TTS spend.

### Phase 2 — Voice pipeline *(Opus)*
1. `scripts/generate-voices.ts` (ElevenLabs with-timestamps, idempotent hashing, manifest regeneration) as specced in §3.3.
2. Generate voice candidates for segment 1 → owner picks → generate all.
3. Commit audio + alignment + manifest.

### Phase 3 — Tour engine *(Opus)*
1. `src/lib/tour/engine.ts` state machine + alignment-driven caption hook (`useTourCaptions`) + visual-cue scheduler. Unit tests (vitest is already configured) for the state machine and timing math with fixture alignments.
2. Entry gate route restructure (`/` gate, `/classic`, `/experience`) with remembered choice.

### Phase 4 — Experience UI *(Sonnet, from Claude Design's designs)*
1. EntryGate, TourStage, CaptionRenderer, ProjectChooser, DeepDiveStage, transitions/motion per design.
2. Preloading, skip control, mute mode, reduced-motion, mobile behavior.

### Phase 5 — Live AI widget *(Opus backend, Sonnet UI)*
1. `api/chat.ts` serverless agent loop + 5 tools + grounded system prompt (port pattern from `My_assistance/hub/app/core/agent.py`).
2. Widget UI (both modes), interrupt/status-report/resume wiring to the engine.
3. CV file at `public/cv/`, `send_cv` tool wired.

### Phase 6 — QA & ship *(Sonnet, sign-off by Fable)*
- E2E happy path with Playwright (already configured): gate → tour → checkpoint → deep-dive → interrupt → ask question → resume → CV download.
- Mobile Safari/Chrome audio behavior, slow-network audio buffering, lighthouse pass, Vercel deploy config (`vercel.json` if needed for the function), README update.

Dependencies: Phase 4 needs Phases 1–3 + design; Phase 5 is parallelizable after Phase 3's interrupt contract exists; design track starts immediately (parallel with Phases 1–3).

---

## 6. Inputs needed from the owner (checklist)

| # | Input | Needed for | Phase |
|---|-------|-----------|-------|
| 1 | **TTS API key** (ElevenLabs strongly recommended — its character timestamps power the letter-by-letter sync; confirm provider) | voice generation | 2 |
| 2 | **Voice pick** from 2–3 generated candidates | voice generation | 2 |
| 3 | **Photos per project** (3–6 per featured project; any size, we normalize) → drop them anywhere in the repo or send them; we place under `public/tour/projects/<slug>/` | deep-dives | 1→4 |
| 4 | **CV PDF** | `send_cv` tool | 5 |
| 5 | **LLM API key for the live widget** (Groq free tier recommended, as in My_assistance) + OK to add one Vercel serverless function | AI widget | 5 |
| 6 | **Script sign-off** (and language mix confirmation: Arabic greeting + English body?) | before TTS spend | 1 |

Keys are provided as environment variables (local `.env` for generation, Vercel project settings for the widget) — never committed.

---

## 7. Non-negotiable engineering rules

1. **Everything registered:** no audio/photo/text exists outside the manifest. The manifest is the contract between script, pipeline, and engine.
2. **No runtime TTS, no runtime generation** in the tour — static playback only.
3. **Grounded AI only:** the widget answers from profile data; unknown → says so.
4. **Classic mode untouched** in behavior; only the routing wrapper changes.
5. **Idempotent, quota-safe voice generation** (hash-guarded).
6. **Muted/no-audio path is first-class** (captions must carry the experience alone).
7. **Secrets never committed**; `.env.example` documents required vars.
8. All work on branch `claude/portfolio-ai-voice-guide-affxgu`, clear commits per phase.
