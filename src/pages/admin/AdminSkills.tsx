import { useState, useEffect } from "react";
import { adminData, SkillCategory } from "@/lib/admin-data";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const AdminSkills = () => {
  const [skills, setSkills] = useState<SkillCategory[]>([]);
  const [editing, setEditing] = useState<SkillCategory | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setSkills(adminData.getSkills()); }, []);

  const save = async () => {
    if (!editing) return;
    const updated: SkillCategory[] = isNew
      ? [...skills, { ...editing, id: crypto.randomUUID() }]
      : skills.map((s) => (s.id === editing.id ? editing : s));
    setError(null);
    try {
      await adminData.setSkills(updated);
      setSkills(updated);
      setEditing(null);
      setIsNew(false);
    } catch (err) {
      console.error("Failed to save skill category", err);
      setError("Échec de la sauvegarde — réessayez.");
    }
  };

  const remove = async (id: string) => {
    const updated = skills.filter((s) => s.id !== id);
    setError(null);
    try {
      await adminData.setSkills(updated);
      setSkills(updated);
    } catch (err) {
      console.error("Failed to delete skill category", err);
      setError("Échec de la suppression — réessayez.");
    }
  };

  const addSkill = () => {
    if (!skillInput.trim() || !editing) return;
    setEditing({ ...editing, skills: [...editing.skills, skillInput.trim()] });
    setSkillInput("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-sora text-2xl font-bold">Compétences</h1>
        <button onClick={() => { setEditing({ id: "", title: "", skills: [] }); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90">
          <Plus size={16} /> Ajouter Catégorie
        </button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold">{isNew ? "Nouvelle Catégorie" : "Modifier"}</h2>
              <button onClick={() => { setEditing(null); setIsNew(false); }}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Nom de la catégorie" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editing.skills.map((s, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-secondary text-foreground/80 flex items-center gap-1">
                    {s} <button onClick={() => setEditing({ ...editing, skills: editing.skills.filter((_, j) => j !== i) })}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} placeholder="Ajouter compétence..." className="flex-1 px-3 py-2 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
                <button onClick={addSkill} className="px-3 py-2 rounded-lg bg-accent/15 text-accent text-sm"><Plus size={16} /></button>
              </div>
            </div>
            <button onClick={() => void save()} className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center justify-center gap-2"><Check size={16} /> Sauvegarder</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {skills.map((cat) => (
          <div key={cat.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm text-accent">{cat.title}</h3>
              <div className="flex flex-wrap gap-1 mt-2">
                {cat.skills.map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground/70">{s}</span>)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditing(cat); setIsNew(false); }} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
              <button onClick={() => void remove(cat.id)} className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminSkills;
