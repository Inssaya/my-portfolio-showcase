import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Cinematic entrance: a counter races to 100 while the name is revealed, then
 * the curtain splits and lifts away. Shown once per browser session so it never
 * becomes an obstacle for a returning recruiter.
 */

const SESSION_KEY = "portfolio:intro-played";

const Preloader = () => {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;

    document.body.style.overflow = "hidden";
    const started = performance.now();
    const duration = 1900;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // Ease-out so the number sprints then settles, instead of running linearly.
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * 100));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        sessionStorage.setItem(SESSION_KEY, "1");
        setTimeout(() => setVisible(false), 420);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "";
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) document.body.style.overflow = "";
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          exit={{ pointerEvents: "none" }}
        >
          {/* Two panels that split apart to reveal the page underneath. */}
          <motion.div
            className="absolute inset-x-0 top-0 h-1/2 bg-background"
            exit={{ y: "-100%" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-background"
            exit={{ y: "100%" }}
            transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          />

          <motion.div
            className="relative z-10 flex flex-col items-center gap-6"
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.35 }}
          >
            <div className="overflow-hidden">
              <motion.p
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
                className="font-sora text-3xl md:text-5xl font-bold tracking-tight"
              >
                Yassine <span className="text-gradient-accent">Sinif</span>
              </motion.p>
            </div>

            <div className="w-48 h-px bg-border relative overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-accent"
                animate={{ width: `${count}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>

            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="font-sora text-xs tracking-[0.3em] text-muted-foreground tabular-nums"
            >
              {String(count).padStart(3, "0")}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Preloader;
