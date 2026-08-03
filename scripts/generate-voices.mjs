#!/usr/bin/env node
/**
 * Generates the tour's audio and timing data, once.
 *
 *   OPENAI_API_KEY=sk-... node scripts/generate-voices.mjs
 *   OPENAI_API_KEY=sk-... node scripts/generate-voices.mjs --sample
 *
 * For each segment of the script it:
 *   1. synthesises speech with gpt-4o-mini-tts,
 *   2. sends that audio back through whisper-1 to get word-level timings,
 *   3. interpolates those into per-character timings for the caption reveal,
 *   4. resolves word-anchored visual cues into millisecond offsets,
 *   5. writes everything into public/tour/manifest.json.
 *
 * It is hash-guarded: a segment whose text has not changed is skipped, so
 * re-running after editing one line costs one segment, not the whole tour.
 *
 * The key is read from the environment and never written to disk.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "tour", "audio");
const MANIFEST = path.join(ROOT, "public", "tour", "manifest.json");

/**
 * Newer models are not enabled on every OpenAI project, and an unavailable one
 * answers 403 `model_not_found` rather than falling back on its own. So we try
 * in order of preference and keep whichever the project can actually use.
 * Override with TOUR_TTS_MODEL to pin one.
 */
const TTS_MODELS = process.env.TOUR_TTS_MODEL
  ? [process.env.TOUR_TTS_MODEL]
  : ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"];
const TRANSCRIBE_MODELS = ["whisper-1", "gpt-4o-mini-transcribe"];

/** Only the gpt-4o speech models accept a delivery/style instruction. */
const supportsInstructions = (model) => model.startsWith("gpt-4o");

let ttsModel = null;
let transcribeModel = null;
let transcribeUnavailable = false;

// Candidates to audition with --sample. Pick one, then set VOICE.
const SAMPLE_VOICES = ["alloy", "onyx", "nova", "shimmer"];
const VOICE = process.env.TOUR_VOICE ?? "onyx";

/**
 * Steering prompt for the TTS model — tone and pronunciation, never content.
 *
 * EMSI is École Marocaine des Sciences de l'Ingénieur, and Moroccans say it as
 * a word: "em-see". Left alone the model spells it out, E-M-S-I, which is
 * immediately wrong to anyone who knows the school — including most of the
 * recruiters this tour is aimed at.
 */
const DELIVERY =
  "Speak like a confident, warm engineer introducing their own work to " +
  "someone they respect. Natural pace, clear articulation, never salesy. " +
  "Pronounce the acronym EMSI as a single word, \"em-see\", never as " +
  "separate letters. Aptiv is \"AP-tiv\".";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set.\n\nUsage:\n  OPENAI_API_KEY=sk-... node scripts/generate-voices.mjs");
  process.exit(1);
}

const sampleMode = process.argv.includes("--sample");

/**
 * Small projects are capped hard — this one at three requests per twenty-second
 * window (`x-ratelimit-limit-project-requests: 3`). Crucially, OpenAI reports an
 * overage on the speech endpoint as `403 model_not_found`, which is the exact
 * shape of a model the project was never granted. An unpaced run therefore
 * looks like a permissions failure and gives up, when all it needed was to wait.
 *
 * So every call takes a slot from a single global pacer. Three minutes of
 * generation becomes five; a run that could not finish at all now finishes.
 * Override with TOUR_MIN_INTERVAL_MS if the project's limits are raised.
 */
const MIN_CALL_INTERVAL_MS = Number(process.env.TOUR_MIN_INTERVAL_MS ?? 7500);
let nextSlotAt = 0;

async function takeSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_CALL_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

