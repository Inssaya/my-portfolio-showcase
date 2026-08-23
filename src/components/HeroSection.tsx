import { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Download, Github, Headphones, Linkedin, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import MagneticButton from "@/components/visuals/MagneticButton";
import {
  CurvedFlourish,
  MarginDoodles,
  WavyUnderline,
} from "@/components/visuals/Handdrawn";
import { adminData } from "@/lib/admin-data";
import { CV_URL } from "@/lib/cv";
import profileImage from "@/assets/profile.jpg";

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
    // py-* is load-bearing, not decoration: with only min-height and centred
    // flex content, a phone whose viewport is barely taller than the copy puts
    // the name hard against the top edge with nothing above it. The padding
    // guarantees breathing room and lets the section grow and scroll instead of
    // clipping when the content is genuinely taller than the screen.
    <section
      id="home"
      className="relative flex min-h-[100svh] items-center overflow-hidden py-28 sm:py-32 md:py-24"
    >
      {/* Warm bloom behind the composition, anchoring the centre of the screen. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[900px] max-h-[900px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.28), transparent 62%)" }}
      />

      <motion.div style={{ y, opacity, scale }} className="container mx-auto relative z-20">
        {/* Ambient hand-drawn marks that fade in, hold, and fade out on their
            own schedules. They orbit the whole composition so the page never
            fully "settles" — something is always coming or going. */}
        <div className="relative mx-auto max-w-6xl">
          <MarginDoodles className="hidden md:block" />

          {/* Two-column asymmetric layout: text takes more room than the
              photo, so the name still reads as the anchor of the composition.
              On mobile the photo moves above the text so the identity marker
              remains the first thing seen. */}
          <div className="grid items-center gap-10 md:grid-cols-[1.15fr_0.85fr] md:gap-14 lg:gap-20">
          {/* --- text column ---
              Left-aligned on every viewport (centered text with a drop cap
              would fight itself). The byline lives at the end of the intro
              paragraph now, as a signed-letter close, rather than as a
              chip at the top. */}
          <div className="order-2 text-left md:order-1">

            {/* The name in Playfair Display, matching the CV. Roman for the
                first name, italic for the last — an editorial pairing that
                reads as designed rather than as a generic gradient effect.
                whitespace-nowrap keeps both words on one line even at narrow
                phone widths — size scales instead of the composition breaking.

                The word `italic` in Tailwind clashes with the framer-motion
                animate props on the span, hence the explicit `not-italic` /
                `italic` classes rather than a variant. */}
            {/* Fluid base size rather than a fixed text-5xl. `whitespace-nowrap`
                keeps both words on one line, so on a 360px phone — 296px once
                the container's 2rem gutters are removed — a fixed 48px set
                "Yassine Sinif" wider than the column and the section's
                overflow-hidden quietly sliced the end off. The clamp scales the
                name to the viewport, so it fills the width on a large phone and
                still fits on a small one. */}
            <h1 className="mb-7 whitespace-nowrap font-playfair text-[clamp(2.25rem,10vw,3rem)] font-medium leading-[0.95] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              {[
                { word: "Yassine", italic: false },
                { word: "Sinif", italic: true },
              ].map(({ word, italic }, wordIndex) => (
                <span
                  key={word}
                  // A real space between the masks — putting it inside
                  // overflow-hidden would collapse against the mask edge.
                  // `relative` is what lets the WavyUnderline sit against
                  // the "Sinif" mask specifically rather than the whole H1.
                  className={`relative inline-block overflow-hidden align-bottom [&+&]:ml-[0.28em] ${
                    italic ? "overflow-visible" : ""
                  }`}
                >
                  <motion.span
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 1,
                      delay: 0.25 + wordIndex * 0.12,
                      ease: [0.33, 1, 0.68, 1],
                    }}
                    className={`inline-block ${italic ? "italic" : "not-italic"}`}
                  >
                    {word}
                  </motion.span>
                  {/* Hand-drawn wavy underline traces itself under the last
                      name shortly after the mask reveal finishes. Draws in
                      once, then re-draws slowly on a loop so the line
                      breathes rather than sitting still. */}
                  {italic && (
                    <WavyUnderline delay={1.4} duration={1.6} loop strokeWidth={2.5} />
                  )}
                </span>
              ))}
            </h1>

            {/* The description is the whole introduction now — the
                specialty triptych and byline chip that used to sit around
                it were both saying what this paragraph already says. Two
                editorial print touches that AI-generated pages don't do:

                1. A drop cap on the first letter (big serif Playfair in
                   accent colour, floated left, text wraps around it).
                2. A signed-letter close underneath: a short accent rule
                   plus a location + availability line in italic serif.

                Together they read as a personal note rather than an app
                landing hero. */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.55 }}
              // Looser leading and a slightly wider measure: 1.65 on a 15px
              // serif-adjacent paragraph is tight for sustained reading on a
              // dark background, which is where "hard on the eyes" usually
              // comes from. 1.75 with a 34rem measure keeps lines in the
              // comfortable 60–75 character range.
              // Sized for whichever letter opens hero.description — currently
              // "H" (Hey, I'm...), previously "F". A wide, boxy capital like H
              // needs more right clearance than a narrow one like F or a
              // curved one like O, or the wrapped text crowds its right edge;
              // me-3 (vs. the old me-2) and a touch more size is a deliberate
              // compromise across letterforms, not tuned to any one of them.
              className="mb-7 max-w-[34rem] text-[15.5px] leading-[1.75] text-foreground/85 md:text-base
                         first-letter:me-3 first-letter:mt-1 first-letter:float-left
                         first-letter:font-playfair first-letter:text-[3.75rem]
                         first-letter:font-medium first-letter:leading-[0.85]
                         first-letter:text-accent md:first-letter:text-[4.25rem]"
            >
              {hero.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.7 }}
              className="mb-8 flex items-center gap-3 font-playfair text-sm italic text-muted-foreground"
            >
              {/* Was a ruler-straight h-px rule; now a hand-drawn curved
                  flourish that traces itself in and finishes with a small
                  curl. Same signature-off role, less machine-generated
                  feel. */}
              <CurvedFlourish delay={1.6} />
              <span>{links.location} — available now</span>
            </motion.div>

            {/* The tour invitation. Deliberately styled as a quiet link
                rather than a fourth button — a text-link with a hand-drawn
                dashed underline reads as an aside ("here's another way to
                see this if you want") rather than as a CTA competing with
                Get In Touch. The click still counts as the user gesture the
                tour needs to unlock audio autoplay. */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="mb-8 flex justify-start"
            >
              {/* This was a muted text link, which read as an aside and got
                  missed entirely. It is now a bordered invitation with an
                  accent tint — enough weight to be seen before the buttons
                  below it, without becoming the gradient pill CTA that was
                  deliberately retired. The three animated bars do the real
                  work: motion in the periphery is what the eye catches, and
                  they say "this makes sound" faster than the label does. */}
              <Link
                to="/experience"
                className="group inline-flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] py-2.5 pl-3.5 pr-4 transition-colors hover:border-accent/60 hover:bg-accent/[0.12]"
              >
                <span className="flex items-center gap-2 text-accent">
                  <Headphones size={15} />
                  {/* Equaliser bars: a cheap, honest "there is audio here". */}
                  <span aria-hidden="true" className="flex items-end gap-[2px]">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <motion.span
                        key={delay}
                        animate={{ scaleY: [0.4, 1, 0.4] }}
                        transition={{
                          duration: 1.1,
                          repeat: Infinity,
                          delay,
                          ease: "easeInOut",
                        }}
                        className="w-[2.5px] origin-bottom rounded-full bg-accent"
                        style={{ height: i === 1 ? 13 : 9 }}
                      />
                    ))}
                  </span>
                </span>

                <span className="text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                  <span className="sm:hidden">Take the guided tour</span>
                  <span className="hidden sm:inline">
                    Prefer to be walked through it? Take the guided tour
                  </span>
                </span>

                {/* 2.9 min of audio played at 1.2x ≈ 2.4 min of listening.
                    Stating the real number matters: a visitor deciding whether
                    to start will not forgive a tour that runs longer than the
                    badge promised. */}
                <span className="font-sora text-[10px] uppercase tracking-[0.15em] text-accent/80">
                  2½&nbsp;min
                </span>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-wrap items-center gap-4"
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
                transition={{ duration: 10.8, repeat: Infinity, ease: "linear" }}
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
                transition={{ duration: 16.9, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-6 rounded-full"
              >
                <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_10px_hsl(200_98%_74%/0.9)]" />
              </motion.div>
              <motion.div
                aria-hidden="true"
                animate={{ rotate: -360 }}
                transition={{ duration: 23.1, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-10 rounded-full"
              >
                <span className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-200/80 shadow-[0_0_8px_hsl(200_100%_86%/0.7)]" />
              </motion.div>
            </div>
          </motion.div>
          </div>
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
