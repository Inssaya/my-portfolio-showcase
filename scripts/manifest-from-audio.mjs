#!/usr/bin/env node
/**
 * Rebuild `public/tour/manifest.json` from whatever MP3s are already sitting
 * in `public/tour/audio/`.
 *
 * Use case: you generated the narration yourself — ElevenLabs, another API,
 * or a good voice actor — and dropped each clip in named after its segment
 * id (e.g. `greeting.mp3`, `aptiv-slide-4.mp3`). This script walks the tour
 * script, pairs each segment with its file, measures the clip length from
 * the MP3 frame headers, estimates character-level caption timings, resolves
 * the visual cues, and writes the manifest.
 *
 * Requires no network, no API key, no dependencies beyond Node.
 *
 * Run:
 *   node scripts/manifest-from-audio.mjs
 *   node scripts/manifest-from-audio.mjs --voice="Rachel (ElevenLabs)"
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "tour", "audio");
const MANIFEST = path.join(ROOT, "public", "tour", "manifest.json");

const voiceArg = process.argv.find((a) => a.startsWith("--voice="));
const VOICE = voiceArg ? voiceArg.slice("--voice=".length) : "custom";

// --------------------------------------------------------------- helpers --

/**
 * Duration of an MPEG audio buffer in milliseconds, by walking its frame
 * headers. Handles both CBR and VBR by summing each frame's own duration.
 */
function mp3DurationMs(buf) {
  const BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BITRATES_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const RATES = {
    3: [44100, 48000, 32000],
    2: [22050, 24000, 16000],
    0: [11025, 12000, 8000],
  };

  let ms = 0;
  let i = 0;
  while (i < buf.length - 4) {
    // Frame sync — eleven set bits.
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 0x03;
    const layer = (buf[i + 1] >> 1) & 0x03;
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    const rateIndex = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;

    const rates = RATES[version];
    if (!rates || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      i += 1;
      continue;
    }
    const isV1 = version === 3;
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
 * Estimate word timings across a clip of given length, weighted by word
 * length. Slight drift versus true word boundaries, but always monotonic —
 * the caption reveal never jumps backwards.
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

/** Spread word timings across every character in the segment text. */
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
  // The script is TypeScript; strip the types rather than pull in a compiler.
  const src = await readFile(path.join(ROOT, "src/lib/tour/script.ts"), "utf8");
  const body = src
    .replace(/^import[\s\S]*?;\s*$/m, "")
    .replace(/:\s*ScriptSegment\[\]/g, "")
    .replace(/:\s*Record<string,\s*string\[\]>/g, "")
    .replace(/export const/g, "const");
  const module = await import(
    `data:text/javascript,${encodeURIComponent(
      `${body}\nexport { TOUR_SCRIPT, PROJECT_CHAINS };`,
    )}`,
  );
  return module.TOUR_SCRIPT;
}

// ---------------------------------------------------------------- main --

const script = await loadScript();
const missing = [];
const empty = [];
const segments = [];

for (const segment of script) {
  const audioPath = path.join(AUDIO_DIR, `${segment.id}.mp3`);
  if (!existsSync(audioPath)) {
    missing.push(segment.id);
    continue;
  }
  const info = await stat(audioPath);
  if (info.size === 0) {
    empty.push(segment.id);
    continue;
  }

  const buf = await readFile(audioPath);
  const durationMs = mp3DurationMs(buf);
  if (durationMs === 0) {
    empty.push(`${segment.id} (unreadable)`);
    continue;
  }

  const words = estimateWords(segment.text, durationMs);
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
    timingSource: "estimated",
  });

  console.log(`  ✓ ${segment.id.padEnd(20)} ${(durationMs / 1000).toFixed(1)}s`);
}

if (missing.length) {
  console.log(`\n  ${missing.length} file(s) still missing:`);
  for (const id of missing) console.log(`    - ${AUDIO_DIR}/${id}.mp3`);
}
if (empty.length) {
  console.log(`\n  ${empty.length} file(s) empty or unreadable:`);
  for (const id of empty) console.log(`    - ${id}`);
}

if (segments.length === 0) {
  console.error("\nNo audio to write a manifest for. Drop the MP3s in public/tour/audio/ first.");
  process.exit(1);
}

await writeFile(
  MANIFEST,
  `${JSON.stringify(
    {
      version: "1",
      generatedAt: new Date().toISOString(),
      voice: VOICE,
      ttsModel: null,
      transcribeModel: null,
      segments,
    },
    null,
    2,
  )}\n`,
);

const total = segments.reduce((s, x) => s + x.durationMs, 0);
console.log(
  `\n${segments.length} segment(s) written to ${path.relative(ROOT, MANIFEST)}\n` +
    `Tour runs ${(total / 60000).toFixed(1)} minute(s).\n` +
    (missing.length
      ? `Partial: ${missing.length} still missing — the tour will play what it has.\n`
      : `Complete.\n`),
);
