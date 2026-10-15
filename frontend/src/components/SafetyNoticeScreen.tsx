import { t } from "../i18n";

interface Props {
  /** Safety helpline text from the backend (safety_message). */
  message: string | null;
  onContinue: () => void;
}

/**
 * Safety-notice screen — shown BEFORE anything else when the backend
 * returns action type `safety_notice`.
 *
 * Displays safety_message prominently with tap-to-call links for
 * Kiran 1800-599-0019 and CHILDLINE 1098.
 * A secondary "Continue to the questions" button.
 */
export function SafetyNoticeScreen({ message, onContinue }: Props) {
  return (
    <section
      className="safety-notice"
      aria-labelledby="safety-title"
      role="alert"
    >
      <h1 id="safety-title" className="display display--clay">
        {t("moduleb.safety.title", "Before we continue")}
      </h1>

      {message ? (
        <p className="safety-notice__message">{message}</p>
      ) : (
        <p className="safety-notice__message">
          {t(
            "moduleb.safety.default",
            "Based on what you shared, we want to make sure you have support available if needed.",
          )}
        </p>
      )}

      <div className="safety-notice__helplines">
        <h2 className="h-sm">
          {t("moduleb.safety.helplines.title", "Talk to someone now")}
        </h2>
        <ul className="safety-notice__list">
          <li>
            <a
              href="tel:18005990019"
              className="safety-notice__link"
              aria-label={t(
                "moduleb.safety.kiran.label",
                "Call Kiran helpline 1800 599 0019",
              )}
            >
              <span className="safety-notice__icon" aria-hidden="true">
                📞
              </span>
              <span>
                <strong>Kiran</strong> — 1800-599-0019
                <br />
                <span className="safety-notice__meta">
                  {t("moduleb.safety.kiran.meta", "Free, 24/7, confidential")}
                </span>
              </span>
            </a>
          </li>
          <li>
            <a
              href="tel:1098"
              className="safety-notice__link"
              aria-label={t(
                "moduleb.safety.childline.label",
                "Call CHILDLINE 1098",
              )}
            >
              <span className="safety-notice__icon" aria-hidden="true">
                📞
              </span>
              <span>
                <strong>CHILDLINE</strong> — 1098
                <br />
                <span className="safety-notice__meta">
                  {t("moduleb.safety.childline.meta", "Free, for children and families")}
                </span>
              </span>
            </a>
          </li>
        </ul>
      </div>

      <button
        type="button"
        className="btn btn--secondary safety-notice__continue"
        onClick={onContinue}
      >
        {t("moduleb.safety.continue", "Continue to the questions")}
      </button>
    </section>
  );
}

/**
 * Small persistent helpline link shown for the rest of the session
 * after dismissing the safety notice.
 */
export function SafetyPersistentLink() {
  return (
    <div className="safety-persistent" role="complementary" aria-label="Safety support">
      <a
        href="tel:18005990019"
        className="safety-persistent__link"
      >
        📞 {t("moduleb.safety.persistent", "Talk to someone now")}
      </a>
    </div>
  );
}
