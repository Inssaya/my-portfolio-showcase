import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { convertGuestAccount, isGuest, verifyEmailCode } from "@/lib/cv/guest";

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
const ErrorBanner = ({ message }: { message: string }) => (
  <p
    role="alert"
    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
  >
    {message}
  </p>
);

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
  // Which verification a code will belong to. A brand-new account is a
  // `signup`; a guest attaching an address to the account they already have
  // is an `email_change`, and using the wrong one fails as "token expired".
  const [codeKind, setCodeKind] = useState<"signup" | "email_change">("signup");
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);
  const [asGuest, setAsGuest] = useState(false);

  useEffect(() => {
    document.title = "CV Builder — Create account";
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      // A guest already holds a session, so "is there a session?" is no
      // longer the same question as "do they already have an account?".
      // Bouncing a guest away from here would be wrong twice over: they do
      // not have an account yet, and this page is exactly where they came to
      // get one.
      const guest = Boolean(data.session) && isGuest(data.session?.user);
      setAlreadyIn(Boolean(data.session) && !guest);
      setAsGuest(guest);
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

    if (asGuest) {
      // Crucial: a guest must be *converted*, never signed up afresh.
      // `signUp` would mint a second account and swap the session to it,
      // silently abandoning every CV, chat and draft built as a guest — all
      // of which are keyed to the guest's user id. `updateUser` attaches the
      // email and password to that same id instead, so nothing moves.
      const result = await convertGuestAccount(email, password, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      setBusy(false);

      if (!result.ok) {
        setError(result.error ?? "Couldn't create your account.");
        return;
      }
      if (result.needsEmailConfirmation) {
        setCodeKind("email_change");
        setSentTo(email.trim());
        return;
      }
      navigate("/cv-builder", { replace: true });
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
        // Lands on the explicit "you're verified" checkpoint (CvVerify)
        // rather than dropping straight into the app. Falls back to the
        // dashboard's configured Site URL if this exact path isn't in the
        // redirect allow-list yet — landing on the homepage with a session
        // already set is a minor inconvenience, not a broken signup, so this
        // is safe to attempt regardless. Add
        // `${origin}/cv-builder/verify` to Supabase's redirect allow-list
        // (Authentication → URL Configuration) for this to take effect.
        emailRedirectTo: `${window.location.origin}/cv-builder/verify`,
      },
    });

    if (signUpError) {
      setError(messageFor(signUpError.message));
      setBusy(false);
      return;
    }

    setCodeKind("signup");
    setSentTo(email.trim());
    setBusy(false);
  };

  /**
   * Confirm the emailed code.
   *
   * A code and not a link, deliberately. A link opens a new browser context —
   * on a phone, very often a different app's in-app browser — so the visitor
   * lands signed in somewhere that has none of the work they just did, in a
   * tab they cannot navigate back to. Typing six digits keeps them where they
   * already are, which is also where their CV is.
   */
  const onConfirmCode = async (event: FormEvent) => {
    event.preventDefault();
    if (confirming || !sentTo) return;
    setConfirming(true);
    setError(null);

    const result = await verifyEmailCode(sentTo, code, codeKind);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't confirm that code.");
      return;
    }
    navigate("/cv-builder", { replace: true });
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
          <h1 className="font-playfair text-2xl font-semibold text-foreground">Enter your code</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We sent a code to <span className="text-foreground">{sentTo}</span>.
            {asGuest
              ? " Type it below — stay on this page, everything you've built is right behind it."
              : " Type it below to finish setting up your account."}
          </p>

          <form onSubmit={onConfirmCode} className="mt-6 space-y-3">
            <input
              // Numeric keypad on a phone, and the OS offers to fill the code
              // straight from the message.
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              disabled={confirming}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
            {error && <ErrorBanner message={error} />}
            <button
              type="submit"
              disabled={confirming || code.trim().length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {confirming && <Loader2 size={14} className="animate-spin" />}
              {confirming ? "Checking…" : "Confirm"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setCode("");
              setSentTo(null);
            }}
            className="mt-4 text-xs text-muted-foreground hover:text-accent"
          >
            Use a different email
          </button>
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
            {asGuest ? "Keep your work" : "Create your account"}
            <WavyUnderline delay={0.35} duration={1.2} />
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {asGuest
              ? "Your CV and chat history stay exactly as they are — this just gives you a way back to them."
              : "Free to use while the CV builder is in beta."}
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
            {/* Before they type, not after. A made-up address only fails at
                the code step, by which point they have filled in a whole form
                and believe they have an account. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Use a real email you can open now — we send a code there to confirm it.
            </p>
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

          {/* ✅ FIXED: Checkbox now clearly visible – larger, with border, accent colours, and circle shape */}
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <Checkbox
              checked={agreedToTerms}
              onCheckedChange={(value) => setAgreedToTerms(value === true)}
              disabled={busy}
              className="mt-0.5 h-5 w-5 rounded-full border-2 border-gray-300 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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