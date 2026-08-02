import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HtmlAudio } from "./audio";
import { TourEngine, TourState } from "./engine";
import { activeCues, revealedCharCount, tourProgress } from "./timing";
import { TourManifest } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; manifest: TourManifest }
  | { status: "missing" }
  | { status: "error"; message: string };

/**
 * Loads the generated manifest.
 *
 * A missing manifest is an expected state, not a failure: it just means the
 * voices have not been generated yet. The UI shows an explanatory panel rather
 * than an error, so the site never looks broken while that step is pending.
 */
export function useTourManifest(url = "/tour/manifest.json") {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then(async (res) => {
        if (res.status === 404) return { status: "missing" } as const;
        if (!res.ok) throw new Error(`manifest request failed: ${res.status}`);

        // A dev server with SPA fallback answers 200 with index.html for a
        // missing file, so verify we actually got the manifest.
        const text = await res.text();
        try {
          const manifest = JSON.parse(text) as TourManifest;
          if (!Array.isArray(manifest.segments) || manifest.segments.length === 0) {
            return { status: "missing" } as const;
          }
          return { status: "ready", manifest } as const;
        } catch {
          return { status: "missing" } as const;
        }
      })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

export interface UseTourOptions {
  manifest: TourManifest;
  chains: Record<string, string[]>;
  closingSegmentId?: string;
}

/**
 * Drives a `TourEngine` from React.
 *
 * The engine is the source of truth; this hook mirrors its state and runs the
 * animation frame loop that advances the caption. Derived values (revealed
 * text, visible cues) are computed here so components stay declarative.
 */
export function useTour({ manifest, chains, closingSegmentId }: UseTourOptions) {
  const audioRef = useRef<HtmlAudio | null>(null);
  const engineRef = useRef<TourEngine | null>(null);
  const [state, setState] = useState<TourState | null>(null);
  const [muted, setMutedState] = useState(false);

  if (!engineRef.current) {
    audioRef.current = new HtmlAudio();
    engineRef.current = new TourEngine({
      manifest,
      audio: audioRef.current,
      chains,
      closingSegmentId,
    });
  }

  const engine = engineRef.current;

  useEffect(() => engine.subscribe(setState), [engine]);
  useEffect(() => () => engine.destroy(), [engine]);

  // Advance the caption. The loop only runs while something is playing, so an
  // idle or paused tour costs nothing.
  useEffect(() => {
    if (state?.status !== "playing") return;
    let frame = 0;
    const tick = () => {
      engine.tick();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, state?.status]);

  // Preload the next clip so segment changes do not stall on the network.
  useEffect(() => {
    const nextId = state?.segment?.next;
    if (!nextId) return;
    const next = manifest.segments.find((s) => s.id === nextId);
    if (next) HtmlAudio.preload(next.audio);
  }, [manifest.segments, state?.segment?.next]);

  // Pause when the tab is hidden: narration playing to nobody is worse than
  // silence, and the visitor loses their place.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engine.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [engine]);

  const start = useCallback(async () => {
    await audioRef.current?.unlock();
    engine.start();
  }, [engine]);

  const setMuted = useCallback(
    (value: boolean) => {
      setMutedState(value);
      engine.setMuted(value);
    },
    [engine],
  );

  const segment = state?.segment ?? null;
  const positionMs = state?.positionMs ?? 0;

  const revealedCount = useMemo(
    () => (segment ? revealedCharCount(segment.charTimingsMs, positionMs) : 0),
    [segment, positionMs],
  );

  return {
    state,
    segment,
    positionMs,
    muted,

    /** The portion of the caption that has been spoken. */
    revealedText: segment ? segment.text.slice(0, revealedCount) : "",
    /** The rest, rendered dimmed so the line does not reflow as it fills in. */
    pendingText: segment ? segment.text.slice(revealedCount) : "",
    cues: segment ? activeCues(segment.cues, positionMs) : [],
    progress: tourProgress(manifest.segments, segment?.id ?? null, positionMs),

    start,
    pause: useCallback(() => engine.pause(), [engine]),
    resume: useCallback(() => engine.resume(), [engine]),
    skip: useCallback(() => engine.skip(), [engine]),
    interrupt: useCallback(() => engine.interrupt(), [engine]),
    selectProject: useCallback((slug: string) => engine.selectProject(slug), [engine]),
    finish: useCallback(() => engine.finish(), [engine]),
    setMuted,
    getStatusReport: useCallback(() => engine.getStatusReport(), [engine]),
  };
}
