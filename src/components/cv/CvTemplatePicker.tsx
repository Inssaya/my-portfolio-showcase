import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { setSessionStyle } from "@/lib/resume/api";
import modernThumb from "@/assets/cv-templates/modern.jpg";
import modernBlueThumb from "@/assets/cv-templates/modern-blue.jpg";
import modernPlumThumb from "@/assets/cv-templates/modern-plum.jpg";
import modernBurgundyThumb from "@/assets/cv-templates/modern-burgundy.jpg";
import classicThumb from "@/assets/cv-templates/classic.jpg";
import classicBlueThumb from "@/assets/cv-templates/classic-blue.jpg";
import classicGreenThumb from "@/assets/cv-templates/classic-green.jpg";
import classicBurgundyThumb from "@/assets/cv-templates/classic-burgundy.jpg";

export type CvTemplate =
  | "modern"
  | "modern-blue"
  | "modern-plum"
  | "modern-burgundy"
  | "classic"
  | "classic-blue"
  | "classic-green"
  | "classic-burgundy";

export const DEFAULT_TEMPLATE: CvTemplate = "modern";

/** Order matches the backend's PICKABLE_STYLES: each layout followed by its
 *  own recolours, so the grid reads as two families rather than eight
 *  unrelated cards. */
const TEMPLATES: CvTemplate[] = [
  "modern",
  "modern-blue",
  "modern-plum",
  "modern-burgundy",
  "classic",
  "classic-blue",
  "classic-green",
  "classic-burgundy",
];

/**
 * Real renders, not CSS mockups.
 *
 * A hand-drawn miniature shipped once as a "loosely inspired" restyle of the
 * `classic` layout — light and cream where the real render is a full-height
 * dark sidebar with a taupe banner — and a visitor who picked it got back a
 * CV that looked nothing like what they chose. These are PNG screenshots of
 * `build_resume()`'s actual output (Yassine's real CV, every pickable
 * style), so what is shown here is what downloading produces — full stop,
 * not "an impression of it".
 */
const THUMBNAILS: Record<CvTemplate, string> = {
  modern: modernThumb,
  "modern-blue": modernBlueThumb,
  "modern-plum": modernPlumThumb,
  "modern-burgundy": modernBurgundyThumb,
  classic: classicThumb,
  "classic-blue": classicBlueThumb,
  "classic-green": classicGreenThumb,
  "classic-burgundy": classicBurgundyThumb,
};

export const TEMPLATE_LABELS: Record<CvTemplate, { label: string; caption: string }> = {
  modern: { label: "Modern", caption: "Teal sidebar, cream page. The house style." },
  "modern-blue": { label: "Modern — Blue", caption: "Modern's layout, navy sidebar." },
  "modern-plum": { label: "Modern — Plum", caption: "Modern's layout, deep plum sidebar." },
  "modern-burgundy": { label: "Modern — Burgundy", caption: "Modern's layout, wine sidebar." },
  classic: { label: "Classic", caption: "Serif with a photo header. Taupe accent." },
  "classic-blue": { label: "Classic — Blue", caption: "Classic's layout, slate blue accent." },
  "classic-green": { label: "Classic — Green", caption: "Classic's layout, forest green accent." },
  "classic-burgundy": { label: "Classic — Burgundy", caption: "Classic's layout, deep wine accent." },
};

/** Preferred template survives across sessions in one browser, so switching
 *  once carries over to the next CV without having to reopen the picker. */
const STORAGE_KEY = "resume_preferred_style";

export function readPreferredTemplate(): CvTemplate {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (TEMPLATES.includes(stored as CvTemplate)) return stored as CvTemplate;
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
 * A modal for switching between the CV templates.
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
              a column of full CV-shaped preview cards is far taller than a
              phone viewport, and without an internal scroll the dialog used to
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
            className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl shadow-black/40 sm:max-h-[85dvh] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 px-6 py-4">
              <div>
                <h2 className="font-sora text-lg font-bold">Pick a template</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Real renders of the CV you're building — your own information
                  will be filled in exactly like this.
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
              {/* 4 across on desktop is not arbitrary: there are four modern
                  variants and four classic ones, so each family lands on its
                  own row and the two layouts read as two groups rather than
                  eight unrelated cards. */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {TEMPLATES.map((style) => (
                  <TemplateCard
                    key={style}
                    style={style}
                    label={TEMPLATE_LABELS[style].label}
                    caption={TEMPLATE_LABELS[style].caption}
                    thumbnail={THUMBNAILS[style]}
                    selected={current === style}
                    saving={saving === style}
                    onPick={() => void pick(style)}
                  />
                ))}
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
  thumbnail: string;
  selected: boolean;
  saving: boolean;
  onPick: () => void;
}

const TemplateCard = ({
  label,
  caption,
  thumbnail,
  selected,
  saving,
  onPick,
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
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
      <img
        src={thumbnail}
        alt={`${label} template preview`}
        loading="lazy"
        className="h-full w-full object-cover object-top"
      />
    </div>
    <div className="border-t border-border/60 bg-card px-3 py-2.5">
      <p className="font-sora text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  </button>
);

export default CvTemplatePicker;
