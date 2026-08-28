import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { setSessionStyle } from "@/lib/resume/api";

export type CvTemplate = "modern" | "classic";

export const DEFAULT_TEMPLATE: CvTemplate = "modern";

/** Preferred template survives across sessions in one browser, so switching
 *  once carries over to the next CV without having to reopen the picker. */
const STORAGE_KEY = "resume_preferred_style";

export function readPreferredTemplate(): CvTemplate {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "modern" || stored === "classic") return stored;
  } catch {
    // Storage disabled — the default is what visitors get.
  }
  return DEFAULT_TEMPLATE;
}

function writePreferredTemplate(style: CvTemplate): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // No fallback needed — the server holds the per-session choice.
  }
}

interface CvTemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** The current session's id, if a conversation is under way. Null on a
   *  brand-new visit — a picked style is remembered locally and applied when
   *  the first session is generated. */
  sessionId?: string | null;
  /** Live current selection, used to highlight the picked card. */
  current: CvTemplate;
  /** Called once the picker has accepted a new choice (locally and, if a
   *  session exists, server-side). */
  onPicked: (style: CvTemplate) => void;
}

/**
 * A modal for switching between the two CV templates.
 *
 * The visitor picks by seeing, not by reading a name — so each card is a
 * miniature of the actual CV design with Yassine's info baked in as an
 * example. Cheap: they are plain CSS, not server-rendered PDFs, so opening
 * the picker costs nothing and works offline.
 *
 * The existing PDF is intentionally NOT re-rendered here. Rebuilding is
 * still the visitor's action ("Build my CV" / "Rebuild"), so a picker change
 * cannot silently replace a file they are currently reading, and it never
 * spends tokens by itself.
 */
const CvTemplatePicker = ({
  open,
  onClose,
  sessionId,
  current,
  onPicked,
}: CvTemplatePickerProps) => {
  const [saving, setSaving] = useState<CvTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSaving(null);
      setError(null);
    }
  }, [open]);

  const pick = async (style: CvTemplate) => {
    if (saving || style === current) {
      if (style === current) onClose();
      return;
    }
    setError(null);

    // Save the browser-wide preference straight away so a switch survives a
    // reload even if the server call below fails.
    writePreferredTemplate(style);

    if (sessionId) {
      setSaving(style);
      // try/finally: a rejected call here must never leave `saving` set
      // forever with no way to clear it short of a reload — that shipped
      // once already (a missing CORS method turned into an infinite spinner
      // rather than the "couldn't save" message below).
      try {
        const saved = await setSessionStyle(sessionId, style);
        if (!saved) {
          setError("Couldn't save that choice. Try again.");
          return;
        }
      } finally {
        setSaving(null);
      }
    }

    onPicked(style);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={onClose}
        >
          {/* max-h + its own overflow-y is what keeps this usable on a phone:
              two full CV-shaped preview cards are taller than a phone
              viewport, and without an internal scroll the dialog used to
              overflow a `fixed` ancestor with nothing to scroll it — the
              header and close button ended up pushed off-screen with no way
              back to them. Capped to dvh, not vh, so mobile Chrome's
              address-bar collapse doesn't leave a gap under the sheet. */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
            role="dialog"
            aria-label="Pick a template"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl shadow-black/40 sm:max-h-[85dvh] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-6 py-4">
              <div>
                <h2 className="font-sora text-lg font-bold">Pick a template</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose the look for your CV. The preview shows an example — your
                  own information will be filled in.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TemplateCard
                  style="modern"
                  label="Modern"
                  caption="Teal sidebar, cream page. The house style."
                  selected={current === "modern"}
                  saving={saving === "modern"}
                  onPick={() => void pick("modern")}
                >
                  <ModernPreview />
                </TemplateCard>

                <TemplateCard
                  style="classic"
                  label="Classic"
                  caption="Serif with a photo header. Traditional feel."
                  selected={current === "classic"}
                  saving={saving === "classic"}
                  onPick={() => void pick("classic")}
                >
                  <ClassicPreview />
                </TemplateCard>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}

              <p className="mt-4 text-[11px] text-muted-foreground">
                Switching a template doesn't rebuild your CV automatically —
                press <span className="text-foreground">Rebuild</span> when
                you're ready to see the new look.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface TemplateCardProps {
  style: CvTemplate;
  label: string;
  caption: string;
  selected: boolean;
  saving: boolean;
  onPick: () => void;
  children: React.ReactNode;
}

