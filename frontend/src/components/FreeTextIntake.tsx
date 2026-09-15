import { FormEvent, useState } from "react";
import { api, ApiError } from "../api/client";
import type { IntakeResponse } from "../api/types";

interface Props {
  sessionId: string;
  onComplete: (domains: string[]) => void;
  onRuleOut: () => void;
}

const CHIP_LABELS = [
  "Work/attention",
  "Reading/writing",
  "Numbers",
  "Movement",
  "Friends",
  "Fear/anger/school",
  "Hearing/seeing",
  "Something else",
];

/**
 * Module B free-text intake form.
 *
 * Two states:
 *  1. Text area — parent or teacher describes what they've noticed.
 *  2. Chip grid — shown when text is too short/vague; multi-select then Continue.
 *
 * On completion, calls onComplete(detected_domains) so ScreeningPage can
 * transition to the question phase.
 * On rule-out, calls onRuleOut() so ScreeningPage shows the referral message.
 */
export function FreeTextIntake({ sessionId, onComplete, onRuleOut }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChips, setShowChips] = useState(false);
  const [recallOptions, setRecallOptions] = useState<string[]>(CHIP_LABELS);
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await doSubmit({ text });
  }

  async function doSubmit(opts: { text?: string; chips?: string[] }) {
    const inputText = (opts.text ?? "").trim();
    const chips = opts.chips ?? [];
    if (!inputText && chips.length === 0) {
      setError("Please describe what you've noticed, or select areas of concern.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res: IntakeResponse = await api.submitIntake(sessionId, {
        text: inputText,
        chips,
      });
      if (res.rule_out_flagged) {
        onRuleOut();
        return;
      }
      if (res.recall_help_needed) {
        setShowChips(true);
        if (res.recall_help_options.length > 0) {
          setRecallOptions(res.recall_help_options);
        }
        return;
      }
      onComplete(res.detected_domains);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Could not submit. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function toggleChip(chip: string) {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  }

  async function handleChipsContinue() {
    if (selectedChips.size === 0) {
      setError("Select at least one area that fits what you've noticed.");
      return;
    }
    await doSubmit({
      text,
      chips: [...selectedChips],
    });
  }

  return (
    <section className="intake" aria-labelledby="intake-title">
      <h1 id="intake-title" className="display">
        What have you noticed?
      </h1>
      <p className="lede">
        Tell us in your own words what you've observed about the child at home
        or school. There's no right or wrong way to describe it.
      </p>
      <p className="intake__privacy">
        Your description is not stored as free text. Only a privacy-safe summary
        of detected areas is recorded for this session.
      </p>

      {error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      {!showChips ? (
        <form className="intake__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="visually-hidden">Describe what you've noticed</span>
            <textarea
              className="intake__textarea"
              rows={5}
              maxLength={2000}
              placeholder="e.g. She has trouble concentrating on homework and often loses her place when reading…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={submitting}
              required
            />
            <span className="field__hint">{text.length}/2000 characters</span>
          </label>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || !text.trim()}
          >
            {submitting ? "Analysing…" : "Continue"}
          </button>
        </form>
      ) : (
        <div className="intake__chips" role="group" aria-label="Select areas of concern">
          <p className="intake__chips-prompt">
            Which of these best describes what you've noticed?{" "}
            <span className="intake__chips-hint">Select all that apply, then continue</span>
          </p>
          <div className="intake__chip-grid">
            {recallOptions.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`intake__chip ${selectedChips.has(chip) ? "intake__chip--selected" : ""}`}
                onClick={() => toggleChip(chip)}
                disabled={submitting}
                aria-pressed={selectedChips.has(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleChipsContinue()}
            disabled={submitting || selectedChips.size === 0}
          >
            {submitting ? "Analysing…" : "Continue with selected areas"}
          </button>
          <button
            type="button"
            className="btn btn--ghost intake__back"
            onClick={() => {
              setShowChips(false);
              setSelectedChips(new Set());
              setError(null);
            }}
          >
            ← Try describing it differently
          </button>
        </div>
      )}
    </section>
  );
}