/** POST to the OpenAI API, retrying on rate limits and transient failures. */
async function callOpenAI(endpoint, { body, headers = {} }, attempt = 1) {
  await takeSlot();

  let res;
  try {
    res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      body,
    });
  } catch (err) {
    // Undici reports DNS hiccups, dropped connections and TLS resets as a bare
    // "fetch failed" thrown from fetch itself, so it never reaches the status
    // handling below. These are exactly as transient as the 5xx we already
    // retry, and one of them should not end an eighteen-segment run.
    if (attempt <= 4) {
      const wait = 2 ** attempt * 1000;
      console.log(`   network error (${err.cause?.code ?? err.message}) — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return callOpenAI(endpoint, { body, headers }, attempt + 1);
    }
    throw err;
  }

  if (res.ok) return res;

  const retriable = res.status === 429 || res.status >= 500;
  if (retriable && attempt <= 4) {
    const wait = 2 ** attempt * 1000;
    console.log(`   ${res.status} — retrying in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return callOpenAI(endpoint, { body, headers }, attempt + 1);
  }

  const text = await res.text();
  const error = new Error(`${endpoint} failed: ${res.status} ${text}`);
  error.status = res.status;
  try {
    error.code = JSON.parse(text).error?.code;
  } catch {
    error.code = undefined;
  }
  throw error;
}

/** A model the project has not been granted access to. */
const isModelUnavailable = (err) =>
  err.code === "model_not_found" || err.status === 403 || err.status === 404;

/**
 * A 403 `model_not_found` is ambiguous: it means either "this project was never
 * granted the model" or "this project just exceeded its request cap". Pacing
 * (see takeSlot) prevents most of the second kind, but bursts still slip
 * through, so a denial is only believed once it survives a full reset window.
 *
 * The wait matches `x-ratelimit-reset-project-requests`. Abandoning an
 * eighteen-segment run — and the manifest, which is written only after the last
 * segment — over a 403 that clears in twenty seconds is far more expensive than
 * waiting. A genuinely ungranted model still fails, just a minute later.
 */
async function retryingSpuriousDenial(label, run, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!isModelUnavailable(err) || attempt >= attempts) throw err;
      console.log(`   ${label}: 403 on attempt ${attempt}/${attempts}, waiting 20s for the window to reset`);
      await new Promise((r) => setTimeout(r, 20000));
    }
  }
}

function speechRequest(model, text, voice) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: "mp3",
      ...(supportsInstructions(model) ? { instructions: DELIVERY } : {}),
    }),
  };
}

