import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Hand-drawn SVG marks — wavy underlines, loose scribbles, tiny doodles.
 *
 * Everything here is a real SVG path that animates as if it were being
 * drawn: `pathLength` sweeps from 0 to 1 (framer-motion turns that into
 * a stroke-dashoffset tween), and some marks slowly redraw on a loop so
 * the composition feels alive rather than fixed. Rotations are slightly
 * off the axis on purpose — a perfectly aligned "hand-drawn" mark reads
 * as machine-drawn, which is what we're getting away from.
 */

// ---------------------------------------------------- WavyUnderline --------

interface WavyUnderlineProps {
  className?: string;
  /** Seconds before the stroke starts drawing. */
  delay?: number;
  /** How long a single draw takes, in seconds. */
  duration?: number;
  /** If true, the stroke re-draws itself every few seconds. */
  loop?: boolean;
  strokeWidth?: number;
}

/**
 * A single wavy underline that sits below whatever wraps it. Set the parent
 * to `relative` and the SVG floats to the bottom edge full-width.
 */
export const WavyUnderline = ({
  className = "",
  delay = 0,
  duration = 1.4,
  loop = false,
  strokeWidth = 2,
}: WavyUnderlineProps) => {
  const reduce = useReducedMotion();
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 24"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 -bottom-2 h-3 w-full text-accent ${className}`}
      fill="none"
    >
      <motion.path
        // Not a perfect sine wave — three uneven Bézier peaks with a slight
        // drop at the end, the sort of thing a hand doing an underline in
        // one pass actually produces.
        d="M 6 16 C 46 4, 100 22, 148 12 S 236 4, 292 16 S 380 10, 394 14"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={
          reduce
            ? { pathLength: 1, opacity: 1 }
            : loop
              ? {
                  pathLength: [0, 1, 1, 0],
                  opacity: [0, 1, 1, 0],
                }
              : { pathLength: 1, opacity: 1 }
        }
        transition={
          reduce
            ? { duration: 0 }
            : loop
              ? { duration: 6, times: [0, 0.25, 0.9, 1], repeat: Infinity, delay, ease: "easeInOut" }
              : { duration, delay, ease: [0.65, 0, 0.35, 1] }
        }
      />
    </svg>
  );
};

// ---------------------------------------------------- CurvedFlourish ------

interface CurvedFlourishProps {
  className?: string;
  delay?: number;
}

/**
 * A short curling line — used in the signature-off close in place of a
 * ruler-straight `h-px`. Draws once on enter, then breathes with a subtle
 * loop so the composition never fully "settles" into a static frame.
 */
export const CurvedFlourish = ({ className = "", delay = 0 }: CurvedFlourishProps) => {
  const reduce = useReducedMotion();
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 60 20"
      className={`h-4 w-14 text-accent ${className}`}
      fill="none"
    >
      <motion.path
        d="M 2 12 Q 16 2, 30 10 T 58 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 1.2, delay, ease: [0.65, 0, 0.35, 1] }}
      />
      {/* Tiny curl at the end — the pen lifting rather than stopping flat. */}
      <motion.path
        d="M 55 8 c 3 1, 4 4, 1 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, delay: delay + 1, ease: "easeOut" }}
      />
    </svg>
  );
};

// ---------------------------------------------------- MarginDoodles -------

/**
 * A single doodle in the design language — a slightly off-axis mark that
 * fades in, holds for a while, then fades out. Positioned absolutely inside
 * a `relative` parent.
 */
interface DoodleMark {
  id: number;
  d: string;
  viewBox: string;
  /** CSS positioning relative to the parent, in percentages. */
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  width: number;
  rotate: number;
  /** Seconds the mark stays fully visible mid-loop. */
  hold: number;
  delay: number;
}

