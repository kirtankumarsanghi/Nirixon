import { useState } from "react";
import type { LiveTaskDefinition } from "../api/types";

interface LiveTaskCardProps {
  task: LiveTaskDefinition;
  currentValue?: number;
  source?: "recall" | "observed";
  onAnswer: (value: number, source: "observed") => Promise<void> | void;
  disabled?: boolean;
  submitting?: boolean;
  compact?: boolean;
}

export function LiveTaskCard({
  task,
  currentValue,
  source,
  onAnswer,
  disabled = false,
  submitting = false,
  compact = false,
}: LiveTaskCardProps) {
  const [selectedVal, setSelectedVal] = useState<number | undefined>(currentValue);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isBusy = disabled || submitting || isSubmittingLocal;

  const handleSelect = async (val: number) => {
    if (isBusy) return;
    setSelectedVal(val);
    setIsSubmittingLocal(true);
    try {
      await onAnswer(val, "observed");
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const domainFormatted = task.domain
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <article
      className={`live-task${compact ? " live-task--compact" : ""}`}
      data-testid={`live-task-card-${task.task_id}`}
    >
      <div className="live-task__header">
        <div className="live-task__badges">
          <span className="badge badge--typical">{domainFormatted}</span>
          <span className="badge badge--monitor">{task.age_bracket} bracket</span>
          <span className="live-task__item-id" title="Linked Milestone Item in Adaptive Screening Engine">
            Item: {task.milestone_item_id}
          </span>
        </div>

        {source === "observed" ? (
          <span className="live-task__observed">Observed in session</span>
        ) : null}
      </div>

      <h3 className="live-task__title">{task.title}</h3>

      {task.materials ? (
        <div className="live-task__materials">
          <strong>Materials needed:</strong> {task.materials}
        </div>
      ) : null}

      <div className="live-task__box live-task__box--instruction">
        <p className="eyebrow">Instruction (what to say / do)</p>
        <p>{task.instruction}</p>
      </div>

      <div className="live-task__box live-task__box--observe">
        <p className="eyebrow">What to observe</p>
        <p>{task.what_to_observe}</p>
      </div>

      <div>
        <p className="live-task__prompt">Select observed response:</p>
        <div
          role="radiogroup"
          aria-label={`Observed response for ${task.title}`}
          className="live-task__options"
        >
          {task.response_options.map((opt) => {
            const isSelected = selectedVal === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isBusy}
                onClick={() => void handleSelect(opt.value)}
                className={`btn btn--option${isSelected ? " btn--option-selected" : ""}`}
              >
                <div className="live-task__opt-row">
                  <span
                    className={`live-task__radio${isSelected ? " live-task__radio--on" : ""}`}
                    aria-hidden
                  />
                  <strong>{opt.label}</strong>
                  <span className="live-task__opt-val">[{opt.value}]</span>
                </div>
                {opt.description ? (
                  <span className="live-task__opt-desc">{opt.description}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="live-task__footer">
        <span>
          Replaces recall question for milestone item <code>{task.milestone_item_id}</code>.
        </span>
        {selectedVal !== undefined ? (
          <span className="live-task__recorded">
            Recorded value: {selectedVal} (source: observed)
          </span>
        ) : null}
      </div>
    </article>
  );
}
