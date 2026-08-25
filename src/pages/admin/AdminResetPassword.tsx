import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/adminRole";

/**
 * Landing page for the Supabase password-reset email link.
 * Supabase redirects here with an access token in the URL fragment —
 * the client library picks it up automatically via detectSessionInUrl.
 *
 * Only the admin email is allowed to complete a reset here. If a recovery
 * session ever lands with a non-admin email (e.g. a link issued before the
 * server-side gate was in place, or a link crafted for a different account),
 * we sign it out on arrival and show "Link expired" — never expose the
 * new-password form to anyone other than the admin.
 */
const AdminResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    document.title = "Admin — Reset password";
    if (!supabase) { setNoSession(true); return; }

    const client = supabase;

    // Ensures every recovery session is owned by the admin. A non-admin
    // recovery is silently killed and shown the generic expired-link page.
    const accept = async (email: string | null | undefined) => {
      if (isAdminEmail(email)) {
        setSessionReady(true);
      } else {
        await client.auth.signOut();
        setNoSession(true);
      }
    };

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        if (timeoutId) clearTimeout(timeoutId);
        void accept(session.user?.email);
        sub.subscription.unsubscribe();
      }
    });

    // The fragment exchange may already be complete by the time we get here —
    // in that case there's no PASSWORD_RECOVERY event to wait for, so read
    // the existing session directly.
    client.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (timeoutId) clearTimeout(timeoutId);
        void accept(data.session.user?.email);
        sub.subscription.unsubscribe();
      }
    });

    // Fallback: no recovery in 5s means the link was never valid.
    timeoutId = setTimeout(() => {
      setNoSession(true);
      sub.subscription.unsubscribe();
    }, 5000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!supabase) return;

    setBusy(true);
    setError(null);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateErr) {
      setError(updateErr.message);
    } else {
      setDone(true);
      setTimeout(() => navigate("/admin", { replace: true }), 2500);
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
        {noSession && (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Lock size={18} />
            </div>
            <h2 className="font-sora text-xl font-bold">Link expired</h2>
            <p className="text-sm text-muted-foreground">
              This reset link has expired or is invalid. Request a new one from the login page.
            </p>
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground"
            >
              Back to login
            </button>
          </div>
        )}

        {!noSession && done && (
          <div className="text-center space-y-4">
            <CheckCircle2 size={40} className="mx-auto text-accent" />
            <h2 className="font-sora text-xl font-bold">Password updated!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to the admin panel…</p>
          </div>
        )}

        {!noSession && !done && (
          <>
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Lock size={18} />
              </div>
              <h1 className="font-playfair text-2xl font-semibold">New password</h1>
              <p className="mt-2 text-sm text-muted-foreground">Choose a strong password for your account.</p>
            </div>

            {!sessionReady ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Verifying link…
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    New password
                  </span>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      autoFocus
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Confirm password
                  </span>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                  />
                </label>

                {error && (
                  <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !password || !confirm}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {busy ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default AdminResetPassword;
