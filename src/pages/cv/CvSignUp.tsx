import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, supabaseEnabled } from "@/lib/supabase";

/**
 * Account creation for the CV builder.
 *
 * Deliberately not the admin login's pattern: that one gates a single
 * pre-created account with no sign-up at all. This is public — anyone can
 * create an account — because the CV builder's whole point is to be usable
 * by visitors, not by the site owner alone.
 *
 * `supabase.auth.signUp` sends Supabase's own confirmation email (the "Email"
 * provider + "Confirm email" toggle, already switched on in the dashboard);
 * this page never sees a code or a link, it just tells the visitor to check
 * their inbox. First/last name go into `user_metadata` rather than a separate
 * table — there is nothing yet for a `profiles` table to join against, and
 * adding one before it is needed would be exactly the kind of premature
 * structure this codebase avoids elsewhere.
 */
const CvSignUp = () => {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);

  useEffect(() => {
    document.title = "CV Builder — Create account";
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAlreadyIn(Boolean(data.session));
      setCheckingSession(false);
    });
  }, []);

  if (checkingSession) {
    return <div className="min-h-[100svh] bg-background" />;
  }
  if (alreadyIn) {
    return <Navigate to="/cv-builder" replace />;
  }

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    password.length >= 6 &&
    password === confirmPassword &&
    agreedToTerms;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canSubmit) return;

    if (!supabaseEnabled || !supabase) {
      setError("Account creation isn't available on this deployment yet.");
      return;
    }

    setBusy(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
        // Falls back to the dashboard's configured Site URL if this exact
        // path isn't in the redirect allow-list yet — landing on the
        // homepage with a session already set is a minor inconvenience, not
        // a broken signup, so this is safe to attempt regardless.
        emailRedirectTo: `${window.location.origin}/cv-builder`,
      },
    });

    if (signUpError) {
      setError(messageFor(signUpError.message));
      setBusy(false);
      return;
    }

    setSentTo(email.trim());
    setBusy(false);
  };

  if (sentTo) {
    return (
      <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-background px-4 py-16">
        <div className="grid-overlay" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
          className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <CheckCircle2 size={20} />
          </div>
          <h1 className="font-playfair text-2xl font-semibold text-foreground">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We sent a confirmation link to <span className="text-foreground">{sentTo}</span>. Open it
            to activate your account, then come back and sign in.
          </p>
          <Link
            to="/cv-builder/login"
            className="mt-6 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Back to sign in
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div className="grid-overlay" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <UserPlus size={18} />
          </div>
          <h1 className="relative inline-block font-playfair text-3xl font-semibold text-foreground">
            Create your account
            <WavyUnderline delay={0.35} duration={1.2} />
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Free to use while the CV builder is in beta.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                First name
              </span>
              <input
                type="text"
                autoComplete="given-name"
                autoFocus
                required
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last name
              </span>
              <input
                type="text"
                autoComplete="family-name"
                required
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Confirm password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
            {passwordsMismatch && (
              <span className="mt-1 block text-xs text-destructive">Passwords don't match.</span>
            )}
          </label>

          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <Checkbox
              checked={agreedToTerms}
              onCheckedChange={(value) => setAgreedToTerms(value === true)}
              disabled={busy}
              className="mt-0.5"
            />
            <span>
              I agree that my CV details are stored to generate my document and understand this is
              a free beta service. Data is used only to build my CV — see{" "}
              <Link to="/cv-builder/terms" target="_blank" className="text-accent hover:underline">
                Terms &amp; Privacy
              </Link>
              .
            </span>
          </label>

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
            disabled={busy || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/cv-builder/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

/** Supabase error strings → plain english. */
function messageFor(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with that email already exists — try signing in instead.";
  }
  if (lower.includes("password")) return "Choose a stronger password (at least 6 characters).";
  if (lower.includes("network") || lower.includes("fetch")) return "Couldn't reach the server. Try again.";
  // Supabase's built-in mailer allows only a handful of emails per hour —
  // real and easy to hit while testing signup, not a bug in this form. Custom
  // SMTP (Brevo) removes the limit; see cv-service/NEXT.md Step 2a.
  if (lower.includes("rate limit")) {
    return "Too many signup attempts right now — wait a few minutes and try again.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "That doesn't look like a deliverable email address.";
  }
  return "Couldn't create your account. Please try again.";
}

export default CvSignUp;
