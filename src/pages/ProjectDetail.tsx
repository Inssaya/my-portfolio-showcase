import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Github, FolderGit2 } from "lucide-react";
import ParticlesBackground from "@/components/ParticlesBackground";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";
import { adminData, Project, slugify } from "@/lib/admin-data";

const ProjectDetail = () => {
  const { slug } = useParams();
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    const projects = adminData.getProjects();
    const found = projects.find((p) => slugify(p.title) === slug);
    setProject(found ?? null);
  }, [slug]);

  if (project === undefined) return null;

  if (project === null) {
    return (
      <div className="relative min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <h1 className="font-sora text-3xl font-bold mb-4">Project not found</h1>
          <Link to="/#projects" className="text-accent hover:underline">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <ParticlesBackground />
      <Navigation />
      <MobileNav />
      <main className="relative z-10 min-h-screen py-24">
        <div className="container mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link
              to="/#projects"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-sm mb-8"
            >
              <ArrowLeft size={16} /> Back to projects
            </Link>

            {project.image ? (
              <img
                src={project.image}
                alt={project.title}
                className="w-full aspect-video object-cover rounded-2xl border border-border/50 mb-8"
              />
            ) : (
              <div className="w-full aspect-video rounded-2xl border border-border/50 mb-8 flex items-center justify-center bg-gradient-to-br from-accent/15 via-secondary to-primary/10">
                <FolderGit2 size={56} className="text-accent/60" />
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
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

            <h1 className="font-sora text-3xl md:text-5xl font-bold mb-6">{project.title}</h1>

            <p className="text-muted-foreground text-base leading-relaxed mb-8">
              {project.longDescription || project.description}
            </p>

            <div className="flex flex-wrap gap-2 mb-10">
              {project.tech.map((t) => (
                <span key={t} className="text-xs px-3 py-1.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  {t}
                </span>
              ))}
            </div>

            {(project.demoUrl || project.githubUrl) && (
              <div className="flex flex-wrap gap-4">
                {project.demoUrl && (
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
                  >
                    <ExternalLink size={16} /> Live Demo
                  </a>
                )}
                {project.githubUrl && (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-foreground/20 text-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    <Github size={16} /> Source Code
                  </a>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <footer className="relative z-10 py-6 text-center text-muted-foreground text-xs border-t border-border/30 pb-20 xl:pb-6">
        © 2026 Yassine Sinif. Tous droits réservés.
      </footer>
    </div>
  );
};

export default ProjectDetail;
