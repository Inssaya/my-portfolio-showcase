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
