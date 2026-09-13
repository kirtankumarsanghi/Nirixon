import type { ResultPayload } from "../api/types";

interface Props {
  result: ResultPayload;
}

/** Parent-facing print-to-PDF via browser native print + print stylesheet. */
export function ExportableSummary({ result }: Props) {
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
        <h2 className="h-sm">Nirixon screening summary</h2>
        <dl className="export-summary__dl">
          <div>
            <dt>Recommendation</dt>
            <dd>{result.final_classification}</dd>
          </div>
          <div>
            <dt>Safety override</dt>
            <dd>{result.safety_override_triggered ? "Yes" : "No"}</dd>
          </div>
          {result.stopping_reason ? (
            <div>
              <dt>Stopped because</dt>
              <dd>{result.stopping_reason}</dd>
            </div>
          ) : null}
        </dl>
        <p className="export-summary__disclaimer">
          This is a screening summary for this check-in only — not a medical
          diagnosis. Discuss any concerns with your child’s pediatrician. This
          printout is not a stored history in the app.
        </p>
      </article>
    </div>
  );
}
