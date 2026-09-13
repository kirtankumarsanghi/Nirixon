import type { ResultPayload } from "../api/types";
import {
  toDomainConcerns,
  type ConcernLevel,
} from "../lib/domainConcern";

interface Props {
  result: ResultPayload;
}

/**
 * Display-only domain view. The backend uses one combined model — this chart
 * must never imply six independent per-domain verdicts (Section 0.5).
 */
export function DomainBreakdownChart({ result }: Props) {
  const concerns = toDomainConcerns(
    result.shap_values,
    result.final_classification,
  );

  return (
    <section className="domain-chart" aria-labelledby="domain-chart-title">
      <h2 id="domain-chart-title" className="h-sm">
        Areas reflected in this check-in
      </h2>
      <p className="domain-chart__note">
        {/* PLACEHOLDER (Section 5): whether any model-attribution detail is
            appropriate for parents vs clinician-only */}
        A simplified view for discussion — not separate scores from six
        independent models, and not raw model numbers.
      </p>
      <ul className="domain-chart__list">
        {concerns.map((c) => (
          <li
            key={c.domain}
            className={`domain-chart__item domain-chart__item--${c.level}`}
          >
            <span className="domain-chart__name">{c.label}</span>
            <span className="domain-chart__level">{levelLabel(c.level)}</span>
            <span className="domain-chart__plain">{c.plainLanguage}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function levelLabel(level: ConcernLevel): string {
  switch (level) {
    case "typical":
      return "Typical";
    case "keep_an_eye":
      return "Keep an eye on this";
    case "worth_discussing":
      return "Worth discussing";
  }
}
