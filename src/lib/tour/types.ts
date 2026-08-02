/**
 * Types shared by the tour script, the voice-generation pipeline and the
 * playback engine. The generated manifest is the contract between all three:
 * nothing in the tour exists outside it.
 */

export type SegmentKind =
  | "greeting"
  | "narration"
  | "project-list"
  | "checkpoint"
  | "project-intro"
  | "project-slide"
  | "project-outro"
  | "closing";

/** Something that appears on the stage while a segment is being narrated. */
export interface VisualCue {
  /** Milliseconds from the start of this segment's audio. */
  atMs: number;
  /** When it leaves. Omitted means it stays until the segment ends. */
  outMs?: number;
  type: "image" | "fact" | "stat" | "list" | "title" | "tech";
  /** Public path for images, e.g. /tour/projects/nexora-ai/dashboard.jpg */
  src?: string;
  /** Short caption or label rendered with the cue. */
  label?: string;
  /** Free-form payload for list/stat cues. */
  payload?: unknown;
}

/**
 * A cue authored against the narration text rather than against a timestamp.
 * The pipeline resolves `afterWord` to a real `atMs` using the word timings
 * returned by transcription, so the script stays readable and never has to be
 * hand-tuned when the voice is regenerated.
 */
export interface AuthoredCue extends Omit<VisualCue, "atMs" | "outMs"> {
  /** Trigger once this word has been spoken (1-based index into the text). */
  afterWord: number;
  /** Optional: remove the cue this many words later. */
  removeAfterWord?: number;
}

export interface ScriptSegment {
  id: string;
  kind: SegmentKind;
  /** Exactly what the voice says. This is the text sent to the TTS model. */
  text: string;
  /** Cues authored against word positions; resolved to ms by the pipeline. */
  cues?: AuthoredCue[];
  /** Slug of the project this segment belongs to, for project segments. */
  projectSlug?: string;
  /** Next segment id. null hands control to the checkpoint logic. */
  next: string | null;
}

/** A segment after the pipeline has attached real audio and timings. */
export interface TourSegment extends Omit<ScriptSegment, "cues"> {
  audio: string;
  /** Total duration in milliseconds. */
  durationMs: number;
  /** Character-level reveal timings, one entry per character of `text`. */
  charTimingsMs: number[];
  cues: VisualCue[];
}

export interface TourManifest {
  version: string;
  generatedAt: string;
  voice: string;
  segments: TourSegment[];
}
