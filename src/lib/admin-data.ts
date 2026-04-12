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
  { id: "1", title: "Multi-Vendor E-commerce SaaS Platform", tech: ["React", "Next.js", "Express", "MongoDB", "Redis", "Kafka"], description: "Microservices architecture with Firebase, websockets and cloud deployment (AWS).", status: "En cours", category: "Personnel" },
  { id: "2", title: "Gym Management App", tech: ["Java", "NFC", "Face Recognition", "Fingerprint", "QR Code"], description: "Full-featured gym management with biometric check-in: NFC, facial recognition, fingerprint and QR code.", status: "Terminé", category: "Personnel" },
  { id: "3", title: "Optic Management App", tech: ["Java", "MySQL", "Swing"], description: "Desktop app for optical store management — inventory, prescriptions, client records.", status: "Terminé", category: "Personnel" },
  { id: "4", title: "POS System App", tech: ["Java", "JavaFX", "MySQL"], description: "Point of sale system with real-time inventory, receipt generation and analytics.", status: "Terminé", category: "Personnel" },
  { id: "5", title: "RAG Chatbot", tech: ["Python", "LangChain", "FAISS", "OpenAI API", "Flask"], description: "Retrieval-Augmented Generation chatbot querying custom knowledge bases.", status: "Terminé", category: "Personnel" },
  { id: "6", title: "AI-Based Enterprise Ticket Management", tech: ["Python", "NLP", "Django", "PostgreSQL"], description: "Intelligent ticket routing and prioritization using NLP.", status: "Terminé", category: "Académique" },
  { id: "7", title: "Mobile Transport App", tech: ["React Native"], description: "Mobile application for transport services.", status: "En cours", category: "Personnel" },
  { id: "8", title: "Plagiarism Detection System", tech: ["Python", "TF-IDF", "SBERT"], description: "Plagiarism detection using advanced NLP techniques.", status: "Terminé", category: "Académique" },
  { id: "9", title: "Flight Management System", tech: ["Python", "Django", "Tailwind CSS"], description: "Web app for flight management with modern interface.", status: "Terminé", category: "Académique" },
  { id: "10", title: "Car Locator Platform", tech: ["PHP", "Laravel", "JavaScript"], description: "Vehicle location platform with interactive map.", status: "Terminé", category: "Académique" },
  { id: "11", title: "To-Do List Web App", tech: ["React", "TypeScript", "Tailwind CSS"], description: "Task management app with reactive UI.", status: "Terminé", category: "Personnel" },
  { id: "12", title: "AI Chatbot", tech: ["Python", "NLP", "Flask", "OpenAI API"], description: "Intelligent chatbot using natural language processing.", status: "Terminé", category: "Académique" },
];

const defaultSocialLinks: SocialLinks = {
  github: "https://github.com",
  linkedin: "https://linkedin.com",
  email: "yassine.sinif@emsi-edu.ma",
  phone: "0623842...",
  location: "Casablanca, Maroc",
};

const defaultHero: HeroContent = {
  subtitle: "Software Engineer · AI & Data Science",
  title: "I Build Systems That",
  titleHighlight: "Actually Scale",
  description: "Computer Engineering student specializing in AI & Data Science at EMSI Casablanca. From microservices to machine learning pipelines — I ship production-ready software with clean architecture and real-world impact.",
};

const defaultAbout: AboutCard[] = [
  { id: "1", icon: "Briefcase", title: "Experience", content: "Internship at a Web Agency in Casablanca — Built a chatbot with Laravel, PDF generator and database integration." },
  { id: "2", icon: "Globe", title: "Languages", content: "Arabic — Native\nEnglish — Advanced\nFrench — Intermediate" },
  { id: "3", icon: "Award", title: "Certifications", content: "Python for Data Science (IBM) • Software Engineering (HKUST) • Web Development (U. Michigan) • React Native (Meta)" },
];

const defaultEducation: Education[] = [
  { id: "1", period: "2024 - 2026", title: "Engineering Degree in Computer Science & Networks", institution: "EMSI Casablanca", description: "Specialization in AI and Data Science" },
  { id: "2", period: "2022 - 2024", title: "Preparatory Classes", institution: "EMSI Rabat", description: "Intensive scientific program" },
];

const defaultSkills: SkillCategory[] = [
  { id: "1", title: "Languages", skills: ["C", "C++", "C#", "Java", "Python", "PHP", "JavaScript", "TypeScript"] },
  { id: "2", title: "Frameworks & Libs", skills: ["React", "React Native", "Laravel", "Django", ".NET", "Bootstrap", "Tailwind CSS"] },
  { id: "3", title: "Databases", skills: ["SQL", "PL/SQL", "SQL Server", "NoSQL", "MongoDB", "Redis"] },
  { id: "4", title: "AI & Data Science", skills: ["MLOps", "NLP", "Deep Learning", "TensorFlow", "Computer Vision", "Multi-Agent Systems"] },
  { id: "5", title: "DevOps & Tools", skills: ["Git", "Docker", "Linux", "CI/CD", "Kafka", "Firebase", "AWS"] },
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