const TemplateCard = ({
  label,
  caption,
  selected,
  saving,
  onPick,
  children,
}: TemplateCardProps) => (
  <button
    type="button"
    onClick={onPick}
    disabled={saving}
    className={`group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all ${
      selected
        ? "border-accent shadow-lg shadow-accent/20"
        : "border-border/60 hover:border-accent/50"
    } ${saving ? "cursor-wait opacity-70" : ""}`}
  >
    {selected && (
      <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow">
        <Check size={13} />
      </span>
    )}
    {saving && (
      <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/80">
        <Loader2 size={12} className="animate-spin text-accent" />
      </span>
    )}
    <div className="relative aspect-[7/9] w-full overflow-hidden bg-neutral-100">
      {children}
    </div>
    <div className="border-t border-border/60 bg-card px-3 py-2.5">
      <p className="font-sora text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  </button>
);

/**
 * A miniature of the LaTeX reference (`cv/yassine-sinif-cv.tex`).
 *
 * Not pixel-accurate — a card at this size can't be — but every visual choice
 * that makes the real template recognisable is here: the teal sidebar band on
 * the left, the cream page, the round photo, the Playfair name in the main
 * column, the accent-coloured section headings.
 */
const ModernPreview = () => (
  <div className="absolute inset-0 flex" style={{ background: "#FAF9F5" }}>
    <div
      className="flex w-[38%] shrink-0 flex-col items-center px-2 pt-3 text-[6px] leading-tight"
      style={{ background: "#254553", color: "#E3E6E9" }}
    >
      <div
        className="mb-2 h-9 w-9 rounded-full border"
        style={{
          background: "linear-gradient(135deg, #6b8290, #3a5560)",
          borderColor: "#677E88",
        }}
      />
      <p className="mb-1 font-bold tracking-widest" style={{ color: "#C2C6CF" }}>
        CONTACT
      </p>
      <div className="w-full space-y-0.5 text-center">
        <p>Casablanca</p>
        <p>+212 6 23 84 25 35</p>
        <p className="truncate">yassinsinif4@…</p>
      </div>
      <p
        className="mt-2 mb-1 font-bold tracking-widest"
        style={{ color: "#C2C6CF" }}
      >
        SKILLS
      </p>
      <div className="w-full space-y-0.5 text-center">
        <p className="opacity-90">Python, FastAPI</p>
        <p className="opacity-90">React, TypeScript</p>
        <p className="opacity-90">SQL, MongoDB</p>
      </div>
      <p
        className="mt-2 mb-1 font-bold tracking-widest"
        style={{ color: "#C2C6CF" }}
      >
        LANGUAGES
      </p>
      <div className="w-full space-y-0.5 text-center">
        <p>Arabic — Native</p>
        <p>English — B2</p>
      </div>
    </div>
    <div className="flex-1 px-3 pt-3 text-[6px] leading-snug" style={{ color: "#3A3734" }}>
      <p
        className="font-serif text-[13px] leading-none"
        style={{ color: "#12241F" }}
      >
        Yassine Sinif
      </p>
      <p className="mt-0.5 text-[6px] font-semibold" style={{ color: "#0E5B52" }}>
        AI &amp; Data Engineering
      </p>
      <p
        className="mt-2 text-[6px] font-bold tracking-widest"
        style={{ color: "#0E5B52" }}
      >
        PROFILE
      </p>
      <p className="mt-1 leading-snug">
        Engineering student in AI &amp; Data Science, final year. Seeking a
        6-month PFE internship starting Feb 2027.
      </p>
      <p
        className="mt-2 text-[6px] font-bold tracking-widest"
        style={{ color: "#0E5B52" }}
      >
        EXPERIENCE
      </p>
      <p className="mt-0.5 text-[7px] font-bold" style={{ color: "#1A1A17" }}>
        AI Data Engineer Intern{" "}
        <span style={{ color: "#0E5B52" }}>— Aptiv</span>
      </p>
      <p style={{ color: "#797772" }}>Tangier · Jun 2026 – Present</p>
      <p
        className="mt-2 text-[6px] font-bold tracking-widest"
        style={{ color: "#0E5B52" }}
      >
        PROJECTS
      </p>
      <p className="mt-0.5">
        <span className="font-bold" style={{ color: "#1A1A17" }}>
          Nexora AI
        </span>{" "}
        — Call-center SaaS with on-premise RAG.
      </p>
    </div>
  </div>
);

