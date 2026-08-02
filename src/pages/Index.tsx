import Navigation from "@/components/Navigation";
import MobileNav from "@/components/MobileNav";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ExperienceSection from "@/components/ExperienceSection";
import SkillsSection from "@/components/SkillsSection";
import EducationSection from "@/components/EducationSection";
import ProjectsSection from "@/components/ProjectsSection";
import ContactSection from "@/components/ContactSection";
import MorphingCore from "@/components/visuals/MorphingCore";
import Starfield from "@/components/visuals/Starfield";
import Preloader from "@/components/visuals/Preloader";
import CursorGlow from "@/components/visuals/CursorGlow";
import ScrollProgress from "@/components/visuals/ScrollProgress";
import TechMarquee from "@/components/visuals/TechMarquee";
import StatsBand from "@/components/visuals/StatsBand";
import AssistantWidget from "@/components/assistant/AssistantWidget";

const Index = () => {
  return (
    <div className="relative">
      <Preloader />
      {/* Two background layers, painted in this order: cool stars far back,
          warm mesh in front. The grid sits above both for a blueprint feel. */}
      <Starfield />
      <MorphingCore />
      <div aria-hidden="true" className="grid-overlay" />
      <ScrollProgress />
      <CursorGlow />
      <Navigation />
      <MobileNav />

      <main className="relative z-10">
        <HeroSection />
        <TechMarquee />
        <AboutSection />
        <StatsBand />
        <ExperienceSection />
        <SkillsSection />
        <EducationSection />
        <ProjectsSection />
        <ContactSection />
      </main>

      <AssistantWidget
        getContext={() =>
          `The visitor is reading the portfolio page (classic mode), not the guided tour.`
        }
      />

      <footer className="relative z-10 border-t border-border/30 py-8 pb-24 text-center text-xs text-muted-foreground xl:pb-8">
        © 2026 Yassine Sinif. Tous droits réservés.
      </footer>
    </div>
  );
};

export default Index;
