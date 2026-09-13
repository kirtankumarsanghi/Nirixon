import type { ResultPayload } from "../api/types";
import { DomainBreakdownChart } from "./DomainBreakdownChart";
import { StigmaReassurance } from "./StigmaReassurance";
import { ExportableSummary } from "./ExportableSummary";
import { CalendarReminderButton } from "./CalendarReminderButton";
import { ScreeningDisclaimer } from "./ScreeningDisclaimer";
import { EarlyInterventionResource } from "./EarlyInterventionResource";

interface Props {
  result: ResultPayload;
  onStartOver?: () => void;
}

/**
 * Two distinct render paths for standard vs safety-floor override —
 * not one template with swapped strings.
 * Clay (not red) on override is intentional — clarity over alarm (Section 0.5).
 */
export function ResultsView({ result, onStartOver }: Props) {
  if (result.safety_override_triggered) {
    return (
      <OverrideResultsLayout result={result} onStartOver={onStartOver} />
    );
  }
  return <StandardResultsLayout result={result} onStartOver={onStartOver} />;
}

function StandardResultsLayout({ result, onStartOver }: Props) {
  const isRefer = result.final_classification === "Refer";

  return (
    <section className="results results--standard" aria-labelledby="results-title">
      <p className="eyebrow">Your check-in result</p>
      <h1 id="results-title" className="display">
        {classificationHeadline(result.final_classification)}
      </h1>
      <p className="lede">
        Based on the answers you shared in this check-in, Nirixon places the
        result in the <strong>{result.final_classification}</strong> category.
      </p>
      <ScreeningDisclaimer />
      {isRefer ? <EarlyInterventionResource /> : null}
      <StigmaReassurance override={false} classification={result.final_classification} />
      <DomainBreakdownChart result={result} />
      <ExportableSummary result={result} />
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

function OverrideResultsLayout({ result, onStartOver }: Props) {
  return (
    <section
      className="results results--override"
      aria-labelledby="override-title"
    >
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
      <DomainBreakdownChart result={result} />
      <ExportableSummary result={result} />
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
      return "Worth discussing with a pediatrician";
    default:
      return c;
  }
}
