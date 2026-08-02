import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, GraduationCap } from "lucide-react";
import SectionHeading from "@/components/visuals/SectionHeading";
import TiltCard from "@/components/visuals/TiltCard";
import { adminData, Certificate, Education } from "@/lib/admin-data";

const EducationSection = () => {
  const [education, setEducation] = useState<Education[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  useEffect(() => {
    setEducation(adminData.getEducation());
    setCertificates(adminData.getCertificates());
  }, []);

  return (
    <section id="education" className="py-24 relative">
      <div className="container mx-auto">
        <SectionHeading
          eyebrow="04 — Learning"
          title="Academic"
          accent="Background"
          subtitle="Formal engineering education, plus the certifications I have taken on my own time."
        />

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
          {/* Degrees */}
          <div className="space-y-6">
            {education.map((edu, i) => (
              <motion.div
                key={edu.id}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
              >
                <TiltCard max={6}>
                  <div className="glass-card h-full p-7 transition-colors duration-300 hover:border-accent/50">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                        <GraduationCap className="text-accent" size={22} />
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
                        {edu.period}
                      </span>
                    </div>
                    <h3 className="font-sora text-lg font-bold leading-snug">{edu.title}</h3>
                    <p className="mt-1.5 text-sm text-accent/80">{edu.institution}</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {edu.description}
                    </p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>

          {/* Certifications */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.15 }}
          >
            <div className="glass-card h-full p-7">
              <h3 className="mb-5 font-sora text-sm font-semibold uppercase tracking-wider text-accent">
                Certifications
              </h3>
              <ul className="space-y-4">
                {certificates.map((certificate, i) => (
                  <motion.li
                    key={certificate.id}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.2 + i * 0.08 }}
                    className="group flex gap-3 border-b border-border/40 pb-4 last:border-0 last:pb-0"
                  >
                    <BadgeCheck
                      size={18}
                      className="mt-0.5 shrink-0 text-accent/70 transition-colors group-hover:text-accent"
                    />
                    <div>
                      <p className="text-sm font-medium leading-snug text-foreground/90">
                        {certificate.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{certificate.issuer}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default EducationSection;
