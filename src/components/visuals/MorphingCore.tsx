import { useEffect, useRef } from "react";

/**
 * A 3D point cloud that morphs between shapes as the page is scrolled.
 * Sphere -> DNA helix -> neural layers -> lattice -> sphere.
 *
 * Everything is projected by hand (no 3D library) to keep the bundle small:
 * points live in model space, get rotated around Y then X, then divided by
 * depth for perspective. Edges are computed once from the sphere topology and
 * kept fixed while the points move, so the mesh stretches organically instead
 * of popping between shapes.
 */

type Vec3 = [number, number, number];

const POINT_COUNT_DESKTOP = 260;
const POINT_COUNT_MOBILE = 120;
const EDGE_NEIGHBOURS = 3;
const FOCAL = 620;

/** Evenly distributed points on a sphere (Fibonacci lattice). */
const sphere = (n: number, radius: number): Vec3[] => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius];
  });
};

/** Double helix — two intertwined strands, like a DNA ribbon. */
const helix = (n: number, radius: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const strand = i % 2;
    const t = i / n;
    const angle = t * Math.PI * 6 + strand * Math.PI;
    return [
      Math.cos(angle) * radius * 0.55,
      (t - 0.5) * radius * 2.2,
      Math.sin(angle) * radius * 0.55,
    ];
  });

/** Stacked neural-network layers, points scattered within each layer plane. */
const layers = (n: number, radius: number): Vec3[] => {
  const layerCount = 4;
  const perLayer = Math.ceil(n / layerCount);
  return Array.from({ length: n }, (_, i) => {
    const layer = Math.floor(i / perLayer);
    const withinLayer = i % perLayer;
    const cols = Math.ceil(Math.sqrt(perLayer));
    const row = Math.floor(withinLayer / cols);
    const col = withinLayer % cols;
    const spread = radius * 1.3;
    return [
      (layer / (layerCount - 1) - 0.5) * radius * 2.4,
      (row / (cols - 1) - 0.5) * spread,
      (col / (cols - 1) - 0.5) * spread,
    ];
  });
};

