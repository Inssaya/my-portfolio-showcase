import { useState, useEffect } from "react";
import { adminData, Project } from "@/lib/admin-data";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const emptyProject: Omit<Project, "id"> = {
  title: "", description: "", longDescription: "", tech: [], status: "En cours", category: "Personnel", image: "", demoUrl: "", githubUrl: "",
};

const AdminProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [techInput, setTechInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setProjects(adminData.getProjects()); }, []);

  const save = async () => {
    if (!editing) return;
    const updated: Project[] = isNew
      ? [...projects, { ...editing, id: crypto.randomUUID() }]
      : projects.map((p) => (p.id === editing.id ? editing : p));
    setError(null);
    try {
      await adminData.setProjects(updated);
      setProjects(updated);
      setEditing(null);
      setIsNew(false);
    } catch (err) {
      console.error("Failed to save project", err);
      setError("Échec de la sauvegarde — réessayez.");
    }
  };

  const remove = async (id: string) => {
    const updated = projects.filter((p) => p.id !== id);
    setError(null);
    try {
      await adminData.setProjects(updated);
      setProjects(updated);
    } catch (err) {
      console.error("Failed to delete project", err);
      setError("Échec de la suppression — réessayez.");
    }
  };

  const addTech = () => {
    if (!techInput.trim() || !editing) return;
    setEditing({ ...editing, tech: [...editing.tech, techInput.trim()] });
    setTechInput("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-sora text-2xl font-bold">Projets</h1>
        <button
          onClick={() => { setEditing({ ...emptyProject, id: "" } as Project); setIsNew(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold">{isNew ? "Nouveau Projet" : "Modifier Projet"}</h2>
              <button onClick={() => { setEditing(null); setIsNew(false); }} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Titre" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Description courte (carte)" rows={2} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50 resize-none" />
            <textarea value={editing.longDescription || ""} onChange={(e) => setEditing({ ...editing, longDescription: e.target.value })} placeholder="Description longue (page projet, optionnel)" rows={4} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50 resize-none" />

            <div className="flex gap-3">
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Project["status"] })} className="flex-1 px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none">
                <option value="En cours">En cours</option>
                <option value="Terminé">Terminé</option>
              </select>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as Project["category"] })} className="flex-1 px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none">
                <option value="Personnel">Personnel</option>
                <option value="Académique">Académique</option>
                <option value="Internship">Internship</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Technologies</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editing.tech.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 flex items-center gap-1">
                    {t}
                    <button onClick={() => setEditing({ ...editing, tech: editing.tech.filter((_, j) => j !== i) })} className="hover:text-destructive"><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={techInput} onChange={(e) => setTechInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTech())} placeholder="Ajouter tech..." className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
                <button onClick={addTech} className="px-3 py-2 rounded-lg bg-accent/15 text-accent text-sm hover:bg-accent/25"><Plus size={16} /></button>
              </div>
            </div>

            <input value={editing.image || ""} onChange={(e) => setEditing({ ...editing, image: e.target.value })} placeholder="URL Photo (optionnel)" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
            <input value={editing.demoUrl || ""} onChange={(e) => setEditing({ ...editing, demoUrl: e.target.value })} placeholder="Lien Démo (optionnel)" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
            <input value={editing.githubUrl || ""} onChange={(e) => setEditing({ ...editing, githubUrl: e.target.value })} placeholder="Lien GitHub (optionnel)" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />

            <button onClick={() => void save()} className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90">
              <Check size={16} /> Sauvegarder
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm truncate">{p.title}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.status === "En cours" ? "bg-accent/15 text-accent" : "bg-green-500/15 text-green-400"}`}>{p.status}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{p.category}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{p.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.tech.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground/70">{t}</span>)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditing(p); setIsNew(false); }} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
              <button onClick={() => void remove(p.id)} className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {projects.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Aucun projet. Cliquez sur "Ajouter" pour commencer.</p>}
      </div>
    </div>
  );
};

export default AdminProjects;
