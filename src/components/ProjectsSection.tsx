import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const projects = [
  {
    title: "Plateforme E-commerce SaaS Multi-Vendeurs",
    tech: ["React", "Next.js", "Express", "MongoDB", "Redis", "Kafka"],
    description: "Architecture microservices avec Firebase, websockets et déploiement cloud (AWS).",
    status: "En cours",
  },
  {
    title: "Application Mobile Transport",
    tech: ["React Native"],
    description: "Application mobile de services de transport en cours de développement.",
    status: "En cours",
  },
  {
    title: "Système de Détection de Plagiat",
    tech: ["Python", "TF-IDF", "SBERT"],
    description: "Détection de plagiat utilisant des techniques de NLP avancées.",
    status: "Terminé",
  },
  {
    title: "Gestion des Vols (Web)",
    tech: ["Python", "Django", "Tailwind CSS"],
    description: "Application web de gestion des vols avec interface moderne.",
    status: "Terminé",
  },
  {
    title: "Site de Localisation de Voitures",
    tech: ["PHP", "Laravel", "JavaScript"],
    description: "Plateforme de localisation de véhicules avec carte interactive.",
    status: "Terminé",
  },
  {
    title: "To-Do List Web App",
    tech: ["React", "TypeScript", "Tailwind CSS"],
    description: "Application de gestion de tâches avec interface réactive.",
    status: "Terminé",
  },
];

const ProjectsSection = () => {
  return (
    <section id="projects" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          Projets <span className="text-gradient-accent">Académiques</span>
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {projects.map((project, i) => (
            <motion.div
              key={project.title}
              variants={fadeIn(0.1 + i * 0.08)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="glass-card p-6 group hover:border-accent/50 transition-all duration-300 flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                    project.status === "En cours"
                      ? "bg-accent/15 text-accent"
                      : "bg-green-500/15 text-green-400"
                  }`}
                >
                  {project.status}
                </span>
                <ExternalLink size={16} className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="font-sora font-semibold text-sm mb-2 leading-snug">{project.title}</h3>
              <p className="text-muted-foreground text-xs mb-4 flex-1">{project.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {project.tech.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                    {t}
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

export default ProjectsSection;
