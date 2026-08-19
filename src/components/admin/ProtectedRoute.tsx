import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type Status = "checking" | "authorized" | "denied";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route gate for /admin/*.
 *
 * Backed by Supabase Auth. On mount we ask supabase-js for the current
 * session (from localStorage, refreshed if the token is close to expiry).
 * We also subscribe to auth state changes so a sign-out or a token
 * expiry in another tab kicks the panel back to /admin/login live.
 *
 * The subtree is suspended on a blank surface during the check so the
 * admin UI never flashes to a bystander before the redirect fires.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [status, setStatus] = useState<Status>("checking");
  const location = useLocation();

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      // No backend configured — treat as denied. The login page will show
      // a helpful "not configured" message rather than an unfixable spinner.
      setStatus("denied");
      return;
    }
    const client = supabase;
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? "authorized" : "denied");
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setStatus(session ? "authorized" : "denied");
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
