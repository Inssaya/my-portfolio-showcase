import { motion } from "framer-motion";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const education = [
  {
    period: "2024 - 2026",
    title: "Engineering Degree in Computer Science & Networks",
    institution: "EMSI Casablanca",
    description: "Specialization in Artificial Intelligence and Data Science",
  },
  {
    period: "2022 - 2024",
    title: "Preparatory Classes",
    institution: "EMSI Rabat",
    description: "Intensive scientific program",
  },
];

const EducationSection = () => {
  return (
    <section id="education" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          Academic <span className="text-gradient-accent">Background</span>
        </motion.h2>

        <div className="max-w-3xl mx-auto relative">
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-border" />

          {education.map((edu, i) => (
            <motion.div
              key={i}
              variants={fadeIn(0.2 + i * 0.15)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className={`relative flex items-start gap-8 mb-12 ${
                i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
              }`}
            >
              <div className="absolute left-4 md:left-1/2 w-3 h-3 rounded-full bg-accent -translate-x-1/2 mt-2 z-10 shadow-[0_0_12px_hsl(6_90%_50%/0.5)]" />

              <div className={`ml-12 md:ml-0 md:w-1/2 ${i % 2 === 0 ? "md:pr-12 md:text-right" : "md:pl-12"}`}>
                <span className="text-accent text-sm font-semibold">{edu.period}</span>
                <h3 className="font-sora text-lg font-bold mt-1">{edu.title}</h3>
                <p className="text-accent/80 text-sm mt-1">{edu.institution}</p>
                <p className="text-muted-foreground text-sm mt-2">{edu.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EducationSection;
