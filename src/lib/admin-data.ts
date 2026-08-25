// Data layer for the portfolio.
//
// Reads: synchronous, from localStorage. localStorage is hydrated once on
// boot (see hydrateFromSupabase below) from the real source of truth — the
// Supabase project. Keeping reads sync means every consumer component
// (`adminData.getProjects()` inside JSX, useEffect, useMemo, whatever) stays
// as it was — no async plumbing spreading across the tree.
//
// Writes: async, Supabase first, localStorage second. If Supabase isn't
// configured (VITE_SUPABASE_* env vars empty), writes fall through to
// localStorage only — the app keeps working, just per-browser.
//
// Messages are the one exception: getMessages/addMessage are async and go
// straight to Supabase. A visitor writing on their phone must reach the admin
// reading on their laptop, and a localStorage cache can't bridge browsers.
//
// The shapes exported here are the frontend's camelCase view. The mappers
// (mapProject, unmapProject, etc.) translate between them and the database's
// snake_case columns.

import { supabase, supabaseEnabled } from "./supabase";

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

// -------------------------------------------------------------------- defaults
// Kept as the fallback for a fresh browser that hasn't hydrated yet — first
// paint shouldn't be empty just because Supabase is still answering.

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
  { id: "13", title: "Nexora AI", tech: ["FastAPI", "React", "TypeScript", "PostgreSQL", "ChromaDB", "Sentence-Transformers", "Ollama"], description: "Call-center SaaS with on-premise RAG for automated ticket handling.", longDescription: "A call-center SaaS platform that automates ticket handling with an on-premise Retrieval-Augmented Generation pipeline — embeddings and retrieval stay fully self-hosted (ChromaDB, sentence-transformers, Ollama) so no support data leaves the client's infrastructure. FastAPI backend, React/TypeScript frontend, PostgreSQL for persistence.", status: "Terminé", category: "Personnel" },
  { id: "14", title: "Stock Market Analytics Platform", tech: ["Python", "Kafka", "MySQL", "Docker", "Streamlit"], description: "Real-time streaming ingestion and processing for stock market data.", longDescription: "A real-time analytics platform that ingests and processes streaming stock market data through Kafka pipelines, persists it to MySQL, and surfaces live dashboards through Streamlit. Fully containerized with Docker for reproducible deployment.", status: "Terminé", category: "Personnel" },
  { id: "15", title: "Medical Multi-Agent System", tech: ["LangGraph", "LangChain", "FastAPI", "MCP", "React", "Flutter"], description: "Coordinated LLM agents for clinical workflows.", longDescription: "A multi-agent system coordinating specialized LLM agents (via LangGraph/LangChain) over clinical workflows, exposed through an MCP tool interface with a FastAPI backend and both React (web) and Flutter (mobile) clients.", status: "Terminé", category: "Personnel" },
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
  description: "Hey, I'm Yassine — a final-year engineering student in AI & Data Science. I like taking ideas and turning them into real-world projects that are stable, useful, and built to succeed in today's competitive world, and I'm looking for a 6-month PFE internship in Morocco or abroad, ideally with a company where I can grow, contribute, and hopefully continue working together after the internship, while also being open to freelance work.",
};

const defaultAbout: AboutCard[] = [
  { id: "1", icon: "Briefcase", title: "Experience", content: "Just finished an internship at Aptiv (Tangier), where I built tools to help a maintenance team catch equipment problems earlier. Before that, I built a chatbot and a PDF tool for a web agency in Casablanca. Now looking for my next internship or freelance project." },
  { id: "2", icon: "Globe", title: "Languages", content: "Arabic — Native\nFrench — B2\nEnglish — B2\nSpanish — A2" },
  { id: "3", icon: "Award", title: "Certifications", content: "DeepLearning.AI Data Engineering Professional Certificate (in progress) • Python for Data Science, AI & Development (IBM) • Software Engineering: Design and Project Management (HKUST) • La recherche documentaire (École Polytechnique)" },
];

