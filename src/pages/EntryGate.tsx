import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Headphones, MousePointer2, Volume2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MorphingCore from "@/components/visuals/MorphingCore";
import { adminData } from "@/lib/admin-data";
import { rememberMode } from "@/lib/mode";

/**
 * The two-door entry screen.
 *
 * Choosing a door is also the user gesture that unlocks audio autoplay for the
 * guided tour, which is why the experience cannot simply start on its own.
 */

const doorVariants = {
  hidden: { opacity: 0, y: 40 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, delay: 0.35 + i * 0.12, ease: [0.33, 1, 0.68, 1] as const },
  }),
};

const EntryGate = () => {
  const navigate = useNavigate();
  const hero = adminData.getHero();

  // Both destinations are prefetched on arrival so neither door feels slower.
  useEffect(() => {
    void import("./Index.tsx");
    void import("./Experience.tsx");
  }, []);

  const choose = (mode: "classic" | "experience") => {
    rememberMode(mode);
    navigate(mode === "classic" ? "/classic" : "/experience");
  };

  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <MorphingCore />
      <div aria-hidden="true" className="grid-overlay" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-6 py-16">
        <motion.p
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="font-sora text-[11px] uppercase tracking-[0.35em] text-accent"
        >
          {hero.subtitle}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.33, 1, 0.68, 1] }}
          className="mt-5 text-center font-sora text-4xl font-bold leading-tight tracking-tight md:text-6xl"
        >
          Yassine <span className="text-gradient-accent">Sinif</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-4 max-w-md text-center text-sm text-muted-foreground md:text-base"
        >
          Two ways in. Read it yourself, or let me walk you through it.
        </motion.p>

        <div className="mt-12 grid w-full gap-5 md:grid-cols-2">
          {/* Door one — the conventional site. */}
          <motion.button
            type="button"
            custom={0}
            variants={doorVariants}
            initial="hidden"
            animate="show"
            onClick={() => choose("classic")}
            className="glass-card group relative overflow-hidden p-8 text-left transition-colors duration-300 hover:border-accent/50 focus-visible:border-accent focus-visible:outline-none"
          >
            <MousePointer2 className="mb-5 text-muted-foreground transition-colors group-hover:text-accent" size={26} />
            <h2 className="font-sora text-xl font-semibold">The Portfolio</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Everything on one page. Scroll at your own pace, skim what you
              want, leave when you're done.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent">
              Enter
              <ArrowRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
            <span className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-accent to-transparent transition-transform duration-500 group-hover:scale-x-100" />
          </motion.button>

          {/* Door two — the narrated tour. */}
          <motion.button
            type="button"
            custom={1}
            variants={doorVariants}
            initial="hidden"
            animate="show"
            onClick={() => choose("experience")}
            className="glass-card group relative overflow-hidden border-accent/30 p-8 text-left transition-colors duration-300 hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none"
          >
            {/* Signals up front that this one makes sound. */}
            <span className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <Volume2 size={11} />
              Sound
            </span>

            <Headphones className="mb-5 text-accent" size={26} />
            <h2 className="font-sora text-xl font-semibold">
              The Guided <span className="text-gradient-accent">Experience</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              I introduce myself out loud, walk you through the projects, and
              stop whenever you want to ask something.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent">
              Start the tour
              <ArrowRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
            <span className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-accent to-transparent transition-transform duration-500 group-hover:scale-x-100" />
          </motion.button>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-10 text-xs text-muted-foreground"
        >
          You can switch at any time.
        </motion.p>
      </div>
    </div>
  );
};

export default EntryGate;
