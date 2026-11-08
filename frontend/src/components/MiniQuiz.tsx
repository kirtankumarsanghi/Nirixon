import { useState } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Btn, Eyebrow } from "./ui";
import { Localize } from "../lib/localize";
import { cn } from "../utils/cn";

export interface MiniQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  rationale: string;
}

/** Small self-contained quiz with best-score progress saved on this device. */
export function MiniQuiz({ questions, storageKey, tone = "dark" }: { questions: MiniQuestion[]; storageKey: string; tone?: "dark" | "warm" }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [best, setBest] = useState<number>(() => {
    try {
      return Number(window.localStorage.getItem(storageKey)) || 0;
    } catch {
      return 0;
    }
  });

  const q = questions[index];
  const percent = Math.round((score / questions.length) * 100);

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (index + 1 >= questions.length) {
      const updated = Math.max(best, percent);
      setBest(updated);
      try {
        window.localStorage.setItem(storageKey, String(updated));
      } catch {
        /* restricted storage */
      }
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };
  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    return (
      <Localize>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[40px] bg-night p-7 text-paper sm:p-10">
          <Eyebrow tone="peach" index="Q">Quiz complete</Eyebrow>
          <p className="mt-4 font-display text-[clamp(56px,8vw,100px)] leading-[0.9] uppercase">{percent}%</p>
          <p className="mt-3 text-[15px] text-paper/75">{score} of {questions.length} correct.</p>
          <div className="mt-7"><Btn variant="peach" onClick={restart}><RotateCcw className="size-4" /> Try again</Btn></div>
        </div>
        <div className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
          <Eyebrow index="B" tone="muted">Best score</Eyebrow>
          <p className="mt-5 font-display text-[56px] leading-none">{best}%</p>
          <p className="mt-5 text-[12px] leading-relaxed text-muted">Saved on this device only.</p>
        </div>
      </div>
      </Localize>
    );
  }

  return (
    <Localize>
    <div className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
      <div className="flex items-center justify-between text-[12px] font-semibold">
        <span>Question {index + 1} of {questions.length}</span>
        <span className="font-mono text-[11px] text-muted">{score} correct</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-sand">
        <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${Math.max(4, ((index + 1) / questions.length) * 100)}%` }} />
      </div>
      <h2 className={cn("mt-7 text-[20px] leading-snug font-bold", tone === "warm" && "text-[22px]")}>{q.question}</h2>
      <div className="mt-5 space-y-2.5">
        {q.options.map((option, i) => {
          const chosen = picked === i;
          const correct = picked !== null && i === q.answer;
          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(i)}
              disabled={picked !== null}
              aria-pressed={chosen}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-[13.5px] font-semibold transition-colors disabled:cursor-default",
                correct ? "border-moss bg-moss-bg text-ink" : chosen ? "border-brick bg-brick-bg text-ink" : "border-line-2 bg-card-2 hover:border-ink/60",
              )}
            >
              <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2", correct ? "border-moss text-moss" : chosen ? "border-brick text-brick" : "border-ink/25")}>
                {correct ? <Check className="size-3.5" /> : String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="nrx-rise mt-5 rounded-2xl bg-sand/70 p-4 text-[12.5px] leading-relaxed text-ink-2">
          <b className="text-ink">Why:</b> {q.rationale}
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <Btn onClick={next} disabled={picked === null}>
          {index + 1 === questions.length ? "See score" : "Next"} <ArrowRight className="size-4" />
        </Btn>
      </div>
    </div>
    </Localize>
  );
}
