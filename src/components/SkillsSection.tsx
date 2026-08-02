import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import SectionHeading from "@/components/visuals/SectionHeading";
import TiltCard from "@/components/visuals/TiltCard";
import { adminData, SkillCategory } from "@/lib/admin-data";

const SkillsSection = () => {
  const [categories, setCategories] = useState<SkillCategory[]>([]);

  useEffect(() => {
    setCategories(adminData.getSkills());
  }, []);

  return (
    <section id="skills" className="py-24 relative">
      <div className="container mx-auto">
        <SectionHeading
          eyebrow="03 — Toolkit"
          title="Technical"
          accent="Skills"
          subtitle="The stack I reach for, grouped by where it sits in a system."
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {categories.map((category, i) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 34 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: Math.min(i * 0.08, 0.4) }}
            >
              <TiltCard className="h-full" max={6}>
                <div className="glass-card h-full p-6 transition-colors duration-300 hover:border-accent/50">
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h3 className="font-sora text-sm font-semibold uppercase tracking-wider text-accent">
                      {category.title}
                    </h3>
                    <span className="font-sora text-[10px] tabular-nums text-muted-foreground">
                      {String(category.skills.length).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {category.skills.map((skill, skillIndex) => (
                      <motion.span
                        key={skill}
                        initial={{ opacity: 0, scale: 0.85 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.35,
                          delay: Math.min(i * 0.08 + skillIndex * 0.025, 0.8),
                        }}
                        className="rounded-full border border-border/50 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        {skill}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SkillsSection;
