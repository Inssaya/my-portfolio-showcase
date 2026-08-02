import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Download, Github, Linkedin, Mail } from "lucide-react";
import MagneticButton from "@/components/visuals/MagneticButton";
import { adminData } from "@/lib/admin-data";
import { CV_URL } from "@/lib/cv";
import profileImage from "@/assets/profile.jpg";

const ROLES = [
  "AI & Data Engineer",
  "RAG & LLM Systems",
  "Full-Stack Developer",
  "Data Pipelines at Scale",
];

/** Cycles through the role list, one line swapping out for the next. */
const RotatingRole = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % ROLES.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="relative inline-flex h-[1.4em] overflow-hidden align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={ROLES[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="whitespace-nowrap"
        >
          {ROLES[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

const scrollTo = (selector: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
};

const HeroSection = () => {
  const { scrollYProgress } = useScroll();
  const [hero, setHero] = useState(() => adminData.getHero());
  const [links, setLinks] = useState(() => adminData.getSocialLinks());

  // The hero drifts up and dissolves as the next section arrives.
  const y = useTransform(scrollYProgress, [0, 0.18], [0, -90]);
  const opacity = useTransform(scrollYProgress, [0, 0.14], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.18], [1, 0.94]);

  useEffect(() => {
    setHero(adminData.getHero());
    setLinks(adminData.getSocialLinks());
  }, []);

  const socials = [
    { href: links.email ? `mailto:${links.email}` : "", icon: Mail, label: "Email" },
    { href: links.github, icon: Github, label: "GitHub" },
    { href: links.linkedin, icon: Linkedin, label: "LinkedIn" },
  ].filter((social) => social.href);

  return (
    <section id="home" className="relative min-h-[100svh] flex items-center overflow-hidden">
      {/* Warm bloom behind the composition, anchoring the centre of the screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[900px] max-h-[900px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.28), transparent 62%)" }}
      />

      <motion.div style={{ y, opacity, scale }} className="container mx-auto relative z-20">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          {/* Portrait inside a slowly rotating conic ring. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.33, 1, 0.68, 1] }}
            className="relative mb-8"
          >
            <motion.div
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-1.5 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent, hsl(var(--accent)), transparent 55%)",
              }}
            />
            <div className="absolute -inset-1 rounded-full bg-background" />
            <img
              src={profileImage}
              alt="Yassine Sinif"
              loading="eager"
              className="relative w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border border-border/60"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 mb-6"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="font-sora text-[11px] tracking-[0.2em] uppercase text-accent">
              Open to a PFE internship — Feb 2027
            </span>
          </motion.div>

          {/* The name, each word rising out of its own mask. */}
          <h1 className="font-sora text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.95] mb-5 tracking-tight">
            {["Yassine", "Sinif"].map((word, wordIndex) => (
              <span key={word} className="inline-block overflow-hidden align-bottom">
                <motion.span
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{
                    duration: 1,
                    delay: 0.25 + wordIndex * 0.12,
                    ease: [0.33, 1, 0.68, 1],
                  }}
                  className={`inline-block ${wordIndex === 1 ? "text-gradient-accent" : ""}`}
                >
                  {wordIndex === 0 ? `${word} ` : word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="font-sora text-lg md:text-2xl mb-6 flex items-baseline gap-2 justify-center flex-wrap"
          >
            <span className="text-muted-foreground">I build</span>
            <span className="text-accent font-semibold">
              <RotatingRole />
            </span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.65 }}
            className="text-muted-foreground text-sm md:text-base max-w-xl mb-10 leading-relaxed"
          >
            {hero.description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <MagneticButton
              href="#contact"
              onClick={scrollTo("#contact")}
              className="group relative overflow-hidden rounded-full bg-accent px-8 py-3.5 font-semibold text-accent-foreground shadow-[var(--shadow-glow)]"
            >
              <span className="relative z-10">Get In Touch</span>
              {/* Sheen that sweeps across on hover. */}
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </MagneticButton>

            <MagneticButton
              href="#projects"
              onClick={scrollTo("#projects")}
              className="rounded-full border border-foreground/20 px-8 py-3.5 font-semibold text-foreground transition-colors hover:border-accent hover:text-accent"
            >
              View Projects
            </MagneticButton>

            <a
              href={CV_URL}
              download
              className="group inline-flex items-center gap-2 px-2 py-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-accent"
            >
              <Download
                size={16}
                className="transition-transform duration-300 group-hover:translate-y-0.5"
              />
              Download CV
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="mt-10 flex items-center gap-6"
          >
            {socials.map(({ href, icon: Icon, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noreferrer" : undefined}
                className="text-muted-foreground transition-colors hover:text-accent"
              >
                <Icon size={20} />
              </a>
            ))}
          </motion.div>
        </div>
      </motion.div>

      <motion.a
        href="#about"
        onClick={scrollTo("#about")}
        aria-label="Scroll to about section"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 text-muted-foreground transition-colors hover:text-accent"
      >
        <motion.span
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="block"
        >
          <ArrowDown size={22} />
        </motion.span>
      </motion.a>
    </section>
  );
};

export default HeroSection;
