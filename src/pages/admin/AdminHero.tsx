import { useState, useEffect } from "react";
import { adminData, HeroContent } from "@/lib/admin-data";
import { Check } from "lucide-react";

const AdminHero = () => {
  const [hero, setHero] = useState<HeroContent>({ subtitle: "", title: "", titleHighlight: "", description: "" });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setHero(adminData.getHero()); }, []);

  const save = async () => {
    setError(null);
    try {
      await adminData.setHero(hero);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save hero", err);
      setError("Échec de la sauvegarde — réessayez.");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-sora text-2xl font-bold">Section Hero</h1>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Sous-titre</label>
          <input value={hero.subtitle} onChange={(e) => setHero({ ...hero, subtitle: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Titre (avant highlight)</label>
          <input value={hero.title} onChange={(e) => setHero({ ...hero, title: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Titre Highlight (en couleur)</label>
          <input value={hero.titleHighlight} onChange={(e) => setHero({ ...hero, titleHighlight: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
          <textarea value={hero.description} onChange={(e) => setHero({ ...hero, description: e.target.value })} rows={4} className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50 resize-none" />
        </div>
      </div>

      <button onClick={() => void save()} className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90">
        <Check size={16} /> {saved ? "Sauvegardé ✓" : "Sauvegarder"}
      </button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
};

export default AdminHero;
