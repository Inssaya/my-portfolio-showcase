import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getToken, verify } from "@/lib/auth";

type Status = "checking" | "authorized" | "denied";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route gate for /admin/*.
 *
 * Two checks: a cheap local `exp` check that clears obviously-dead tokens
 * before any UI renders, and a server verify against /api/admin/verify — the
 * latter is the real trust boundary, since the signing secret only lives on
 * the server. While the verify is in flight the whole subtree is suspended
 * on a blank surface, so the admin UI never flashes to a bystander.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [status, setStatus] = useState<Status>("checking");
  const location = useLocation();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus("denied");
      return;
    }
    let cancelled = false;
    verify(token).then((ok) => {
      if (cancelled) return;
      setStatus(ok ? "authorized" : "denied");
    });
    return () => {
      cancelled = true;
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
