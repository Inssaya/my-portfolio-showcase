import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { useState, FormEvent } from "react";
import { adminData } from "@/lib/admin-data";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

const ContactSection = () => {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    adminData.addMessage(form);
    setForm({ name: "", email: "", subject: "", message: "" });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <section id="contact" className="py-24 pb-32 relative">
      <div className="container mx-auto">
        <motion.h2
          variants={fadeIn(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="font-sora text-3xl md:text-5xl font-bold text-center mb-16"
        >
          Me <span className="text-gradient-accent">Contacter</span>
        </motion.h2>

        <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          <motion.div
            variants={fadeIn(0.2)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="space-y-8"
          >
            <p className="text-muted-foreground leading-relaxed">
              Je suis à la recherche d'un stage de deux mois à partir du 01/07/2026. 
              N'hésitez pas à me contacter pour toute opportunité.
            </p>

            <div className="space-y-4">
              <a href="mailto:yassine.sinif@emsi-edu.ma" className="flex items-center gap-4 text-foreground/80 hover:text-accent transition-colors group">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Mail className="text-accent" size={18} />
                </div>
                <span className="text-sm">yassine.sinif@emsi-edu.ma</span>
              </a>

              <div className="flex items-center gap-4 text-foreground/80">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Phone className="text-accent" size={18} />
                </div>
                <span className="text-sm">0623842...</span>
              </div>

              <div className="flex items-center gap-4 text-foreground/80">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <MapPin className="text-accent" size={18} />
                </div>
                <span className="text-sm">Casablanca, Maroc</span>
              </div>
            </div>
          </motion.div>

          <motion.form
            variants={fadeIn(0.3)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Nom"
                required
                className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="email"
                placeholder="Email"
                required
                className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            <input
              type="text"
              placeholder="Sujet"
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
            />
            <textarea
              placeholder="Votre message..."
              rows={5}
              required
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors resize-none"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-full bg-accent text-accent-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              {submitted ? "Message Envoyé ✓" : (
                <>Envoyer <Send size={16} /></>
              )}
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
