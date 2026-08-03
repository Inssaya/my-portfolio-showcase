/**
 * One-shot bootstrap.
 *
 * Creates the initial admin user (from ADMIN_EMAIL / ADMIN_PASSWORD env vars)
 * and populates every table with the same defaults the frontend used to hold
 * in localStorage. Safe to re-run: uses upsert on the admin user and skips
 * seeding a table that already has rows, so it never overwrites edits made
 * through the admin panel.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user seed.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {}, // Never overwrite the password if the user already exists.
    create: { email: email.toLowerCase(), passwordHash, role: "admin" },
  });
  console.log(`Admin user ready: ${user.email}`);
}

async function seedHero() {
  const existing = await prisma.hero.findUnique({ where: { id: 1 } });
  if (existing) return;
  await prisma.hero.create({
    data: {
      id: 1,
      subtitle: "AI & Data Engineering",
      title: "I Build Systems That",
      titleHighlight: "Actually Scale",
      description:
        "Final-year engineering student in AI & Data Science at EMSI Casablanca, currently interning as an AI Data Engineer at Aptiv. I build AI-powered and full-stack systems — from RAG pipelines to production-ready web apps — and I'm looking for a 6-month PFE internship starting February 2027.",
    },
  });
  console.log("Hero seeded.");
}

async function seedSocial() {
  const existing = await prisma.socialLinks.findUnique({ where: { id: 1 } });
  if (existing) return;
  await prisma.socialLinks.create({
    data: {
      id: 1,
      github: "https://github.com/Inssaya",
      linkedin: "",
      email: "yassinsinif4@gmail.com",
      phone: "+212 6 23 84 25 35",
      location: "Casablanca, Morocco",
    },
  });
  console.log("SocialLinks seeded.");
}

async function seedAbout() {
  if ((await prisma.aboutCard.count()) > 0) return;
  await prisma.aboutCard.createMany({
    data: [
      {
        icon: "Briefcase",
        title: "Experience",
        content:
          "AI Data Engineer Intern at Aptiv (Tangier) — maintenance KPI platform, predictive maintenance and an agentic RAG assistant. Previously: Laravel chatbot & PDF tool internship at a Casablanca web agency.",
        position: 0,
      },
      {
        icon: "Globe",
        title: "Languages",
        content: "Arabic — Native\nFrench — B2\nEnglish — B2\nSpanish — A2",
        position: 1,
      },
      {
        icon: "Award",
        title: "Certifications",
        content:
          "DeepLearning.AI Data Engineering Professional Certificate (in progress) • Python for Data Science, AI & Development (IBM) • Software Engineering: Design and Project Management (HKUST) • La recherche documentaire (École Polytechnique)",
        position: 2,
      },
    ],
  });
  console.log("AboutCards seeded.");
}

async function seedEducation() {
  if ((await prisma.education.count()) > 0) return;
  await prisma.education.create({
    data: {
      period: "2022 - 2027",
      title: "Engineering Degree, Computer Science & Networks",
      institution: "EMSI, Casablanca",
      description: "Specialization: AI & Data Science",
      position: 0,
    },
  });
  console.log("Education seeded.");
}

async function seedExperience() {
  if ((await prisma.experience.count()) > 0) return;
  await prisma.experience.createMany({
    data: [
      {
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
        position: 0,
      },
      {
        period: "2024 – 2025 · 1 month",
        title: "Software Engineering Intern",
        company: "Web Agency",
        location: "Casablanca, Morocco",
        bullets: [
          "Developed a Laravel chatbot with database information retrieval.",
          "Built an automated PDF generation tool.",
        ],
        position: 1,
      },
    ],
  });
  console.log("Experience seeded.");
}

async function seedSkills() {
  if ((await prisma.skillCategory.count()) > 0) return;
  await prisma.skillCategory.createMany({
    data: [
      { title: "Languages & Frameworks", skills: ["Python", "Django", "FastAPI", "React", "React Native", "JavaScript", "TypeScript", "Java", "C++", "C#", "ASP.NET"], position: 0 },
      { title: "Data & ML", skills: ["pandas", "NumPy", "scikit-learn", "PyTorch", "Feature Engineering", "Model Evaluation", "Backtesting"], position: 1 },
      { title: "LLM & RAG", skills: ["LangChain", "LangGraph", "RAG Pipelines", "Embeddings", "ChromaDB", "Ollama", "Prompt Engineering"], position: 2 },
      { title: "Data Engineering", skills: ["PostgreSQL", "SQL Server", "SSIS", "MySQL", "MongoDB", "Neo4j", "Cassandra", "Hadoop", "ETL", "Kafka", "Data Warehousing"], position: 3 },
      { title: "DevOps & Tools", skills: ["Docker", "Git", "CI/CD", "Linux", "REST APIs"], position: 4 },
      { title: "BI & Cloud", skills: ["Power BI", "Tableau"], position: 5 },
    ],
  });
  console.log("Skills seeded.");
}

async function seedCertificates() {
  if ((await prisma.certificate.count()) > 0) return;
  await prisma.certificate.createMany({
    data: [
      { name: "Data Engineering Professional Certificate (in progress, 2026)", issuer: "DeepLearning.AI & AWS", position: 0 },
      { name: "Python for Data Science, AI & Development", issuer: "IBM", position: 1 },
      { name: "Software Engineering: Design and Project Management", issuer: "HKUST", position: 2 },
      { name: "La recherche documentaire", issuer: "École Polytechnique", position: 3 },
    ],
  });
  console.log("Certificates seeded.");
}

async function seedProjects() {
  if ((await prisma.project.count()) > 0) return;

  const projects: Array<{
    title: string;
    description: string;
    longDescription?: string;
    tech: string[];
    status: string;
    category: string;
  }> = [
    { title: "Multi-Vendor E-commerce SaaS Platform", tech: ["React", "Next.js", "Express", "MongoDB", "Redis", "Kafka"], description: "Microservices architecture with Firebase, websockets and cloud deployment (AWS).", status: "En cours", category: "Personnel" },
    { title: "Gym Management App", tech: ["Java", "NFC", "Face Recognition", "Fingerprint", "QR Code"], description: "Full-featured gym management with biometric check-in: NFC, facial recognition, fingerprint and QR code.", status: "Terminé", category: "Personnel" },
    { title: "Optic Management App", tech: ["Java", "MySQL", "Swing"], description: "Desktop app for optical store management — inventory, prescriptions, client records.", status: "Terminé", category: "Personnel" },
    { title: "POS System App", tech: ["Java", "JavaFX", "MySQL"], description: "Point of sale system with real-time inventory, receipt generation and analytics.", status: "Terminé", category: "Personnel" },
    { title: "RAG Chatbot", tech: ["Python", "LangChain", "FAISS", "OpenAI API", "Flask"], description: "Retrieval-Augmented Generation chatbot querying custom knowledge bases.", status: "Terminé", category: "Personnel" },
    { title: "AI-Based Enterprise Ticket Management", tech: ["Python", "NLP", "Django", "PostgreSQL"], description: "Intelligent ticket routing and prioritization using NLP.", status: "Terminé", category: "Académique" },
    { title: "Mobile Transport App", tech: ["React Native"], description: "Mobile application for transport services.", status: "En cours", category: "Personnel" },
    { title: "Plagiarism Detection System", tech: ["Python", "TF-IDF", "SBERT", "Django"], description: "Plagiarism detection using semantic similarity scoring with TF-IDF and SBERT.", status: "Terminé", category: "Académique" },
    { title: "Flight Management System", tech: ["Python", "Django", "Tailwind CSS"], description: "Web app for flight management with modern interface.", status: "Terminé", category: "Académique" },
    { title: "Car Locator Platform", tech: ["PHP", "Laravel", "JavaScript"], description: "Vehicle location platform with interactive map.", status: "Terminé", category: "Académique" },
    { title: "To-Do List Web App", tech: ["React", "TypeScript", "Tailwind CSS"], description: "Task management app with reactive UI.", status: "Terminé", category: "Personnel" },
    { title: "AI Chatbot", tech: ["Python", "NLP", "Flask", "OpenAI API"], description: "Intelligent chatbot using natural language processing.", status: "Terminé", category: "Académique" },
    {
      title: "Nexora AI",
      tech: ["FastAPI", "React", "TypeScript", "PostgreSQL", "ChromaDB", "Sentence-Transformers", "Ollama"],
      description: "Call-center SaaS with on-premise RAG for automated ticket handling.",
      longDescription: "A call-center SaaS platform that automates ticket handling with an on-premise Retrieval-Augmented Generation pipeline — embeddings and retrieval stay fully self-hosted (ChromaDB, sentence-transformers, Ollama) so no support data leaves the client's infrastructure. FastAPI backend, React/TypeScript frontend, PostgreSQL for persistence.",
      status: "Terminé",
      category: "Personnel",
    },
    {
      title: "Stock Market Analytics Platform",
      tech: ["Python", "Kafka", "MySQL", "Docker", "Streamlit"],
      description: "Real-time streaming ingestion and processing for stock market data.",
      longDescription: "A real-time analytics platform that ingests and processes streaming stock market data through Kafka pipelines, persists it to MySQL, and surfaces live dashboards through Streamlit. Fully containerized with Docker for reproducible deployment.",
      status: "Terminé",
      category: "Personnel",
    },
    {
      title: "Medical Multi-Agent System",
      tech: ["LangGraph", "LangChain", "FastAPI", "MCP", "React", "Flutter"],
      description: "Coordinated LLM agents for clinical workflows.",
      longDescription: "A multi-agent system coordinating specialized LLM agents (via LangGraph/LangChain) over clinical workflows, exposed through an MCP tool interface with a FastAPI backend and both React (web) and Flutter (mobile) clients.",
      status: "Terminé",
      category: "Personnel",
    },
    {
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

  await prisma.$transaction(
    projects.map((project, index) =>
      prisma.project.create({
        data: { ...project, slug: slugify(project.title), position: index },
      }),
    ),
  );
  console.log(`Seeded ${projects.length} projects.`);
}

async function main() {
  await seedAdmin();
  await seedHero();
  await seedSocial();
  await seedAbout();
  await seedEducation();
  await seedExperience();
  await seedSkills();
  await seedCertificates();
  await seedProjects();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
