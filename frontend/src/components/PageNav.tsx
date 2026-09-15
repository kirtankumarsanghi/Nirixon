import { useNavigate } from "react-router-dom";

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

/**
 * Page chrome: Back control only.
 * Primary section links live in the global NavBar (AppLayout).
 */
export function PageNav({
  backTo = "/screen",
  backLabel = "Back to screening",
  preferHistoryBack = true,
  onBack,
  showBack = true,
}: Props) {
  const navigate = useNavigate();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (preferHistoryBack && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backTo);
  }

  if (!showBack) {
    return null;
  }

  return (
    <div className="page-nav no-print">
      <button type="button" className="page-nav__back" onClick={handleBack}>
        ← {backLabel}
      </button>
    </div>
  );
}
