import ParticlesBackground from "@/components/ParticlesBackground";
import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import SkillsSection from "@/components/SkillsSection";
import EducationSection from "@/components/EducationSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";

const Index = () => {
  return (
    <div className="relative">
      <ParticlesBackground />
      <Navigation />
      <MobileNav />
      <main className="relative z-10">
        <HeroSection />
        <AboutSection />
        <SkillsSection />
        <EducationSection />
        <ProjectsSection />
        <ContactSection />
      </main>
      <footer className="relative z-10 py-6 text-center text-muted-foreground text-xs border-t border-border/30 pb-20 xl:pb-6">
        © 2026 Yassine Sinif. Tous droits réservés.
      </footer>
    </div>
  );
};

export default Index;
