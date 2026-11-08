import { useState } from "react";
import { ArrowRight, Check, GraduationCap, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { TIER_META } from "../lib/model";
import { useT } from "../lib/useT";
import {
  TRAINING_CASES,
  TRAINING_QUIZ,
  type TrainingCase,
  type TrainingTier,
} from "../lib/trainingContent";
import { cn } from "../utils/cn";

type Mode = "cases" | "quiz";
type Filter = "all" | "A" | "B";
type Progress = { best: number; attempts: number };

const STORAGE_KEY = "nirixon-training-progress";
const TIERS: TrainingTier[] = ["Typical", "Monitor", "Refer"];

function readProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { best: 0, attempts: 0 };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { best: Number(parsed.best) || 0, attempts: Number(parsed.attempts) || 0 };
  } catch {
    return { best: 0, attempts: 0 };
  }
}

function saveProgress(progress: Progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* restricted storage */
  }
}

function CaseDetail({ item }: { item: TrainingCase }) {
  const [picked, setPicked] = useState<TrainingTier | null>(null);
  const meta = TIER_META[item.answer];
  return (
    <div className="rounded-[44px] bg-night p-7 text-paper sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow tone="peach" index="02">Sample case · Module {item.module}{item.bracket ? ` · ${item.bracket}` : ""}</Eyebrow>
          <p className="mt-3 font-display text-[clamp(34px,4vw,52px)] leading-[0.95] uppercase">{item.title}</p>
          <p className="mt-2 font-mono text-[11px] tracking-[0.14em] text-paper/55 uppercase">{item.age}</p>
        </div>
        <Chip tone="night">{item.signals.length} signals</Chip>
      </div>

      <p className="mt-7 max-w-[640px] text-[14.5px] leading-relaxed text-paper/80">{item.vignette}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {item.signals.map((signal) => (
          <Chip key={signal} tone="night">{signal}</Chip>
        ))}
      </div>

      <p className="mt-8 mb-3 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">What tier would you assign?</p>
      <div className="flex flex-wrap gap-2.5">
        {TIERS.map((tier) => {
          const active = picked === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setPicked(tier)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-5 py-2.5 text-[13px] font-bold transition-colors",
                active ? "border-peach bg-peach text-night" : "border-white/20 text-paper/75 hover:border-paper/60 hover:text-paper",
              )}
            >
              {tier}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className="nrx-rise mt-7 rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
          <div className="flex items-center gap-4">
            <GlowDot hex={meta.hexLight} glow={meta.glow} size={42} />
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-paper/55 uppercase">Correct tier</p>
              <p className="font-display text-[34px] leading-none uppercase" style={{ color: meta.hexLight }}>{item.answer}</p>
            </div>
          </div>
          <p className="mt-4 text-[13.5px] leading-relaxed text-paper/80">{item.rationale}</p>
          {item.safetyRule && (
            <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#ee6a4f]/15 p-4 text-[12.5px] leading-relaxed text-paper/85">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />
              {item.safetyRule}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Quiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<Progress>(() => readProgress());

  const question = TRAINING_QUIZ[index];

  const choose = (option: number) => {
    if (picked !== null) return;
    setPicked(option);
    if (option === question.answer) setScore((value) => value + 1);
  };

  const next = () => {
    if (index + 1 >= TRAINING_QUIZ.length) {
      const percent = Math.round((score / TRAINING_QUIZ.length) * 100);
      const updated = { best: Math.max(progress.best, percent), attempts: progress.attempts + 1 };
      setProgress(updated);
      saveProgress(updated);
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
    const percent = Math.round((score / TRAINING_QUIZ.length) * 100);
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[40px] bg-night p-7 text-paper sm:p-10">
          <Eyebrow tone="peach" index="03">Quiz complete</Eyebrow>
          <p className="mt-4 font-display text-[clamp(56px,8vw,100px)] leading-[0.9] uppercase">{percent}%</p>
          <p className="mt-3 text-[15px] text-paper/75">{score} of {TRAINING_QUIZ.length} correct.</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Btn variant="peach" onClick={restart}><RotateCcw className="size-4" /> Try again</Btn>
          </div>
        </div>
        <div className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
          <Eyebrow index="04" tone="muted">Progress</Eyebrow>
          <p className="mt-5 font-display text-[56px] leading-none">{progress.best}%</p>
          <p className="mt-2 text-[13px] text-ink-2">Best score across {progress.attempts} attempt{progress.attempts === 1 ? "" : "s"}.</p>
          <p className="mt-5 text-[12px] leading-relaxed text-muted">Saved on this device only. Retake the quiz after each training session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
        <div className="flex items-center justify-between text-[12px] font-semibold">
          <span>Question {index + 1} of {TRAINING_QUIZ.length}</span>
          <span className="font-mono text-[11px] text-muted">{score} correct</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-sand">
          <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${Math.max(4, ((index + 1) / TRAINING_QUIZ.length) * 100)}%` }} />
        </div>
        <h2 className="mt-7 min-h-[72px] text-[20px] leading-snug font-bold">{question.question}</h2>
        <div className="mt-5 space-y-2.5">
          {question.options.map((option, optionIndex) => {
            const chosen = picked === optionIndex;
            const correct = picked !== null && optionIndex === question.answer;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(optionIndex)}
                disabled={picked !== null}
                aria-pressed={chosen}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-[13.5px] font-semibold transition-colors disabled:cursor-default",
                  correct
                    ? "border-moss bg-moss-bg text-ink"
                    : chosen
                      ? "border-brick bg-brick-bg text-ink"
                      : "border-line-2 bg-card-2 hover:border-ink/60",
                )}
              >
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2", correct ? "border-moss text-moss" : chosen ? "border-brick text-brick" : "border-ink/25")}>
                  {correct ? <Check className="size-3.5" /> : String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="nrx-rise mt-5 rounded-2xl bg-sand/70 p-4 text-[12.5px] leading-relaxed text-ink-2">
            <b className="text-ink">Why:</b> {question.rationale}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Btn onClick={next} disabled={picked === null}>
            {index + 1 === TRAINING_QUIZ.length ? "See score" : "Next"} <ArrowRight className="size-4" />
          </Btn>
        </div>
      </div>

      <div className="rounded-[40px] bg-night p-7 text-paper sm:p-9">
        <Sparkles className="size-7 text-peach" />
        <p className="mt-5 font-display text-[clamp(34px,4vw,54px)] leading-[0.95] uppercase">Learn from the safety rules.</p>
        <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-paper/75">
          <li>• Regression → refer, never wait.</li>
          <li>• Positive vision/hearing rule-out → refer.</li>
          <li>• Self-harm language → helplines now.</li>
          <li>• Screening is triage, not diagnosis.</li>
        </ul>
        <p className="mt-6 text-[11.5px] leading-relaxed text-paper/50">These practice cases are synthetic. Real decisions follow your district protocol and supervisor.</p>
      </div>
    </div>
  );
}

export function Training() {
  const tr = useT();
  const [mode, setMode] = useState<Mode>("cases");
  const [selected, setSelected] = useState(TRAINING_CASES[0].id);
  const [filter, setFilter] = useState<Filter>("all");
  const visible = TRAINING_CASES.filter((item) => filter === "all" || item.module === filter);
  const active = TRAINING_CASES.find((item) => item.id === selected) ?? TRAINING_CASES[0];

  return (
    <Page>
      <Eyebrow index="01">Frontline training · sample cases</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          {tr("Practise.")}
          <br />
          <span className="text-sea">{tr("Then go help.")}</span>
        </Display>
        <div className="flex rounded-full border border-line-2 bg-card p-1" role="group" aria-label="Training mode">
          {(["cases", "quiz"] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              aria-pressed={mode === item}
              className={cn("rounded-full px-5 py-2.5 text-[12px] font-bold transition-colors", mode === item ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
            >
              {item === "cases" ? "Sample cases" : "Practice quiz"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-ink-2">
        Short, synthetic cases covering every Module A age bracket and Module B age band, plus a {TRAINING_QUIZ.length}-question quiz for new ASHA, Anganwadi and ANM workers. Progress stays on this device.
      </p>

      <Reveal className="mt-10">
        {mode === "cases" ? (
          <div className="grid items-start gap-4 lg:grid-cols-[400px_1fr]">
            <div className="rounded-[36px] border border-line-2 bg-card p-3">
              <div className="flex items-center gap-2 px-3 py-2">
                <GraduationCap className="size-4 text-rust" />
                <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">{visible.length} cases</span>
                <div className="ml-auto flex rounded-full bg-sand p-0.5" role="group" aria-label="Filter cases by module">
                  {([["all", "All"], ["A", "Module A"], ["B", "Module B"]] as [Filter, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={cn("rounded-full px-3 py-1 text-[10.5px] font-bold transition-colors", filter === value ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="mt-1 max-h-[640px] space-y-1 overflow-y-auto pr-1">
                {visible.map((item) => {
                  const on = item.id === active.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(item.id)}
                        aria-current={on ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors",
                          on ? "bg-ink text-paper" : "hover:bg-card-2",
                        )}
                      >
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold", on ? "bg-paper/15 text-paper" : "bg-sand text-ink-2")}>
                          M{item.module}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-bold">{item.title}</span>
                          <span className={cn("block text-[11px]", on ? "text-paper/55" : "text-muted")}>{item.age}{item.bracket ? ` · ${item.bracket}` : ""} · {item.signals[0]}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <CaseDetail key={active.id} item={active} />
          </div>
        ) : (
          <Quiz />
        )}
      </Reveal>
    </Page>
  );
}

