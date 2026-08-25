import { FormEvent, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, Loader2, Lock, ShieldAlert } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/adminRole";
import {
  getLockStatus,
  recordFailure,
  recordSuccess,
  LockStatus,
} from "@/lib/loginRateLimit";

/**
 * Login screen for the admin panel.
 *
 * Rate limiting: after 5 failed attempts within a 15-minute window the form
 * locks for 10 minutes. State lives in localStorage so a page refresh can't
 * reset the counter. The lockout banner shows a live countdown.
 *
 * Supabase Auth's own server-side throttling applies on top of this for
 * Supabase-backed logins — the client-side guard mainly protects the
 * static-password fallback.
 */

function fmtCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);

  // Rate-limit state — seeded from localStorage on mount
  const [lockStatus, setLockStatus] = useState<LockStatus>(() => getLockStatus());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forgot-password state
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  // Live countdown ticker — starts when locked, clears when unlocked.
  useEffect(() => {
    if (!lockStatus.locked) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      const next = getLockStatus();
      setLockStatus(next);
      if (!next.locked && countdownRef.current) {
        clearInterval(countdownRef.current);
        setError(null);
      }
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lockStatus.locked]);

  useEffect(() => {
    document.title = "Admin — Sign in";
    if (!supabase) {
      setAlreadyIn(localStorage.getItem("portfolio_admin_static") === "1");
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAlreadyIn(Boolean(data.session));
      setCheckingSession(false);
    });
  }, []);

  if (checkingSession) return <div className="min-h-[100svh] bg-background" />;
  if (alreadyIn) return <Navigate to={from} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || lockStatus.locked) return;

    // Re-check in case the timer just expired or state is stale.
    const currentStatus = getLockStatus();
    if (currentStatus.locked) { setLockStatus(currentStatus); return; }

    setBusy(true);
    setError(null);

    if (!supabaseEnabled || !supabase) {
      // Static-password fallback.
      const ok =
        email.trim().toLowerCase() === "yassinsinif4@gmail.com" &&
        password === "YaSsine2004@gmail.com";

      if (ok) {
        recordSuccess();
        localStorage.setItem("portfolio_admin_static", "1");
        navigate(from, { replace: true });
      } else {
        const next = recordFailure();
        setLockStatus(next);
        if (next.locked) {
          setError(null); // banner replaces the inline error when locked
        } else {
          const left = next.attemptsLeft ?? 0;
          setError(
            left === 1
              ? "Wrong email or password. 1 attempt left before 10-minute lockout."
              : `Wrong email or password. ${left} attempts left.`,
          );
        }
        setBusy(false);
      }
      return;
    }

    const submitted = email.trim().toLowerCase();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: submitted,
      password,
    });

    // Any failure — bad credentials OR a valid non-admin — is counted the
    // same, so an attacker can't distinguish "wrong password" from "not
    // admin" and use this endpoint as an email-enumeration oracle.
    const failed = Boolean(signInError) || !isAdminEmail(data?.user?.email);

    if (failed) {
      // If Supabase gave us a valid non-admin session, kill it — otherwise
      // that JWT would sit in localStorage waiting to be replayed.
      if (!signInError && data?.session) {
        await supabase.auth.signOut();
      }

      const next = recordFailure();
      setLockStatus(next);
      if (!next.locked) {
        const left = next.attemptsLeft ?? 0;
        // Uniform message on both branches — never leak whether the email
        // exists or is merely non-admin.
        const base = signInError ? messageFor(signInError.message) : "Wrong email or password.";
        setError(
          left === 1
            ? `${base} 1 attempt left before 10-minute lockout.`
            : `${base} ${left} attempt${left !== 1 ? "s" : ""} left.`,
        );
      }
      setBusy(false);
      return;
    }

    recordSuccess();
    navigate(from, { replace: true });
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setResetError("Password reset requires Supabase to be configured.");
      return;
    }
    setResetBusy(true);
    setResetError(null);

    const submitted = resetEmail.trim().toLowerCase();

    // Only send a reset email when the submitted address is actually the
    // admin. Any other address gets the same "if it exists, we sent a
    // link" response — no network call, no oracle for enumerating who
    // the admin is.
    if (isAdminEmail(submitted)) {
      await supabase.auth.resetPasswordForEmail(submitted, {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });
    }

    setResetBusy(false);
    setResetSent(true);
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
        <AnimatePresence mode="wait">
          {!forgotMode ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
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

              {/* Lockout banner */}
              <AnimatePresence>
                {lockStatus.locked && (
                  <motion.div
                    key="lockout"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                      <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Too many failed attempts</p>
                        <p className="mt-0.5 text-destructive/80">
                          Try again in{" "}
                          <span className="font-mono font-bold">
                            {fmtCountdown(lockStatus.msRemaining)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy || lockStatus.locked}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                  />
                </label>

                <div className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Password
                  </span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy || lockStatus.locked}
                    className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setResetEmail(email); }}
                    className="mt-1.5 block text-[11px] text-muted-foreground hover:text-accent transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && !lockStatus.locked && (
                  <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || lockStatus.locked || !email.trim() || !password}
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
          ) : (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22 }}
            >
              <button
                type="button"
                onClick={() => { setForgotMode(false); setResetSent(false); setResetError(null); }}
                className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={13} /> Back to sign in
              </button>

              <div className="mb-8 text-center">
                <h2 className="font-playfair text-2xl font-semibold">Reset password</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your email and we'll send a reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 size={36} className="text-accent" />
                  <p className="text-sm font-medium">Check your inbox</p>
                  <p className="text-xs text-muted-foreground">
                    If that address is the admin, a reset link has been sent. It expires in 1 hour.
                  </p>
                </div>
              ) : (
                <form onSubmit={onForgot} className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Email
                    </span>
                    <input
                      type="email"
                      autoFocus
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={resetBusy}
                      className="w-full rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent/50 disabled:opacity-60"
                    />
                  </label>

                  {resetError && (
                    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {resetError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={resetBusy || !resetEmail.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {resetBusy && <Loader2 size={14} className="animate-spin" />}
                    {resetBusy ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
