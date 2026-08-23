import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type Status = "checking" | "authorized" | "denied";

interface CvProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route gate for /cv-builder.
 *
 * Same shape as the admin panel's ProtectedRoute (components/admin), but
 * deliberately not the same component: that one has a hardcoded static
 * fallback for a single pre-created admin account, which makes no sense for a
 * public sign-up flow — anyone reaching this gate is meant to be able to
 * create an account, not be told to "kindly turn back".
 *
 * Backed by Supabase Auth. On mount this asks supabase-js for the current
 * session and subscribes to auth state changes, so a sign-out in another tab
 * (or the sign-out button in ResumeBuilder itself) kicks the page back to
 * /cv-builder/login live.
 */
const CvProtectedRoute = ({ children }: CvProtectedRouteProps) => {
  const [status, setStatus] = useState<Status>("checking");
  const location = useLocation();

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      // No Supabase configured at all: the CV builder cannot authenticate
      // anyone, so there is nothing to gate — ResumeBuilder's own
      // `resumeApiConfigured` check is what tells the visitor it is off.
      setStatus("authorized");
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
    return <Navigate to="/cv-builder/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default CvProtectedRoute;
