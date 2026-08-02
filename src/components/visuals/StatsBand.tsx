import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { adminData } from "@/lib/admin-data";

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

/** Counts from zero to `value` once the band scrolls into view. */
const Counter = ({ value, suffix, active }: { value: number; suffix: string; active: boolean }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return;
    const duration = 1400;
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value]);

  return (
    <span className="font-sora text-4xl md:text-5xl font-bold text-gradient-accent tabular-nums">
      {display}
      {suffix}
    </span>
  );
};

/** Headline numbers, all derived from the real profile data rather than hardcoded. */
const StatsBand = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    const projects = adminData.getProjects();
    const technologies = new Set(adminData.getSkills().flatMap((c) => c.skills));
    const experience = adminData.getExperience();
    const certificates = adminData.getCertificates();

    setStats([
      { value: projects.length, suffix: "+", label: "Projects built" },
      { value: technologies.size, suffix: "+", label: "Technologies" },
      { value: experience.length, suffix: "", label: "Internships" },
      { value: certificates.length, suffix: "", label: "Certifications" },
    ]);
  }, []);

  return (
    <section ref={ref} className="py-20 relative">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="text-center"
            >
              <Counter value={stat.value} suffix={stat.suffix} active={inView} />
              <p className="mt-2 text-xs md:text-sm text-muted-foreground tracking-wide">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsBand;
