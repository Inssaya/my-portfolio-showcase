import { useState, useEffect } from "react";
import { adminData, AboutCard } from "@/lib/admin-data";
import { Check, Pencil, X } from "lucide-react";

const AdminAbout = () => {
  const [cards, setCards] = useState<AboutCard[]>([]);
  const [editing, setEditing] = useState<AboutCard | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCards(adminData.getAbout()); }, []);

  const save = () => {
    if (!editing) return;
    const updated = cards.map((c) => (c.id === editing.id ? editing : c));
    adminData.setAbout(updated);
    setCards(updated);
    setEditing(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-sora text-2xl font-bold">Section À Propos</h1>
        {saved && <span className="text-green-400 text-sm flex items-center gap-1"><Check size={14} /> Sauvegardé</span>}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold">Modifier la carte</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Titre" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={5} placeholder="Contenu" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none resize-none" />
            <button onClick={save} className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:opacity-90">Sauvegarder</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {cards.map((c) => (
          <div key={c.id} className="glass-card p-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm">{c.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{c.content}</p>
            </div>
            <button onClick={() => setEditing(c)} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0"><Pencil size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminAbout;
