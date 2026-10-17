import { useEffect, useId, useRef, useState } from "react";
import type { QuestionPayload, LiveTaskDefinition } from "../api/types";
import { api } from "../api/client";
import { LiveTaskCard } from "./LiveTaskCard";
import { AudioNarrationBar } from "./AudioNarrationBar";
import {
  DOMAIN_LABELS,
  getDomainGuide,
  MODULE_B_DOMAINS,
} from "../lib/domainConcern";

interface Props {
  question: QuestionPayload;
  disabled?: boolean;
  onAnswer: (value: number, source?: "recall" | "observed") => void;
  sessionId?: string | null;
}

export function QuestionnaireForm({ question, disabled, onAnswer, sessionId }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groupId = useId();
  const [liveTask, setLiveTask] = useState<LiveTaskDefinition | null>(null);
  const [isLiveMode, setIsLiveMode] = useState<boolean>(false);
  const [, setLoadingTask] = useState<boolean>(false);

  useEffect(() => {
    headingRef.current?.focus();
    setIsLiveMode(false);
  }, [question.item_id]);

  useEffect(() => {
    let active = true;
    if (sessionId) {
      setLoadingTask(true);
      api
        .getSessionLiveTasks(sessionId)
        .then((tasks) => {
          if (active) {
            const match = tasks.find((t) => t.milestone_item_id === question.item_id);
            setLiveTask(match ?? null);
            setLoadingTask(false);
          }
        })
        .catch(() => {
          if (active) {
            setLiveTask(null);
            setLoadingTask(false);
          }
        });
    } else {
      setLiveTask(null);
    }
    return () => {
      active = false;
    };
  }, [sessionId, question.item_id]);

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>
          {domainLabel}
          {guide ? ` · ${guide.everydayName}` : ""}
        </p>

        {liveTask && (
          <button
            type="button"
            onClick={() => setIsLiveMode(!isLiveMode)}
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
              border: isLiveMode ? "1px solid #10b981" : "1px solid rgba(59, 130, 246, 0.4)",
              background: isLiveMode ? "rgba(16, 185, 129, 0.18)" : "rgba(59, 130, 246, 0.15)",
              color: isLiveMode ? "#6ee7b7" : "#93c5fd",
              cursor: "pointer",
            }}
          >
            {isLiveMode ? "← Switch to Caregiver Recall" : "Switch to Live Observation Task"}
          </button>
        )}
      </div>

      {guide ? (
        <p className="question__domain-help">{guide.whatItMeans}</p>
      ) : null}

      {isLiveMode && liveTask ? (
        <div style={{ marginTop: "1rem" }}>
          <LiveTaskCard
            task={liveTask}
            disabled={disabled}
            onAnswer={(val) => onAnswer(val, "observed")}
          />
        </div>
      ) : (
        <>
          <AudioNarrationBar
            itemId={question.item_id}
            questionText={question.question_text}
          />
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
                onClick={() => onAnswer(opt.value, "recall")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginTop: "1.25rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <p className="question__progress-meta" style={{ margin: 0 }}>
          Question {question.question_number} of up to {question.question_cap}
        </p>

        <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem" }}>
          <a href="/deferred/live-elicitation" style={{ color: "#93c5fd" }}>
            Live observation tasks
          </a>
          <a href="/deferred/touch-micro" style={{ color: "#facc15" }}>
            Touch tasks (24m+)
          </a>
        </div>
      </div>
    </section>
  );
}

