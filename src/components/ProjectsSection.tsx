import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import SectionHeading from "@/components/visuals/SectionHeading";
import TiltCard from "@/components/visuals/TiltCard";
import { adminData, Project, slugify } from "@/lib/admin-data";

type Filter = "All" | "Internship" | "Personnel" | "Académique";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "All", label: "All" },
  { id: "Internship", label: "Internship" },
  { id: "Personnel", label: "Personal" },
  { id: "Académique", label: "Academic" },
];

const CATEGORY_LABELS: Record<Project["category"], string> = {
  Internship: "Internship",
  Personnel: "Personal",
  Académique: "Academic",
};

const ProjectsSection = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    setProjects(adminData.getProjects());
  }, []);

  const visible = useMemo(
    () => (filter === "All" ? projects : projects.filter((p) => p.category === filter)),
    [projects, filter],
  );

  return (
    <section id="projects" className="py-24 relative">
      <div className="container mx-auto">
        <SectionHeading
          eyebrow="05 — Work"
          title="Selected"
          accent="Projects"
          subtitle="From RAG pipelines and multi-agent systems to production web platforms. Every card opens a full case study."
        />

        <div className="flex justify-center gap-2 mb-12">
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`relative rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  active ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* The pill slides between filters rather than cutting. */}
                {active && (
                  <motion.span
                    layoutId="project-filter-pill"
                    className="absolute inset-0 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </div>

        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <AnimatePresence mode="popLayout">
            {visible.map((project, i) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3) }}
              >
                <TiltCard className="h-full">
                  <Link
                    to={`/projects/${slugify(project.title)}`}
                    className="glass-card group relative flex h-full flex-col overflow-hidden p-6 transition-colors duration-300 hover:border-accent/50"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            project.status === "En cours"
                              ? "bg-accent/15 text-accent"
                              : "bg-green-500/15 text-green-400"
                          }`}
                        >
                          {project.status === "En cours" ? "In Progress" : "Completed"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            project.category === "Internship"
                              ? "bg-accent/15 text-accent"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {CATEGORY_LABELS[project.category]}
                        </span>
                      </div>
                      <ArrowUpRight
                        size={16}
                        className="shrink-0 text-muted-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </div>

                    <h3 className="mb-2 font-sora text-sm font-semibold leading-snug transition-colors group-hover:text-accent">
                      {project.title}
                    </h3>
                    <p className="mb-4 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {project.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {project.tech.slice(0, 5).map((tech) => (
                        <span
                          key={tech}
                          className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[10px] text-accent"
                        >
                          {tech}
                        </span>
                      ))}
                      {project.tech.length > 5 && (
                        <span className="rounded-full border border-border/50 px-2 py-1 text-[10px] text-muted-foreground">
                          +{project.tech.length - 5}
                        </span>
                      )}
                    </div>

                    {/* Accent rule that draws itself along the bottom edge on hover. */}
                    <span className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-accent to-transparent transition-transform duration-500 group-hover:scale-x-100" />
                  </Link>
                </TiltCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
};

export default ProjectsSection;
