import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Github, FolderGit2 } from "lucide-react";
import ParticlesBackground from "@/components/ParticlesBackground";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";
import { adminData, Project, slugify } from "@/lib/admin-data";
import { PROJECT_GALLERIES } from "@/lib/project-galleries";

const ProjectDetail = () => {
  const { slug } = useParams();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const gallery = slug ? PROJECT_GALLERIES[slug] : undefined;

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
        <div className={`container mx-auto ${gallery ? "max-w-5xl" : "max-w-3xl"}`}>
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
              <span
                className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                  project.category === "Internship"
                    ? "bg-accent/15 text-accent"
                    : "bg-primary/15 text-primary"
                }`}
              >
                {project.category === "Personnel"
                  ? "Personal"
                  : project.category === "Académique"
                    ? "Academic"
                    : "Internship"}
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

          {gallery && (
            <div className="mt-16 space-y-16">
              {gallery.intro && (
                <p className="text-base leading-relaxed text-muted-foreground max-w-3xl">
                  {gallery.intro}
                </p>
              )}
              {gallery.sections.map((section, sIdx) => (
                <motion.section
                  key={section.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: Math.min(sIdx * 0.05, 0.2) }}
                  className="space-y-6"
                >
                  <div className="max-w-3xl">
                    <h2 className="font-sora text-2xl md:text-3xl font-semibold mb-3">
                      {section.title}
                    </h2>
                    {section.body && (
                      <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
                        {section.body}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {section.shots.map((shot) => (
                      <figure
                        key={shot.src}
                        className={`glass-card overflow-hidden ${
                          shot.span === "wide" ? "sm:col-span-2" : ""
                        }`}
                      >
                        <div className="bg-secondary/40 p-3">
                          <img
                            src={shot.src}
                            alt={shot.alt}
                            loading="lazy"
                            className="w-full h-auto rounded-lg border border-border/40"
                          />
                        </div>
                        <figcaption className="px-4 py-3 text-xs md:text-sm text-muted-foreground border-t border-border/40">
                          {shot.caption}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </motion.section>
              ))}
            </div>
          )}
        </div>
      </main>
      <footer className="relative z-10 py-6 text-center text-muted-foreground text-xs border-t border-border/30 pb-20 xl:pb-6">
        © 2026 Yassine Sinif. Tous droits réservés.
      </footer>
    </div>
  );
};

export default ProjectDetail;