const defaultEducation: Education[] = [
  { id: "1", period: "2022 - 2027", title: "Engineering Degree, Computer Science & Networks", institution: "EMSI, Casablanca", description: "Specialization: AI & Data Science" },
];

const defaultExperience: Experience[] = [
  {
    id: "1",
    period: "Jun 2026 – Aug 2026",
    title: "AI Data Engineer Intern",
    company: "Aptiv",
    location: "Tangier, Morocco · Maintenance Department",
    bullets: [
      "Built a maintenance intervention tracking and KPI platform, replacing a manual Excel workflow, and owned its technical specification end to end.",
      "Designed a predictive maintenance module ranking machines by failure risk, combining statistical reliability modeling with an ML classifier.",
      "Built an AI assistant that searches past maintenance reports to find similar cases and suggest likely causes.",
      "Tested everything on synthetic data before touching real production data, to keep sensitive information safe.",
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

// ------------------------------------------------------- localStorage helpers

const K = {
  projects: "admin_projects",
  hero: "admin_hero",
  social: "admin_social",
  about: "admin_about",
  education: "admin_education",
  experience: "admin_experience",
  skills: "admin_skills",
  certificates: "admin_certificates",
  messages: "admin_messages",
} as const;

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function setLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled — the write succeeded server-side, we just
    // can't cache it. Next hydrate will refresh from Supabase anyway.
  }
}

// ------------------------------------------------- row ↔ frontend mappers

type Row = Record<string, unknown>;

const mapProject = (row: Row): Project => ({
  id: String(row.id),
  title: String(row.title ?? ""),
  description: String(row.description ?? ""),
  longDescription: (row.long_description as string | null) ?? undefined,
  tech: (row.tech as string[]) ?? [],
  status: row.status as Project["status"],
  category: row.category as Project["category"],
  image: (row.image as string | null) ?? undefined,
  demoUrl: (row.demo_url as string | null) ?? undefined,
  githubUrl: (row.github_url as string | null) ?? undefined,
});

const unmapProject = (p: Project, position: number): Row => ({
  slug: slugify(p.title),
  title: p.title,
  description: p.description,
  long_description: p.longDescription ?? null,
  tech: p.tech,
  status: p.status,
  category: p.category,
  image: p.image ?? null,
  demo_url: p.demoUrl ?? null,
  github_url: p.githubUrl ?? null,
  position,
});

const mapHero = (row: Row): HeroContent => ({
  subtitle: String(row.subtitle ?? ""),
  title: String(row.title ?? ""),
  titleHighlight: String(row.title_highlight ?? ""),
  description: String(row.description ?? ""),
});

const unmapHero = (h: HeroContent): Row => ({
  id: 1,
  subtitle: h.subtitle,
  title: h.title,
  title_highlight: h.titleHighlight,
  description: h.description,
});

const mapSocial = (row: Row): SocialLinks => ({
  github: String(row.github ?? ""),
  linkedin: String(row.linkedin ?? ""),
  email: String(row.email ?? ""),
  phone: String(row.phone ?? ""),
  location: String(row.location ?? ""),
});

const unmapSocial = (s: SocialLinks): Row => ({ id: 1, ...s });

const mapAbout = (row: Row): AboutCard => ({
  id: String(row.id),
  icon: row.icon as AboutCard["icon"],
  title: String(row.title ?? ""),
  content: String(row.content ?? ""),
});

const unmapAbout = (a: AboutCard, position: number): Row => ({
  icon: a.icon, title: a.title, content: a.content, position,
});

const mapEducation = (row: Row): Education => ({
  id: String(row.id),
  period: String(row.period ?? ""),
  title: String(row.title ?? ""),
  institution: String(row.institution ?? ""),
  description: String(row.description ?? ""),
});

const unmapEducation = (e: Education, position: number): Row => ({
  period: e.period, title: e.title, institution: e.institution, description: e.description, position,
});

const mapExperience = (row: Row): Experience => ({
  id: String(row.id),
  period: String(row.period ?? ""),
  title: String(row.title ?? ""),
  company: String(row.company ?? ""),
  location: String(row.location ?? ""),
  bullets: (row.bullets as string[]) ?? [],
});

const unmapExperience = (e: Experience, position: number): Row => ({
  period: e.period, title: e.title, company: e.company, location: e.location,
  bullets: e.bullets, position,
});

const mapSkillCategory = (row: Row): SkillCategory => ({
  id: String(row.id),
  title: String(row.title ?? ""),
  skills: (row.skills as string[]) ?? [],
});

const unmapSkillCategory = (s: SkillCategory, position: number): Row => ({
  title: s.title, skills: s.skills, position,
});

const mapCertificate = (row: Row): Certificate => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  issuer: String(row.issuer ?? ""),
});

