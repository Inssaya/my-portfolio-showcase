import { useEffect, useRef } from "react";

/**
 * A drifting field of cool-blue stars, layered behind the warm red mesh.
 *
 * Runs in parallel with `MorphingCore` — the mesh reacts to scroll and pointer,
 * the starfield is autonomous: each star has its own gentle drift and its own
 * twinkle phase, so nothing here syncs to anything else. The two layers together
 * give the background a sense of depth without either dominating.
 *
 * Palette is intentionally cool (sky-blue → pale cyan → white) to sit opposite
 * the accent-red mesh. Warm and cool at once reads as space rather than as
 * decoration.
 */

const STAR_COUNT_DESKTOP = 220;
const STAR_COUNT_MOBILE = 110;

/** Sky-blue palette. RGB tuples so we can vary alpha per frame cheaply. */
const PALETTE: Array<[number, number, number]> = [
  [125, 211, 252], // sky-300 — the dominant hue
  [186, 230, 253], // sky-200 — softer
  [56, 189, 248], //  sky-400 — occasional pop
  [224, 231, 255], // indigo-100 — hint of violet for variety
  [255, 255, 255], // pure white — the brightest few
];

interface Star {
  /** Normalized 0..1 base position, so a resize doesn't reshuffle everything. */
  bx: number;
  by: number;
  /** Radial drift, in pixels, around the base position. */
  driftAmp: number;
  driftSpeed: number;
  driftPhase: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: [number, number, number];
  /** A few stars get a soft halo — the "big" ones the eye lands on. */
  hasHalo: boolean;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const Starfield = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? STAR_COUNT_MOBILE : STAR_COUNT_DESKTOP;

    starsRef.current = Array.from({ length: count }, () => {
      // A quarter of the stars are noticeably larger and get haloes.
      const bright = Math.random() < 0.22;
      return {
        bx: Math.random(),
        by: Math.random(),
        driftAmp: rand(6, 22),
        driftSpeed: rand(0.00015, 0.0004),
        driftPhase: Math.random() * Math.PI * 2,
        size: bright ? rand(1.4, 2.6) : rand(0.4, 1.3),
        brightness: bright ? rand(0.65, 0.95) : rand(0.25, 0.6),
        twinkleSpeed: rand(0.0007, 0.002),
        twinklePhase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        hasHalo: bright,
      };
    });

    // Cached dimensions. On mobile the address bar collapses on scroll and
    // fires a `resize` — if we recompute star positions from a new height
    // every time, every star jumps at once. So we lock the "logical" size
    // and only accept updates that look like a real layout change (width
    // change, or a big height jump like an orientation flip).
    let logicalWidth = 0;
    let logicalHeight = 0;

    const resize = (isReal = true) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (isReal) {
        logicalWidth = width;
        logicalHeight = height;
      }
    };

    resize();

    const onResize = () => {
      const dw = Math.abs(window.innerWidth - logicalWidth);
      const dh = Math.abs(window.innerHeight - logicalHeight);
      // Anything under ~150px of pure-height change is almost certainly a
      // mobile chrome collapse. Keep positions, just resize the canvas.
      const isRealLayoutChange = dw > 20 || dh > 150;
      resize(isRealLayoutChange);
    };

    window.addEventListener("resize", onResize);

    const render = (time: number) => {
      // Use the logical size, not window.inner*, so address-bar toggles on
      // mobile don't jerk every star sideways every frame.
      const width = logicalWidth;
      const height = logicalHeight;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Additive blending makes overlapping stars blossom into a bloom, which
      // is what a dense patch of sky actually looks like.
      ctx.globalCompositeOperation = "lighter";

      for (const star of starsRef.current) {
        const driftT = reduceMotion ? 0 : time * star.driftSpeed + star.driftPhase;
        const x = star.bx * width + Math.cos(driftT) * star.driftAmp;
        const y = star.by * height + Math.sin(driftT * 1.3) * star.driftAmp * 0.7;

        // Twinkle: brightness pulses between ~30% and 100% of its base value.
        const twinkle = reduceMotion
          ? 1
          : 0.65 + 0.35 * Math.sin(time * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.brightness * twinkle;
        const [r, g, b] = star.color;

        if (star.hasHalo) {
          const haloR = star.size * 4.2;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, haloR);
          gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.35})`);
          gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // -z-20 sits behind MorphingCore (-z-10) so the red mesh floats in front
      // of the blue field, and both stay behind the content.
      className="fixed inset-0 -z-20 pointer-events-none"
    />
  );
};

export default Starfield;
