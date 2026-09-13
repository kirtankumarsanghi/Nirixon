import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Screening requires consent in this browser session (or an in-progress resume). */
export function RequireConsent() {
  const { consentGiven } = useAuth();
  const location = useLocation();
  // Allow resume path: if session id exists in sessionStorage, consent was
  // already recorded server-side when the session started.
  const hasSession =
    typeof sessionStorage !== "undefined" &&
    Boolean(sessionStorage.getItem("nirixon_screen_session_id"));

  if (!consentGiven && !hasSession) {
    return <Navigate to="/consent" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
