import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { WavyUnderline } from "@/components/visuals/Handdrawn";
import { supabase, supabaseEnabled } from "@/lib/supabase";

/**
 * Where the emailed confirmation link lands (CvSignUp's `emailRedirectTo`).
 *
 * Supabase's client already exchanges the link's token for a real session on
 * load — `detectSessionInUrl: true` in lib/supabase.ts — before this
 * component ever runs, so by the time it mounts, confirmation has already
 * happened. This page is not what performs it; it is the deliberate "you're
 * verified" checkpoint the visitor asked for, with an explicit action before
 * they're dropped into their new account, rather than a silent redirect.
 */
type Phase = "checking" | "verified" | "failed";

const CvVerify = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    document.title = "CV Builder — Verify email";
    if (!supabaseEnabled || !supabase) {
      setPhase("failed");
      return;
    }
    // A short delay, not a fixed one: detectSessionInUrl races this effect,
    // so poll briefly rather than assuming a session is already there the
    // instant this mounts.
    let cancelled = false;
    const client = supabase;
    const check = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        const { data } = await client.auth.getSession();
        if (data.session) {
          if (!cancelled) setPhase("verified");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (!cancelled) setPhase("failed");
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div className="grid-overlay" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-card/90 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        {phase === "checking" && (
          <>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Loader2 size={20} className="animate-spin" />
            </div>
            <h1 className="font-playfair text-2xl font-semibold text-foreground">
              Confirming…
            </h1>
          </>
        )}

        {phase === "verified" && (
          <>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
              <CheckCircle2 size={20} />
            </div>
            <h1 className="relative inline-block font-playfair text-2xl font-semibold text-foreground">
              You're verified
              <WavyUnderline delay={0.3} duration={1} />
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your email is confirmed and your account is ready.
            </p>
            <button
              type="button"
              onClick={() => navigate("/cv-builder/profile")}
              className="mt-6 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Continue
            </button>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <XCircle size={20} />
            </div>
            <h1 className="font-playfair text-2xl font-semibold text-foreground">
              Couldn't confirm that link
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              It may have expired or already been used. Try signing in — if
              your account still needs verifying, we can send a new link.
            </p>
            <Link
              to="/cv-builder/login"
              className="mt-6 inline-block text-sm font-semibold text-accent hover:underline"
            >
              Go to sign in
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default CvVerify;
