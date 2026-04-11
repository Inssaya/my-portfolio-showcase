import { useState, useEffect } from "react";
import { adminData, Education } from "@/lib/admin-data";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const empty: Omit<Education, "id"> = { period: "", title: "", institution: "", description: "" };

const AdminEducation = () => {
  const [items, setItems] = useState<Education[]>([]);
  const [editing, setEditing] = useState<Education | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { setItems(adminData.getEducation()); }, []);

  const save = () => {
    if (!editing) return;
    let updated: Education[];
    if (isNew) {
      updated = [...items, { ...editing, id: crypto.randomUUID() }];
    } else {
      updated = items.map((e) => (e.id === editing.id ? editing : e));
    }
    adminData.setEducation(updated);
    setItems(updated);
    setEditing(null);
    setIsNew(false);
  };

  const remove = (id: string) => {
    const updated = items.filter((e) => e.id !== id);
    adminData.setEducation(updated);
    setItems(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-sora text-2xl font-bold">Formation</h1>
        <button onClick={() => { setEditing({ ...empty, id: "" } as Education); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold">{isNew ? "Nouvelle Formation" : "Modifier"}</h2>
              <button onClick={() => { setEditing(null); setIsNew(false); }}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <input value={editing.period} onChange={(e) => setEditing({ ...editing, period: e.target.value })} placeholder="Période (ex: 2024 - 2026)" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Titre" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <input value={editing.institution} onChange={(e) => setEditing({ ...editing, institution: e.target.value })} placeholder="Institution" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Description" rows={3} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none resize-none" />
            <button onClick={save} className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center justify-center gap-2"><Check size={16} /> Sauvegarder</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((e) => (
          <div key={e.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-accent text-xs font-semibold">{e.period}</span>
              <h3 className="font-semibold text-sm">{e.title}</h3>
              <p className="text-xs text-muted-foreground">{e.institution} — {e.description}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditing(e); setIsNew(false); }} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
              <button onClick={() => remove(e.id)} className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminEducation;
