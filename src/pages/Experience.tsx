import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LayoutGrid, Loader2, Play, Volume2, VolumeX } from "lucide-react";
import MorphingCore from "@/components/visuals/MorphingCore";
import Starfield from "@/components/visuals/Starfield";
import Nebulae from "@/components/visuals/Nebulae";
import TourCaption from "@/components/tour/TourCaption";
import TourStage from "@/components/tour/TourStage";
import ProjectChooser from "@/components/tour/ProjectChooser";
import TourControls from "@/components/tour/TourControls";
import AssistantWidget from "@/components/assistant/AssistantWidget";
import { useTour, useTourManifest } from "@/lib/tour/useTour";
import { PROJECT_CHAINS } from "@/lib/tour/script";
import { TourManifest } from "@/lib/tour/types";
import { CV_URL } from "@/lib/cv";

/** Shown while the manifest loads, and if it turns out not to exist yet. */
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative min-h-[100svh] overflow-hidden">
    <Starfield />
    <Nebulae />
    <MorphingCore />
    <div aria-hidden="true" className="grid-overlay" />
    <div className="relative z-10 flex min-h-[100svh] items-center justify-center px-6">
      {children}
    </div>
  </div>
);

/**
 * The guided tour. Everything here is driven by the generated manifest; if the
 * voices have not been generated the page explains that rather than failing,
 * so the route is always safe to deploy.
 */
const TourPlayer = ({ manifest }: { manifest: TourManifest }) => {
  const tour = useTour({
    manifest,
    chains: PROJECT_CHAINS,
    closingSegmentId: "closing",
  });
  const [started, setStarted] = useState(false);

  const begin = async () => {
    setStarted(true);
    await tour.start();
  };

  // Space toggles play/pause, Escape skips — recruiters are impatient.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (tour.state?.status === "playing") tour.pause();
        else tour.resume();
      }
      if (e.code === "Escape") tour.skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, tour]);

  if (!started) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-md text-center"
        >
          <h1 className="font-sora text-3xl font-bold md:text-4xl">
            Ready when <span className="text-gradient-accent">you are</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            About {Math.max(1, Math.round(
              manifest.segments.filter((s) => !s.projectSlug).reduce((n, s) => n + s.durationMs, 0) /
                60000,
            ))} minutes, with sound. You can pause, skip or ask a question at any point.
          </p>
          <button
            type="button"
            onClick={begin}
            className="group mt-8 inline-flex items-center gap-2.5 rounded-full bg-accent px-8 py-3.5 font-semibold text-accent-foreground shadow-[var(--shadow-glow)]"
          >
            <Play size={16} className="transition-transform group-hover:scale-110" />
            Begin
          </button>
          <p className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-4 hover:text-accent">
              Or read the portfolio instead
            </Link>
          </p>
        </motion.div>
      </Shell>
    );
  }

  const atCheckpoint = tour.state?.status === "checkpoint";
  const ended = tour.state?.status === "ended";

  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <MorphingCore />
      <div aria-hidden="true" className="grid-overlay" />

      {/* Progress along the linear spine. */}
      <div className="fixed inset-x-0 top-0 z-40 h-[2px] bg-border/30">
        <motion.div
          className="h-full origin-left bg-gradient-to-r from-accent to-orange-400"
          animate={{ scaleX: tour.progress }}
          style={{ transformOrigin: "left" }}
          transition={{ ease: "linear", duration: 0.2 }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-4xl flex-col justify-center px-6 py-24">
        <TourStage cues={tour.cues} />

        <AnimatePresence mode="wait">
          {atCheckpoint ? (
            <ProjectChooser
              key="chooser"
              visited={tour.state?.visited ?? []}
              onSelect={tour.selectProject}
              onFinish={tour.finish}
            />
          ) : ended ? (
            <motion.div
              key="ended"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="font-sora text-2xl font-bold">Thanks for watching.</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={CV_URL}
                  download
                  className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
                >
                  Download my CV
                </a>
                <Link
                  to="/"
                  className="rounded-full border border-foreground/20 px-6 py-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
                >
                  Browse the portfolio
                </Link>
              </div>
            </motion.div>
          ) : (
            <TourCaption
              key="caption"
              revealed={tour.revealedText}
              pending={tour.pendingText}
            />
          )}
        </AnimatePresence>
      </div>

      <TourControls
        status={tour.state?.status ?? "idle"}
        muted={tour.muted}
        onPlayPause={() => (tour.state?.status === "playing" ? tour.pause() : tour.resume())}
        onSkip={tour.skip}
        onToggleMute={() => tour.setMuted(!tour.muted)}
      />

      <AssistantWidget
        onOpen={tour.interrupt}
        onResumeTour={tour.resume}
        pausedLabel={
          tour.state?.status === "interrupted" ? "Tour paused — ask me anything." : undefined
        }
        getContext={() => {
          const report = tour.getStatusReport();
          return [
            `The visitor is in the guided tour.`,
            report.currentText ? `They just heard: "${report.currentText}"` : null,
            report.activeProject ? `They are exploring the project: ${report.activeProject}` : null,
            report.visitedProjects.length
              ? `Projects they have already seen: ${report.visitedProjects.join(", ")}`
              : null,
            `Tour progress: ${report.progressPct}%.`,
            `If they ask to continue or resume, call resume_tour.`,
          ]
            .filter(Boolean)
            .join(" ");
        }}
      />

      <Link
        to="/"
        className="fixed left-5 top-5 z-40 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3.5 py-2 text-xs font-semibold text-muted-foreground backdrop-blur-md transition-colors hover:border-accent/50 hover:text-accent"
      >
        <LayoutGrid size={13} />
        Portfolio
      </Link>
    </div>
  );
};

const Experience = () => {
  const manifestState = useTourManifest();

  const body = useMemo(() => {
    if (manifestState.status === "loading") {
      return (
        <Loader2 className="animate-spin text-accent" size={28} aria-label="Loading the tour" />
      );
    }

    if (manifestState.status === "ready") return null;

    // Missing or broken manifest: say what is actually going on.
    return (
      <div className="max-w-md text-center">
        <h2 className="font-sora text-2xl font-bold">The tour isn't recorded yet</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {manifestState.status === "error"
            ? `The tour data could not be loaded (${manifestState.message}).`
            : "The narration audio has not been generated yet, so there is nothing to play."}
        </p>
        <Link
          to="/"
          className="mt-8 inline-block rounded-full bg-accent px-7 py-3 text-sm font-semibold text-accent-foreground"
        >
          Read the portfolio instead
        </Link>
      </div>
    );
  }, [manifestState]);

  if (manifestState.status === "ready") {
    return <TourPlayer manifest={manifestState.manifest} />;
  }

  return <Shell>{body}</Shell>;
};

export default Experience;
