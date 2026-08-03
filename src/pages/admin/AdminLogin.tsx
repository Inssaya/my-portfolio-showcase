import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { getToken, login, LoginError } from "@/lib/auth";

/**
 * The login screen sitting in front of the admin panel.
 *
 * If a valid token already exists in localStorage we redirect straight through
 * — no reason to make the owner re-authenticate every time they open a tab.
 * On failure we surface the server's error code as a plain-english message
 * (never the raw string), because "invalid_credentials" reads like a bug.
 */
const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  if (getToken()) return <Navigate to={from} replace />;

  useEffect(() => {
    document.title = "Admin — Sign in";
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(messageFor(loginError));
      setBusy(false);
    }
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
              Username
            </span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
            disabled={busy || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] italic text-muted-foreground">
          Session lasts 7 days on this device.
        </p>
      </motion.div>
    </div>
  );
};

/** Server error codes → user-facing strings. Anything unknown falls to a
 *  generic message rather than leaking the raw code. */
function messageFor(error: unknown): string {
  if (error instanceof LoginError) {
    switch (error.code) {
      case "invalid_credentials":
        return "Wrong username or password.";
      case "missing_credentials":
        return "Both fields are required.";
      case "not_configured":
        return "The admin login isn't configured on the server yet.";
      case "invalid_json":
      case "malformed_response":
        return "Something went wrong reaching the server. Try again.";
      default:
        return "Sign-in failed. Please try again.";
    }
  }
  return "Sign-in failed. Please try again.";
}

export default AdminLogin;
