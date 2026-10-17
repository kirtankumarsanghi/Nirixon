import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isParentRole } from "../auth/roles";

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Parent screening requires consent; staff may assist-screen without that gate. */
export function RequireConsent() {
  const { consentGiven, role } = useAuth();
  const location = useLocation();
  const hasSession =
    typeof sessionStorage !== "undefined" &&
    Boolean(sessionStorage.getItem("nirixon_screen_session_id"));

  if (!isParentRole(role)) {
    return <Outlet />;
  }

  if (!consentGiven && !hasSession) {
    return <Navigate to="/consent" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
