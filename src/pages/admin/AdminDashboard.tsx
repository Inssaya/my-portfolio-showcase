import { FolderKanban, MessageSquare, Eye, Hammer, ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { adminData } from "@/lib/admin-data";
import { useEffect, useState } from "react";

interface Gap {
  label: string;
  count: number;
  to: string;
  why: string;
}

/**
 * Everything on this page is derived from the data actually stored — no
 * placeholder metrics. The gaps list is the useful half: it names the content
 * that is missing and links straight to the screen that fixes it.
 */
function readState() {
  const projects = adminData.getProjects();
  const messages = adminData.getMessages();
  const links = adminData.getSocialLinks();

  const missingDetail = projects.filter((p) => !p.longDescription?.trim());
  const missingLinks = projects.filter((p) => !p.githubUrl?.trim() && !p.demoUrl?.trim());
  const missingImage = projects.filter((p) => !p.image?.trim());
  const unread = messages.filter((m) => !m.read);

  const gaps: Gap[] = [
    {
      label: "Lien LinkedIn absent",
      count: links.linkedin.trim() ? 0 : 1,
      to: "/admin/links",
      why: "L'icône est masquée partout sur le site tant qu'il est vide.",
    },
    {
      label: "Projets sans description détaillée",
      count: missingDetail.length,
      to: "/admin/projects",
      why: "Leur page de détail reste quasi vide.",
    },
    {
      label: "Projets sans lien GitHub ni démo",
      count: missingLinks.length,
      to: "/admin/projects",
      why: "Un recruteur ne peut pas vérifier le code.",
    },
    {
      label: "Projets sans image",
      count: missingImage.length,
      to: "/admin/projects",
      why: "Les cartes s'affichent sans visuel.",
    },
    {
      label: "Messages non lus",
      count: unread.length,
      to: "/admin/messages",
      why: "En attente de réponse.",
    },
  ];

  return {
    projects: projects.length,
    inProgress: projects.filter((p) => p.status === "En cours").length,
    messages: messages.length,
    unread: unread.length,
    gaps: gaps.filter((g) => g.count > 0),
  };
}

const AdminDashboard = () => {
  const [state, setState] = useState({
    projects: 0,
    inProgress: 0,
    messages: 0,
    unread: 0,
    gaps: [] as Gap[],
  });

  useEffect(() => setState(readState()), []);

  const cards = [
    { label: "Projets", value: state.projects, icon: FolderKanban, color: "text-accent" },
    { label: "En cours", value: state.inProgress, icon: Hammer, color: "text-yellow-400" },
    { label: "Messages", value: state.messages, icon: MessageSquare, color: "text-blue-400" },
    { label: "Non Lus", value: state.unread, icon: Eye, color: "text-green-400" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-sora text-2xl font-bold">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm">{c.label}</span>
              <c.icon size={20} className={c.color} />
            </div>
            <p className="font-sora text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6">
        <h2 className="font-sora font-semibold mb-1">À compléter</h2>
        <p className="text-muted-foreground text-sm mb-5">
          Ce qui manque dans le contenu du site, calculé à partir des données réelles.
        </p>

        {state.gaps.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check size={18} /> Tout est complet.
          </div>
        ) : (
          <ul className="space-y-2">
            {state.gaps.map((gap) => (
              <li key={gap.label}>
                <Link
                  to={gap.to}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors group"
                >
                  <span className="font-sora font-bold text-lg text-accent tabular-nums w-8 shrink-0">
                    {gap.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{gap.label}</span>
                    <span className="block text-xs text-muted-foreground">{gap.why}</span>
                  </span>
                  <ArrowRight
                    size={16}
                    className="text-muted-foreground group-hover:text-accent transition-colors shrink-0"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
