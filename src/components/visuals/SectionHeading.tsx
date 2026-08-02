import { motion } from "framer-motion";
import RevealText from "./RevealText";

interface SectionHeadingProps {
  /** Small label above the title, e.g. "02 — Projects". */
  eyebrow?: string;
  /** Plain part of the title. */
  title: string;
  /** Part of the title painted with the accent gradient. */
  accent: string;
  subtitle?: string;
}

/** Shared section header: eyebrow, split title, drawn rule, optional subtitle. */
const SectionHeading = ({ eyebrow, title, accent, subtitle }: SectionHeadingProps) => (
  <div className="text-center mb-16">
    {eyebrow && (
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="font-sora text-[11px] tracking-[0.35em] uppercase text-accent mb-4"
      >
        {eyebrow}
      </motion.p>
    )}

    <h2 className="font-sora text-3xl md:text-5xl font-bold">
      <RevealText as="span" text={title} className="inline" />{" "}
      <RevealText as="span" text={accent} className="inline text-gradient-accent" delay={0.1} />
    </h2>

    <motion.div
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.25, ease: [0.33, 1, 0.68, 1] }}
      className="mx-auto mt-6 h-px w-24 origin-center bg-gradient-to-r from-transparent via-accent to-transparent"
    />

    {subtitle && (
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.35 }}
        className="mt-5 text-muted-foreground text-sm md:text-base max-w-xl mx-auto"
      >
        {subtitle}
      </motion.p>
    )}
  </div>
);

export default SectionHeading;
