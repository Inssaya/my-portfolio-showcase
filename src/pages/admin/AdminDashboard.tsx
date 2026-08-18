import { FolderKanban, MessageSquare, Eye, TrendingUp } from "lucide-react";
import { adminData } from "@/lib/admin-data";
import { useEffect, useState } from "react";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ projects: 0, messages: 0, unread: 0 });

  useEffect(() => {
    let cancelled = false;
    const projects = adminData.getProjects(); // sync — reads from localStorage cache
    // Messages come straight from Supabase (fresh); everything else is cached.
    adminData.getMessages().then((messages) => {
      if (cancelled) return;
      setStats({
        projects: projects.length,
        messages: messages.length,
        unread: messages.filter((m) => !m.read).length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: "Projets", value: stats.projects, icon: FolderKanban, color: "text-accent" },
    { label: "Messages", value: stats.messages, icon: MessageSquare, color: "text-blue-400" },
    { label: "Non Lus", value: stats.unread, icon: Eye, color: "text-yellow-400" },
    { label: "Visites (démo)", value: 1284, icon: TrendingUp, color: "text-green-400" },
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
        <h2 className="font-sora font-semibold mb-4">Analytique (démo)</h2>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          <p>Les graphiques d'analytique seront disponibles après l'intégration backend.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
