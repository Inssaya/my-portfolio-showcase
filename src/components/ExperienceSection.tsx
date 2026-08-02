import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import SectionHeading from "@/components/visuals/SectionHeading";
import { adminData, Experience } from "@/lib/admin-data";

const ExperienceSection = () => {
  const [experience, setExperience] = useState<Experience[]>([]);

  useEffect(() => {
    setExperience(adminData.getExperience());
  }, []);

  return (
    <section id="experience" className="py-24 relative">
      <div className="container mx-auto">
        <SectionHeading eyebrow="02 — Career" title="Professional" accent="Experience" />

        <div className="relative max-w-3xl mx-auto">
          {/* Spine of the timeline, drawn downward as the section is revealed. */}
          <motion.div
            aria-hidden="true"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute left-[7px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-accent via-accent/40 to-transparent md:left-[9px]"
          />

          <div className="space-y-8">
            {experience.map((exp, i) => (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.15 }}
                className="relative pl-10 md:pl-14"
              >
                {/* Node on the spine. */}
                <span className="absolute left-0 top-2 flex h-4 w-4 items-center justify-center md:h-5 md:w-5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
                  <span className="relative h-3 w-3 rounded-full border-2 border-accent bg-background md:h-3.5 md:w-3.5" />
                </span>

                <div className="glass-card p-6 transition-colors duration-300 hover:border-accent/50 md:p-8">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-sora text-lg font-bold">
                        {exp.title} <span className="text-accent">— {exp.company}</span>
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{exp.location}</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                      {exp.period}
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {exp.bullets.map((bullet, j) => (
                      <motion.li
                        key={j}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: i * 0.15 + j * 0.06 }}
                        className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span>{bullet}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExperienceSection;
