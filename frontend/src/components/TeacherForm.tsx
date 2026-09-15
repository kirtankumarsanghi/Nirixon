import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { TeacherAnswerResponse, TeacherItemPayload } from "../api/types";
import { DOMAIN_LABELS } from "../lib/domainConcern";

interface Props {
  sessionId: string;
  onComplete: (result?: TeacherAnswerResponse) => void;
}

const OPTIONS = [
  { value: 0, label: "Never / not true" },
  { value: 1, label: "Sometimes (1–2× / week)" },
  { value: 2, label: "Often (3+ / week)" },
] as const;

/**
 * Module B teacher questionnaire — asks about the same item IDs the parent
 * answered so home vs school consistency can be scored.
 */
export function TeacherForm({ sessionId, onComplete }: Props) {
  const [items, setItems] = useState<TeacherItemPayload[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeacherAnswerResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getTeacherItems(sessionId);
        if (cancelled) return;
        setItems(res.items);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.detail
            : "Could not load teacher questions.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function handleSelect(id: string, value: number) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      onComplete();
      return;
    }
    if (Object.keys(answers).length < items.length) {
      setError("Please answer all questions.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitTeacher(sessionId, { answers });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Could not submit teacher answers.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="teacher-form" aria-labelledby="teacher-result-title">
        <h2 id="teacher-result-title" className="display">
          Teacher input saved
        </h2>
        <p className="lede">
          Home vs school agreement:{" "}
          <strong>{Math.round(result.consistency_score * 100)}%</strong>
        </p>
        {result.caveats.length > 0 ? (
          <aside className="results__caveats" aria-label="Notes">
            <h3 className="h-sm">Notes</h3>
            <ul>
              {result.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </aside>
        ) : null}
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onComplete(result)}
        >
          See check-in summary
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <p className="lede" role="status" aria-live="polite">
        Loading teacher questions…
      </p>
    );
  }

  return (
    <section className="teacher-form" aria-labelledby="teacher-form-title">
      <h2 id="teacher-form-title" className="display">
        Teacher perspective
      </h2>
      <p className="lede">
        Optional — if a teacher or school staff member has observed this child,
        answer the same areas from a classroom point of view. This helps compare
        home and school without changing the check-in result itself.
      </p>

      {error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <form className="teacher-form__form" onSubmit={handleSubmit}>
        {items.map((q) => {
          const domainLabel =
            DOMAIN_LABELS[q.domain] ?? q.domain.replace(/_/g, " ");
          return (
            <fieldset key={q.item_id} className="teacher-form__item">
              <legend className="teacher-form__legend">
                <span className="eyebrow">{domainLabel}</span>
                <span className="teacher-form__prompt">{q.question_text}</span>
              </legend>
              <div className="question__options" role="group">
                {OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn btn--option${
                      answers[q.item_id] === opt.value
                        ? " btn--option-selected"
                        : ""
                    }`}
                    onClick={() => handleSelect(q.item_id, opt.value)}
                    aria-pressed={answers[q.item_id] === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={submitting || items.length === 0}
        >
          {submitting ? "Submitting…" : "Submit teacher responses"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onComplete()}
        >
          Skip for now
        </button>
      </form>
    </section>
  );
}
