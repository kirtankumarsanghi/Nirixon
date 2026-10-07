import { useState } from "react";
import { DOMAIN_LABELS } from "../lib/domainConcern";
import { t } from "../i18n";

/** Friendly labels for Module B domain keys used in recall-help chips. */
const RECALL_FRIENDLY: Record<string, string> = {
  attention: "Focus & work habits",
  listening_speaking: "Listening & speaking",
  reading: "Reading",
  writing: "Writing & spelling",
  numbers: "Numbers & maths",
  motor: "Movement & coordination",
  social: "Friendships & peers",
  emotion_conduct: "Feelings & behaviour",
};

interface Props {
  options: string[];
  submitting?: boolean;
  onSubmit: (selectedDomains: string[]) => void;
}

/**
 * Recall-help screen — shown when the backend returns action type `recall_help`.
 *
 * "Think about yesterday during homework or play. Was it about:"
 * with returned domains as tappable chips (multi-select), then POST /recall.
 */
export function RecallHelpScreen({ options, submitting, onSubmit }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function handleContinue() {
    if (selected.size === 0) return;
    onSubmit([...selected]);
  }

  return (
    <section className="recall-help" aria-labelledby="recall-title">
      <h1 id="recall-title" className="display">
        {t("moduleb.recall.title", "Can you help us narrow it down?")}
      </h1>
      <p className="lede">
        {t(
          "moduleb.recall.prompt",
          "Think about yesterday during homework or play. Was it about any of these?",
        )}
      </p>
      <p className="recall-help__hint">
        {t("moduleb.recall.hint", "Pick all that fit, then tap Continue.")}
      </p>

      <div
        className="intake__chip-grid"
        role="group"
        aria-label={t("moduleb.recall.group", "Select areas of concern")}
      >
        {options.map((domain) => {
          const label =
            RECALL_FRIENDLY[domain] ??
            DOMAIN_LABELS[domain] ??
            domain.replace(/_/g, " ");
          return (
            <button
              key={domain}
              type="button"
              className={`intake__chip ${selected.has(domain) ? "intake__chip--selected" : ""}`}
              onClick={() => toggle(domain)}
              disabled={submitting}
              aria-pressed={selected.has(domain)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn--primary"
        onClick={handleContinue}
        disabled={submitting || selected.size === 0}
      >
        {submitting
          ? t("moduleb.recall.submitting", "Continuing…")
          : t("moduleb.recall.continue", "Continue")}
      </button>
    </section>
  );
}
