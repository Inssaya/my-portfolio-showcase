import { TourSegment, VisualCue } from "./types";

/**
 * Pure timing helpers for the tour.
 *
 * These are deliberately free of React and of the Audio element so they can be
 * tested directly and called from a requestAnimationFrame loop without
 * allocating. The engine owns playback; this file only answers "given a
 * position in the clip, what should be on screen?".
 */

/**
 * How many characters of a segment's text should be visible at `currentMs`.
 *
 * `charTimingsMs` is sorted ascending (the pipeline guarantees monotonicity),
 * so this binary-searches rather than scanning — it runs on every animation
 * frame, and captions can be several hundred characters long.
 */
export function revealedCharCount(charTimingsMs: number[], currentMs: number): number {
  if (charTimingsMs.length === 0) return 0;
  // A character is revealed once its own timing is reached, so the comparison
  // is strict: at exactly charTimingsMs[0] the first character is already out.
  if (currentMs < charTimingsMs[0]) return 0;
  if (currentMs >= charTimingsMs[charTimingsMs.length - 1]) return charTimingsMs.length;

  let low = 0;
  let high = charTimingsMs.length - 1;

  // Find the first index whose timing is strictly greater than currentMs;
  // that index is exactly the number of characters already revealed.
  while (low < high) {
    const mid = (low + high) >> 1;
    if (charTimingsMs[mid] <= currentMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/** The cues that should be on screen at `currentMs`, in authored order. */
export function activeCues(cues: VisualCue[], currentMs: number): VisualCue[] {
  return cues.filter(
    (cue) => currentMs >= cue.atMs && (cue.outMs === undefined || currentMs < cue.outMs),
  );
}

/**
 * Fraction of the whole tour completed, treating the linear spine as the
 * measure. Project deep-dives are optional detours, so counting them would
 * make the bar jump backwards when a visitor picks a second project.
 */
export function tourProgress(
  segments: TourSegment[],
  currentSegmentId: string | null,
  currentMs: number,
): number {
  const spine = segments.filter((s) => !s.projectSlug);
  if (spine.length === 0) return 0;

  const index = spine.findIndex((s) => s.id === currentSegmentId);
  if (index === -1) {
    // Inside a project detour: hold at the checkpoint's position.
    const checkpoint = spine.findIndex((s) => s.kind === "checkpoint");
    return checkpoint === -1 ? 0 : checkpoint / spine.length;
  }

  const within = spine[index].durationMs > 0 ? currentMs / spine[index].durationMs : 0;
  return Math.min(1, (index + Math.min(1, Math.max(0, within))) / spine.length);
}

/** Total runtime of the linear spine, in milliseconds. */
export function spineDurationMs(segments: TourSegment[]): number {
  return segments.filter((s) => !s.projectSlug).reduce((sum, s) => sum + s.durationMs, 0);
}

/** A slice of a segment's text, shown as one caption beat. */
export interface CaptionBeat {
  /** Inclusive start index into the segment's text. */
  start: number;
  /** Exclusive end index into the segment's text. */
  end: number;
}

// A beat longer than this reads as a wall of text rather than a spoken
// thought — this is what most of the tour's short, single-sentence segments
// already are without any splitting (they never exceed it), and what a
// longer segment (see the tour's intro, one continuous clip covering what
// used to be four short segments) needs splitting *into*.
const MAX_BEAT_CHARS = 90;

/**
 * Break a segment's text into caption beats: TourCaption always renders a
 * beat's *entire* text at once (deliberately — see its own docstring on why
 * appending characters would reflow the line) rather than the whole
 * segment, so a long segment still reads as short beats arriving one at a
 * time instead of one paragraph dimly filling in.
 *
 * Splits on sentence boundaries first. Any sentence still longer than
 * MAX_BEAT_CHARS is further split at the comma nearest that limit, so one
 * very long sentence still breaks into readable pieces rather than staying
 * a single oversized beat.
 */
export function captionBeats(text: string): CaptionBeat[] {
  if (!text) return [];

  const sentences: CaptionBeat[] = [];
  const sentenceRe = /[^.!?]+[.!?]+(?:\s+|$)/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  while ((match = sentenceRe.exec(text))) {
    sentences.push({ start: match.index, end: match.index + match[0].length });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) sentences.push({ start: cursor, end: text.length });

  const beats: CaptionBeat[] = [];
  for (const sentence of sentences) {
    let start = sentence.start;
    while (sentence.end - start > MAX_BEAT_CHARS) {
      // The comma nearest MAX_BEAT_CHARS in, so beats stay close to even
      // length rather than front-loading one long piece and a short remainder.
      const window = text.slice(start, start + MAX_BEAT_CHARS);
      const commaAt = window.lastIndexOf(",");
      if (commaAt <= 0) break; // no good split point — keep the rest as one beat
      const splitAt = start + commaAt + 1;
      beats.push({ start, end: splitAt });
      start = splitAt;
    }
    beats.push({ start, end: sentence.end });
  }
  return beats;
}

/** Which beat covers `currentMs`, by looking up its character range's own
 *  timing — the last beat whose first character has already been reached. */
export function activeBeatIndex(
  beats: CaptionBeat[],
  charTimingsMs: number[],
  currentMs: number,
): number {
  if (beats.length === 0) return 0;
  let index = 0;
  for (let i = 0; i < beats.length; i++) {
    const startMs = charTimingsMs[beats[i].start] ?? 0;
    if (startMs <= currentMs) index = i;
    else break;
  }
  return index;
}