const unmapCertificate = (c: Certificate, position: number): Row => ({
  name: c.name, issuer: c.issuer, position,
});

const mapMessage = (row: Row): Message => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  email: String(row.email ?? ""),
  subject: String(row.subject ?? ""),
  message: String(row.message ?? ""),
  date: String(row.created_at ?? new Date().toISOString()),
  read: Boolean(row.read),
});

// -------------------------------------------------- write-back helpers
// The admin panel "save" flow hands us the entire array to persist. Simplest
// correct mapping to Supabase for a portfolio-scale dataset: replace the
// whole table. Wrapped in a safety guard so an accidental empty-array save
// can't nuke the content silently.

async function replaceTable(table: string, rows: Row[], allowEmpty = false) {
  if (!supabase) return;
  if (rows.length === 0 && !allowEmpty) {
    // Empty save is almost always a bug in the calling code, not intent.
    // Bail out loud rather than wipe the table.
    console.warn(`Refusing to replace ${table} with empty array — pass allowEmpty=true if that's really intended.`);
    return;
  }
  // Deleting all rows requires a WHERE clause under RLS; a always-true id
  // filter satisfies it without limiting scope.
  const del = await supabase.from(table).delete().not("id", "is", null);
  if (del.error) throw del.error;
  if (rows.length > 0) {
    const ins = await supabase.from(table).insert(rows);
    if (ins.error) throw ins.error;
  }
}

// ------------------------------------------------------- hydrate on boot

/**
 * Overwrite localStorage with fresh Supabase data — public content only.
 * Called once from main.tsx before the app mounts. If Supabase isn't
 * configured we return immediately and the app uses whatever localStorage
 * already has (previous visit's data, or the defaults above).
 *
 * Errors are swallowed on purpose: the app must render even if the network
 * or Supabase is momentarily down. Users just see the cached content until
 * next hydrate.
 */
export async function hydrateFromSupabase(): Promise<void> {
  if (!supabaseEnabled || !supabase) return;
  try {
    const client = supabase;
    const [projects, hero, social, about, education, experience, skills, certificates] =
      await Promise.all([
        client.from("projects").select("*").order("position").order("created_at", { ascending: false }),
        client.from("hero").select("*").eq("id", 1).maybeSingle(),
        client.from("social_links").select("*").eq("id", 1).maybeSingle(),
        client.from("about_cards").select("*").order("position"),
        client.from("education").select("*").order("position"),
        client.from("experience").select("*").order("position"),
        client.from("skill_categories").select("*").order("position"),
        client.from("certificates").select("*").order("position"),
      ]);
    if (projects.data) setLocal(K.projects, projects.data.map(mapProject));
    if (hero.data) setLocal(K.hero, mapHero(hero.data));
    if (social.data) setLocal(K.social, mapSocial(social.data));
    if (about.data) setLocal(K.about, about.data.map(mapAbout));
    if (education.data) setLocal(K.education, education.data.map(mapEducation));
    if (experience.data) setLocal(K.experience, experience.data.map(mapExperience));
    if (skills.data) setLocal(K.skills, skills.data.map(mapSkillCategory));
    if (certificates.data) setLocal(K.certificates, certificates.data.map(mapCertificate));
  } catch (error) {
    console.error("hydrateFromSupabase failed — falling back to cached content", error);
  }
}

