import { motion } from "framer-motion";

const fadeIn = (direction: string, delay: number) => ({
  hidden: {
    y: direction === "up" ? 60 : 0,
    x: direction === "left" ? 60 : direction === "right" ? -60 : 0,
    opacity: 0,
  },
  show: {
    y: 0, x: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const skillCategories = [
  {
    title: "Languages",
    skills: ["C", "C++", "C#", "Java", "Python", "PHP", "JavaScript", "TypeScript"],
  },
  {
    title: "Frameworks & Libs",
    skills: ["React", "React Native", "Laravel", "Django", ".NET", "Bootstrap", "Tailwind CSS"],
  },
  {
    title: "Databases",
    skills: ["SQL", "PL/SQL", "SQL Server", "NoSQL", "MongoDB", "Redis"],
  },
  {
    title: "AI & Data Science",
    skills: ["MLOps", "NLP", "Deep Learning", "TensorFlow", "Computer Vision", "Multi-Agent Systems"],
  },
  {
    title: "DevOps & Tools",
    skills: ["Git", "Docker", "Linux", "CI/CD", "Kafka", "Firebase", "AWS"],
  },
  {
    title: "Architecture",
    skills: ["UML", "Merise", "MVC", "OOP", "TCP/IP", "Microservices"],
  },
];

const SkillsSection = () => {
  return (
    <section id="skills" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn("up", 0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          Technical <span className="text-gradient-accent">Skills</span>
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {skillCategories.map((cat, i) => (
            <motion.div
              key={cat.title}
              variants={fadeIn("up", 0.1 + i * 0.1)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="glass-card p-6 hover:border-accent/50 transition-colors"
            >
              <h3 className="font-sora text-accent font-semibold mb-4 text-sm uppercase tracking-wider">
                {cat.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {cat.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1.5 text-xs rounded-full bg-secondary text-foreground/80 border border-border/50 hover:border-accent/50 hover:text-accent transition-colors"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SkillsSection;
