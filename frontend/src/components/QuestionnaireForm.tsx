import { useEffect, useId, useRef } from "react";
import type { QuestionPayload } from "../api/types";
import { DOMAIN_LABELS } from "../lib/domainConcern";

interface Props {
  question: QuestionPayload;
  disabled?: boolean;
  onAnswer: (value: number) => void;
}

export function QuestionnaireForm({ question, disabled, onAnswer }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groupId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, [question.item_id]);

  const domainLabel =
    DOMAIN_LABELS[question.domain] ??
    question.domain.replace(/_/g, " ");

  const options =
    question.response_type === "yes_no"
      ? [
          { value: 1, label: "Yes" },
          { value: 0, label: "No" },
        ]
      : [
          { value: 0, label: "Not yet / 0 times" },
          { value: 1, label: "1–2 times this week" },
          { value: 2, label: "3 or more times this week" },
        ];

  return (
    <section className="question" aria-labelledby={groupId}>
      <p className="eyebrow">{domainLabel}</p>
      <h2
        id={groupId}
        className="display question__prompt"
        ref={headingRef}
        tabIndex={-1}
      >
        {question.question_text}
      </h2>
      <div
        className="question__options"
        role="group"
        aria-labelledby={groupId}
        aria-busy={disabled || undefined}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="btn btn--option"
            disabled={disabled}
            onClick={() => onAnswer(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