// -------------------------------------------------- User Management types
// Backed by admin-only SECURITY DEFINER functions (see
// supabase/admin-user-functions.sql), NOT by direct table reads. The browser
// cannot query auth.users with the anon key, and passwords are never exposed —
// Supabase stores only a bcrypt hash.

export interface AppUser {
  id: string;
  fullName: string | null;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  totalCvsCreated: number;
  totalTokens: number;
}

/** One CV session (each is a CV conversation the visitor built). */
export interface UserCV {
  id: string;
  style: string;
  language: string;
  pdfVersion: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  toolName: string | null;
  createdAt: string;
}

const mapAppUser = (row: Row): AppUser => ({
  id: String(row.id),
  fullName: (row.full_name as string | null) ?? null,
  email: String(row.email ?? ""),
  createdAt: String(row.created_at ?? ""),
  lastLoginAt: (row.last_sign_in_at as string | null) ?? null,
  totalCvsCreated: Number(row.cv_count ?? 0),
  totalTokens: Number(row.total_tokens ?? 0),
});

const mapUserCV = (row: Row): UserCV => ({
  id: String(row.id),
  style: String(row.style ?? ""),
  language: String(row.language ?? ""),
  pdfVersion: Number(row.pdf_version ?? 0),
  totalTokens: Number(row.total_tokens ?? 0),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
  messageCount: Number(row.message_count ?? 0),
});

const mapChatMessage = (row: Row): ChatMessage => ({
  id: Number(row.id),
  role: String(row.role ?? ""),
  content: String(row.content ?? ""),
  toolName: (row.tool_name as string | null) ?? null,
  createdAt: String(row.created_at ?? ""),
});

// -------------------------------------------------- public API