/**
 * A miniature of the actual `classic` renderer (`_cvdesign.py`), not a
 * loosely-inspired restyle.
 *
 * It shipped once as a restyle — a light cream card, a thin taupe strip, a
 * sidebar on the *right* — and the real PDF a visitor got back looked
 * nothing like what they picked: a full-height dark sidebar on the *left*, a
 * taupe banner spanning the top with the photo and name on it, and taupe
 * filled badges (not plain coloured text) for every section heading in the
 * main column. Every colour below is the same hex `_cvdesign.py` paints with
 * (DARK/TAUPE/SIDE_TEXT/BODY/SUBTLE), and every position is that file's own
 * point coordinates converted to a percentage of the A4 page (595×842pt) —
 * not eyeballed, so it cannot drift from the renderer the way a loosely-
 * inspired restyle already did once.
 */
const ClassicPreview = () => (
  <div className="absolute inset-0" style={{ background: "#FFFFFF" }}>
    {/* Sidebar: full height, x 0–200/595 ≈ 33.6%. */}
    <div className="absolute inset-y-0 left-0 w-[33.6%]" style={{ background: "#282830" }} />

    {/* Banner: x 40–554.5/595, y 40–188/842. Painted after the sidebar so it
        overlaps the top of it, exactly as header()'s notch-then-banner order
        does in the real render. */}
    <div
      className="absolute"
      style={{ left: "6.7%", top: "4.7%", width: "86.5%", height: "17.6%", background: "#B59E96" }}
    />
    {/* Photo: centre 121/595, 106/842, radius 46pt. */}
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gradient-to-br from-neutral-400 to-neutral-600"
      style={{ left: "20.3%", top: "12.6%", width: "13.6%", aspectRatio: "1 / 1" }}
    />
    {/* Name + contact: x 220/595 ≈ 37%. */}
    <div className="absolute text-white" style={{ left: "37%", top: "9.5%", width: "56%" }}>
      <p className="font-serif text-[9px] font-bold uppercase leading-none">Yassine Sinif</p>
      <p className="mt-[3px] text-[5px] leading-tight">yassinsinif4@gmail.com</p>
      <p className="text-[5px] leading-tight">Casablanca, Morocco</p>
    </div>

    {/* Both columns start at CONTENT_TOP = 218/842 ≈ 25.9%. */}
    <div
      className="absolute px-1.5 text-[5.5px] leading-tight"
      style={{ left: "6.7%", top: "26%", width: "23%", color: "#E0E0E1" }}
    >
      <p className="font-serif font-bold tracking-widest" style={{ color: "#B59E96" }}>
        SKILLS
      </p>
      <p className="mt-1">Python, FastAPI</p>
      <p>React, TypeScript</p>
      <p className="mt-1.5 font-serif font-bold tracking-widest" style={{ color: "#B59E96" }}>
        LANGUAGES
      </p>
      <p className="mt-1">Arabic</p>
      <div className="mt-[1px] h-[1.5px] w-full" style={{ background: "#B59E96" }} />
    </div>

    <div
      className="absolute text-[5.5px] leading-snug"
      style={{ left: "37%", top: "26%", width: "56%", color: "#1A1A1A" }}
    >
      <span
        className="inline-block font-serif font-bold uppercase tracking-widest text-white"
        style={{ background: "#B59E96", padding: "1px 4px" }}
      >
        Profile
      </span>
      <p className="mt-1 italic leading-snug">
        Engineering student in AI &amp; Data Science, final year.
      </p>
      <span
        className="mt-1.5 inline-block font-serif font-bold uppercase tracking-widest text-white"
        style={{ background: "#B59E96", padding: "1px 4px" }}
      >
        Experience
      </span>
      <p className="mt-1 font-bold">AI Data Engineer Intern</p>
      <p style={{ color: "#8A8A8A" }}>Aptiv · Tangier, Morocco</p>
    </div>
  </div>
);

export default CvTemplatePicker;
