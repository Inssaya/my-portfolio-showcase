import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ChevronDown, X } from "lucide-react";

/**
 * Mobile navigation.
 *
 * Instead of the seven-icons-crammed-along-the-bottom bar every AI
 * portfolio ends up with, this shows a single labelled chip at the bottom
 * that always says which section the visitor is currently reading. Tap it
 * to expand a compact list of the whole site; tap a row to jump.
 *
 * The active section is inferred from scroll position rather than an
 * IntersectionObserver, so a partially-visible section still counts as
 * "the current one" (the reader is *reading* it — an observer would
 * flip states halfway through a scroll gesture, which reads as jitter).
 */

interface NavItem {
  id: string;
  name: string;
  order: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", name: "Home", order: 1 },
  { id: "about", name: "About", order: 2 },
  { id: "experience", name: "Experience", order: 3 },
  { id: "skills", name: "Skills", order: 4 },
  { id: "education", name: "Education", order: 5 },
  { id: "projects", name: "Projects", order: 6 },
  { id: "contact", name: "Contact", order: 7 },
];

/**
 * Which section the visitor is reading right now. The topmost section whose
 * top has crossed a trigger line at roughly a third of the viewport counts
 * as active — that matches how a reader thinks about it: "I'm reading the
 * projects section" is true once projects fills most of the screen, not the
 * instant its very first pixel appears.
 */
function useActiveSection(): string {
  const [active, setActive] = useState<string>(NAV_ITEMS[0].id);

  useEffect(() => {
    let frame = 0;
    let queued = false;

    const compute = () => {
      queued = false;
      const trigger = window.scrollY + window.innerHeight * 0.33;
      let current = NAV_ITEMS[0].id;
      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.id);
        if (el && el.offsetTop <= trigger) current = item.id;
      }
      setActive(current);
    };

    // rAF-throttled so scroll events don't call the DOM in a tight loop.
    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return active;
}

const MobileNav = () => {
  const activeId = useActiveSection();
  const active = NAV_ITEMS.find((item) => item.id === activeId) ?? NAV_ITEMS[0];
  const [open, setOpen] = useState(false);

  // Any navigation intent closes the sheet — Escape, backdrop tap, section
  // click. Keeping it open after a jump would sit on top of the content the
  // visitor just chose to see.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const jumpTo = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Full-viewport backdrop, tap to dismiss. Behind the sheet
                itself but above everything else on the page. */}
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm xl:hidden"
            />

            <motion.nav
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
              className="fixed inset-x-4 bottom-24 z-50 rounded-2xl border border-border/60 bg-card/90 p-2 backdrop-blur-xl xl:hidden"
              aria-label="Sections"
            >
              <ul>
                {NAV_ITEMS.map((item, i) => {
                  const isActive = item.id === activeId;
                  return (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: 0.03 + i * 0.02 }}
                    >
                      <button
                        type="button"
                        onClick={() => jumpTo(item.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors ${
                          isActive
                            ? "bg-accent/15 text-accent"
                            : "text-foreground/80 hover:bg-accent/10"
                        }`}
                      >
                        <span className="flex items-baseline gap-3">
                          <span className="font-sora text-[10px] tabular-nums text-muted-foreground">
                            {String(item.order).padStart(2, "0")}
                          </span>
                          <span className="font-sora text-base font-semibold">
                            {item.name}
                          </span>
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider">
                            reading
                          </span>
                        )}
                      </button>
                    </motion.li>
                  );
                })}
              </ul>

              <div className="mt-1 flex items-center gap-2 border-t border-border/40 px-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-accent"
                >
                  <ArrowUp size={12} />
                  Back to top
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* The chip. Always visible on non-desktop viewports, positioned so
          the AssistantWidget's Ask button still has room next to it. */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${active.name} — open navigation`}
        aria-expanded={open}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="fixed bottom-6 left-6 z-50 inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/80 py-2.5 pl-3.5 pr-3 font-sora text-xs font-semibold backdrop-blur-xl xl:hidden"
      >
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {String(active.order).padStart(2, "0")}
        </span>
        {/* The label morphs when the active section changes rather than
            hard-swapping, so the chip feels alive rather than flipping. */}
        <span className="relative inline-flex h-4 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={active.id}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
              className="whitespace-nowrap"
            >
              {active.name}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="text-muted-foreground"
        >
          <ChevronDown size={13} />
        </motion.span>
      </motion.button>
    </>
  );
};

export default MobileNav;
