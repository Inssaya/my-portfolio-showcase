import { TourManifest, TourSegment } from "./types";

/**
 * The tour playback state machine.
 *
 * Audio is injected rather than constructed here, so the whole machine can be
 * driven by a fake clock in tests. Nothing in this file touches the DOM or
 * React; the hook in `useTour.ts` adapts it for components.
 */

export type TourStatus =
  | "idle"
  | "playing"
  | "paused"
  | "checkpoint"
  | "interrupted"
  | "ended";

export interface TourState {
  status: TourStatus;
  segment: TourSegment | null;
  /** Position within the current segment, in milliseconds. */
  positionMs: number;
  /** Slugs of projects whose deep-dive has been watched. */
  visited: string[];
  /** Set while a project deep-dive is playing. */
  activeProject: string | null;
}

/**
 * A snapshot handed to the AI assistant when the visitor interrupts, so it can
 * answer "what is this?" about whatever was on screen.
 */
export interface TourStatusReport {
  mode: "experience";
  status: TourStatus;
  currentSegmentId: string | null;
  currentText: string | null;
  activeProject: string | null;
  visitedProjects: string[];
  narratedSoFar: string[];
  progressPct: number;
}

/** Minimal audio surface the engine needs. Implemented by `HtmlAudio`. */
export interface AudioPort {
  load(src: string): void;
  play(): Promise<void> | void;
  pause(): void;
  /** Current position in milliseconds. */
  currentMs(): number;
  seek(ms: number): void;
  /** Called when the clip finishes. Replaces any previous handler. */
  onEnded(handler: () => void): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

export interface TourEngineOptions {
  manifest: TourManifest;
  audio: AudioPort;
  /** Ordered segment ids per project slug. */
  chains: Record<string, string[]>;
  /** Id of the segment that closes the tour when the visitor is done. */
  closingSegmentId?: string;
}

export class TourEngine {
  private readonly manifest: TourManifest;
  private readonly audio: AudioPort;
  private readonly chains: Record<string, string[]>;
  private readonly closingSegmentId?: string;
  private readonly byId: Map<string, TourSegment>;
  private readonly listeners = new Set<(state: TourState) => void>();

  private state: TourState = {
    status: "idle",
    segment: null,
    positionMs: 0,
    visited: [],
    activeProject: null,
  };

  /** Segment ids narrated in full, in order — feeds the assistant's context. */
  private narrated: string[] = [];
  /** Where to resume once a project deep-dive finishes. */
  private returnToCheckpoint: string | null = null;

  constructor({ manifest, audio, chains, closingSegmentId }: TourEngineOptions) {
    this.manifest = manifest;
    this.audio = audio;
    this.chains = chains;
    this.closingSegmentId = closingSegmentId;
    this.byId = new Map(manifest.segments.map((s) => [s.id, s]));
    this.audio.onEnded(() => this.handleSegmentEnd());
  }

  // ----------------------------------------------------------- observation --

  subscribe(listener: (state: TourState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): TourState {
    return this.state;
  }

  private emit(patch: Partial<TourState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Refresh `positionMs` from the audio clock. Called from the render loop. */
  tick() {
    if (this.state.status !== "playing") return;
    this.emit({ positionMs: this.audio.currentMs() });
  }

  // -------------------------------------------------------------- playback --

  start() {
    const first = this.manifest.segments[0];
    if (!first) return;
    this.narrated = [];
    this.emit({ visited: [], activeProject: null });
    this.play(first.id);
  }

  private play(segmentId: string) {
    const segment = this.byId.get(segmentId);
    if (!segment) {
      this.emit({ status: "ended", segment: null });
      return;
    }

    // A checkpoint still narrates its own line; it only stops afterwards.
    this.audio.load(segment.audio);
    this.emit({
      status: "playing",
      segment,
      positionMs: 0,
      activeProject: segment.projectSlug ?? this.state.activeProject,
    });
    void this.audio.play();
  }

  private handleSegmentEnd() {
    const segment = this.state.segment;
    if (!segment) return;

    if (!this.narrated.includes(segment.id)) this.narrated.push(segment.id);

    // Finished the last slide of a project: mark it seen and go back to choose.
    const chain = segment.projectSlug ? this.chains[segment.projectSlug] : undefined;
    const isChainEnd = chain && chain[chain.length - 1] === segment.id;

    if (isChainEnd && segment.projectSlug) {
      const visited = this.state.visited.includes(segment.projectSlug)
        ? this.state.visited
        : [...this.state.visited, segment.projectSlug];
      this.emit({ visited, activeProject: null });
      this.enterCheckpoint();
      return;
    }

    if (segment.kind === "checkpoint") {
      this.enterCheckpoint();
      return;
    }

    if (segment.next) {
      this.play(segment.next);
      return;
    }

    this.emit({ status: "ended", positionMs: segment.durationMs });
  }

  private enterCheckpoint() {
    const checkpoint =
      this.manifest.segments.find((s) => s.kind === "checkpoint") ?? this.state.segment;
    this.returnToCheckpoint = checkpoint?.id ?? null;
    this.audio.pause();
    this.emit({
      status: "checkpoint",
      segment: checkpoint ?? null,
      positionMs: checkpoint?.durationMs ?? 0,
      activeProject: null,
    });
  }

  /** Jump straight to the end of the current segment. */
  skip() {
    if (this.state.status !== "playing" && this.state.status !== "paused") return;
    this.audio.pause();
    this.handleSegmentEnd();
  }

  pause() {
    if (this.state.status !== "playing") return;
    this.audio.pause();
    this.emit({ status: "paused", positionMs: this.audio.currentMs() });
  }

  resume() {
    if (this.state.status !== "paused" && this.state.status !== "interrupted") return;
    this.emit({ status: "playing" });
    void this.audio.play();
  }

  /**
   * Freeze everything because the visitor opened the assistant. Distinct from
   * `pause` so the UI can say "tour paused, ask me anything" rather than just
   * showing a play button.
   */
  interrupt() {
    if (this.state.status === "playing") {
      this.audio.pause();
      this.emit({ status: "interrupted", positionMs: this.audio.currentMs() });
      return;
    }
    // Interrupting at a checkpoint is legal and changes nothing to resume.
    if (this.state.status === "checkpoint") {
      this.emit({ status: "interrupted" });
    }
  }

  /** Begin (or restart) a project's deep-dive. */
  selectProject(slug: string) {
    const chain = this.chains[slug];
    if (!chain?.length) return;
    this.emit({ activeProject: slug });
    this.play(chain[0]);
  }

  /** Leave the checkpoint and play the closing segment. */
  finish() {
    if (this.closingSegmentId && this.byId.has(this.closingSegmentId)) {
      this.play(this.closingSegmentId);
      return;
    }
    this.emit({ status: "ended" });
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  destroy() {
    this.audio.destroy();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- report --

  getStatusReport(): TourStatusReport {
    const spine = this.manifest.segments.filter((s) => !s.projectSlug);
    const index = spine.findIndex((s) => s.id === this.state.segment?.id);

    return {
      mode: "experience",
      status: this.state.status,
      currentSegmentId: this.state.segment?.id ?? null,
      currentText: this.state.segment?.text ?? null,
      activeProject: this.state.activeProject,
      visitedProjects: this.state.visited,
      narratedSoFar: this.narrated
        .map((id) => this.byId.get(id)?.text)
        .filter((text): text is string => Boolean(text)),
      progressPct:
        spine.length > 0 && index >= 0 ? Math.round(((index + 1) / spine.length) * 100) : 0,
    };
  }
}
