import { motion } from "framer-motion";
import { Download, Loader2, Mail, MapPin, Phone, Send } from "lucide-react";
import { useEffect, useState, FormEvent } from "react";
import { adminData } from "@/lib/admin-data";
import { CV_URL } from "@/lib/cv";

const fadeIn = (delay: number) => ({
  hidden: { y: 40, opacity: 0 },
  show: {
    y: 0, opacity: 1,
    transition: { type: "tween", duration: 0.8, delay, ease: [0.25, 0.25, 0.25, 0.75] },
  },
});

type SubmitState = "idle" | "sending" | "sent" | "error";

const ContactSection = () => {
  const [status, setStatus] = useState<SubmitState>("idle");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  // Email/phone/location shown below were hardcoded, drifted independently
  // of Liens & Contact in /admin — same class of bug as the Hero byline chip.
  const [links, setLinks] = useState(() => adminData.getSocialLinks());

  useEffect(() => { setLinks(adminData.getSocialLinks()); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      await adminData.addMessage(form);
      setForm({ name: "", email: "", subject: "", message: "" });
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      // Real network / RLS error — tell the visitor rather than pretend it
      // worked. They can retry, or fall back to the email link above.
      console.error("Failed to send message", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
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
          Get In <span className="text-gradient-accent">Touch</span>
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
              I'm an AI &amp; Data Engineer looking for my next internship (PFE) — in Morocco or
              abroad — or freelance projects. If your team could use some extra hands, I'd love to
              hear from you.
            </p>

            <div className="space-y-4">
              {links.email && (
                <a href={`mailto:${links.email}`} className="flex items-center gap-4 text-foreground/80 hover:text-accent transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <Mail className="text-accent" size={18} />
                  </div>
                  <span className="text-sm">{links.email}</span>
                </a>
              )}

              {links.phone && (
                <a href={`tel:${links.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-4 text-foreground/80 hover:text-accent transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <Phone className="text-accent" size={18} />
                  </div>
                  <span className="text-sm">{links.phone}</span>
                </a>
              )}

              <div className="flex items-center gap-4 text-foreground/80">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <MapPin className="text-accent" size={18} />
                </div>
                <span className="text-sm">{links.location}</span>
              </div>

              <a
                href={CV_URL}
                download
                className="group mt-2 inline-flex items-center gap-3 self-start rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/15"
              >
                <Download
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-y-0.5"
                />
                Download my CV
              </a>
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
                placeholder="Name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
              />
              <input
                type="email"
                placeholder="Email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            <input
              type="text"
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors"
            />
            <textarea
              placeholder="Your message..."
              rows={5}
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50 text-sm outline-none focus:border-accent/50 transition-colors resize-none"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full py-3 rounded-full bg-accent text-accent-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {status === "sending" && <><Loader2 size={16} className="animate-spin" /> Sending…</>}
              {status === "sent" && "Message Sent ✓"}
              {status === "error" && "Send failed — try again"}
              {status === "idle" && <>Send Message <Send size={16} /></>}
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
