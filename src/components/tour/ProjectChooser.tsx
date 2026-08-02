import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { adminData, Project, slugify } from "@/lib/admin-data";
import { PROJECT_CHAINS } from "@/lib/tour/script";

interface ProjectChooserProps {
  /** Slugs already watched, so they can be marked rather than hidden. */
  visited: string[];
  onSelect: (slug: string) => void;
  onFinish: () => void;
}

/**
 * The checkpoint: the voice has just asked the visitor to pick a project.
 *
 * Only projects that actually have a recorded walkthrough are offered — an
 * option that leads nowhere is worse than a shorter list.
 */
const ProjectChooser = ({ visited, onSelect, onFinish }: ProjectChooserProps) => {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const withChains = adminData
      .getProjects()
      .filter((project) => PROJECT_CHAINS[slugify(project.title)]);
    setProjects(withChains);
  }, []);

  const allSeen = projects.length > 0 && projects.every((p) => visited.includes(slugify(p.title)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
      className="w-full"
    >
      <p className="mb-8 text-center font-sora text-lg font-medium text-muted-foreground md:text-xl">
        {allSeen ? "That's all of them." : "Pick one and I'll walk you through it."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project, i) => {
          const slug = slugify(project.title);
          const seen = visited.includes(slug);

          return (
            <motion.button
              key={project.id}
              type="button"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              onClick={() => onSelect(slug)}
              className="glass-card group relative overflow-hidden p-5 text-left transition-colors duration-300 hover:border-accent/50 focus-visible:border-accent focus-visible:outline-none"
            >
              {seen && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-400">
                  <Check size={10} />
                  Seen
                </span>
              )}

              <h3 className="pr-16 font-sora text-sm font-semibold leading-snug transition-colors group-hover:text-accent">
                {project.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {project.description}
              </p>

              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                {seen ? "Watch again" : "Show me"}
                <ArrowRight
                  size={12}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={onFinish}
          className="text-xs font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-accent"
        >
          {allSeen ? "Wrap up" : "Skip to the end"}
        </button>
      </div>
    </motion.div>
  );
};

export default ProjectChooser;
