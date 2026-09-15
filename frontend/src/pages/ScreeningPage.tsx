import { FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import { useAdaptiveQuestionnaire } from "../hooks/useAdaptiveQuestionnaire";
import { useToast } from "../toast/Toast";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { ResultsView } from "../components/ResultsView";

export function ScreeningPage() {
  const q = useAdaptiveQuestionnaire();
  const { push } = useToast();
  const [ageMonths, setAgeMonths] = useState("24");
  const [childRef, setChildRef] = useState("");
  const [starting, setStarting] = useState(false);

  // Compute the ASQ-3 bracket label to display live as age changes
  const ageBracketLabel = (() => {
    const n = Number(ageMonths);
    if (!Number.isFinite(n) || n < 1 || n > 66) return null;
    if (n < 3) return "2 months";
    if (n < 5) return "4 months";
    if (n < 7.5) return "6 months";
    if (n < 10.5) return "9 months";
    if (n < 13.5) return "12 months";
    if (n < 16.5) return "15 months";
    if (n < 19.5) return "18 months";
    if (n < 22.5) return "21 months";
    if (n < 25.5) return "24 months";
    if (n < 28.5) return "27 months";
    if (n < 31.5) return "30 months";
    if (n < 34.5) return "33 months";
    if (n < 39) return "36 months";
    if (n < 45) return "42 months";
    if (n < 51) return "48 months";
    if (n < 57) return "54 months";
    return "60 months";
  })();

  async function onStart(e: FormEvent) {
    e.preventDefault();
    const age = Number(ageMonths);
    if (!Number.isFinite(age) || age < 1 || age > 66) {
      push("Please enter a corrected age between 1 and 66 months (ASQ-3 range).", "error");
      return;
    }
    setStarting(true);
    try {
      await q.start({
        corrected_age_months: age,
        child_ref: childRef.trim() || undefined,
      });
    } catch (err) {
      push(
        err instanceof ApiError ? err.detail : "Could not start screening.",
        "error",
      );
    } finally {
      setStarting(false);
    }
  }

  async function onAnswer(value: number) {
    try {
      await q.submitAnswer(value);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 429
            ? "You’re sending answers a bit quickly — please wait a moment and try again."
            : err.detail
          : "Could not save that answer after retries. Check your connection and try again — your earlier answers are still saved.";
      push(msg, "error");
    }
  }

  if (q.phase === "complete" && q.result) {
    return (
      <ResultsView
        result={q.result}
        onStartOver={() => {
          q.reset();
        }}
      />
    );
  }

  if (q.phase === "question" && q.question) {
    return (
      <div className="screening">
        <ProgressIndicator
          coveredCount={q.coveredDomains.size}
          totalDomains={q.totalDomains}
        />
        {q.error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {q.error}
          </p>
        ) : null}
        {q.submitting ? (
          <p className="lede screening__saving" role="status" aria-live="polite">
            Saving your answer…
          </p>
        ) : null}
        <QuestionnaireForm
          question={q.question}
          disabled={q.submitting}
          onAnswer={onAnswer}
        />
      </div>
    );
  }

  if (q.phase === "loading") {
    return (
      <p className="lede" role="status" aria-live="polite">
        Loading your check-in…
      </p>
    );
  }

  return (
    <section className="screening-start" aria-labelledby="start-title">
      <h1 id="start-title" className="display">
        Start a check-in
      </h1>
      <p className="lede">
        We’ll ask a short adaptive set of questions. Progress is by domain
        coverage, not a fixed question count — the list can shorten as you go.
      </p>
      {q.error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {q.error}
        </p>
      ) : null}
      <form className="screening-start__form" onSubmit={onStart}>
        <label className="field">
          <span>Child’s corrected age (months)</span>
          <input
            type="number"
            min={1}
            max={66}
            step={0.5}
            required
            value={ageMonths}
            onChange={(e) => setAgeMonths(e.target.value)}
          />
          {ageBracketLabel && (
            <span className="field__hint" aria-live="polite">
              ASQ-3 bracket: <strong>{ageBracketLabel}</strong>
            </span>
          )}
        </label>
        <label className="field">
          <span>Optional label for this session only</span>
          <input
            type="text"
            value={childRef}
            onChange={(e) => setChildRef(e.target.value)}
            placeholder="e.g. initials — not a lasting child profile"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={starting}
        >
          {starting ? "Starting…" : "Begin"}
        </button>
      </form>
    </section>
  );
}
