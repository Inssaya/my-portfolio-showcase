import { useState, useEffect } from "react";
import { adminData, Certificate } from "@/lib/admin-data";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const AdminCertificates = () => {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setCerts(adminData.getCertificates()); }, []);

  const save = async () => {
    if (!editing) return;
    const updated: Certificate[] = isNew
      ? [...certs, { ...editing, id: crypto.randomUUID() }]
      : certs.map((c) => (c.id === editing.id ? editing : c));
    setError(null);
    try {
      await adminData.setCertificates(updated);
      setCerts(updated);
      setEditing(null);
      setIsNew(false);
    } catch (err) {
      console.error("Failed to save certificate", err);
      setError("Échec de la sauvegarde — réessayez.");
    }
  };

  const remove = async (id: string) => {
    const updated = certs.filter((c) => c.id !== id);
    setError(null);
    try {
      await adminData.setCertificates(updated);
      setCerts(updated);
    } catch (err) {
      console.error("Failed to delete certificate", err);
      setError("Échec de la suppression — réessayez.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-sora text-2xl font-bold">Certificats</h1>
        <button onClick={() => { setEditing({ id: "", name: "", issuer: "" }); setIsNew(true); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-sora font-semibold">{isNew ? "Nouveau Certificat" : "Modifier"}</h2>
              <button onClick={() => { setEditing(null); setIsNew(false); }}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nom du certificat" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <input value={editing.issuer} onChange={(e) => setEditing({ ...editing, issuer: e.target.value })} placeholder="Émetteur (ex: IBM, Google...)" className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none" />
            <button onClick={() => void save()} className="w-full py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center justify-center gap-2"><Check size={16} /> Sauvegarder</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {certs.map((c) => (
          <div key={c.id} className="glass-card p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{c.name}</h3>
              <p className="text-xs text-muted-foreground">{c.issuer}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditing(c); setIsNew(false); }} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
              <button onClick={() => void remove(c.id)} className="p-2 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCertificates;
