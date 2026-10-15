import { useEffect, useId, useRef } from "react";
import type { QuestionPayload, ProgressPayload } from "../api/types";
import {
  DOMAIN_LABELS,
  getDomainGuide,
  MODULE_B_DOMAINS,
} from "../lib/domainConcern";
import { t } from "../i18n";

interface LikertOption {
  value: number;
  label: string;
}

/** Parse a scale string like "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often" */
function parseLikertScale(scale: string): LikertOption[] {
  return scale.split("|").map((part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) return { value: 0, label: part.trim() };
    const val = Number(part.slice(0, eqIndex).trim());
    const lbl = part.slice(eqIndex + 1).trim();
    return { value: val, label: lbl };
  });
}

interface Props {
  question: QuestionPayload;
  disabled?: boolean;
  onAnswer: (value: number) => void;
  /** Module B progress counter. */
  progress?: ProgressPayload | null;
}

/**
 * Module B question form.
 *
 * - likert5: parses the `scale` string for 5 labelled buttons (never hard-coded).
 * - yesno: renders Yes / No / Not sure.
 * - Focus moves to the question heading on each new question.
 */
export function ModuleBQuestionForm({
  question,
  disabled,
  onAnswer,
  progress,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groupId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, [question.item_id]);

  const domainLabel =
    DOMAIN_LABELS[question.domain] ??
    question.domain.replace(/_/g, " ");
  const guide = getDomainGuide(question.domain);
  const isModuleB = (MODULE_B_DOMAINS as readonly string[]).includes(
    question.domain,
  );

  let options: LikertOption[];
  const scaleString = question.scale_labels || question.scale;
  if (
    (question.response_type === "likert5" || question.response_type === "frequency") &&
    scaleString
  ) {
    options = parseLikertScale(scaleString);
  } else if (question.response_type === "yesno" || question.response_type === "yes_no") {
    options = [
      { value: 1, label: t("moduleb.yesno.yes", "Yes") },
      { value: 0, label: t("moduleb.yesno.no", "No") },
      { value: 2, label: t("moduleb.yesno.notsure", "Not sure") },
    ];
  } else if (isModuleB) {
    // Fallback for Module B frequency without scale string
    options = [
      { value: 0, label: t("moduleb.freq.never", "Never / not true") },
      { value: 1, label: t("moduleb.freq.sometimes", "Sometimes (1–2× / week)") },
      { value: 2, label: t("moduleb.freq.often", "Often (3+ / week)") },
    ];
  } else {
    options = [
      { value: 0, label: "Not yet / 0 times" },
      { value: 1, label: "1–2 times this week" },
      { value: 2, label: "3 or more times this week" },
    ];
  }

  const progressText = progress
    ? t(
        "moduleb.progress",
        `Question ${progress.answered + 1} of up to ${progress.max}`,
      )
    : `Question ${question.question_number} of up to ${question.question_cap}`;

  return (
    <section className="question" aria-labelledby={groupId}>
      <p className="eyebrow">
        {domainLabel}
        {guide ? ` · ${guide.everydayName}` : ""}
      </p>
      {guide ? (
        <p className="question__domain-help">{guide.whatItMeans}</p>
      ) : null}
      <h2
        id={groupId}
        className="display question__prompt"
        ref={headingRef}
        tabIndex={-1}
      >
        {question.question_text}
      </h2>
      <p className="question__hint">
        {t(
          "moduleb.question.hint",
          "Answer based on what you have seen recently. If you are unsure, choose the option that feels closest.",
        )}
      </p>
      <div
        className="question__options question__options--moduleb"
        role="group"
        aria-labelledby={groupId}
        aria-busy={disabled || undefined}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="btn btn--option btn--option-lg"
            disabled={disabled}
            onClick={() => onAnswer(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="question__progress-meta" aria-live="polite">
        {progressText}
      </p>
    </section>
  );
}
