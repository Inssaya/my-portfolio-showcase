import { motion, useScroll, useSpring } from "framer-motion";

/** A thin accent bar across the top of the viewport tracking read progress. */
const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2px] origin-left z-[80] bg-gradient-to-r from-accent via-orange-400 to-accent"
    />
  );
};

export default ScrollProgress;
