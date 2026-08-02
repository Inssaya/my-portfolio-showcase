import { ReactNode, useRef, useState } from "react";
import { motion } from "framer-motion";

interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  target?: string;
  rel?: string;
  /** How far the element is allowed to travel toward the pointer, in pixels. */
  strength?: number;
}

/**
 * Pulls itself toward the pointer while hovered, then springs back on exit.
 * Falls back to a plain element on touch devices, where there is no hover.
 */
const MagneticButton = ({
  children,
  href,
  onClick,
  className = "",
  target,
  rel,
  strength = 14,
}: MagneticButtonProps) => {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const rect = el.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width - 0.5;
    const relativeY = (e.clientY - rect.top) / rect.height - 0.5;
    setOffset({ x: relativeX * strength * 2, y: relativeY * strength * 2 });
  };

  const reset = () => setOffset({ x: 0, y: 0 });

  const motionProps = {
    animate: { x: offset.x, y: offset.y },
    transition: { type: "spring" as const, stiffness: 260, damping: 18, mass: 0.4 },
    onMouseMove: handleMove,
    onMouseLeave: reset,
    className,
  };

  if (href) {
    return (
      <motion.a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        onClick={onClick}
        target={target}
        rel={rel}
        {...motionProps}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      onClick={onClick}
      type="button"
      {...motionProps}
    >
      {children}
    </motion.button>
  );
};

export default MagneticButton;
