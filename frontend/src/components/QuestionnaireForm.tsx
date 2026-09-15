import { useEffect, useId, useRef } from "react";
import type { QuestionPayload } from "../api/types";
import {
  DOMAIN_LABELS,
  getDomainGuide,
  MODULE_B_DOMAINS,
} from "../lib/domainConcern";

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
  const guide = getDomainGuide(question.domain);
  const isModuleB = (MODULE_B_DOMAINS as readonly string[]).includes(
    question.domain,
  );

  const options =
    question.response_type === "yes_no"
      ? [
          { value: 1, label: "Yes" },
          { value: 0, label: "No" },
        ]
      : isModuleB
        ? [
            { value: 0, label: "Never / not true" },
            { value: 1, label: "Sometimes (1–2× / week)" },
            { value: 2, label: "Often (3+ / week)" },
          ]
        : [
            { value: 0, label: "Not yet / 0 times" },
            { value: 1, label: "1–2 times this week" },
            { value: 2, label: "3 or more times this week" },
          ];

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
        Answer based on what you have seen your child do recently. If you are
        unsure, choose the option that feels closest — there are no right or
        wrong answers.
      </p>
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
      <p className="question__progress-meta">
        Question {question.question_number} of up to {question.question_cap}
      </p>
    </section>
  );
}
