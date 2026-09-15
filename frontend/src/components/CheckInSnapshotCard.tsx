import type { ResultPayload } from "../api/types";

interface Props {
  result: ResultPayload;
  correctedAgeMonths?: number | null;
  coveredDomainCount?: number;
  /** Total areas for this pathway (6 Module A / 8 Module B). */
  totalAreas?: number;
}

/** Compact interactive facts drawn only from this check-in's real payload. */
export function CheckInSnapshotCard({
  result,
  correctedAgeMonths,
  coveredDomainCount,
  totalAreas,
}: Props) {
  const answers =
    result.real_answer_count != null ? result.real_answer_count : null;
  const stopping = result.stopping_reason
    ? result.stopping_reason.replace(/_/g, " ")
    : null;
  const areasTotal = totalAreas ?? (result.module === "B" ? 8 : 6);
  const domainCount = Object.keys(result.domain_classifications ?? {}).length;

  return (
    <section className="checkin-snapshot" aria-labelledby="snapshot-title">
      <h2 id="snapshot-title" className="h-sm">
        This check-in at a glance
      </h2>
      <ul className="checkin-snapshot__grid">
        <li>
          <span className="checkin-snapshot__label">Overall</span>
          <span className="checkin-snapshot__value">
            {result.final_classification}
          </span>
        </li>
        {correctedAgeMonths != null ? (
          <li>
            <span className="checkin-snapshot__label">Age</span>
            <span className="checkin-snapshot__value">
              {correctedAgeMonths} months
              {result.module === "B"
                ? ` · ~${(correctedAgeMonths / 12).toFixed(1)} yrs`
                : ""}
            </span>
          </li>
        ) : null}
        {answers != null ? (
          <li>
            <span className="checkin-snapshot__label">Answers used</span>
            <span className="checkin-snapshot__value">{answers}</span>
          </li>
        ) : null}
        {coveredDomainCount != null || domainCount > 0 ? (
          <li>
            <span className="checkin-snapshot__label">Areas touched</span>
            <span className="checkin-snapshot__value">
              {coveredDomainCount ?? domainCount} / {areasTotal}
            </span>
          </li>
        ) : null}
        {typeof result.consistency_score === "number" ? (
          <li>
            <span className="checkin-snapshot__label">Home/school</span>
            <span className="checkin-snapshot__value">
              {Math.round(result.consistency_score * 100)}% agree
            </span>
          </li>
        ) : null}
        {stopping ? (
          <li className="checkin-snapshot__wide">
            <span className="checkin-snapshot__label">Why it finished</span>
            <span className="checkin-snapshot__value">{stopping}</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
