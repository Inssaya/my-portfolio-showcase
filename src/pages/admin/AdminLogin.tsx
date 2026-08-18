import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { supabase, supabaseEnabled } from "@/lib/supabase";

/**
 * Login screen for the admin panel.
 *
 * Uses Supabase Auth's signInWithPassword. Session token persistence and
 * refresh are handled inside the supabase-js client — we just call
 * signInWithPassword and read back the session below.
 *
 * If a session already exists in localStorage the page redirects straight
 * through, so re-opening a tab doesn't force a re-login while the JWT is
 * still valid.
 */
const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  useEffect(() => {
    document.title = "Admin — Sign in";
    // Skip straight through if the user already has a live session — but
    // don't Navigate on first render (that would fight React Router).
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
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!supabaseEnabled || !supabase) {
      setError("The admin backend isn't configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      // Supabase returns "Invalid login credentials" for both wrong email and
      // wrong password — surface it as one clear line.
      setError(messageFor(signInError.message));
      setBusy(false);
      return;
    }
    navigate(from, { replace: true });
  };

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
            Admin panel access. Everyone else, kindly turn back.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
            disabled={busy || !email.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] italic text-muted-foreground">
          Session persists on this device until you sign out.
        </p>
      </motion.div>
    </div>
  );
};

/** Supabase error strings → plain english. */
function messageFor(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Wrong email or password.";
  if (lower.includes("email not confirmed")) return "This account hasn't been confirmed yet.";
  if (lower.includes("network") || lower.includes("fetch")) return "Couldn't reach the server. Try again.";
  return "Sign-in failed. Please try again.";
}

export default AdminLogin;
