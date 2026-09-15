import type { ResultPayload } from "../api/types";
import {
  concernLevelLabel,
  getDomainGuide,
  toDomainConcerns,
  toModuleBDomainConcerns,
} from "../lib/domainConcern";

interface Props {
  result: ResultPayload;
  correctedAgeMonths?: number | null;
  childRef?: string;
  coveredDomainCount?: number;
  /** Total areas for this pathway (6 Module A / 8 Module B). */
  totalAreas?: number;
}

/** Parent-facing print-to-PDF via browser native print + print stylesheet. */
export function ExportableSummary({
  result,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  totalAreas,
}: Props) {
  const isModuleB = result.module === "B";
  const areasTotal = totalAreas ?? (isModuleB ? 8 : 6);
  const concerns = isModuleB
    ? toModuleBDomainConcerns(
        result.domain_classifications,
        result.final_classification,
      )
    : toDomainConcerns(result.shap_values, result.final_classification);

  return (
    <div className="export-summary print-only-block">
      <div className="export-summary__actions no-print">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => window.print()}
        >
          Print / save as PDF
        </button>
      </div>
      <article className="export-summary__sheet" aria-label="Printable summary">
        <h2 className="h-sm">
          {isModuleB
            ? "Nirixon school-age screening summary"
            : "Nirixon screening summary"}
        </h2>
        <dl className="export-summary__dl">
          <div>
            <dt>Recommendation</dt>
            <dd>{result.final_classification}</dd>
          </div>
          {correctedAgeMonths != null ? (
            <div>
              <dt>Age at check-in</dt>
              <dd>
                {correctedAgeMonths} months
                {isModuleB
                  ? ` (about ${(correctedAgeMonths / 12).toFixed(1)} years)`
                  : ""}
              </dd>
            </div>
          ) : null}
          {childRef ? (
            <div>
              <dt>Session label</dt>
              <dd>{childRef}</dd>
            </div>
          ) : null}
          {result.real_answer_count != null ? (
            <div>
              <dt>Answers used</dt>
              <dd>{result.real_answer_count}</dd>
            </div>
          ) : null}
          {coveredDomainCount != null ? (
            <div>
              <dt>Areas covered</dt>
              <dd>
                {coveredDomainCount} of {areasTotal}{" "}
                {isModuleB ? "functioning areas" : "developmental areas"}
              </dd>
            </div>
          ) : null}
          {typeof result.consistency_score === "number" ? (
            <div>
              <dt>Home vs school agreement</dt>
              <dd>{Math.round(result.consistency_score * 100)}%</dd>
            </div>
          ) : null}
          <div>
            <dt>Safety override</dt>
            <dd>{result.safety_override_triggered ? "Yes" : "No"}</dd>
          </div>
          {result.stopping_reason ? (
            <div>
              <dt>Stopped because</dt>
              <dd>{humanizeStopping(result.stopping_reason)}</dd>
            </div>
          ) : null}
        </dl>

        <h3 className="h-sm">Areas reflected</h3>
        <ul className="export-summary__domains">
          {concerns.map((c) => {
            const guide = getDomainGuide(c.domain);
            return (
              <li key={c.domain}>
                <strong>
                  {c.label}
                  {guide ? ` (${guide.everydayName})` : ""}:
                </strong>{" "}
                {concernLevelLabel(c.level)} — {c.plainLanguage}
                {guide ? ` ${guide.whatItMeans}` : ""}
              </li>
            );
          })}
        </ul>

        {result.caveats.length > 0 ? (
          <>
            <h3 className="h-sm">Notes</h3>
            <ul>
              {result.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="export-summary__disclaimer">
          This is a screening summary for this check-in only — not a medical
          diagnosis
          {isModuleB
            ? " and not separate diagnoses per school subject."
            : "."}{" "}
          Discuss any concerns with your child’s paediatrician, school support
          team, or nearest District Early Intervention Centre (DEIC). This
          printout is not a stored history in the app.
        </p>
      </article>
    </div>
  );
}

function humanizeStopping(reason: string): string {
  return reason.replace(/_/g, " ");
}
