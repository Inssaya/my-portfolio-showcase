import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, KeyRound, Loader2, Lock } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { guestSignInMessage, isGuest } from "@/lib/cv/guest";

/**
 * Sign-in for the CV builder, plus the two states around it: requesting a
 * password reset, and setting a new password after following the emailed
 * link.
 *
 * Those three live in one file rather than three because Supabase's recovery
 * flow lands the visitor back on the app with a live session already
 * established (via `detectSessionInUrl` in lib/supabase.ts) and fires a
 * `PASSWORD_RECOVERY` auth event — there is no separate "reset" URL to route
 * to, only a moment this page needs to notice and react to.
 *
 * The redirect URL configured in the Supabase dashboard is currently the
 * site root, not this page specifically. `resetPasswordForEmail` still asks
 * for this page's URL below — if it isn't on the allow-list yet, Supabase
 * quietly falls back to the dashboard's Site URL instead of erroring. That
 * lands the visitor on the homepage with the recovery session already set,
 * so a manual visit to /cv-builder/login still picks it up and shows the
 * "set new password" form. Widening the allow-list to include this path
 * just skips that one extra click.
 */
type View = "signin" | "forgot" | "sent" | "recovery";

const CvSignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<View>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);
  const [asGuest, setAsGuest] = useState(false);

  const routed = location.state as { from?: string; guestError?: string | null } | null;
  const from = routed?.from ?? "/cv-builder";
  // Set by CvProtectedRoute when signInAnonymously() failed, and carrying the
  // reason. Landing here at all means guest mode did not work — without
  // saying why, the product just looks like it still demands an account.
  const guestBlocked = routed?.guestError ?? null;

  useEffect(() => {
    document.title = "CV Builder — Sign in";
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    const client = supabase;

    client.auth.getSession().then(({ data }) => {
      // A guest holds a real session too. Treating that as "already signed
      // in" would bounce them straight back into the app and leave a
      // returning member with no way to reach their own account from a
      // device that had once been used as a guest.
      const guest = Boolean(data.session) && isGuest(data.session?.user);
      setAlreadyIn(Boolean(data.session) && !guest);
      setAsGuest(guest);
      setCheckingSession(false);
    });

    // Supabase fires this the moment the recovery link's session lands —
    // whether that happens on first load (hash already in the URL) or later
    // in the same tab makes no difference to the visitor, so both are caught
    // the same way: switch straight to "set a new password" instead of
    // treating them as already signed in and bouncing them to the app.
    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAlreadyIn(false);
        setView("recovery");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return <div className="min-h-[100svh] bg-background" />;
  }
  if (alreadyIn && view !== "recovery") {
    return <Navigate to={from} replace />;
  }

  const onSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!supabaseEnabled || !supabase) {
      setError("Sign-in isn't available on this deployment yet.");
      return;
    }
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      setError(messageFor(signInError.message));
      setBusy(false);
      return;
    }
    navigate(from, { replace: true });
  };

  /**
   * The way in for someone who does not want an account yet.
   *
   * CvProtectedRoute already does this automatically for a visitor with no
   * session, so this button only ever matters for the two cases that reach
   * this page deliberately: somebody who signed out and changed their mind,
   * and somebody who followed "Sign in" from the portfolio without having
   * decided yet. Both would otherwise be stuck at a form.
   */
  const onContinueAsGuest = async () => {
    if (busy || !supabase) return;
    setBusy(true);
    setError(null);

    const { error: guestError } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (guestError) {
      // Not messageFor(): every likely cause here is a project setting rather
      // than anything the visitor did, and the generic "something went wrong"
      // points at nothing. See guestSignInMessage.
      console.warn("anonymous sign-in failed", guestError);
      setError(guestSignInMessage(guestError.message));
      return;
    }
    navigate(from, { replace: true });
  };

  const onRequestReset = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !supabase) return;
    setBusy(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/cv-builder/login` },
    );
    setBusy(false);
    if (resetError) {
      setError(messageFor(resetError.message));
      return;
    }
    setView("sent");
  };

  const onSetNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !supabase) return;
    if (newPassword !== confirmNewPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (updateError) {
      setError(messageFor(updateError.message));
      return;
    }
    navigate("/cv-builder", { replace: true });
  };

  if (view === "sent") {
    return (
      <AuthShell icon={<CheckCircle2 size={20} />} title="Check your email">
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If an account exists for <span className="text-foreground">{email}</span>, a password
          reset link is on its way.
        </p>
        <button
          type="button"
          onClick={() => setView("signin")}
          className="mt-6 text-sm font-semibold text-accent hover:underline"
        >
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  if (view === "recovery") {
    return (
      <AuthShell icon={<KeyRound size={18} />} title="Set a new password">
        <form onSubmit={onSetNewPassword} className="mt-6 space-y-4 text-left">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={6}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Confirm new password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>
          {error && <ErrorBanner message={error} />}
          <button
            type="submit"
            disabled={busy || newPassword.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (view === "forgot") {
    return (
      <AuthShell icon={<KeyRound size={18} />} title="Reset your password">
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Enter your email and we'll send you a link to set a new one.
        </p>
        <form onSubmit={onRequestReset} className="space-y-4 text-left">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>
          {error && <ErrorBanner message={error} />}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setView("signin")}
          className="mt-4 text-xs text-muted-foreground hover:text-accent"
        >
          Back to sign in
        </button>
      </AuthShell>
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
            <Lock size={18} />
          </div>
          <h1 className="relative inline-block font-playfair text-3xl font-semibold text-foreground">
            Sign in
            <WavyUnderline delay={0.35} duration={1.2} />
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to pick up your saved CVs.
          </p>
        </div>

        {guestBlocked && (
          <p className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
            {guestBlocked}
          </p>
        )}

        {asGuest && (
          // They are mid-session as a guest and chose to sign in to an
          // existing account instead. Signing in swaps the session, so the
          // guest CV stays with the guest account and is not carried over —
          // saying so beats letting them discover it afterwards. The way to
          // keep it is "Save work" in the builder, which converts this
          // account rather than replacing it.
          <p className="mb-5 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            You're currently building as a guest. Signing in to another account
            switches to it — the CV you built as a guest stays with the guest
            session. To keep it on this account, go back and use{" "}
            <span className="text-foreground">Save work</span> instead.
          </p>
        )}

        <form onSubmit={onSignIn} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setView("forgot");
              }}
              className="text-xs text-muted-foreground hover:text-accent"
            >
              Forgot password?
            </button>
          </div>

          {error && <ErrorBanner message={error} />}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {!asGuest && (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <button
              type="button"
              onClick={onContinueAsGuest}
              disabled={busy}
              className="w-full rounded-full border border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Build a CV without an account
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              No email needed. You can save it to an account afterwards.
            </p>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link to="/cv-builder/signup" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

const AuthShell = ({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-background px-4 py-16">
    <div className="grid-overlay" />
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
      className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
        {icon}
      </div>
      <h1 className="font-playfair text-2xl font-semibold text-foreground">{title}</h1>
      {children}
    </motion.div>
  </div>
);

const ErrorBanner = ({ message }: { message: string }) => (
  <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
    {message}
  </p>
);

/** Supabase error strings → plain english. */
function messageFor(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Wrong email or password.";
  if (lower.includes("email not confirmed")) return "Confirm your email first — check your inbox.";
  if (lower.includes("network") || lower.includes("fetch")) return "Couldn't reach the server. Try again.";
  // Supabase's built-in mailer allows only a handful of emails per hour —
  // hit by password-reset requests too, not just sign-up.
  if (lower.includes("rate limit")) {
    return "Too many email requests right now — wait a few minutes and try again.";
  }
  return "Something went wrong. Please try again.";
}

export default CvSignIn;
