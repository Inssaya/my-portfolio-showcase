import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { adminData, Project, slugify } from "@/lib/admin-data";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const ProjectsSection = () => {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => { setProjects(adminData.getProjects()); }, []);

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
          My <span className="text-gradient-accent">Projects</span>
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {projects.map((project, i) => (
            <motion.div
              key={project.id}
              variants={fadeIn(0.1 + i * 0.06)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              <Link
                to={`/projects/${slugify(project.title)}`}
                className="glass-card p-6 group hover:border-accent/50 transition-all duration-300 flex flex-col h-full"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                        project.status === "En cours"
                          ? "bg-accent/15 text-accent"
                          : "bg-green-500/15 text-green-400"
                      }`}
                    >
                      {project.status === "En cours" ? "In Progress" : "Completed"}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      {project.category === "Personnel" ? "Personal" : "Academic"}
                    </span>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
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
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;
