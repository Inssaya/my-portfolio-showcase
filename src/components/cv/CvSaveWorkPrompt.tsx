import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Lock, X } from "lucide-react";
import { convertGuestAccount } from "@/lib/cv/guest";

interface CvSaveWorkPromptProps {
  open: boolean;
  onClose: () => void;
  /** Called once the guest account has become a real one. */
  onSaved?: () => void;
}

/**
 * The conversion point: shown once a guest has a finished CV in hand.
 *
 * Deliberately a *save* prompt and not a wall. The old flow asked for an email
 * and a verification click before showing anything, and people left — nobody
 * opens their inbox for a product they have not seen work. This asks at the
 * moment the visitor is holding something they want to keep, which is both the
 * better time to ask and the honest framing: their CV already exists and is
 * already downloadable, and an account is how they get back to it.
 *
 * Dismissible for the same reason. A guest who says no keeps their CV and can
 * carry on; the prompt is offered again later rather than blocking the door.
 */
const CvSaveWorkPrompt = ({ open, onClose, onSaved }: CvSaveWorkPromptProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"saved" | "confirm" | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await convertGuestAccount(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Couldn't save your account.");
      return;
    }
    setDone(result.needsEmailConfirmation ? "confirm" : "saved");
    onSaved?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.33, 1, 0.68, 1] }}
            role="dialog"
            aria-label="Keep your CV"
            className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-2xl shadow-black/40"
          >
            {done ? (
              <div className="space-y-3 text-center">
                <CheckCircle2 size={38} className="mx-auto text-accent" />
                <h2 className="font-sora text-lg font-bold">
                  {done === "confirm" ? "Almost there" : "Saved to your account"}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {done === "confirm"
                    ? "Open the link we just emailed you to finish setting up your account. Your CV is already saved and stays exactly where it is."
                    : "Your CV and this conversation are attached to your account — sign in any time to pick them back up."}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
                >
                  Back to my CV
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sora text-lg font-bold">Keep this CV</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      You're building as a guest. Add an email and password to keep this
                      CV and come back to it from any device — nothing you've built is
                      lost, it stays exactly as it is.
                    </p>
                    {/* Concrete, because "create an account" on its own reads
                        as a toll gate. As a guest each conversation has its own
                        allowance; an account replaces that with a weekly one
                        across all of them, so a long CV never runs out mid-way. */}
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      An account also lifts the per-conversation limit — you get a
                      weekly allowance across every CV instead, so a long one never
                      stops halfway.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Not now"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={submit} className="space-y-3">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    disabled={busy}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    disabled={busy}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                  />

                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !email.trim() || password.length < 6}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    {busy ? "Saving…" : "Keep my CV"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Not now
                  </button>
                </form>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock size={11} />
                  Your CV stays private to your account.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CvSaveWorkPrompt;
