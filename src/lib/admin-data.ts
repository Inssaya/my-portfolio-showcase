// Local storage based admin data management (will be replaced with Supabase later)

export interface Project {
  id: string;
  title: string;
  description: string;
  longDescription?: string;
  tech: string[];
  status: "En cours" | "Terminé";
  category: "Personnel" | "Académique" | "Internship";
  image?: string;
  demoUrl?: string;
  githubUrl?: string;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

export interface Experience {
  id: string;
  period: string;
  title: string;
  company: string;
  location: string;
  bullets: string[];
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
  { id: "8", title: "Plagiarism Detection System", tech: ["Python", "TF-IDF", "SBERT", "Django"], description: "Plagiarism detection using semantic similarity scoring with TF-IDF and SBERT.", status: "Terminé", category: "Académique" },
  { id: "9", title: "Flight Management System", tech: ["Python", "Django", "Tailwind CSS"], description: "Web app for flight management with modern interface.", status: "Terminé", category: "Académique" },
  { id: "10", title: "Car Locator Platform", tech: ["PHP", "Laravel", "JavaScript"], description: "Vehicle location platform with interactive map.", status: "Terminé", category: "Académique" },
  { id: "11", title: "To-Do List Web App", tech: ["React", "TypeScript", "Tailwind CSS"], description: "Task management app with reactive UI.", status: "Terminé", category: "Personnel" },
  { id: "12", title: "AI Chatbot", tech: ["Python", "NLP", "Flask", "OpenAI API"], description: "Intelligent chatbot using natural language processing.", status: "Terminé", category: "Académique" },
  {
    id: "13",
    title: "Nexora AI",
    tech: ["FastAPI", "React", "TypeScript", "PostgreSQL", "ChromaDB", "Sentence-Transformers", "Ollama"],
    description: "Call-center SaaS with on-premise RAG for automated ticket handling.",
    longDescription: "A call-center SaaS platform that automates ticket handling with an on-premise Retrieval-Augmented Generation pipeline — embeddings and retrieval stay fully self-hosted (ChromaDB, sentence-transformers, Ollama) so no support data leaves the client's infrastructure. FastAPI backend, React/TypeScript frontend, PostgreSQL for persistence.",
    status: "Terminé",
    category: "Personnel",
  },
  {
    id: "14",
    title: "Stock Market Analytics Platform",
    tech: ["Python", "Kafka", "MySQL", "Docker", "Streamlit"],
    description: "Real-time streaming ingestion and processing for stock market data.",
    longDescription: "A real-time analytics platform that ingests and processes streaming stock market data through Kafka pipelines, persists it to MySQL, and surfaces live dashboards through Streamlit. Fully containerized with Docker for reproducible deployment.",
    status: "Terminé",
    category: "Personnel",
  },
  {
    id: "15",
    title: "Medical Multi-Agent System",
    tech: ["LangGraph", "LangChain", "FastAPI", "MCP", "React", "Flutter"],
    description: "Coordinated LLM agents for clinical workflows.",
    longDescription: "A multi-agent system coordinating specialized LLM agents (via LangGraph/LangChain) over clinical workflows, exposed through an MCP tool interface with a FastAPI backend and both React (web) and Flutter (mobile) clients.",
    status: "Terminé",
    category: "Personnel",
  },
  {
    id: "16",
    title: "Aptiv Maintenance Platform",
    tech: ["FastAPI", "PostgreSQL", "SQLAlchemy", "Alembic", "React", "TypeScript", "Docker"],
    description:
      "Maintenance intervention tracking, KPI platform and failure-risk analysis for a wire-harness plant, replacing a manual Excel workflow.",
    longDescription:
      "A multi-user web platform for the maintenance department of a wire-harness plant, replacing a shared Excel workbook that was the only source of truth for the team's performance indicators. Technicians open the app on any phone or PC on the plant network and log a breakdown as it happens: the repair timer runs on the server, so a reload, a dead battery or a closed browser never distorts the recorded time, and a repair that spans two shifts is handed over and taken over without being split — actual hands-on time and waiting time are separated automatically. Supervisors get MTTR, MTBF, availability, downtime rate, Pareto charts of the most costly machines and weekly trends, all derived automatically from the technicians' records for any period or scope; targets can be set per machine, line, project or globally, with the most specific applicable target displayed. Two design properties protect the indicators: durations are never stored, only derived from timestamps every time they are displayed, so they cannot silently disagree with the underlying record; and every correction is attributed and kept, so the history stays both accurate and auditable. On top of the recorded history, a failure-risk module scores every machine nightly for its risk of failing within a defined horizon — Level 1 is a Weibull survival model (classical reliability statistics, fully transparent), Level 2 is a logistic-regression / random-forest classifier, and a rolling backtest picks the champion; on a 24-month simulated validation set the statistical model reaches ~2.2x lift and the ML model ~2.4x lift, both measured with a strict no-leak protocol. An agentic assistant is grounded on a fixed set of tools onto the department's own database (KPIs, Pareto and failure-type breakdowns, spare-part consumption, past-case retrieval with the action that fixed each, per-machine clustering) and may answer only from what those tools return — so every answer is traceable to recorded data. Weekly PDF reports, bilingual FR/EN interface, role-based access enforced centrally, 110 automated tests covering indicator formulas, state transitions, access control, imports and query behaviour, versioned migrations applied at startup, and the whole stack packaged as a single-command container deployment (application + PostgreSQL + nightly backup) that runs on-premise so no maintenance data leaves the plant.",
    status: "En cours",
    category: "Internship",
  },
];

const defaultSocialLinks: SocialLinks = {
  github: "https://github.com/Inssaya",
  linkedin: "",
  email: "yassinsinif4@gmail.com",
  phone: "+212 6 23 84 25 35",
  location: "Casablanca, Morocco",
};

const defaultHero: HeroContent = {
  subtitle: "AI & Data Engineering",
  title: "I Build Systems That",
  titleHighlight: "Actually Scale",
  description: "Final-year engineering student in AI & Data Science at EMSI Casablanca, currently interning as an AI Data Engineer at Aptiv. I build AI-powered and full-stack systems — from RAG pipelines to production-ready web apps — and I'm looking for a 6-month PFE internship starting February 2027.",
};

const defaultAbout: AboutCard[] = [
  { id: "1", icon: "Briefcase", title: "Experience", content: "AI Data Engineer Intern at Aptiv (Tangier) — maintenance KPI platform, predictive maintenance and an agentic RAG assistant. Previously: Laravel chatbot & PDF tool internship at a Casablanca web agency." },
  { id: "2", icon: "Globe", title: "Languages", content: "Arabic — Native\nFrench — B2\nEnglish — B2\nSpanish — A2" },
  { id: "3", icon: "Award", title: "Certifications", content: "DeepLearning.AI Data Engineering Professional Certificate (in progress) • Python for Data Science, AI & Development (IBM) • Software Engineering: Design and Project Management (HKUST) • La recherche documentaire (École Polytechnique)" },
];

const defaultEducation: Education[] = [
  { id: "1", period: "2022 - 2027", title: "Engineering Degree, Computer Science & Networks", institution: "EMSI, Casablanca", description: "Specialization: AI & Data Science" },
];

const defaultExperience: Experience[] = [
  {
    id: "1",
    period: "Jun 2026 – Present",
    title: "AI Data Engineer Intern",
    company: "Aptiv",
    location: "Tangier, Morocco · Maintenance Department",
    bullets: [
      "Built a maintenance intervention tracking and KPI platform, replacing a manual Excel workflow, and owned its technical specification end to end.",
      "Designed a predictive maintenance module ranking machines by failure risk, combining statistical reliability modeling with an ML classifier.",
      "Built an agentic RAG assistant calling retrieval and clustering tools over past maintenance reports to surface similar cases and suggest likely causes.",
      "Validated the full pipeline on synthetic data before touching production, keeping sensitive data on-premise.",
    ],
  },
  {
    id: "2",
    period: "2024 – 2025 · 1 month",
    title: "Software Engineering Intern",
    company: "Web Agency",
    location: "Casablanca, Morocco",
    bullets: [
      "Developed a Laravel chatbot with database information retrieval.",
      "Built an automated PDF generation tool.",
    ],
  },
];

const defaultSkills: SkillCategory[] = [
  { id: "1", title: "Languages & Frameworks", skills: ["Python", "Django", "FastAPI", "React", "React Native", "JavaScript", "TypeScript", "Java", "C++", "C#", "ASP.NET"] },
  { id: "2", title: "Data & ML", skills: ["pandas", "NumPy", "scikit-learn", "PyTorch", "Feature Engineering", "Model Evaluation", "Backtesting"] },
  { id: "3", title: "LLM & RAG", skills: ["LangChain", "LangGraph", "RAG Pipelines", "Embeddings", "ChromaDB", "Ollama", "Prompt Engineering"] },
  { id: "4", title: "Data Engineering", skills: ["PostgreSQL", "SQL Server", "SSIS", "MySQL", "MongoDB", "Neo4j", "Cassandra", "Hadoop", "ETL", "Kafka", "Data Warehousing"] },
  { id: "5", title: "DevOps & Tools", skills: ["Docker", "Git", "CI/CD", "Linux", "REST APIs"] },
  { id: "6", title: "BI & Cloud", skills: ["Power BI", "Tableau"] },
];

const defaultCertificates: Certificate[] = [
  { id: "1", name: "Data Engineering Professional Certificate (in progress, 2026)", issuer: "DeepLearning.AI & AWS" },
  { id: "2", name: "Python for Data Science, AI & Development", issuer: "IBM" },
  { id: "3", name: "Software Engineering: Design and Project Management", issuer: "HKUST" },
  { id: "4", name: "La recherche documentaire", issuer: "École Polytechnique" },
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

  getExperience: (): Experience[] => get("admin_experience", defaultExperience),
  setExperience: (e: Experience[]) => set("admin_experience", e),

  getSkills: (): SkillCategory[] => get("admin_skills", defaultSkills),
  setSkills: (s: SkillCategory[]) => set("admin_skills", s),

  getCertificates: (): Certificate[] => get("admin_certificates", defaultCertificates),
  setCertificates: (c: Certificate[]) => set("admin_certificates", c),
};
