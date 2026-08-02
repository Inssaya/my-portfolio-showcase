import { AnimatePresence, motion } from "framer-motion";
import { VisualCue } from "@/lib/tour/types";

interface TourStageProps {
  cues: VisualCue[];
}

/** A stable key for a cue, since cues carry no id of their own. */
const cueKey = (cue: VisualCue, i: number) => `${cue.type}-${cue.src ?? cue.label ?? i}-${cue.atMs}`;

/**
 * The area above the caption where images and facts appear in time with the
 * narration. It reserves its height whether or not anything is showing, so the
 * caption underneath never jumps when a cue enters or leaves.
 */
const TourStage = ({ cues }: TourStageProps) => {
  const images = cues.filter((c) => c.type === "image" && c.src);
  const chips = cues.filter((c) => c.type !== "image" && c.type !== "list" && c.label);

  return (
    <div className="mb-10 flex min-h-[38svh] flex-col items-center justify-end gap-6">
      <AnimatePresence mode="popLayout">
        {images.map((cue, i) => (
          <motion.figure
            key={cueKey(cue, i)}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -12 }}
            transition={{ duration: 0.6, ease: [0.33, 1, 0.68, 1] }}
            className="glass-card overflow-hidden p-2"
          >
            <img
              src={cue.src}
              alt={cue.label ?? ""}
              loading="eager"
              className="max-h-[42svh] w-auto rounded-lg object-contain"
            />
            {cue.label && (
              <figcaption className="px-2 py-2 text-center text-xs text-muted-foreground">
                {cue.label}
              </figcaption>
            )}
          </motion.figure>
        ))}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <AnimatePresence mode="popLayout">
          {chips.map((cue, i) => (
            <motion.span
              key={cueKey(cue, i)}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
              className={
                cue.type === "title"
                  ? "font-sora text-2xl font-bold md:text-4xl"
                  : "rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 font-sora text-xs font-semibold uppercase tracking-wider text-accent md:text-sm"
              }
            >
              {cue.label}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TourStage;
