import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import { TourStatus } from "@/lib/tour/engine";

interface TourControlsProps {
  status: TourStatus;
  muted: boolean;
  onPlayPause: () => void;
  onSkip: () => void;
  onToggleMute: () => void;
}

/**
 * Transport controls, pinned bottom-centre.
 *
 * Muting deliberately does not stop the tour: the captions carry it on their
 * own, so a visitor in an open office can still follow along.
 */
const TourControls = ({
  status,
  muted,
  onPlayPause,
  onSkip,
  onToggleMute,
}: TourControlsProps) => {
  const playing = status === "playing";
  const busy = status === "checkpoint" || status === "ended";

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/70 p-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={busy}
          aria-label={playing ? "Pause the tour" : "Resume the tour"}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          aria-label="Skip to the next part"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground"
        >
          <SkipForward size={15} />
        </button>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/60" />

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute the narration" : "Mute the narration"}
          aria-pressed={muted}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-accent-foreground ${
            muted ? "text-accent" : "text-foreground"
          }`}
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </div>
  );
};

export default TourControls;
