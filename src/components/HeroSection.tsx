import { motion } from "framer-motion";
import { ArrowDown, Github, Linkedin, Mail } from "lucide-react";
import profileImg from "@/assets/profile.jpeg";

const fadeIn = (direction: string, delay: number) => ({
  hidden: {
    y: direction === "up" ? 60 : direction === "down" ? -60 : 0,
    x: direction === "left" ? 60 : direction === "right" ? -60 : 0,
    opacity: 0,
  },
  show: {
    y: 0,
    x: 0,
    opacity: 1,
    transition: { type: "tween", duration: 1.2, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const HeroSection = () => {
  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
      
      <div className="container mx-auto relative z-20">
        <div className="flex flex-col xl:flex-row items-center gap-12">
          <div className="flex-1 text-center xl:text-left">
            <motion.p
              variants={fadeIn("down", 0.1)}
              initial="hidden"
              animate="show"
              className="text-accent font-sora font-semibold tracking-widest uppercase text-sm mb-4"
            >
              Ingénieur Informatique & Data Science
            </motion.p>
            
            <motion.h1
              variants={fadeIn("down", 0.2)}
              initial="hidden"
              animate="show"
              className="font-sora text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6"
            >
              Yassine{" "}
              <span className="text-gradient-accent">Sinif</span>
            </motion.h1>

            <motion.p
              variants={fadeIn("down", 0.3)}
              initial="hidden"
              animate="show"
              className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto xl:mx-0 mb-8 leading-relaxed"
            >
              Étudiant en Ingénierie Informatique, spécialité Intelligence Artificielle 
              et Data Science à l'EMSI Casa. Passionné par les nouvelles technologies et l'IA, 
              je transforme les idées en réalités digitales.
            </motion.p>

            <motion.div
              variants={fadeIn("down", 0.4)}
              initial="hidden"
              animate="show"
              className="flex items-center gap-4 justify-center xl:justify-start"
            >
              <a
                href="#contact"
                onClick={(e) => { e.preventDefault(); document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" }); }}
                className="px-8 py-3 rounded-full bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                Me Contacter
              </a>
              <a
                href="#projects"
                onClick={(e) => { e.preventDefault(); document.querySelector("#projects")?.scrollIntoView({ behavior: "smooth" }); }}
                className="px-8 py-3 rounded-full border border-foreground/20 text-foreground hover:border-accent hover:text-accent transition-colors"
              >
                Mes Projets
              </a>
            </motion.div>

            <motion.div
              variants={fadeIn("down", 0.5)}
              initial="hidden"
              animate="show"
              className="flex items-center gap-5 mt-8 justify-center xl:justify-start"
            >
              <a href="mailto:yassine.sinif@emsi-edu.ma" className="text-muted-foreground hover:text-accent transition-colors">
                <Mail size={20} />
              </a>
              <a href="https://github.com" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-accent transition-colors">
                <Github size={20} />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-accent transition-colors">
                <Linkedin size={20} />
              </a>
            </motion.div>
          </div>

          <motion.div
            variants={fadeIn("up", 0.5)}
            initial="hidden"
            animate="show"
            className="flex-shrink-0 relative"
          >
            <div className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-full overflow-hidden border-4 border-accent/30 shadow-[var(--shadow-glow)]" style={{ animation: "pulse-glow 3s ease-in-out infinite" }}>
              <img
                src={profileImg}
                alt="Yassine Sinif"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -z-10 inset-0 rounded-full bg-accent/10 blur-3xl scale-150" />
          </motion.div>
        </div>
      </div>

      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 text-muted-foreground"
      >
        <ArrowDown size={24} />
      </motion.div>
    </section>
  );
};

export default HeroSection;