async function synthesise(text, voice) {
  // The model already answered once, so a 403 now is a stale cache, not a
  // denial. Retry rather than lose the run.
  if (ttsModel) {
    const res = await retryingSpuriousDenial(ttsModel, () =>
      callOpenAI("audio/speech", speechRequest(ttsModel, text, voice)),
    );
    return Buffer.from(await res.arrayBuffer());
  }

  // First call: find a speech model this project is allowed to use. The whole
  // sequence is retried, so a stale 403 cannot demote us to a worse model — or
  // fail the run outright when only one model is granted.
  return retryingSpuriousDenial("speech model negotiation", async () => {
    let lastError;
    for (const model of TTS_MODELS) {
      try {
        const res = await callOpenAI("audio/speech", speechRequest(model, text, voice));
        ttsModel = model;
        console.log(`  speech model: ${model}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        if (!isModelUnavailable(err)) throw err;
        console.log(`  ${model} unavailable on this project, trying next`);
        lastError = err;
      }
    }
    throw lastError;
  });
}

function transcriptionRequest(model, mp3, filename) {
  const form = new FormData();
  form.append("file", new Blob([mp3], { type: "audio/mpeg" }), filename);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  return { body: form };
}

/**
 * Recover word-level timings by transcribing the audio we just generated.
 * Returns null when no transcription model is available, in which case the
 * caller falls back to estimated timings — a slightly less exact caption
 * reveal is far better than no tour at all.
 */
async function wordTimings(mp3, filename) {
  if (transcribeUnavailable) return null;

  const candidates = transcribeModel ? [transcribeModel] : TRANSCRIBE_MODELS;
  let lastError;

  // Retried as a whole: a stale 403 here would otherwise latch
  // `transcribeUnavailable` and silently downgrade every remaining segment to
  // estimated caption timing, which is a quality loss that survives the run.
  try {
    return await retryingSpuriousDenial("transcription", async () => {
      let denial;
      for (const model of candidates) {
        try {
          const res = await callOpenAI("audio/transcriptions", transcriptionRequest(model, mp3, filename));
          const json = await res.json();
          if (!transcribeModel) {
            transcribeModel = model;
            console.log(`  timing model: ${model}`);
          }
          return {
            words: json.words ?? [],
            durationMs: Math.round((json.duration ?? 0) * 1000),
          };
        } catch (err) {
          if (!isModelUnavailable(err)) throw err;
          denial = err;
        }
      }
      throw denial;
    });
  } catch (err) {
    if (!isModelUnavailable(err)) throw err;
    lastError = err;
  }

  transcribeUnavailable = true;
  console.log(
    `\n  ! No transcription model available on this project (${lastError?.code ?? "access denied"}).\n` +
      `    Falling back to estimated caption timings for every segment.\n` +
      `    Enable whisper-1 in the OpenAI dashboard and re-run for exact sync.\n`,
  );
  return null;
}

/**
 * Duration of an MPEG audio buffer, by walking its frame headers.
 *
 * Needed only on the fallback path: without transcription there is no reported
 * duration, and the caption reveal still has to span exactly the length of the
 * clip. Handles CBR and VBR by summing each frame's own duration.
 */
function mp3DurationMs(buf) {
  const BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BITRATES_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

  let ms = 0;
  let i = 0;

  while (i < buf.length - 4) {
    // Frame sync: eleven set bits.
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }

    const versionBits = (buf[i + 1] >> 3) & 0x03;
    const layerBits = (buf[i + 1] >> 1) & 0x03;
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    const rateIndex = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;

    const rates = RATES[versionBits];
    // layerBits 1 == Layer III; reserved values mean this is not a frame start.
    if (!rates || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      i += 1;
      continue;
    }

    const isV1 = versionBits === 3;
    const kbps = (isV1 ? BITRATES_V1L3 : BITRATES_V2L3)[bitrateIndex];
    const sampleRate = rates[rateIndex];
    const samples = isV1 ? 1152 : 576;
    const frameLength = Math.floor((samples / 8) * ((kbps * 1000) / sampleRate)) + padding;

    if (frameLength <= 0) {
      i += 1;
      continue;
    }

    ms += (samples / sampleRate) * 1000;
    i += frameLength;
  }

  return Math.round(ms);
}

/**
 * Approximate word timings when transcription is unavailable: give each word a
 * share of the clip proportional to its length, which tracks speech rate far
 * better than an equal split does.
 */
function estimateWords(text, durationMs) {
  const tokens = [...text.matchAll(/\S+/g)].map((m) => m[0]);
  const weights = tokens.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = 0;
  return tokens.map((word, i) => {
    const span = (weights[i] / total) * durationMs;
    const start = cursor;
    cursor += span;
    return { word, start: start / 1000, end: cursor / 1000 };
  });
}

/**
 * Spread word timings across characters.
 *
 * Whisper returns timings for the words it *heard*, which will not line up
 * one-to-one with the words we *wrote* (numbers, punctuation and casing all
 * drift). So we walk our own text word by word, consume heard words in order,
 * and interpolate each character linearly inside its word's window. Any word
 * we cannot match inherits the previous timing, which keeps the reveal
 * monotonic — a caption that jumps backwards looks broken, a caption that
 * drifts slightly does not.
 */
function charTimings(text, words, durationMs) {
  const timings = new Array(text.length).fill(0);
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));

  let cursor = 0;
  let lastEnd = 0;

  tokens.forEach((token, i) => {
    const heard = words[cursor];
    let startMs;
    let endMs;

    if (heard) {
      startMs = Math.round(heard.start * 1000);
      endMs = Math.round(heard.end * 1000);
      cursor += 1;
    } else {
      // Ran out of heard words: pace the remainder evenly to the end.
      const remaining = tokens.length - i;
      const slice = Math.max(0, durationMs - lastEnd) / Math.max(1, remaining);
      startMs = lastEnd;
      endMs = lastEnd + slice;
    }

    startMs = Math.max(startMs, lastEnd);
    endMs = Math.max(endMs, startMs + 1);

    const span = token.end - token.start;
    for (let c = 0; c < span; c++) {
      timings[token.start + c] = Math.round(startMs + ((endMs - startMs) * c) / span);
    }
    // Whitespace before the next word holds the previous timestamp.
    for (let c = token.end; c < (tokens[i + 1]?.start ?? text.length); c++) {
      timings[c] = Math.round(endMs);
    }

    lastEnd = endMs;
  });

  return timings;
}

/** Turn word-anchored cues into millisecond offsets. */
function resolveCues(cues, text, timings) {
  if (!cues?.length) return [];
  const tokens = [...text.matchAll(/\S+/g)];

  const msAtWord = (n) => {
    const token = tokens[Math.min(Math.max(n, 1), tokens.length) - 1];
    return token ? timings[Math.min(token.index + token[0].length - 1, timings.length - 1)] : 0;
  };

  return cues.map(({ afterWord, removeAfterWord, ...rest }) => ({
    ...rest,
    atMs: msAtWord(afterWord),
    ...(removeAfterWord ? { outMs: msAtWord(removeAfterWord) } : {}),
  }));
}

async function loadScript() {
  // The script is TypeScript; strip the types rather than pulling in a compiler.
  const src = await readFile(path.join(ROOT, "src/lib/tour/script.ts"), "utf8");
  const body = src
    .replace(/^import[\s\S]*?;\s*$/m, "")
    .replace(/:\s*ScriptSegment\[\]/g, "")
    .replace(/:\s*Record<string,\s*string\[\]>/g, "")
    .replace(/export const/g, "const");
  const module = await import(
    `data:text/javascript,${encodeURIComponent(`${body}\nexport { TOUR_SCRIPT, PROJECT_CHAINS };`)}`
  );
  return module.TOUR_SCRIPT;
}

/**
 * Write the manifest as it currently stands.
 *
 * Called after every segment rather than once at the end. The hash guard reads
 * this file to decide what to skip, so a run that died on segment fifteen used
 * to throw away fourteen perfectly good clips — the MP3s survived on disk but
 * nothing recorded their timings. Writing as we go turns a crash into a resume,
 * which matters a great deal on a rate-limited project.
 */
async function writeManifest(segments) {
  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      {
        version: "1",
        generatedAt: new Date().toISOString(),
        voice: VOICE,
        ttsModel,
        transcribeModel,
        segments,
      },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  const script = await loadScript();
  await mkdir(AUDIO_DIR, { recursive: true });

  if (sampleMode) {
    const [first] = script;
    console.log(`Auditioning ${SAMPLE_VOICES.length} voices on "${first.text}"\n`);
    for (const voice of SAMPLE_VOICES) {
      const mp3 = await synthesise(first.text, voice);
      const out = path.join(AUDIO_DIR, `_sample-${voice}.mp3`);
      await writeFile(out, mp3);
      console.log(`  ${voice.padEnd(9)} -> ${path.relative(ROOT, out)}`);
    }
    console.log("\nListen, then re-run with TOUR_VOICE=<name> and no --sample.");
    return;
  }

  const previous = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, "utf8"))
    : { segments: [] };
  const priorById = new Map(previous.segments.map((s) => [s.id, s]));

  const segments = [];
  let generated = 0;

  for (const segment of script) {
    const hash = createHash("sha1")
      .update(`${VOICE}::${segment.text}`)
      .digest("hex")
      .slice(0, 12);
    const prior = priorById.get(segment.id);
    const audioPath = path.join(AUDIO_DIR, `${segment.id}.mp3`);

    // Unchanged text + voice and the file still exists: reuse, spend nothing.
    if (prior?.hash === hash && existsSync(audioPath)) {
      segments.push({ ...prior, cues: resolveCues(segment.cues, segment.text, prior.charTimingsMs) });
      console.log(`  = ${segment.id} (unchanged)`);
      continue;
    }

    process.stdout.write(`  + ${segment.id} … `);
    const mp3 = await synthesise(segment.text, VOICE);
    await writeFile(audioPath, mp3);

    const heard = await wordTimings(mp3, `${segment.id}.mp3`);
    const durationMs = heard?.durationMs || mp3DurationMs(mp3);
    const words = heard?.words?.length ? heard.words : estimateWords(segment.text, durationMs);
    const timings = charTimings(segment.text, words, durationMs);

    segments.push({
      id: segment.id,
      kind: segment.kind,
      text: segment.text,
      projectSlug: segment.projectSlug,
      next: segment.next,
      audio: `/tour/audio/${segment.id}.mp3`,
      durationMs,
      charTimingsMs: timings,
      cues: resolveCues(segment.cues, segment.text, timings),
      timingSource: heard?.words?.length ? "transcribed" : "estimated",
      hash,
    });

    generated += 1;
    await writeManifest(segments);
    console.log(
      `${(durationMs / 1000).toFixed(1)}s, ${words.length} words` +
        (heard?.words?.length ? "" : " (estimated timing)"),
    );
  }

  await writeManifest(segments);

  const total = segments.reduce((sum, s) => sum + s.durationMs, 0);
  const estimated = segments.filter((s) => s.timingSource === "estimated").length;

  console.log(
    `\n${generated} generated, ${segments.length - generated} reused.\n` +
      `Tour runs ${(total / 60000).toFixed(1)} minutes.\n` +
      `Manifest: ${path.relative(ROOT, MANIFEST)}`,
  );
  if (estimated) {
    console.log(
      `\nNote: ${estimated} segment(s) use estimated caption timing because no\n` +
        `transcription model was available. The tour works, but the letter-by-letter\n` +
        `sync will drift slightly. Enable whisper-1 on the project and re-run to fix.`,
    );
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