/** Handful of paths — each traced from a scribble, not procedurally generated. */
const DOODLE_PATHS: Array<{ d: string; viewBox: string }> = [
  // Loose spiral
  {
    viewBox: "0 0 40 40",
    d: "M 20 20 m -3 0 a 3 3 0 1 1 6 0 a 6 6 0 1 1 -12 0 a 9 9 0 1 1 18 0 a 12 12 0 1 1 -24 0",
  },
  // Short dashed diagonal
  {
    viewBox: "0 0 40 40",
    d: "M 5 30 L 12 22 M 15 20 L 22 12 M 25 10 L 32 3",
  },
  // Curly bracket
  {
    viewBox: "0 0 40 40",
    d: "M 30 5 c -6 2, -6 10, -12 15 c 6 5, 6 13, 12 15",
  },
  // Zigzag arrow
  {
    viewBox: "0 0 50 30",
    d: "M 4 24 L 14 8 L 22 20 L 32 6 L 44 22 M 38 18 L 44 22 L 40 28",
  },
  // Three parallel curved lashes
  {
    viewBox: "0 0 40 40",
    d: "M 5 12 q 15 -8, 30 0 M 5 22 q 15 -8, 30 0 M 5 32 q 15 -8, 30 0",
  },
  // Small star burst — five short rays
  {
    viewBox: "0 0 40 40",
    d: "M 20 6 L 20 14 M 30 10 L 25 15 M 34 20 L 26 20 M 30 30 L 25 25 M 20 34 L 20 26 M 10 30 L 15 25 M 6 20 L 14 20 M 10 10 L 15 15",
  },
];

/** Positioned doodles that come and go in a loop. */
const DOODLE_PLACEMENT: Array<Omit<DoodleMark, "id" | "d" | "viewBox">> = [
  { top: "8%", left: "-2%", width: 34, rotate: -12, hold: 4, delay: 1.2 },
  { top: "42%", right: "-3%", width: 42, rotate: 18, hold: 5, delay: 3.6 },
  { bottom: "18%", left: "6%", width: 30, rotate: -25, hold: 3.5, delay: 6 },
  { top: "60%", right: "12%", width: 26, rotate: 8, hold: 4, delay: 8.4 },
  { bottom: "4%", right: "-1%", width: 38, rotate: -6, hold: 4, delay: 10.8 },
  { top: "22%", left: "18%", width: 22, rotate: 32, hold: 3, delay: 13.2 },
];

/**
 * Six ambient doodles orbiting a `relative` parent. Each fades in, holds,
 * fades out on its own schedule, so at any given moment two or three are
 * visible somewhere on the composition and never in the same rhythm.
 */
export const MarginDoodles = ({ className = "" }: { className?: string }) => {
  const reduce = useReducedMotion();

  // Pair each placement with a doodle path — shuffled per-mount so the
  // same doodle isn't always in the top-left.
  const [marks, setMarks] = useState<DoodleMark[]>([]);
  useEffect(() => {
    const paths = [...DOODLE_PATHS].sort(() => Math.random() - 0.5);
    setMarks(
      DOODLE_PLACEMENT.map((placement, i) => ({
        ...placement,
        ...paths[i % paths.length],
        id: i,
      })),
    );
  }, []);

  if (reduce) return null; // A reduced-motion visitor gets a still composition.

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {marks.map((mark) => (
        <div
          key={mark.id}
          className="absolute"
          style={{
            top: mark.top,
            left: mark.left,
            right: mark.right,
            bottom: mark.bottom,
            transform: `rotate(${mark.rotate}deg)`,
            width: mark.width,
            height: mark.width,
          }}
        >
          <svg
            viewBox={mark.viewBox}
            fill="none"
            className="h-full w-full text-accent/70"
            aria-hidden="true"
          >
            <motion.path
              d={mark.d}
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              // 5-step loop: draw in, hold, fade out, wait, repeat.
              animate={{
                pathLength: [0, 1, 1, 1, 0],
                opacity: [0, 0.9, 0.9, 0.6, 0],
              }}
              transition={{
                duration: mark.hold + 4,
                times: [0, 0.2, 0.5, 0.85, 1],
                repeat: Infinity,
                repeatDelay: 6,
                delay: mark.delay,
                ease: "easeInOut",
              }}
            />
          </svg>
        </div>
      ))}
    </div>
  );
};
