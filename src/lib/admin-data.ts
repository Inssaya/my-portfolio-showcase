// Local storage based admin data management (will be replaced with Supabase later)

export interface Project {
  id: string;
  title: string;
  description: string;
  tech: string[];
  status: "En cours" | "Terminé";
  category: "Personnel" | "Académique";
  link?: string;
}

export interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  date: string;
  read: boolean;
}

export interface SocialLinks {
  github: string;
  linkedin: string;
  email: string;
  phone: string;
  location: string;
}

export interface HeroContent {
  subtitle: string;
  title: string;
  titleHighlight: string;
  description: string;
}

export interface AboutCard {
  id: string;
  icon: "Briefcase" | "Globe" | "Award";
  title: string;
  content: string;
}

export interface Education {
  id: string;
  period: string;
  title: string;
  institution: string;
  description: string;
}

export interface SkillCategory {
  id: string;
  title: string;
  skills: string[];
}

export interface Certificate {
  id: string;
  name: string;
  issuer: string;
}

// Default data
const defaultProjects: Project[] = [
  { id: "1", title: "Plateforme E-commerce SaaS Multi-Vendeurs", tech: ["React", "Next.js", "Express", "MongoDB", "Redis", "Kafka"], description: "Architecture microservices avec Firebase, websockets et déploiement cloud (AWS).", status: "En cours", category: "Personnel" },
  { id: "2", title: "Application Mobile Transport", tech: ["React Native"], description: "Application mobile de services de transport en cours de développement.", status: "En cours", category: "Personnel" },
  { id: "3", title: "Système de Détection de Plagiat", tech: ["Python", "TF-IDF", "SBERT"], description: "Détection de plagiat utilisant des techniques de NLP avancées.", status: "Terminé", category: "Académique" },
  { id: "4", title: "Gestion des Vols (Web)", tech: ["Python", "Django", "Tailwind CSS"], description: "Application web de gestion des vols avec interface moderne.", status: "Terminé", category: "Académique" },
  { id: "5", title: "Site de Localisation de Voitures", tech: ["PHP", "Laravel", "JavaScript"], description: "Plateforme de localisation de véhicules avec carte interactive.", status: "Terminé", category: "Académique" },
  { id: "6", title: "To-Do List Web App", tech: ["React", "TypeScript", "Tailwind CSS"], description: "Application de gestion de tâches avec interface réactive.", status: "Terminé", category: "Personnel" },
  { id: "7", title: "Portfolio Personnel", tech: ["React", "TypeScript", "Tailwind CSS", "Framer Motion"], description: "Site portfolio interactif avec animations et design moderne.", status: "Terminé", category: "Personnel" },
  { id: "8", title: "Chatbot IA", tech: ["Python", "NLP", "Flask", "OpenAI API"], description: "Chatbot intelligent utilisant le traitement du langage naturel.", status: "Terminé", category: "Académique" },
];

const defaultSocialLinks: SocialLinks = {
  github: "https://github.com",
  linkedin: "https://linkedin.com",
  email: "yassine.sinif@emsi-edu.ma",
  phone: "0623842...",
  location: "Casablanca, Maroc",
};

const defaultHero: HeroContent = {
  subtitle: "Ingénieur Informatique & Data Science",
  title: "Transformer les Idées en",
  titleHighlight: "Réalité Digitale",
  description: "Étudiant en Ingénierie Informatique, spécialité Intelligence Artificielle et Data Science à l'EMSI Casa. Passionné par les nouvelles technologies et l'IA, je transforme les idées en réalités digitales.",
};

const defaultAbout: AboutCard[] = [
  { id: "1", icon: "Briefcase", title: "Expérience", content: "Stage chez Web Agency à Casablanca — Développement d'un chatbot avec Laravel, générateur PDF et base de données." },
  { id: "2", icon: "Globe", title: "Langues", content: "Arabe — Langue maternelle\nAnglais — Avancé\nFrançais — Intermédiaire" },
  { id: "3", icon: "Award", title: "Certifications", content: "Python for Data Science (IBM) • Software Engineering (HKUST) • Web Development (U. Michigan) • React Native (Meta)" },
];

const defaultEducation: Education[] = [
  { id: "1", period: "2024 - 2026", title: "Cycle Ingénieur en Informatique et Réseaux", institution: "EMSI Casablanca", description: "Spécialité Intelligence Artificielle et Data Science" },
  { id: "2", period: "2022 - 2024", title: "Classes Préparatoires", institution: "EMSI Rabat", description: "Formation scientifique intensive" },
];

const defaultSkills: SkillCategory[] = [
  { id: "1", title: "Langages", skills: ["C", "C++", "C#", "Java", "Python", "PHP", "JavaScript", "TypeScript"] },
  { id: "2", title: "Frameworks & Libs", skills: ["React", "React Native", "Laravel", "Django", ".NET", "Bootstrap", "Tailwind CSS"] },
  { id: "3", title: "Bases de Données", skills: ["SQL", "PL/SQL", "SQL Server", "NoSQL", "MongoDB", "Redis"] },
  { id: "4", title: "IA & Data Science", skills: ["MLOps", "NLP", "Deep Learning", "TensorFlow", "Computer Vision", "Multi-Agent Systems"] },
  { id: "5", title: "DevOps & Outils", skills: ["Git", "Docker", "Linux", "CI/CD", "Kafka", "Firebase", "AWS"] },
  { id: "6", title: "Architecture", skills: ["UML", "Merise", "MVC", "POO", "TCP/IP", "Microservices"] },
];

const defaultCertificates: Certificate[] = [
  { id: "1", name: "Python for Data Science", issuer: "IBM" },
  { id: "2", name: "Software Engineering", issuer: "HKUST" },
  { id: "3", name: "Web Development", issuer: "U. Michigan" },
  { id: "4", name: "React Native", issuer: "Meta" },
];

// Helper
function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function set(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// API
export const adminData = {
  getProjects: (): Project[] => get("admin_projects", defaultProjects),
  setProjects: (p: Project[]) => set("admin_projects", p),

  getMessages: (): Message[] => get("admin_messages", []),
  setMessages: (m: Message[]) => set("admin_messages", m),
  addMessage: (m: Omit<Message, "id" | "date" | "read">) => {
    const msgs = adminData.getMessages();
    msgs.unshift({ ...m, id: crypto.randomUUID(), date: new Date().toISOString(), read: false });
    adminData.setMessages(msgs);
  },

  getSocialLinks: (): SocialLinks => get("admin_social", defaultSocialLinks),
  setSocialLinks: (s: SocialLinks) => set("admin_social", s),

  getHero: (): HeroContent => get("admin_hero", defaultHero),
  setHero: (h: HeroContent) => set("admin_hero", h),

  getAbout: (): AboutCard[] => get("admin_about", defaultAbout),
  setAbout: (a: AboutCard[]) => set("admin_about", a),

  getEducation: (): Education[] => get("admin_education", defaultEducation),
  setEducation: (e: Education[]) => set("admin_education", e),

  getSkills: (): SkillCategory[] => get("admin_skills", defaultSkills),
  setSkills: (s: SkillCategory[]) => set("admin_skills", s),

  getCertificates: (): Certificate[] => get("admin_certificates", defaultCertificates),
  setCertificates: (c: Certificate[]) => set("admin_certificates", c),
};
