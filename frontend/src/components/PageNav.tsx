import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultAuthenticatedPath, normalizeRole } from "../auth/roles";

interface Props {
  /** Where the Back control goes when history back is not used. */
  backTo?: string;
  backLabel?: string;
  /** Prefer browser history when available. */
  preferHistoryBack?: boolean;
  /** Custom back handler (e.g. reset screening). Overrides navigate. */
  onBack?: () => void;
  /** Hide the back button. */
  showBack?: boolean;
  /**
   * @deprecated Section strip removed — kept optional so call sites compiling
   * with a `current` prop do not break during the transition.
   */
  current?: string;
}

function backLabelForHome(home: string, role: string | null): string {
  if (home === "/referrals") return "Back to referrals";
  if (home === "/sandbox") return "Back to clinician tools";
  if (normalizeRole(role) === "parent") return "Back to screening";
  return "Back to home";
}

/**
 * Page chrome: Back control only.
 * Primary section links live in the global NavBar (AppLayout).
 * Defaults follow the signed-in role home (not always screening).
 */
export function PageNav({
  backTo,
  backLabel,
  preferHistoryBack = true,
  onBack,
  showBack = true,
}: Props) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const home = defaultAuthenticatedPath(role);
  const resolvedBackTo = backTo ?? home;
  const resolvedLabel = backLabel ?? backLabelForHome(home, role);

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (preferHistoryBack && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(resolvedBackTo);
  }

  if (!showBack) {
    return null;
  }

  return (
    <div className="page-nav no-print">
      <button type="button" className="page-nav__back" onClick={handleBack}>
        ← {resolvedLabel}
      </button>
    </div>
  );
}
