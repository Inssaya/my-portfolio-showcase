import { motion } from "framer-motion";
import { Briefcase, Globe, Award } from "lucide-react";

const fadeIn = (direction: string, delay: number) => ({
  hidden: {
    y: direction === "up" ? 60 : direction === "down" ? -60 : 0,
    x: direction === "left" ? 60 : direction === "right" ? -60 : 0,
    opacity: 0,
  },
  show: {
    y: 0, x: 0, opacity: 1,
    transition: { type: "tween", duration: 1, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const AboutSection = () => {
  return (
    <section id="about" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn("down", 0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          À Propos de <span className="text-gradient-accent">Moi</span>
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <motion.div
            variants={fadeIn("up", 0.2)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass-card p-8 text-center group hover:border-accent/50 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-accent/20 transition-colors">
              <Briefcase className="text-accent" size={24} />
            </div>
            <h3 className="font-sora text-lg font-semibold mb-2">Expérience</h3>
            <p className="text-muted-foreground text-sm">
              Stage chez Web Agency à Casablanca — Développement d'un chatbot avec Laravel, 
              générateur PDF et base de données.
            </p>
          </motion.div>

          <motion.div
            variants={fadeIn("up", 0.3)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass-card p-8 text-center group hover:border-accent/50 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-accent/20 transition-colors">
              <Globe className="text-accent" size={24} />
            </div>
            <h3 className="font-sora text-lg font-semibold mb-2">Langues</h3>
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground">Arabe</span> — Langue maternelle<br />
              <span className="text-foreground">Anglais</span> — Avancé<br />
              <span className="text-foreground">Français</span> — Intermédiaire
            </p>
          </motion.div>

          <motion.div
            variants={fadeIn("up", 0.4)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="glass-card p-8 text-center group hover:border-accent/50 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-accent/20 transition-colors">
              <Award className="text-accent" size={24} />
            </div>
            <h3 className="font-sora text-lg font-semibold mb-2">Certifications</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Python for Data Science (IBM) • Software Engineering (HKUST) • 
              Web Development (U. Michigan) • React Native (Meta)
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
