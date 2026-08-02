import { useEffect, useRef } from "react";

/**
 * Soft, slowly drifting coloured clouds — the "nebulae" the starfield sits in.
 *
 * The mesh and the stars each work well on their own, but the empty space
 * *between* them was still empty: the cards, even at low opacity, ate that
 * space because there was nothing behind to eat. This layer fills that void
 * with big soft blobs of accent-red, sky-blue and a purple bridge tone. Now
 * the glass on every card has actual colour to filter — the transparency
 * finally has something to show.
 *
 * Rendered with big radial gradients that redraw each frame. No CSS `filter:
 * blur` — that's the single most expensive property on mobile GPUs, and a soft
 * enough gradient stop reads the same to the eye without paying for it.
 */

interface Nebula {
  /** Normalized 0..1 base position on the viewport. */
  bx: number;
  by: number;
  /** How far it drifts around its base, in pixels. */
  driftAmp: number;
  driftSpeed: number;
  driftPhase: number;
  /** Radius in *pixels*, sized to the smaller viewport dimension at build. */
  radius: number;
  color: [number, number, number];
  /** Peak opacity at the centre. */
  intensity: number;
}

// A palette that reads as space: two warm accents, two cool blues, and one
// violet bridge that sits between them and stops the two halves feeling like
// separate compositions.
const PALETTE: Array<[number, number, number]> = [
  [241, 48, 36],  // accent red
  [125, 211, 252], // sky-300
  [56, 189, 248],  // sky-400
  [196, 181, 253], // violet-300 — the bridge
  [251, 146, 60],  // orange-400 — echoes the accent gradient
];

const Nebulae = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cloudsRef = useRef<Nebula[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const build = () => {
      const min = Math.min(window.innerWidth, window.innerHeight);
      // Six clouds: enough to always have colour in view, few enough to stay
      // legible as distinct patches rather than merging into a uniform wash.
      cloudsRef.current = Array.from({ length: 6 }, (_, i) => {
        const color = PALETTE[i % PALETTE.length];
        return {
          bx: 0.15 + Math.random() * 0.7,
          by: 0.15 + Math.random() * 0.7,
          driftAmp: min * (0.05 + Math.random() * 0.1),
          driftSpeed: 0.00003 + Math.random() * 0.00005,
          driftPhase: Math.random() * Math.PI * 2,
          radius: min * (0.35 + Math.random() * 0.25),
          color,
          intensity: 0.18 + Math.random() * 0.12,
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    resize();
    window.addEventListener("resize", resize);

    const render = (time: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      ctx.clearRect(0, 0, width, height);

      // Additive so overlapping clouds blend into brighter, warmer patches
      // instead of muddy overlaps.
      ctx.globalCompositeOperation = "lighter";

      for (const cloud of cloudsRef.current) {
        const t = reduceMotion ? 0 : time * cloud.driftSpeed + cloud.driftPhase;
        const x = cloud.bx * width + Math.cos(t) * cloud.driftAmp;
        const y = cloud.by * height + Math.sin(t * 1.3) * cloud.driftAmp * 0.7;

        const [r, g, b] = cloud.color;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, cloud.radius);
        // Three-stop gradient: hot core, soft mid, fully transparent edge so
        // the cloud doesn't clip against the viewport in a visible circle.
        gradient.addColorStop(0, `rgba(${r},${g},${b},${cloud.intensity})`);
        gradient.addColorStop(0.4, `rgba(${r},${g},${b},${cloud.intensity * 0.35})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, cloud.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // -z-15 sits between the stars (-z-20) and the mesh (-z-10), so the
      // stack from back to front reads: stars → nebulae → mesh → grid.
      className="fixed inset-0 -z-[15] pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
};

export default Nebulae;
