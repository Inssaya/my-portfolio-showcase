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
 * Visitors used to be stopped here and sent to sign up, and most of them left:
 * the drop-off was at email verification, which asks somebody to go to their
 * inbox for a product they have not seen work yet. So this no longer turns
 * anyone away. A visitor with no session is signed in *anonymously* and goes
 * straight to building a CV; the account only becomes a real one when they
 * choose to keep their work (see CvSaveWorkPrompt).
 *
 * Anonymous sign-in is a real Supabase account — a unique id and a valid JWT,
 * just no email — which is why it needed no backend change: session ownership,
 * the RLS policies and the per-user checks all key on the id, and `is_admin()`
 * keys on the email an anonymous user does not have, so one can never be an
 * admin. Converting later with `updateUser({ email, password })` keeps the same
 * id, so every CV built as a guest carries over with nothing to migrate.
 *
 * Deliberately NOT device fingerprinting, which was the other way to do this.
 * Fingerprints collide — two visitors on the same phone model and browser can
 * produce the same one, which here would mean opening the app and finding
 * somebody else's CV, with their name and phone number in it. They are also
 * unstable (a browser update loses the account) and, being identification
 * without consent, are treated like cookies under GDPR/ePrivacy. Anonymous
 * auth has none of those properties.
 */
const CvProtectedRoute = ({ children }: CvProtectedRouteProps) => {
  const [status, setStatus] = useState<Status>("checking");
  const [guestUnavailable, setGuestUnavailable] = useState(false);
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

    const admit = async (hasSession: boolean) => {
      if (cancelled) return;
      if (hasSession) {
        setStatus("authorized");
        return;
      }
      // No session: make them a guest rather than sending them away.
      const { error } = await client.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        // Anonymous sign-in is a project setting (Supabase → Authentication →
        // Providers → Anonymous). If it is off, or rate-limited, fall back to
        // the sign-in page rather than leaving the visitor on a blank screen —
        // the old behaviour, which still works.
        //
        // Flagged rather than silent: with the provider off, every visitor
        // lands on a sign-in wall and the product looks like it was never
        // changed. The sign-in page says what happened, so the cause is
        // visible from the outside instead of only in this console line.
        console.warn("anonymous sign-in unavailable, falling back to login", error);
        setGuestUnavailable(true);
        setStatus("denied");
        return;
      }
      setStatus("authorized");
    };

    client.auth.getSession().then(({ data }) => void admit(Boolean(data.session)));

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
        state={{ from: location.pathname, guestUnavailable }}
      />
    );
  }

  return <>{children}</>;
};

export default CvProtectedRoute;
