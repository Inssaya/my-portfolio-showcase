import { useEffect, useRef, useState } from "react";

/**
 * A soft light that trails the pointer, plus a ring that swells over anything
 * interactive. Pointer-device only — it never renders on touch, where there is
 * no cursor to augment.
 */
const CursorGlow = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setEnabled(finePointer.matches && !reduceMotion.matches);

    const onChange = () => setEnabled(finePointer.matches && !reduceMotion.matches);
    finePointer.addEventListener("change", onChange);
    reduceMotion.addEventListener("change", onChange);
    return () => {
      finePointer.removeEventListener("change", onChange);
      reduceMotion.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: target.x, y: target.y };
    let hovering = false;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;

      const el = e.target as HTMLElement | null;
      hovering = Boolean(el?.closest("a, button, [role='button'], input, textarea, select"));
    };

    const render = () => {
      // The dot tracks exactly; the ring lags behind for a trailing feel.
      ring.x += (target.x - ring.x) * 0.14;
      ring.y += (target.y - ring.y) * 0.14;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        const scale = hovering ? 1.9 : 1;
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        ringRef.current.style.opacity = hovering ? "0.9" : "0.4";
      }

      frame = requestAnimationFrame(render);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden="true"
        className="fixed top-0 left-0 z-[90] pointer-events-none w-1.5 h-1.5 rounded-full bg-accent"
      />
      <div
        ref={ringRef}
        aria-hidden="true"
        className="fixed top-0 left-0 z-[90] pointer-events-none w-9 h-9 rounded-full border border-accent/60 transition-[opacity] duration-200"
      />
    </>
  );
};

export default CursorGlow;