export const adminData = {
  // -- Projects ----------------------------------------------------------------
  getProjects: (): Project[] => get(K.projects, defaultProjects),
  setProjects: async (projects: Project[]): Promise<void> => {
    if (supabase) {
      await replaceTable("projects", projects.map((p, i) => unmapProject(p, i)));
    }
    setLocal(K.projects, projects);
  },

  // -- Hero (singleton) --------------------------------------------------------
  getHero: (): HeroContent => get(K.hero, defaultHero),
  setHero: async (hero: HeroContent): Promise<void> => {
    if (supabase) {
      const { error } = await supabase.from("hero").upsert(unmapHero(hero), { onConflict: "id" });
      if (error) throw error;
    }
    setLocal(K.hero, hero);
  },

  // -- SocialLinks (singleton) -------------------------------------------------
  getSocialLinks: (): SocialLinks => get(K.social, defaultSocialLinks),
  setSocialLinks: async (social: SocialLinks): Promise<void> => {
    if (supabase) {
      const { error } = await supabase.from("social_links").upsert(unmapSocial(social), { onConflict: "id" });
      if (error) throw error;
    }
    setLocal(K.social, social);
  },

  // -- About -------------------------------------------------------------------
  getAbout: (): AboutCard[] => get(K.about, defaultAbout),
  setAbout: async (about: AboutCard[]): Promise<void> => {
    if (supabase) {
      await replaceTable("about_cards", about.map((a, i) => unmapAbout(a, i)));
    }
    setLocal(K.about, about);
  },

  // -- Education ---------------------------------------------------------------
  getEducation: (): Education[] => get(K.education, defaultEducation),
  setEducation: async (education: Education[]): Promise<void> => {
    if (supabase) {
      await replaceTable("education", education.map((e, i) => unmapEducation(e, i)));
    }
    setLocal(K.education, education);
  },

  // -- Experience --------------------------------------------------------------
  getExperience: (): Experience[] => get(K.experience, defaultExperience),
  setExperience: async (experience: Experience[]): Promise<void> => {
    if (supabase) {
      await replaceTable("experience", experience.map((e, i) => unmapExperience(e, i)));
    }
    setLocal(K.experience, experience);
  },

  // -- Skills ------------------------------------------------------------------
  getSkills: (): SkillCategory[] => get(K.skills, defaultSkills),
  setSkills: async (skills: SkillCategory[]): Promise<void> => {
    if (supabase) {
      await replaceTable("skill_categories", skills.map((s, i) => unmapSkillCategory(s, i)));
    }
    setLocal(K.skills, skills);
  },

  // -- Certificates ------------------------------------------------------------
  getCertificates: (): Certificate[] => get(K.certificates, defaultCertificates),
  setCertificates: async (certificates: Certificate[]): Promise<void> => {
    if (supabase) {
      await replaceTable("certificates", certificates.map((c, i) => unmapCertificate(c, i)));
    }
    setLocal(K.certificates, certificates);
  },

  // -- Messages ---------------------------------------------------------------
  // Async on both sides — messages are the one thing where a stale localStorage
  // cache would be actively wrong (visitor writes on phone, admin reads on
  // laptop). Fresh read every time, direct write every time.

  getMessages: async (): Promise<Message[]> => {
    if (!supabase) return get<Message[]>(K.messages, []);
    const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("getMessages failed", error);
      return get<Message[]>(K.messages, []);
    }
    return (data ?? []).map(mapMessage);
  },

  addMessage: async (message: Omit<Message, "id" | "date" | "read">): Promise<void> => {
    if (!supabase) {
      const msgs = get<Message[]>(K.messages, []);
      msgs.unshift({ ...message, id: crypto.randomUUID(), date: new Date().toISOString(), read: false });
      setLocal(K.messages, msgs);
      return;
    }
    const { error } = await supabase.from("messages").insert({
      name: message.name,
      email: message.email,
      subject: message.subject,
      message: message.message,
    });
    if (error) throw error;
  },

  setMessages: async (messages: Message[]): Promise<void> => {
    // Only used by mark-read and delete. Compute the set of ids that should
    // exist after this write, and delete anything else on the server.
    if (supabase) {
      const keepIds = messages.map((m) => m.id);
      if (keepIds.length === 0) {
        // Delete everything on the server — this is a real intent (Clear inbox).
        const { error } = await supabase.from("messages").delete().not("id", "is", null);
        if (error) throw error;
      } else {
        const { error: delError } = await supabase
          .from("messages")
          .delete()
          .not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
        if (delError) throw delError;
      }
      // Update `read` flags on rows that remain.
      for (const m of messages.filter((m) => m.read)) {
        await supabase.from("messages").update({ read: true }).eq("id", m.id);
      }
    }
    setLocal(K.messages, messages);
  },

  markMessageRead: async (id: string): Promise<void> => {
    // Preferred API for AdminMessages — surgical, avoids the whole-array dance.
    if (!supabase) {
      const msgs = get<Message[]>(K.messages, []);
      setLocal(K.messages, msgs.map((m) => (m.id === id ? { ...m, read: true } : m)));
      return;
    }
    const { error } = await supabase.from("messages").update({ read: true }).eq("id", id);
    if (error) throw error;
  },

  deleteMessage: async (id: string): Promise<void> => {
    if (!supabase) {
      const msgs = get<Message[]>(K.messages, []);
      setLocal(K.messages, msgs.filter((m) => m.id !== id));
      return;
    }
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) throw error;
  },

  // -- Users -------------------------------------------------------------------
  // All three go through admin-only SECURITY DEFINER RPCs. A non-admin caller
  // gets a "Not authorized" error from Postgres, never data.

  getUsers: async (): Promise<AppUser[]> => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) throw new Error(error.message);
    return ((data as Row[]) ?? []).map(mapAppUser);
  },

  getUserCVs: async (userId: string): Promise<UserCV[]> => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.rpc("admin_list_user_sessions", { uid: userId });
    if (error) throw new Error(error.message);
    return ((data as Row[]) ?? []).map(mapUserCV);
  },

  getSessionMessages: async (sessionId: string): Promise<ChatMessage[]> => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.rpc("admin_get_session_messages", { sid: sessionId });
    if (error) throw new Error(error.message);
    return ((data as Row[]) ?? []).map(mapChatMessage);
  },
};
