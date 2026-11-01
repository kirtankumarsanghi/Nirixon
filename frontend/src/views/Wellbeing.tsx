import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartHandshake,
  Loader2,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { maternalApi } from "../api/client";
import type { EpdsQuestion, EpdsQuestionsResponse, EpdsResult } from "../api/types";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Phase = "intro" | "quiz" | "result";

const TIER_STYLE = {
  Typical: { hex: "#8fbf5a", label: "Doing okay" },
  Monitor: { hex: "#e8b13a", label: "Worth a check-in" },
  Refer: { hex: "#ee6a4f", label: "Please talk to someone" },
} as const;

export function Wellbeing() {
  const { go, showToast } = useApp();
  const [phase, setPhase] = useState<Phase>("intro");
  const [data, setData] = useState<EpdsQuestionsResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EpdsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    maternalApi
      .getQuestions()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the wellbeing questions.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const question: EpdsQuestion | undefined = data?.questions[index];

  const choose = (value: number) => {
    if (!question) return;
    const next = { ...answers, [question.item_id]: value };
    setAnswers(next);
    if (index + 1 < (data?.questions.length ?? 0)) {
      setIndex(index + 1);
    }
  };

  const submit = async () => {
    if (!data) return;
    if (!consent) {
      setError("Please confirm consent before saving your answers.");
      return;
    }
    const missing = data.questions.filter((q) => answers[q.item_id] === undefined);
    if (missing.length) {
      setError("Please answer every question.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const scored = await maternalApi.score({
        answers: data.questions.map((q) => ({ item_id: q.item_id, value: answers[q.item_id] })),
        consent_given: true,
      });
      setResult(scored);
      setPhase("result");
      window.scrollTo({ top: 0 });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save your answers.");
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setPhase("intro");
    setIndex(0);
    setAnswers({});
    setResult(null);
    setError(null);
  };

  if (phase === "result" && result) {
    const style = TIER_STYLE[result.classification];
    return (
      <Page>
        <Eyebrow index="01">Caregiver wellbeing · EPDS</Eyebrow>
        <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Display as="h1" className="text-[clamp(48px,7vw,108px)]">
            You matter <span className="text-sea">too.</span>
          </Display>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">
            This is a wellbeing screening for you, not a diagnosis of your child. Your answers stay private.
          </p>
        </div>

        <section className="mt-10 overflow-hidden rounded-[44px] bg-night p-7 text-paper sm:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <Eyebrow tone="peach" index="02">Your result</Eyebrow>
              <p className="mt-4 font-display text-[clamp(52px,7vw,96px)] leading-[0.9] uppercase" style={{ color: style.hex }}>
                {style.label}
              </p>
              <p className="mt-3 font-mono text-[12px] tracking-[0.18em] text-paper/55 uppercase">
                EPDS total {result.total_score} / 30 · {result.classification}
              </p>
              <p className="mt-6 max-w-[470px] text-[15px] leading-relaxed text-paper/80">{result.interpretation}</p>
              {result.safety_flag && (
                <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-brick/20 p-4 text-[13px] leading-relaxed text-paper">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />
                  Some answers suggest you may be having thoughts of self-harm. Please call Tele-MANAS 14416 now or go to the nearest emergency department.
                </p>
              )}
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/[0.06] p-6">
              <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-peach uppercase">Support</p>
              <ul className="mt-4 space-y-2.5">
                {result.helplines.map((line) => (
                  <li key={line.number} className="flex items-center justify-between gap-3 text-[13px]">
                    <span><b className="font-semibold">{line.name}</b><span className="block text-[11px] text-paper/55">{line.available}</span></span>
                    <a href={`tel:${line.number.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full bg-peach px-3 py-1.5 text-[11px] font-bold text-night">
                      <PhoneCall className="size-3" /> Call
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Reveal className="mt-4">
          <section className="rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
            <Eyebrow index="03" tone="muted">What may help</Eyebrow>
            <ul className="mt-5 space-y-3">
              {result.recommendations.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-ink-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sand text-[10px] font-bold text-ink">
                    <Check className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Btn onClick={restart}><RotateCcw className="size-4" /> Check in again</Btn>
              <Btn variant="light" onClick={() => go("home")}><ArrowLeft className="size-4" /> Back home</Btn>
              <Btn variant="soft" onClick={() => go("help")}>Find help <ArrowRight className="size-4" /></Btn>
            </div>
            <p className="mt-5 text-[11.5px] leading-relaxed text-muted">
              EPDS wording and scoring are pending clinical review. This screening never replaces a conversation with a clinician.
            </p>
          </section>
        </Reveal>
      </Page>
    );
  }

  if (phase === "quiz" && data && question) {
    const progress = Math.round((index / data.questions.length) * 100);
    return (
      <Page>
        <Eyebrow index="01">Caregiver wellbeing · EPDS</Eyebrow>
        <div className="mt-5 grid items-start gap-x-14 gap-y-10 lg:grid-cols-[1fr_430px]">
          <div>
            <Display as="h1" className="text-[clamp(44px,6vw,92px)]">
              How are <span className="text-sea">you</span> doing?
            </Display>
            <p className="mt-5 max-w-[500px] text-[14.5px] leading-relaxed text-ink-2">{data.instructions}</p>
            <p className="mt-5 flex items-start gap-2 rounded-2xl bg-sand/70 p-4 text-[12px] leading-relaxed text-ink-2">
              <HeartHandshake className="mt-0.5 size-4 shrink-0 text-rust" />
              {data.disclaimer}
            </p>
          </div>

          <div className="rounded-[38px] border border-line-2 bg-card p-6 sm:p-8 lg:sticky lg:top-28">
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span>Question {index + 1} of {data.questions.length}</span>
              <span className="font-mono text-[11px] text-muted">{progress}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-sand">
              <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${Math.max(4, progress)}%` }} />
            </div>

            <h2 key={question.item_id} className="nrx-rise mt-7 min-h-[72px] text-[20px] leading-snug font-bold">
              {question.text}
            </h2>

            <div className="mt-5 space-y-2.5">
              {question.options.map((option) => {
                const active = answers[question.item_id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choose(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-[14px] font-semibold transition-colors",
                      active ? "border-ink bg-ink text-paper" : "border-line-2 bg-card-2 hover:border-ink/60",
                    )}
                  >
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", active ? "border-peach bg-peach text-night" : "border-ink/25")}>
                      {active && <Check className="size-3.5" />}
                    </span>
                    <span className="flex-1">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <Btn variant="light" size="sm" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>
                <ArrowLeft className="size-3.5" /> Back
              </Btn>
              {index + 1 === data.questions.length ? (
                <Btn size="sm" onClick={() => void submit()} disabled={busy}>
                  {busy ? <><Loader2 className="size-3.5 animate-spin" /> Saving…</> : "See result"}
                </Btn>
              ) : (
                <Btn size="sm" variant="light" onClick={() => setIndex((value) => value + 1)}>
                  Next <ArrowRight className="size-3.5" />
                </Btn>
              )}
            </div>
          </div>
        </div>
        {error && <p role="alert" className="mt-6 rounded-xl bg-brick-bg px-4 py-3 text-[12.5px] font-semibold text-brick">{error}</p>}
      </Page>
    );
  }

  return (
    <Page>
      <Eyebrow index="01">Caregiver wellbeing · EPDS</Eyebrow>
      <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          Your wellbeing.
          <br />
          <span className="text-sea">Not an afterthought.</span>
        </Display>
        <p className="max-w-[390px] text-[15px] leading-relaxed text-ink-2">
          A short, private check-in about how you have been feeling over the past week. It is separate from your child's screening and never shown to them.
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[38px] border border-line-2 bg-card p-7 sm:p-9">
          <Eyebrow index="02" tone="muted">Before you start</Eyebrow>
          <ul className="mt-6 space-y-4 text-[14px] leading-relaxed text-ink-2">
            <li className="flex items-start gap-3"><HeartHandshake className="mt-0.5 size-4 shrink-0 text-rust" /> 10 short questions, about 3 minutes.</li>
            <li className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-rust" /> If you are in immediate danger, call 112.</li>
            <li className="flex items-start gap-3"><ArrowRight className="mt-0.5 size-4 shrink-0 text-rust" /> You can stop at any time. Nothing is sent until you choose to save.</li>
          </ul>
          <label className="mt-7 flex items-start gap-3 rounded-2xl border border-line-2 bg-card-2 p-4">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 accent-[var(--color-rust)]" />
            <span className="text-[12px] leading-relaxed text-ink-2">
              <b className="text-ink">I agree to save my answers.</b> They are used only to show me this wellbeing result and support options.
            </span>
          </label>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Btn
              size="lg"
              disabled={!data || !consent}
              onClick={() => {
                setError(null);
                setPhase("quiz");
              }}
            >
              Start wellbeing check <ArrowRight className="size-4" />
            </Btn>
            <Btn variant="light" size="lg" onClick={() => go("home")}>
              <ArrowLeft className="size-4" /> Back home
            </Btn>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-brick-bg px-3 py-2 text-[12.5px] font-semibold text-brick">{error}</p>}
        </section>

        <section className="relative overflow-hidden rounded-[38px] bg-night p-7 text-paper sm:p-9">
          <HeartHandshake className="size-8 text-peach" />
          <p className="mt-6 font-display text-[clamp(34px,4vw,56px)] leading-[0.95] uppercase">
            Asking for help is a strength.
          </p>
          <p className="mt-4 text-[13.5px] leading-relaxed text-paper/70">
            Many caregivers feel overwhelmed, anxious or low. Support is available and confidential.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Chip tone="night">Tele-MANAS 14416</Chip>
            <Chip tone="night">Kiran 1800-599-0019</Chip>
          </div>
        </section>
      </div>
    </Page>
  );
}
