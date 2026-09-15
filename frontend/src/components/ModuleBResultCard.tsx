import type { ResultPayload } from "../api/types";
import { toModuleBDomainConcerns } from "../lib/domainConcern";
import { ScreeningDisclaimer } from "./ScreeningDisclaimer";
import { EarlyInterventionResource } from "./EarlyInterventionResource";
import { StigmaReassurance } from "./StigmaReassurance";
import { CheckInSnapshotCard } from "./CheckInSnapshotCard";
import { DomainBreakdownChart } from "./DomainBreakdownChart";
import { ExportableSummary } from "./ExportableSummary";
import { CalendarReminderButton } from "./CalendarReminderButton";

/**
 * Module B result view — school-age (5–12 years) pathway.
 *
 * Mirrors the Module A ResultsView depth: snapshot, expandable domain guides,
 * printable summary, and calendar reminder — using functioning domains.
 */

interface ConsistencyBarProps {
  score: number;
}

function ConsistencyBar({ score }: ConsistencyBarProps) {
  const pct = Math.round(score * 100);
  const label =
    pct >= 80
      ? "Good agreement between home and school perspectives"
      : pct >= 60
        ? "Moderate agreement — some areas look different at home vs. school"
        : "Notable differences between home and school observations";

  return (
    <div className="consistency">
      <h2 className="h-sm">Home vs. school agreement</h2>
      <div
        className="consistency__bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="consistency__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="consistency__label">{label}</p>
    </div>
  );
}

interface Props {
  result: ResultPayload;
  correctedAgeMonths?: number | null;
  childRef?: string;
  coveredDomainCount?: number;
  onStartOver?: () => void;
}

export function ModuleBResultCard({
  result,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  onStartOver,
}: Props) {
  const isRefer =
    result.final_classification === "Refer" || result.safety_override_triggered;
  const concerns = toModuleBDomainConcerns(
    result.domain_classifications,
    result.final_classification,
  );

  return (
    <article
      className={`results results--module-b ${
        result.safety_override_triggered ? "results--override" : "results--standard"
      }`}
      aria-label="School-age screening result"
    >
      <p className={`eyebrow ${isRefer ? "eyebrow--clay" : ""}`}>
        School-age check-in
      </p>
      <h1 className={`display ${isRefer ? "display--clay" : ""}`}>
        {result.final_classification === "Typical"
          ? "Looking on track for this check-in"
          : result.final_classification === "Monitor"
            ? "Some areas to keep an eye on"
            : "Worth discussing with a clinician or school support team"}
      </h1>
      <p className="lede">
        Based on the answers you shared in this check-in, Nirixon places the
        result in the <strong>{result.final_classification}</strong> category.
        Below, each functioning area touched in this check-in is explained in
        everyday language — this is not a separate diagnosis per subject.
      </p>

      <ScreeningDisclaimer />
      {isRefer ? <EarlyInterventionResource /> : null}
      <StigmaReassurance
        override={Boolean(result.safety_override_triggered)}
        classification={result.final_classification}
      />

      <CheckInSnapshotCard
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        coveredDomainCount={coveredDomainCount}
        totalAreas={8}
      />

      <DomainBreakdownChart
        result={result}
        concerns={concerns}
        title="Functioning areas reflected in this check-in"
        note="These are school-age skill areas (attention, literacy, maths, motor, social, and emotional functioning). Tap an area to learn what it means. Highlights reflect this single check-in — not eight separate diagnoses."
      />

      {typeof result.consistency_score === "number" ? (
        <ConsistencyBar score={result.consistency_score} />
      ) : null}

      {result.caveats.length > 0 ? (
        <aside className="results__caveats" aria-label="Notes">
          <h2 className="h-sm">Things to keep in mind</h2>
          <ul>
            {result.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      {result.safety_override_triggered ? (
        <div className="override-callout" role="status">
          <p>
            <strong>Protective recommendation:</strong>{" "}
            {result.override_rule === "rule_out_item"
              ? "A response suggested a possible vision, hearing, or significant developmental concern. A specialist conversation is recommended."
              : "A protective screening rule recommended referral for this check-in."}
          </p>
        </div>
      ) : null}

      <ExportableSummary
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        childRef={childRef}
        coveredDomainCount={coveredDomainCount}
        totalAreas={8}
      />

      <div className="results__actions">
        <CalendarReminderButton classification={result.final_classification} />
        {onStartOver ? (
          <button type="button" className="btn btn--ghost" onClick={onStartOver}>
            Start another check-in
          </button>
        ) : null}
      </div>
    </article>
  );
}
