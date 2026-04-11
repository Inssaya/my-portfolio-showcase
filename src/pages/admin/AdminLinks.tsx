import { useState, useEffect } from "react";
import { adminData, SocialLinks } from "@/lib/admin-data";
import { Check, Github, Linkedin, Mail, Phone, MapPin } from "lucide-react";

const AdminLinks = () => {
  const [links, setLinks] = useState<SocialLinks>({ github: "", linkedin: "", email: "", phone: "", location: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLinks(adminData.getSocialLinks()); }, []);

  const save = () => {
    adminData.setSocialLinks(links);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields = [
    { key: "github" as const, label: "GitHub", icon: Github, placeholder: "https://github.com/username" },
    { key: "linkedin" as const, label: "LinkedIn", icon: Linkedin, placeholder: "https://linkedin.com/in/username" },
    { key: "email" as const, label: "Email", icon: Mail, placeholder: "email@example.com" },
    { key: "phone" as const, label: "Téléphone", icon: Phone, placeholder: "+212 6..." },
    { key: "location" as const, label: "Localisation", icon: MapPin, placeholder: "Casablanca, Maroc" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-sora text-2xl font-bold">Liens & Contact</h1>

      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
              <f.icon size={18} className="text-accent" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
              <input
                value={links[f.key]}
                onChange={(e) => setLinks({ ...links, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm outline-none focus:border-accent/50"
              />
            </div>
          </div>
        ))}
      </div>

      <button onClick={save} className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90">
        <Check size={16} /> {saved ? "Sauvegardé ✓" : "Sauvegarder"}
      </button>
    </div>
  );
};

export default AdminLinks;
