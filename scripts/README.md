# Generating the tour voices

One-time generation. The output (`public/tour/`) is committed, so this only
needs re-running when the narration text in `src/lib/tour/script.ts` changes.

## Windows — just run the script

```
scripts\generate-voices.bat
```

It checks Node, installs dependencies, prompts for the key, auditions the four
voices, generates the tour in the one you pick, and pushes the result. Nothing
to memorise.

### Setting the key by hand instead

The syntax differs between the two Windows shells, which is the usual source of
"The filename, directory name, or volume label syntax is incorrect":

| Shell | Prompt looks like | Syntax |
|---|---|---|
| Command Prompt | `C:\Users\you\portfolio>` | `set "OPENAI_API_KEY=sk-..."` |
| PowerShell | `PS C:\Users\you\portfolio>` | `$env:OPENAI_API_KEY = "sk-..."` |

In Command Prompt the quotes must wrap the **whole** `NAME=value` pair, and
there must be no spaces around the `=`, or the spaces and quotes end up inside
the value itself.

## macOS / Linux

```sh
export OPENAI_API_KEY="sk-your-key"

npm run voices:sample
npm run voices
```

## If a model is not enabled on your project

OpenAI answers `403 model_not_found` when a project has not been granted a
model, and does not fall back on its own. The script handles this: it tries
`gpt-4o-mini-tts`, then `tts-1-hd`, then `tts-1`, and keeps the first that
works. Pin one explicitly with `TOUR_TTS_MODEL` if you prefer.

## The 403 that is really a rate limit

Worth knowing before you lose an hour to it: on a small project OpenAI reports
a **request-cap overage on the speech endpoint as `403 model_not_found`** — the
exact same error as a model you were never granted. The message names the model
and says you lack access, which is simply untrue; the same call succeeds
seconds later.

Check the response headers to tell them apart:

```
x-ratelimit-limit-project-requests: 3
x-ratelimit-reset-project-requests: 20s
```

Three requests per twenty seconds is the cap this project ran into. Each
segment costs two calls (speech, then transcription), so eighteen segments is
thirty-six calls and an unpaced run trips the cap almost immediately — then
looks like a permissions failure and gives up.

The script paces every call to stay under the cap, defaulting to one call each
7.5 seconds. That default is still too fast when a project is this constrained,
because a *denied* retry consumes a slot too and feeds the problem. Raise it:

```sh
TOUR_MIN_INTERVAL_MS=15000 npm run voices   # ~10 min for the full tour, retry-free
```

Genuine denials still fail, just a minute later — a 403 is only believed after
it survives five attempts spaced a full reset window apart.

## If the run dies partway

It resumes. The manifest is written after every segment, not just at the end,
and the hash guard skips any segment already recorded in it. Rerun the same
command and it picks up where it stopped. Network errors (`fetch failed`,
`ETIMEDOUT`) are retried with backoff rather than ending the run.

The same applies to timing. If no transcription model (`whisper-1`) is
available, the script still produces the tour — it reads the real clip length
out of the MP3 frame headers and distributes the caption reveal across it,
weighted by word length. The sync drifts slightly rather than being exact, and
the run prints which segments were affected. Enabling `whisper-1` in the
OpenAI dashboard under Project → Limits and re-running upgrades them; unchanged
segments are skipped, so only the timing is recomputed.

## What happens

1. `--sample` writes `public/tour/audio/_sample-<voice>.mp3` for four voices
   (`alloy`, `onyx`, `nova`, `shimmer`) speaking the opening line. Listen, pick
   one, set `TOUR_VOICE`, then run the full generation.
2. The full run synthesises every segment, sends each clip back through
   `whisper-1` to recover word timings, interpolates per-character timings for
   the caption reveal, resolves the word-anchored visual cues into
   milliseconds, and writes `public/tour/manifest.json`.

Generation is hash-guarded per segment: a segment whose text and voice are
unchanged is skipped. Editing one line costs one segment, not the whole tour.

## Cost

The tour is ~2,600 characters, about three minutes of audio. Both the speech
synthesis and the transcription are billed in cents at this size — the sample
run costs a fraction of that. The `--sample` step exists so you never pay to
generate the whole tour in a voice you end up disliking.

## After generating

```sh
git add public/tour
git commit -m "Add generated tour audio and manifest"
git push
```

The audio is served as static files from `public/`, so it rides the same CDN as
the rest of the site. It does not need object storage — these are a handful of
small, immutable MP3s that never change between deploys, which is exactly what
a static asset is.
