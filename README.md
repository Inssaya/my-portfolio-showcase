# Yassine Sinif — Portfolio

Personal portfolio with two ways in: a conventional scrollable site, and a
voice-guided tour where pre-generated narration plays while the caption reveals
character by character in sync with it.

Live: <https://sinif-yassine.vercel.app>

## Stack

React 18 · TypeScript · Vite · Tailwind · shadcn/ui · framer-motion ·
react-router. No backend — content lives in `src/lib/admin-data.ts`, backed by
localStorage and editable through `/admin`.

## Running it

```sh
npm install
npm run dev        # http://localhost:8080
```

| Script | Does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm test` | unit tests (vitest) |
| `npm run lint` | eslint |
| `npm run voices` | generate the tour narration — see `scripts/README.md` |

## Routes

| Path | Page |
|---|---|
| `/` | Entry gate — choose classic or guided |
| `/classic` | The portfolio |
| `/experience` | The guided tour |
| `/projects/:slug` | Project case study |
| `/admin` | Content editor |

## Layout

```
src/
  components/
    visuals/      background, motion and interaction pieces
    tour/         caption, stage, project chooser, transport controls
    admin/        content editor
  lib/
    admin-data.ts all profile content, and the only place to edit it
    tour/         playback engine, timing maths, React binding
  pages/
scripts/          one-time voice generation (see scripts/README.md)
cv/               LaTeX source for the CV (see cv/README.md)
docs/             roadmap, plans and design briefs
```

## The guided tour

Nothing is generated at runtime. Narration is synthesised once by
`scripts/generate-voices.mjs`, which also recovers word timings and
interpolates them into per-character timings; the result is committed to
`public/tour/`. At runtime the site only replays audio and reads timings, so
the tour costs nothing to serve and works on static hosting.

`src/lib/tour/engine.ts` is a plain state machine with audio injected through
an `AudioPort`, which is why it can be tested headless against a fake clock.
`src/lib/tour/useTour.ts` adapts it for React.

If `public/tour/manifest.json` is absent, `/experience` explains that the tour
has not been recorded yet rather than failing — the route is always safe to
deploy.

## Editing content

Everything on the public pages reads from `src/lib/admin-data.ts`. Edit it
there, or through `/admin` at runtime. Components should never hardcode profile
copy; if you find some that does, it is a bug.

## Documentation

- `docs/ROADMAP.md` — what is done and what is next
- `docs/AI_VOICE_GUIDE_PLAN.md` — full spec for the tour and assistant
- `docs/DESIGN_BRIEFS.md` — briefs for the design work
- `scripts/README.md` — generating the narration
- `cv/README.md` — building the CV
