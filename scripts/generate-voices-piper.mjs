#!/usr/bin/env node
/**
 * Offline tour generation using Piper — the same output shape as
 * generate-voices.mjs, but with a local neural TTS instead of an API call.
 *
 * Why this exists:
 *   The primary pipeline calls OpenAI. In an environment where OpenAI is
 *   unreachable, or where the owner wants to avoid any spend at all, Piper
 *   produces an acceptable "placeholder" voice that can be swapped later just
 *   by rerunning the primary script — the manifest format is identical, and
 *   segments are keyed by a hash of their text, so unchanged segments get
 *   reused rather than re-synthesised.
 *
 *   The quality is noticeably below gpt-4o-mini-tts. That is fine: this
 *   pipeline exists so a visitor to /experience is never told "the voices are
 *   not recorded yet"; it does not claim to be the final voice.
 *
 * Requires:
 *   - piper CLI on PATH  (pip install piper-tts)
 *   - ffmpeg on PATH     (for the WAV -> MP3 conversion)
 *   - PIPER_MODEL env var pointing at an .onnx voice file. The .onnx.json
 *     sitting next to it is read automatically by piper.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUDIO_DIR = path.join(ROOT, "public", "tour", "audio");
const MANIFEST = path.join(ROOT, "public", "tour", "manifest.json");

const MODEL = process.env.PIPER_MODEL;
if (!MODEL) {
  console.error(
    "PIPER_MODEL is not set.\n\n" +
      "Point it at a Piper .onnx voice file. Models live at\n" +
      "https://github.com/rhasspy/piper/releases and unpack to a folder with\n" +
      "both <voice>.onnx and <voice>.onnx.json.\n\n" +
      "  PIPER_MODEL=/path/to/voice.onnx node scripts/generate-voices-piper.mjs",
  );
  process.exit(1);
}
if (!existsSync(MODEL)) {
  console.error(`PIPER_MODEL does not exist: ${MODEL}`);
  process.exit(1);
}

/**
 * Send `text` through the `piper` CLI and return a Node Buffer of the WAV it
 * emits on stdout. Piper reads its input on stdin one line at a time, so a
 * segment with embedded newlines would produce two separate clips — we join
 * with spaces to keep each segment to one clip.
 */
function pipeSynthesise(text) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "piper",
      ["--model", MODEL, "--output-raw"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const raw = [];
    child.stdout.on("data", (chunk) => raw.push(chunk));
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`piper exited ${code}: ${stderr.trim()}`));
      resolve(Buffer.concat(raw));
    });
    child.stdin.end(`${text.replace(/\s+/g, " ").trim()}\n`);
  });
}

/**
 * Piper's raw output is a headerless 22.05 kHz mono int16 PCM stream. Wrap it
 * in a WAV container so ffmpeg can decode it — a couple dozen bytes of header
 * are cheaper than a second CLI call to piper --output_file.
 */
function pcmToWav(pcm, sampleRate = 22050) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function wavToMp3(wav, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-f", "wav", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", outPath],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    ff.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim()))));
    ff.stdin.end(wav);
  });
}

/** Duration of a 22 050 Hz mono int16 PCM buffer, in milliseconds. */
const pcmDurationMs = (pcm) => Math.round((pcm.length / 2 / 22050) * 1000);

/**
 * Piper is deterministic and gives no word timings, so we estimate them from
 * the clip length weighted by word length — the same fallback the primary
 * pipeline uses. Slight drift versus true word boundaries; still monotonic.
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
  // Same TypeScript loader trick the primary pipeline uses — strip the types
  // rather than pull in a compiler.
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

const voiceLabel = path.basename(MODEL, ".onnx");

async function main() {
  const script = await loadScript();
  await mkdir(AUDIO_DIR, { recursive: true });

  const previous = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, "utf8"))
    : { segments: [] };
  const priorById = new Map(previous.segments.map((s) => [s.id, s]));

  const segments = [];
  let generated = 0;

  for (const segment of script) {
    const hash = createHash("sha1")
      .update(`piper::${voiceLabel}::${segment.text}`)
      .digest("hex")
      .slice(0, 12);
    const prior = priorById.get(segment.id);
    const audioPath = path.join(AUDIO_DIR, `${segment.id}.mp3`);

    if (prior?.hash === hash && existsSync(audioPath)) {
      segments.push({
        ...prior,
        cues: resolveCues(segment.cues, segment.text, prior.charTimingsMs),
      });
      console.log(`  = ${segment.id} (unchanged)`);
      continue;
    }

    process.stdout.write(`  + ${segment.id} … `);
    const pcm = await pipeSynthesise(segment.text);
    const durationMs = pcmDurationMs(pcm);
    await wavToMp3(pcmToWav(pcm), audioPath);

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
      hash,
    });

    generated += 1;
    console.log(`${(durationMs / 1000).toFixed(1)}s (piper/${voiceLabel})`);
  }

  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      {
        version: "1",
        generatedAt: new Date().toISOString(),
        voice: `piper/${voiceLabel}`,
        ttsModel: `piper/${voiceLabel}`,
        transcribeModel: null,
        segments,
      },
      null,
      2,
    )}\n`,
  );

  const total = segments.reduce((sum, s) => sum + s.durationMs, 0);
  console.log(
    `\n${generated} generated, ${segments.length - generated} reused.\n` +
      `Tour runs ${(total / 60000).toFixed(1)} minutes.\n` +
      `Manifest: ${path.relative(ROOT, MANIFEST)}\n\n` +
      `NOTE: These are Piper voices — offline placeholder quality.\n` +
      `Re-run scripts/generate-voices.mjs with an OpenAI key to upgrade them.`,
  );
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
