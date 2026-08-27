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
 * A visitor with no session is sent to /cv-builder/login, which offers three
 * ways in: sign in, create an account, or continue as a guest. The guest
 * route is a deliberate choice on that page rather than something that
 * happens to somebody automatically — a visitor who never saw a decision
 * cannot be said to have made one, and this one has a consequence they need
 * to know about up front: a guest can build a CV and read it on screen, but
 * downloading the file needs an account.
 *
 * Guests themselves are real Supabase accounts created by
 * `signInAnonymously()` — a unique id and a valid JWT, just no email — which
 * is why none of the backend needed a new concept: session ownership, the RLS
 * policies and the per-user checks all key on the id, and `is_admin()` keys on
 * an email a guest does not have, so one can never be an admin. Converting
 * later with `updateUser({ email })` keeps the same id, so everything built as
 * a guest carries over with nothing to migrate.
 *
 * Deliberately NOT device fingerprinting, which was the other way to do this.
 * Fingerprints collide — two visitors on the same phone model and browser can
 * produce the same one, which here would mean opening the app and finding
 * somebody else's CV, with their name and phone number in it. They are also
 * unstable (a browser update loses the account) and, being identification
 * without consent, are treated like cookies under GDPR/ePrivacy.
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
      // No session means the choice has not been made yet, so send them to
      // the page that offers it rather than picking for them.
      setStatus(data.session ? "authorized" : "denied");
    });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // A real sign-out should return them to the sign-in page rather than
      // silently minting a new guest, which would look like the sign-out
      // failed. Every other transition just reflects the new session.
      if (event === "SIGNED_OUT") {
        setStatus("denied");
        return;
      }
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
    return (
      <Navigate
        to="/cv-builder/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
};

export default CvProtectedRoute;
