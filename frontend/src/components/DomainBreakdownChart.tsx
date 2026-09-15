import { useId, useState } from "react";
import type { ResultPayload } from "../api/types";
import {
  concernLevelLabel,
  getDomainGuide,
  toDomainConcerns,
  type ConcernLevel,
  type DomainConcern,
} from "../lib/domainConcern";

interface Props {
  result: ResultPayload;
  /** Precomputed concerns (e.g. Module B). Defaults to Module A SHAP mapping. */
  concerns?: DomainConcern[];
  title?: string;
  note?: string;
}

/**
 * Interactive domain summary for parents. Still display-only attribution —
 * must never imply independent per-domain model scores (Section 0.5).
 */
export function DomainBreakdownChart({
  result,
  concerns: concernsProp,
  title = "The six areas this check-in looks at",
  note = "These are everyday skill areas clinicians use when talking about early development. Tap an area to learn what it means. The highlights below reflect this single check-in — not six separate diagnoses or scores.",
}: Props) {
  const concerns =
    concernsProp ??
    toDomainConcerns(result.shap_values, result.final_classification);
  const [openDomain, setOpenDomain] = useState<string | null>(
    firstFlaggedDomain(concerns),
  );
  const baseId = useId();

  return (
    <section className="domain-chart" aria-labelledby="domain-chart-title">
      <h2 id="domain-chart-title" className="h-sm">
        {title}
      </h2>
      <p className="domain-chart__note">{note}</p>
      <ul className="domain-chart__list">
        {concerns.map((c) => {
          const guide = getDomainGuide(c.domain);
          const panelId = `${baseId}-${c.domain}`;
          const isOpen = openDomain === c.domain;
          return (
            <li
              key={c.domain}
              className={`domain-chart__item domain-chart__item--${c.level}${
                isOpen ? " domain-chart__item--open" : ""
              }`}
            >
              <button
                type="button"
                className="domain-chart__toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpenDomain((prev) => (prev === c.domain ? null : c.domain))
                }
              >
                <span className="domain-chart__name-block">
                  <span className="domain-chart__name">{c.label}</span>
                  {guide ? (
                    <span className="domain-chart__everyday">
                      {guide.everydayName}
                    </span>
                  ) : null}
                </span>
                <span className="domain-chart__level">
                  {concernLevelLabel(c.level)}
                </span>
                <span className="domain-chart__meter" aria-hidden="true">
                  <span
                    className={`domain-chart__meter-fill domain-chart__meter-fill--${c.level}`}
                    style={{ width: `${meterWidth(c.level)}%` }}
                  />
                </span>
                <span className="domain-chart__chevron" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen ? (
                <div id={panelId} className="domain-chart__panel">
                  <p className="domain-chart__plain">{c.plainLanguage}</p>
                  {guide ? (
                    <>
                      <p>
                        <strong>What this means:</strong> {guide.whatItMeans}
                      </p>
                      <p>
                        <strong>Examples:</strong> {guide.examples}
                      </p>
                      <p>
                        <strong>Why it matters:</strong> {guide.whyItMatters}
                      </p>
                      {c.level !== "typical" ? (
                        <p className="domain-chart__tip">
                          <strong>For your next visit:</strong>{" "}
                          {guide.discussTip}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function firstFlaggedDomain(concerns: DomainConcern[]): string | null {
  const flagged = concerns.find((c) => c.level !== "typical");
  return flagged?.domain ?? concerns[0]?.domain ?? null;
}

function meterWidth(level: ConcernLevel): number {
  switch (level) {
    case "typical":
      return 28;
    case "keep_an_eye":
      return 62;
    case "worth_discussing":
      return 92;
  }
}
