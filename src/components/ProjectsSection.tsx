import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const projects = [
  {
    title: "Multi-Vendor E-commerce SaaS Platform",
    tech: ["React", "Next.js", "Express", "MongoDB", "Redis", "Kafka"],
    description: "Microservices architecture with Firebase, websockets and cloud deployment (AWS).",
    status: "In Progress",
    category: "Personal",
  },
  {
    title: "Gym Management App",
    tech: ["Java", "NFC", "Face Recognition", "Fingerprint", "QR Code"],
    description: "Full-featured gym management system with biometric check-in: NFC, facial recognition, fingerprint scanning and QR code verification.",
    status: "Completed",
    category: "Personal",
  },
  {
    title: "Optic Management App",
    tech: ["Java", "MySQL", "Swing"],
    description: "Desktop application for optical store management — inventory, prescriptions, client records and sales tracking.",
    status: "Completed",
    category: "Personal",
  },
  {
    title: "POS System App",
    tech: ["Java", "JavaFX", "MySQL"],
    description: "Point of sale system with real-time inventory management, receipt generation and sales analytics.",
    status: "Completed",
    category: "Personal",
  },
  {
    title: "RAG Chatbot",
    tech: ["Python", "LangChain", "FAISS", "OpenAI API", "Flask"],
    description: "Retrieval-Augmented Generation chatbot that queries custom knowledge bases for context-aware, accurate responses.",
    status: "Completed",
    category: "Personal",
  },
  {
    title: "AI-Based Enterprise Ticket Management",
    tech: ["Python", "NLP", "Django", "PostgreSQL"],
    description: "Intelligent ticket routing and prioritization system using NLP to classify, assign and resolve enterprise support tickets.",
    status: "Completed",
    category: "Academic",
  },
  {
    title: "Mobile Transport App",
    tech: ["React Native"],
    description: "Mobile application for transport services currently in development.",
    status: "In Progress",
    category: "Personal",
  },
  {
    title: "Plagiarism Detection System",
    tech: ["Python", "TF-IDF", "SBERT"],
    description: "Plagiarism detection using advanced NLP techniques for semantic similarity analysis.",
    status: "Completed",
    category: "Academic",
  },
  {
    title: "Flight Management System (Web)",
    tech: ["Python", "Django", "Tailwind CSS"],
    description: "Web application for flight management with a modern, responsive interface.",
    status: "Completed",
    category: "Academic",
  },
  {
    title: "Car Locator Platform",
    tech: ["PHP", "Laravel", "JavaScript"],
    description: "Vehicle location platform with interactive map and real-time tracking.",
    status: "Completed",
    category: "Academic",
  },
  {
    title: "To-Do List Web App",
    tech: ["React", "TypeScript", "Tailwind CSS"],
    description: "Task management application with reactive UI and persistent storage.",
    status: "Completed",
    category: "Personal",
  },
  {
    title: "AI Chatbot",
    tech: ["Python", "NLP", "Flask", "OpenAI API"],
    description: "Intelligent chatbot using natural language processing for conversational AI.",
    status: "Completed",
    category: "Academic",
  },
];

const ProjectsSection = () => {
  return (
    <section id="projects" className="py-24 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          My <span className="text-gradient-accent">Projects</span>
        </motion.h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {projects.map((project, i) => (
            <motion.div
              key={project.title}
              variants={fadeIn(0.1 + i * 0.06)}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="glass-card p-6 group hover:border-accent/50 transition-all duration-300 flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                      project.status === "In Progress"
                        ? "bg-accent/15 text-accent"
                        : "bg-green-500/15 text-green-400"
                    }`}
                  >
                    {project.status}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                    {project.category}
                  </span>
                </div>
                <ExternalLink size={16} className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <h3 className="font-sora font-semibold text-sm mb-2 leading-snug">{project.title}</h3>
              <p className="text-muted-foreground text-xs mb-4 flex-1">{project.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {project.tech.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                    {t}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;
