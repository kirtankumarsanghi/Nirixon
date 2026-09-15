import { useEffect } from "react";
import type { ResultPayload } from "../api/types";
import { saveCheckIn } from "../lib/checkInHistory";
import { DomainBreakdownChart } from "./DomainBreakdownChart";
import { StigmaReassurance } from "./StigmaReassurance";
import { ExportableSummary } from "./ExportableSummary";
import { CalendarReminderButton } from "./CalendarReminderButton";
import { ScreeningDisclaimer } from "./ScreeningDisclaimer";
import { EarlyInterventionResource } from "./EarlyInterventionResource";
import { CheckInSnapshotCard } from "./CheckInSnapshotCard";
import { Link } from "react-router-dom";
import { PageNav } from "./PageNav";

interface Props {
  result: ResultPayload;
  sessionId?: string | null;
  correctedAgeMonths?: number | null;
  childRef?: string;
  coveredDomainCount?: number;
  onStartOver?: () => void;
}

/**
 * Two distinct render paths for standard vs safety-floor override —
 * not one template with swapped strings.
 * Clay (not red) on override is intentional — clarity over alarm (Section 0.5).
 */
export function ResultsView({
  result,
  sessionId,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  onStartOver,
}: Props) {
  useEffect(() => {
    if (!sessionId || correctedAgeMonths == null) return;
    saveCheckIn({
      sessionId,
      result,
      correctedAgeMonths,
      childRef,
      coveredDomainCount,
      module: result.module ?? "A",
    });
  }, [sessionId, result, correctedAgeMonths, childRef, coveredDomainCount]);

  if (result.safety_override_triggered) {
    return (
      <OverrideResultsLayout
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        childRef={childRef}
        coveredDomainCount={coveredDomainCount}
        onStartOver={onStartOver}
      />
    );
  }
  return (
    <StandardResultsLayout
      result={result}
      correctedAgeMonths={correctedAgeMonths}
      childRef={childRef}
      coveredDomainCount={coveredDomainCount}
      onStartOver={onStartOver}
    />
  );
}

function StandardResultsLayout({
  result,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  onStartOver,
}: Omit<Props, "sessionId">) {
  const isRefer = result.final_classification === "Refer";

  return (
    <section className="results results--standard" aria-labelledby="results-title">
      <PageNav
        current="/screen"
        backLabel="Start another check-in"
        onBack={onStartOver}
        preferHistoryBack={false}
      />
      <p className="eyebrow">Your check-in result</p>
      <h1 id="results-title" className="display">
        {classificationHeadline(result.final_classification)}
      </h1>
      <p className="lede">
        Based on the answers you shared in this check-in, Nirixon places the
        result in the <strong>{result.final_classification}</strong> category.
        Below, each of the six developmental areas is explained in everyday
        language so you know what the check-in was looking at.
      </p>
      <ScreeningDisclaimer />
      {isRefer ? <EarlyInterventionResource /> : null}
      <StigmaReassurance override={false} classification={result.final_classification} />
      <CheckInSnapshotCard
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        coveredDomainCount={coveredDomainCount}
      />
      <DomainBreakdownChart result={result} />
      <nav className="results__related" aria-label="Related tools">
        <p className="eyebrow">Explore from this result</p>
        <ul>
          <li>
            <Link to="/growth">Growth trends</Link> — timeline of check-ins on
            this device
          </li>
          <li>
            <Link to="/share">Family sharing</Link> — copy or print a summary
            for caregivers
          </li>
          <li>
            <Link to="/sandbox">Clinician tools</Link> — probabilities and
            model detail for a paediatrician visit
          </li>
        </ul>
      </nav>
      <ExportableSummary
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        childRef={childRef}
        coveredDomainCount={coveredDomainCount}
      />
      <div className="results__actions">
        <CalendarReminderButton classification={result.final_classification} />
        {onStartOver ? (
          <button type="button" className="btn btn--ghost" onClick={onStartOver}>
            Start another check-in
          </button>
        ) : null}
      </div>
      {result.caveats.length > 0 ? (
        <aside className="results__caveats" aria-label="Notes">
          <h2 className="h-sm">Notes</h2>
          <ul>
            {result.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}

function OverrideResultsLayout({
  result,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  onStartOver,
}: Omit<Props, "sessionId">) {
  return (
    <section
      className="results results--override"
      aria-labelledby="override-title"
    >
      <PageNav
        current="/screen"
        backLabel="Start another check-in"
        onBack={onStartOver}
        preferHistoryBack={false}
      />
      <p className="eyebrow eyebrow--clay">Safety recommendation</p>
      <h1 id="override-title" className="display display--clay">
        {/* PLACEHOLDER (Section 5): clinical sign-off on override wording */}
        Please talk with your child’s clinician
      </h1>
      <p className="lede">
        A protective screening rule recommended a referral for this check-in,
        regardless of the model score. This is intentional — it prioritizes
        caution when certain answers raise a clinical flag.
      </p>
      <div className="override-callout" role="status">
        <p>
          Recommendation: <strong>Refer</strong>
        </p>
        <p className="override-callout__meta">
          {/* PLACEHOLDER: rule label may be technical; keep soft for parents */}
          Protective rule applied
          {result.override_rule ? ` (${result.override_rule})` : ""}
        </p>
      </div>
      <ScreeningDisclaimer />
      <EarlyInterventionResource />
      <StigmaReassurance override classification={result.final_classification} />
      <CheckInSnapshotCard
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        coveredDomainCount={coveredDomainCount}
      />
      <DomainBreakdownChart result={result} />
      <nav className="results__related" aria-label="Related tools">
        <p className="eyebrow">Explore from this result</p>
        <ul>
          <li>
            <Link to="/growth">Growth trends</Link>
          </li>
          <li>
            <Link to="/share">Family sharing</Link>
          </li>
          <li>
            <Link to="/sandbox">Clinician tools</Link>
          </li>
        </ul>
      </nav>
      <ExportableSummary
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        childRef={childRef}
        coveredDomainCount={coveredDomainCount}
      />
      <div className="results__actions">
        <CalendarReminderButton classification="Refer" />
        {onStartOver ? (
          <button type="button" className="btn btn--ghost" onClick={onStartOver}>
            Start another check-in
          </button>
        ) : null}
      </div>
    </section>
  );
}

function classificationHeadline(c: string): string {
  switch (c) {
    case "Typical":
      return "Looking on track for this check-in";
    case "Monitor":
      return "Worth keeping an eye on";
    case "Refer":
      return "Worth discussing with a paediatrician";
    default:
      return c;
  }
}
