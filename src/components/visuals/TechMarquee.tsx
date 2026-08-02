import { useEffect, useState } from "react";
import { adminData } from "@/lib/admin-data";

/**
 * An infinite ticker of the technologies from the skills data. The row is
 * duplicated end to end and translated by exactly half its width, so the loop
 * has no visible seam. Pauses on hover so a name can actually be read.
 */
const TechMarquee = () => {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const skills = adminData.getSkills().flatMap((category) => category.skills);
    // De-duplicate while preserving the order the skills are authored in.
    setItems([...new Set(skills)]);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden py-6 border-y border-border/30 bg-card/20 backdrop-blur-sm group"
    >
      {/* Feathered edges so items dissolve instead of being cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent" />

      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {items.map((item) => (
              <span key={`${copy}-${item}`} className="flex items-center whitespace-nowrap">
                <span className="font-sora text-sm md:text-base text-foreground/50 px-6">
                  {item}
                </span>
                <span className="w-1 h-1 rounded-full bg-accent/60" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TechMarquee;