/** Cube lattice — a structured grid of nodes. */
const lattice = (n: number, radius: number): Vec3[] => {
  const side = Math.ceil(Math.cbrt(n));
  return Array.from({ length: n }, (_, i) => {
    const x = i % side;
    const y = Math.floor(i / side) % side;
    const z = Math.floor(i / (side * side)) % side;
    const step = (radius * 2) / (side - 1 || 1);
    return [x * step - radius, y * step - radius, z * step - radius];
  });
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const MorphingCore = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? POINT_COUNT_MOBILE : POINT_COUNT_DESKTOP;
    const radius = isMobile ? 170 : 280;
    // Push the cloud just far enough back that the nearest points land at depth
    // ~1 and the farthest at ~0.5 — that spread is what makes the glow read.
    const cameraOffset = radius * 1.02;

    // Every shape is sampled with the same point count so index k in one shape
    // maps to index k in the next — that is what makes the morph continuous.
    const shapes: Vec3[][] = [
      sphere(count, radius),
      helix(count, radius),
      layers(count, radius),
      lattice(count, radius * 0.8),
      sphere(count, radius),
    ];

    // Edges are derived from the sphere once: each point links to its nearest
    // neighbours in the *first* shape and keeps those links forever.
    const base = shapes[0];
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      const distances = base
        .map((p, j) => {
          const dx = p[0] - base[i][0];
          const dy = p[1] - base[i][1];
          const dz = p[2] - base[i][2];
          return { j, d: dx * dx + dy * dy + dz * dz };
        })
        .filter((entry) => entry.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, EDGE_NEIGHBOURS);
      for (const { j } of distances) {
        if (i < j) edges.push([i, j]);
      }
    }

    // Same address-bar-collapse guard as the other background layers: only
    // recentre the sphere when the layout really changes, not when a mobile
    // scroll toggles the address bar and jerks the reported viewport height.
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

    const onResize = () => {
      const dw = Math.abs(window.innerWidth - logicalWidth);
      const dh = Math.abs(window.innerHeight - logicalHeight);
      resize(dw > 20 || dh > 150);
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRef.current = max > 0 ? window.scrollY / max : 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };

    resize();
    onScroll();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // Smoothed values so the cloud eases toward the target instead of snapping.
    let smoothScroll = scrollRef.current;
    let smoothPointerX = 0;
    let smoothPointerY = 0;
    const projected = new Float32Array(count * 4); // x, y, scale, depth

    const render = (time: number) => {
      // Logical size (fixed unless a real layout change), not window.inner*,
      // so address-bar scroll toggles don't jerk the sphere across the screen.
      const width = logicalWidth;
      const height = logicalHeight;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      smoothScroll += (scrollRef.current - smoothScroll) * 0.06;
      smoothPointerX += (pointerRef.current.x - smoothPointerX) * 0.04;
      smoothPointerY += (pointerRef.current.y - smoothPointerY) * 0.04;

      // Which two shapes are we between, and how far?
      const position = smoothScroll * (shapes.length - 1);
      const from = Math.min(Math.floor(position), shapes.length - 2);
      const blend = smoothstep(Math.min(1, Math.max(0, position - from)));
      const shapeA = shapes[from];
      const shapeB = shapes[from + 1];

      const drift = reduceMotion ? 0 : time * 0.00012;
      const rotY = drift + smoothScroll * Math.PI * 1.5 + smoothPointerX * 0.4;
      const rotX = Math.sin(drift * 1.6) * 0.25 + smoothPointerY * 0.3;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const centreX = width / 2;
      const centreY = height / 2;

      for (let i = 0; i < count; i++) {
        const a = shapeA[i];
        const b = shapeB[i];
        const x = a[0] + (b[0] - a[0]) * blend;
        const y = a[1] + (b[1] - a[1]) * blend;
        const z = a[2] + (b[2] - a[2]) * blend;

        // Rotate around Y, then X.
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        const depth = FOCAL / (FOCAL + z2 + cameraOffset);
        projected[i * 4] = centreX + x1 * depth;
        projected[i * 4 + 1] = centreY + y1 * depth;
        projected[i * 4 + 2] = depth;
        projected[i * 4 + 3] = z2;
      }

      // Edges first, so nodes sit on top of them.
      ctx.lineWidth = 0.6;
      for (const [i, j] of edges) {
        const depthA = projected[i * 4 + 2];
        const depthB = projected[j * 4 + 2];
        const dx = projected[i * 4] - projected[j * 4];
        const dy = projected[i * 4 + 1] - projected[j * 4 + 1];
        const length = Math.sqrt(dx * dx + dy * dy);

        // Fade links out as the morph stretches them, so exploded shapes stay clean.
        const stretch = Math.max(0, 1 - length / (radius * 1.5));
        const alpha = stretch * Math.max(0, (depthA + depthB) / 2 - 0.45) * 1.1;
        if (alpha <= 0.01) continue;

        ctx.strokeStyle = `rgba(245, 211, 147, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(projected[i * 4], projected[i * 4 + 1]);
        ctx.lineTo(projected[j * 4], projected[j * 4 + 1]);
        ctx.stroke();
      }

      for (let i = 0; i < count; i++) {
        const depth = projected[i * 4 + 2];
        const alpha = Math.max(0, (depth - 0.45) * 1.7);
        if (alpha <= 0.01) continue;
        const size = depth * 2.9;
        const pulse = reduceMotion ? 1 : 0.75 + Math.sin(time * 0.002 + i * 0.5) * 0.25;

        // Closest nodes get a soft halo — cheap depth cue, reads as glow.
        if (depth > 0.86) {
          ctx.beginPath();
          ctx.arc(projected[i * 4], projected[i * 4 + 1], size * pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(241, 48, 36, ${(depth - 0.86) * 0.55})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(projected[i * 4], projected[i * 4 + 1], size * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241, 48, 36, ${alpha})`;
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
};

export default MorphingCore;
