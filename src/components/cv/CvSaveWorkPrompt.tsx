import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Lock, X } from "lucide-react";
import { convertGuestAccount, verifyEmailCode } from "@/lib/cv/guest";

interface CvSaveWorkPromptProps {
  open: boolean;
  onClose: () => void;
  /**
   * Why the visitor is seeing this. `download` is the hard one — they pressed
   * a button and were stopped — so it leads with what they were trying to do
   * rather than with a pitch for an account.
   */
  reason?: "save" | "download";
  /** Called once the account is real and verified. */
  onSaved?: () => void;
}

/**
 * Turning a guest into an account, without losing anything.
 *
 * Two steps, because the address has to be proved: attach the email and
 * password to the account that already exists, then confirm the code sent to
 * it. `updateUser` rather than `signUp` is what keeps the account id the same,
 * so the CV built as a guest is still there afterwards with nothing to
 * migrate — see convertGuestAccount.
 *
 * A code, not a link. A link opens a new browser context, and on a phone that
 * is frequently a different app's in-app browser: the visitor lands signed in
 * somewhere that has none of the work they just did, in a tab they cannot get
 * back to. The code is typed into the tab they are already sitting in.
 */
const CvSaveWorkPrompt = ({
  open,
  onClose,
  reason = "save",
  onSaved,
}: CvSaveWorkPromptProps) => {
  const [step, setStep] = useState<"details" | "code" | "done">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await convertGuestAccount(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Couldn't create your account.");
      return;
    }
    // No confirmation required on this project: the account is already real,
    // so asking for a code nobody sent would be a dead end.
    if (!result.needsEmailConfirmation) {
      setStep("done");
      onSaved?.();
      return;
    }
    setStep("code");
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    // `email_change`, not `signup`: the address was attached to an account
    // that already existed, which is what conversion is.
    const result = await verifyEmailCode(email, code, "email_change");
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Couldn't confirm that code.");
      return;
    }
    setStep("done");
    onSaved?.();
  };

  const heading =
    reason === "download" ? "Your CV is ready to download" : "Keep this CV";

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
            aria-label={heading}
            className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-2xl shadow-black/40"
          >
            {step === "done" && (
              <div className="space-y-3 text-center">
                <CheckCircle2 size={38} className="mx-auto text-accent" />
                <h2 className="font-sora text-lg font-bold">Account created</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your CV and this conversation are saved to it — sign in from any
                  device to pick them back up.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
                >
                  Continue
                </button>
              </div>
            )}

            {step === "code" && (
              <>
                <h2 className="font-sora text-lg font-bold">Enter your code</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  We sent a code to <span className="text-foreground">{email}</span>.
                  Type it here — stay on this page, your CV is right behind this.
                </p>

                <form onSubmit={submitCode} className="mt-5 space-y-3">
                  <input
                    // A phone should offer the numeric keypad and the OS should
                    // offer to autofill the code straight from the message.
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    disabled={busy}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
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
                    disabled={busy || code.trim().length < 4}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    {busy ? "Checking…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep("details");
                    }}
                    className="w-full py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Use a different email
                  </button>
                </form>
              </>
            )}

            {step === "details" && (
              <>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sora text-lg font-bold">{heading}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {reason === "download"
                        ? "Downloading the file needs an account. Create one now and this exact CV comes with you — nothing you've written is lost."
                        : "You're building as a guest. Add an email and password to keep this CV and come back to it from any device."}
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

                <form onSubmit={submitDetails} className="space-y-3">
                  <div>
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
                    {/* Said before they type, not after: a made-up address
                        fails at the code step, by which point they have
                        entered a password and believe they have an account. */}
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      Use an email you can open now — we'll send a code to confirm it.
                    </p>
                  </div>
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
                    {busy ? "Sending…" : "Create account"}
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
