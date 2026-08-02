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
