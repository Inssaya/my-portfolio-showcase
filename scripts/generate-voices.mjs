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

const TTS_MODEL = "gpt-4o-mini-tts";
const TRANSCRIBE_MODEL = "whisper-1";

// Candidates to audition with --sample. Pick one, then set VOICE.
const SAMPLE_VOICES = ["alloy", "onyx", "nova", "shimmer"];
const VOICE = process.env.TOUR_VOICE ?? "onyx";

// Steering prompt for the TTS model — tone, not content.
const DELIVERY =
  "Speak like a confident, warm engineer introducing their own work to " +
  "someone they respect. Natural pace, clear articulation, never salesy.";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set.\n\nUsage:\n  OPENAI_API_KEY=sk-... node scripts/generate-voices.mjs");
  process.exit(1);
}

const sampleMode = process.argv.includes("--sample");

/** POST to the OpenAI API, retrying on rate limits and transient failures. */
async function callOpenAI(endpoint, { body, headers = {} }, attempt = 1) {
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, ...headers },
    body,
  });

  if (res.ok) return res;

  const retriable = res.status === 429 || res.status >= 500;
  if (retriable && attempt <= 4) {
    const wait = 2 ** attempt * 1000;
    console.log(`   ${res.status} — retrying in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return callOpenAI(endpoint, { body, headers }, attempt + 1);
  }

  throw new Error(`${endpoint} failed: ${res.status} ${await res.text()}`);
}

async function synthesise(text, voice) {
  const res = await callOpenAI("audio/speech", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input: text,
      instructions: DELIVERY,
      response_format: "mp3",
    }),
  });
  return Buffer.from(await res.arrayBuffer());
}

/** Transcribe the generated audio to recover word-level timings. */
async function wordTimings(mp3, filename) {
  const form = new FormData();
  form.append("file", new Blob([mp3], { type: "audio/mpeg" }), filename);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await callOpenAI("audio/transcriptions", { body: form });
  const json = await res.json();
  return {
    words: json.words ?? [],
    durationMs: Math.round((json.duration ?? 0) * 1000),
  };
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

    const { words, durationMs } = await wordTimings(mp3, `${segment.id}.mp3`);
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
      hash,
    });

    generated += 1;
    console.log(`${(durationMs / 1000).toFixed(1)}s, ${words.length} words`);
  }

  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      { version: "1", generatedAt: new Date().toISOString(), voice: VOICE, segments },
      null,
      2,
    )}\n`,
  );

  const total = segments.reduce((sum, s) => sum + s.durationMs, 0);
  console.log(
    `\n${generated} generated, ${segments.length - generated} reused.\n` +
      `Tour runs ${(total / 60000).toFixed(1)} minutes.\n` +
      `Manifest: ${path.relative(ROOT, MANIFEST)}`,
  );
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
