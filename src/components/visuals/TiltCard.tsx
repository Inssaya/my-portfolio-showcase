import { ReactNode, useRef, useState } from "react";
import { motion } from "framer-motion";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees on each axis. */
  max?: number;
}

/**
 * Tilts in 3D toward the pointer and tracks a light source across its surface,
 * so cards feel like physical panels catching a highlight. Static on touch.
 */
const TiltCard = ({ children, className = "", max = 8 }: TiltCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, active: false });

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    setTilt({ x: (0.5 - py) * max * 2, y: (px - 0.5) * max * 2 });
    setGlare({ x: px * 100, y: py * 100, active: true });
  };

  const reset = () => {
    setTilt({ x: 0, y: 0 });
    setGlare((g) => ({ ...g, active: false }));
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: "spring", stiffness: 200, damping: 20, mass: 0.5 }}
      style={{ transformStyle: "preserve-3d", perspective: 900 }}
      className={`relative ${className}`}
    >
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          opacity: glare.active ? 1 : 0,
          background: `radial-gradient(340px circle at ${glare.x}% ${glare.y}%, hsl(var(--accent) / 0.13), transparent 65%)`,
        }}
      />
    </motion.div>
  );
};

export default TiltCard;
