import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Download, Github, Headphones, Linkedin, Mail } from "lucide-react";
import { Link } from "react-router-dom";
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
        {/* Two-column asymmetric layout: text takes more room than the photo,
            so the name still reads as the anchor of the composition. On
            mobile the photo moves above the text so the identity marker
            remains the first thing seen. */}
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.15fr_0.85fr] md:gap-14 lg:gap-20">
          {/* --- text column --- */}
          <div className="order-2 text-center md:order-1 md:text-left">
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="font-sora text-[11px] uppercase tracking-[0.2em] text-accent">
                Open to a PFE internship — Feb 2027
              </span>
            </motion.div>

            {/* The name, each word rising out of its own mask.
                whitespace-nowrap keeps "Yassine Sinif" on one line even at
                narrow phone widths — the size scales down instead of the
                composition breaking into two stacked words. */}
            <h1 className="mb-5 whitespace-nowrap font-sora text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
              {["Yassine", "Sinif"].map((word, wordIndex) => (
                <span
                  key={word}
                  // A real space between the masks — putting it inside
                  // overflow-hidden would collapse against the mask edge and
                  // "Yassine Sinif" would render as "YassineSinif".
                  className="inline-block overflow-hidden align-bottom [&+&]:ml-[0.25em]"
                >
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
                    {word}
                  </motion.span>
                </span>
              ))}
            </h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.55 }}
              className="mb-6 flex flex-wrap items-baseline justify-center gap-2 font-sora text-lg md:justify-start md:text-2xl"
            >
              <span className="text-muted-foreground">I build</span>
              <span className="font-semibold text-accent">
                <RotatingRole />
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.65 }}
              className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-muted-foreground md:mx-0 md:text-base"
            >
              {hero.description}
            </motion.p>

            {/* The tour invitation, styled distinctively so a recruiter reads
                it as an invitation rather than a fourth button. Clicking it
                is also the user gesture that unlocks audio autoplay for the
                tour — same reason the old entry gate was clickable. */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="mb-6 flex justify-center md:justify-start"
            >
              <Link
                to="/experience"
                className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent/70 hover:bg-accent/15 md:gap-3 md:px-5"
              >
                <Headphones size={15} />
                {/* Short form on phones so the pill stays a single line;
                    full sentence on desktop where there's room. The headphone
                    icon already tells the visitor it makes sound, which is
                    why the WITH SOUND chip is desktop-only too. */}
                <span className="md:hidden">Take the guided tour</span>
                <span className="hidden md:inline">
                  Prefer a guided tour? I'll walk you through it.
                </span>
                <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-accent/70 md:inline">
                  with sound
                </span>
                {/* Sheen sweep on hover, same trick as the primary CTA. */}
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-accent/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-wrap items-center justify-center gap-4 md:justify-start"
            >
              <MagneticButton
                href="#contact"
                onClick={scrollTo("#contact")}
                className="group relative overflow-hidden rounded-full bg-accent px-8 py-3.5 font-semibold text-accent-foreground shadow-[var(--shadow-glow)]"
              >
                <span className="relative z-10">Get In Touch</span>
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
              className="mt-10 flex items-center justify-center gap-6 md:justify-start"
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

          {/* --- portrait column ---
              Larger than the old centred avatar because it now anchors its
              own column. Hidden on phones: the narrow viewport can't hold a
              big name and a big photo side by side, and stacking them costs
              more vertical space than the photo earns above the fold. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
            className="hidden md:order-2 md:flex md:justify-end"
          >
            <div className="relative">
              {/* Slowly rotating conic-gradient ring around the portrait. */}
              <motion.div
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-2 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent, hsl(var(--accent)), transparent 55%)",
                }}
              />
              <div className="absolute -inset-1.5 rounded-full bg-background" />

              <img
                src={profileImage}
                alt="Yassine Sinif"
                loading="eager"
                className="relative h-52 w-52 rounded-full border border-border/60 object-cover md:h-64 md:w-64 lg:h-72 lg:w-72"
              />

              {/* Two orbiting dots, opposite directions, that visually echo
                  the starfield. Slow enough to feel alive, subtle enough not
                  to distract from the portrait. */}
              <motion.div
                aria-hidden="true"
                animate={{ rotate: 360 }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-6 rounded-full"
              >
                <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_10px_hsl(200_98%_74%/0.9)]" />
              </motion.div>
              <motion.div
                aria-hidden="true"
                animate={{ rotate: -360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-10 rounded-full"
              >
                <span className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-200/80 shadow-[0_0_8px_hsl(200_100%_86%/0.7)]" />
              </motion.div>
            </div>
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
