import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Award, Briefcase, Globe, LucideIcon } from "lucide-react";
import SectionHeading from "@/components/visuals/SectionHeading";
import TiltCard from "@/components/visuals/TiltCard";
import { adminData, AboutCard } from "@/lib/admin-data";

const ICONS: Record<AboutCard["icon"], LucideIcon> = {
  Briefcase,
  Globe,
  Award,
};

const AboutSection = () => {
  const [cards, setCards] = useState<AboutCard[]>([]);

  useEffect(() => {
    setCards(adminData.getAbout());
  }, []);

  return (
    <section id="about" className="py-24 relative">
      <div className="container mx-auto">
        <SectionHeading eyebrow="01 — Profile" title="About" accent="Me" />

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {cards.map((card, i) => {
            const Icon = ICONS[card.icon] ?? Briefcase;
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.12 }}
              >
                <TiltCard className="h-full" max={7}>
                  <div className="glass-card group h-full p-8 text-center transition-colors duration-300 hover:border-accent/50">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 transition-all duration-300 group-hover:scale-110 group-hover:bg-accent/20">
                      <Icon className="text-accent" size={24} />
                    </div>
                    <h3 className="mb-3 font-sora text-lg font-semibold">{card.title}</h3>
                    {/* Content is authored with newlines in the admin panel. */}
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {card.content}
                    </p>
                  </div>
                </TiltCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
