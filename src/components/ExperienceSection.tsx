import { motion } from "framer-motion";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const experience = [
  {
    period: "Jun 2026 – Present",
    title: "AI Data Engineer Intern",
    company: "Aptiv",
    location: "Tangier, Morocco · Maintenance Department",
    bullets: [
      "Built a maintenance intervention tracking and KPI platform, replacing a manual Excel workflow, and owned its technical specification end to end.",
      "Designed a predictive maintenance module ranking machines by failure risk, combining statistical reliability modeling with an ML classifier.",
      "Built an agentic RAG assistant calling retrieval and clustering tools over past maintenance reports to surface similar cases and suggest likely causes.",
      "Validated the full pipeline on synthetic data before touching production, keeping sensitive data on-premise.",
    ],
  },
  {
    period: "2024 – 2025 · 1 month",
    title: "Software Engineering Intern",
    company: "Web Agency",
    location: "Casablanca, Morocco",
    bullets: [
      "Developed a Laravel chatbot with database information retrieval.",
      "Built an automated PDF generation tool.",
    ],
  },
];

const ExperienceSection = () => {
  return (
    <section id="experience" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          Professional <span className="text-gradient-accent">Experience</span>
        </motion.h2>

        <div className="max-w-3xl mx-auto space-y-6">
          {experience.map((exp, i) => (
            <motion.div
              key={exp.title + exp.company}
              variants={fadeIn(0.1 + i * 0.15)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="glass-card p-6 md:p-8 hover:border-accent/50 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-sora text-lg font-bold">
                    {exp.title} <span className="text-accent">— {exp.company}</span>
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1">{exp.location}</p>
                </div>
                <span className="text-accent text-xs font-semibold uppercase tracking-wider whitespace-nowrap px-3 py-1 rounded-full bg-accent/10">
                  {exp.period}
                </span>
              </div>
              <ul className="space-y-2 mt-4">
                {exp.bullets.map((b, j) => (
                  <li key={j} className="text-muted-foreground text-sm leading-relaxed flex gap-2">
                    <span className="text-accent mt-1.5 shrink-0">▸</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ExperienceSection;
