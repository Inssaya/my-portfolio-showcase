import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, supabaseEnabled } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/adminRole";

type Status = "checking" | "authorized" | "denied";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route gate for /admin/*.
 *
 * Two conditions must both hold to see the admin panel:
 *   1. A live Supabase session (or the static-fallback flag when Supabase
 *      is not configured for local UI work).
 *   2. The session's email matches ADMIN_EMAIL — a random signed-in visitor
 *      is denied and immediately signed out so their session cannot be
 *      reused elsewhere on the site's admin surface.
 *
 * Client-side gating is a UX layer only. The real enforcement lives in
 * Supabase RLS policies on every admin-writable table, keyed on the same
 * email in `auth.jwt()`.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [status, setStatus] = useState<Status>("checking");
  const location = useLocation();

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      // No Supabase configured — admin auth is unavailable, so deny. We do
      // NOT honour any localStorage flag here: a flag is attacker-writable
      // from the devtools console (`localStorage.setItem(...)`), so trusting
      // it would be a trivial client-side auth bypass. Real auth requires a
      // signed Supabase session, checked below.
      setStatus("denied");
      return;
    }

    const client = supabase;
    let cancelled = false;

    const evaluate = async (email: string | null | undefined) => {
      if (!email) return "denied" as const;
      if (isAdminEmail(email)) return "authorized" as const;
      // Signed-in but not the admin — kill the session so a hostile
      // user can't linger with a valid JWT.
      await client.auth.signOut();
      return "denied" as const;
    };

    client.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setStatus(await evaluate(data.session?.user?.email));
    });

    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      setStatus(await evaluate(session?.user?.email));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === "checking") {
    return <div className="min-h-[100svh] bg-background" />;
  }

  if (status === "denied") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
