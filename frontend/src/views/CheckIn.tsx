import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Baby, BatteryFull, Check, GraduationCap, Lightbulb, MapPin, Printer, RotateCcw, Share2, ShieldAlert, Signal, TrendingUp, Wifi } from "lucide-react";
import { LogoMark } from "../components/Brand";
import { Photo } from "../components/Photo";
import { QuestionAudio } from "../components/QuestionAudio";
import { caregiverPlanBody, printSheet } from "../lib/printSheet";
import { loadModuleBHindi } from "../lib/moduleBHi";
import { Radar } from "../components/Radar";
import { Btn, Chip, CtaPill, Display, Eyebrow, GlowDot, Page } from "../components/ui";
import {
  DOMAINS,
  TIER_META,
  ageBand,
  domainStatus,
  evaluate,
  type CheckIn as CheckInT,
  type Scores,
  type Tier,
} from "../lib/model";
import { PHOTO } from "../photos";
import { ROLES } from "../lib/roles";
import { useApp } from "../store";
import { cn } from "../utils/cn";
import { api, getAuthToken } from "../api/client";
import type { ResultPayload, ScreenActionResponse } from "../api/types";
import { scoresFromResult, irtFromResult } from "../lib/apiAdapters";

type DesignVal = 0 | 1 | 2;
type Lang = "en" | "hi";
type Module = "A" | "B";
type Phase = "setup" | "intake" | "recall" | "safety" | "quiz" | "result";
type IntakeSetting = "home" | "school" | "both";

interface BackendQuestion {
  item_id: string;
  question_text: string;
  domain: string;
  question_number: number;
  question_cap: number;
  response_type?: string;
  scale_labels?: string | null;
}

const modules: Record<Module, { label: string; age: string; min: number; max: number; subtitle: string; note: string }> = {
  A: {
    label: "Early years",
    age: "1–59 months",
    min: 1,
    max: 59,
    subtitle: "Six areas: movement, hands, talking, people, thinking and self-help.",
    note: "A short adaptive set for the early years.",
  },
  B: {
    label: "School age",
    age: "60–144 months",
    min: 60,
    max: 144,
    subtitle: "Eight areas: attention, language, reading, writing, numbers, motor, social and emotions.",
    note: "A school-age adaptive set.",
  },
};

const ANSWER_OPTIONS: { val: DesignVal; en: string; hi: string }[] = [
  { val: 2, en: "Yes, does this consistently", hi: "हाँ, हमेशा करता/करती है" },
  { val: 1, en: "Sometimes or with help", hi: "कभी-कभी या मदद से" },
  { val: 0, en: "Not yet / significant difficulty", hi: "अभी नहीं / काफ़ी कठिनाई" },
];

const UI: Record<Lang, Record<string, string>> = {
  en: { question: "Question", tag: "Developmental check", back: "Back", complete: "complete" },
  hi: { question: "प्रश्न", tag: "विकासात्मक जाँच", back: "पीछे", complete: "पूर्ण" },
};

const REGRESSION_Q: Record<Lang, string> = {
  en: "Has the child stopped doing something they used to do?",
  hi: "क्या बच्चे ने कोई ऐसा काम करना बंद कर दिया जो पहले करता था?",
};

const MODULE_A_DOMAINS = ["gross", "fine", "comm", "social", "cog", "adaptive"];
const MODULE_B_DOMAINS = ["attention", "listening_speaking", "reading", "writing", "numbers", "motor", "social", "emotion_conduct"];
const DESIGN_OF: Record<string, string> = {
  gross_motor: "gross",
  fine_motor: "fine",
  communication: "comm",
  personal_social: "social",
  cognitive: "cog",
  self_help: "adaptive",
};
const designDomain = (k: string) => DESIGN_OF[k] ?? k;
const moduleForAge = (m: number): Module => (m >= 60 ? "B" : "A");
const barW = (z: number) => `${((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100}%`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Connection problem — please try again.");

/** Map the design's 3-option answer onto the backend's expected value. */
function toBackendAnswer(responseType: string | undefined, val: DesignVal): number | string {
  if (responseType === "likert5") return val === 2 ? 5 : val === 1 ? 3 : 1;
  if (responseType === "yesno") return val === 2 ? "Yes" : val === 1 ? "Not sure" : "No";
  if (responseType === "yes_no") return val === 0 ? 0 : 1;
  return val; // frequency (0/1/2)
}

export function CheckIn() {
  const { role, children, checkInTarget, setCheckInTarget, patchChild, reload, go, showToast, lang, setLang } = useApp();
  const assisting = role !== "parent";
  const initialChild = children.find((c) => c.id === checkInTarget);
  const initialAge = initialChild?.ageMonths ?? (assisting ? 30 : 39);

  const [phase, setPhase] = useState<Phase>("setup");
  const [target, setTarget] = useState<string>(() => checkInTarget ?? "");
  const targetChild = children.find((c) => c.id === target);
  const [name, setName] = useState(assisting ? "" : "Aarav");
  const [module, setModule] = useState<Module>(() => moduleForAge(initialAge));
  const [age, setAge] = useState(() => Math.max(1, Math.min(144, initialAge)));
  const [regression, setRegression] = useState(false);
  const [picked, setPicked] = useState<DesignVal | null>(null);
  const [result, setResult] = useState<CheckInT | null>(null);
  const [backendResult, setBackendResult] = useState<ResultPayload | null>(null);

  // Backend-driven flow
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<BackendQuestion | null>(null);
  const [answers, setAnswers] = useState<Record<string, { sum: number; n: number }>>({});
  const [busy, setBusy] = useState(false);

  // Module B: free-text intake, recall-help chips and the safety notice.
  const [intakeText, setIntakeText] = useState("");
  const [intakeChips, setIntakeChips] = useState<string[]>([]);
  const [intakeSetting, setIntakeSetting] = useState<IntakeSetting>("both");
  const [recallOptions, setRecallOptions] = useState<Record<string, string>>({});
  const [recallMessage, setRecallMessage] = useState("");
  const [recallPicked, setRecallPicked] = useState<string[]>([]);
  const [safetyMessage, setSafetyMessage] = useState("");
  const [helplines, setHelplines] = useState<Record<string, string>>({});
  const [moduleBHi, setModuleBHi] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (module !== "B") return;
    let cancelled = false;
    void loadModuleBHindi().then((map) => {
      if (!cancelled) setModuleBHi(map);
    });
    return () => {
      cancelled = true;
    };
  }, [module]);

  useEffect(() => () => setCheckInTarget(null), [setCheckInTarget]);

  const groups = useMemo(
    () => ({
      unsc: children.filter((c) => c.status === "unscreened"),
      over: children.filter((c) => c.status === "overdue"),
      rest: children.filter((c) => c.status !== "unscreened" && c.status !== "overdue"),
    }),
    [children]
  );

  const expectedDomains = module === "A" ? MODULE_A_DOMAINS : MODULE_B_DOMAINS;
  const previewScores = useMemo(() => {
    const s: Scores = {};
    for (const [dom, { sum, n }] of Object.entries(answers)) {
      if (n > 0) s[dom] = -2.5 + (sum / n / 2) * 2.9;
    }
    return s;
  }, [answers]);
  const answeredAny = Object.keys(answers).length > 0;
  const liveEv = evaluate(previewScores, regression);
  const liveMeta = TIER_META[liveEv.tier];
  const qNumber = question?.question_number ?? 1;
  const qCap = question?.question_cap ?? 10;
  const pct = Math.round(((qNumber - 1) / Math.max(1, qCap)) * 100);
  const doneCount = Object.keys(answers).length;
  const moduleMeta = modules[module];

  const persistSession = (sid: string | null) => {
    setSessionId(sid);
    try {
      if (sid) sessionStorage.setItem("nirixon_screen_session_id", sid);
      else sessionStorage.removeItem("nirixon_screen_session_id");
    } catch {
      /* restricted storage */
    }
  };

  const finalize = useCallback(
    (rp: ResultPayload, sid: string, ageMonths: number) => {
      const scores = scoresFromResult(rp);
      const irt = irtFromResult(rp);
      const child = targetChild ? targetChild.id : name.trim() || (assisting ? "Walk-in child" : "Aarav");
      const tier = (rp.final_classification as Tier) ?? "Typical";
      const ci: CheckInT = {
        id: sid,
        date: new Date().toISOString().slice(0, 10),
        ageMonths,
        child,
        scores,
        irt,
        tier,
        probs: {
          typical: rp.probabilities?.Typical ?? 0,
          monitor: rp.probabilities?.Monitor ?? 0,
          refer: rp.probabilities?.Refer ?? 0,
        },
        regression: rp.safety_override_triggered,
        source: "live",
        module,
      };
      setResult(ci);
      setBackendResult(rp);
      setPhase("result");
      persistSession(null);
      if (targetChild) {
        patchChild(targetChild.id, {
          scores,
          status: tier === "Typical" ? "ontrack" : tier === "Monitor" ? "watch" : "refer",
          visits: targetChild.visits + 1,
          lastVisitDays: 0,
          handoff: tier === "Refer" ? "queued" : targetChild.handoff,
        });
      } else {
        reload(); // refresh the real saved history
      }
      window.scrollTo({ top: 0 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetChild, name, assisting, module, patchChild, reload]
  );

  const applyAction = useCallback(
    async (res: ScreenActionResponse, ageMonths: number) => {
      if (res.session_id) persistSession(res.session_id);
      if (res.type === "question" && res.question) {
        setQuestion(res.question as unknown as BackendQuestion);
        setPhase("quiz");
        return;
      }
      if (res.type === "complete" && res.result) {
        finalize(res.result, res.session_id ?? sessionId ?? `live-${Date.now()}`, ageMonths);
        return;
      }
      if (res.type === "intake_required" && res.session_id) {
        // Module B routes on a short caregiver note, so collect it here rather
        // than posting an empty one (which the backend rejects with 422).
        persistSession(res.session_id);
        setIntakeText("");
        setIntakeChips([]);
        setPhase("intake");
        return;
      }
      if (res.type === "recall_help") {
        setRecallOptions(res.recall_options ?? {});
        setRecallMessage(res.recall_message ?? "");
        setRecallPicked([]);
        setPhase("recall");
        return;
      }
      if (res.type === "safety_notice") {
        setSafetyMessage(res.safety_message ?? "");
        setHelplines(res.helplines ?? {});
        setPhase("safety");
        return;
      }
      if (res.type === "done") {
        // The engine finished without an inline result — pull the saved one.
        const sid = res.session_id ?? sessionId;
        if (sid) {
          try {
            finalize(await api.getResult(sid), sid, ageMonths);
            return;
          } catch (e) {
            showToast(errMsg(e));
          }
        }
        setPhase("setup");
        return;
      }
      setPhase("setup");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalize, sessionId, showToast]
  );

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setPicked(null);
    setResult(null);
    setBackendResult(null);
    setAnswers({});
    setQuestion(null);
    try {
      const res = await api.startScreen({
        corrected_age_months: age,
        question_cap: 10,
        module,
        consent_given: true,
        child_ref: targetChild?.id ?? "",
        child_name: !targetChild && name.trim() ? name.trim() : undefined,
      });
      await applyAction(res, age);
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (val: DesignVal) => {
    if (picked !== null || busy || !question || !sessionId) return;
    setPicked(val);
    setBusy(true);
    const dom = designDomain(question.domain);
    setAnswers((prev) => {
      const cur = prev[dom] ?? { sum: 0, n: 0 };
      return { ...prev, [dom]: { sum: cur.sum + val, n: cur.n + 1 } };
    });
    try {
      const res = await api.submitAnswer(sessionId, {
        item_id: question.item_id,
        answer: toBackendAnswer(question.response_type, val) as unknown as number,
        source: "recall",
      });
      setPicked(null);
      await applyAction(res, age);
    } catch (e) {
      setAnswers((prev) => {
        const cur = prev[dom];
        if (!cur) return prev;
        const next = { ...prev };
        if (cur.n <= 1) delete next[dom];
        else next[dom] = { sum: cur.sum - val, n: cur.n - 1 };
        return next;
      });
      setPicked(null);
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** Module B: send the caregiver's note (and any chips) to the NLP router. */
  const submitIntakeForm = async () => {
    if (busy || !sessionId) return;
    const text = intakeText.trim();
    if (!text && intakeChips.length === 0) {
      showToast("Please describe what you've noticed, or pick an area of concern.");
      return;
    }
    setBusy(true);
    try {
      const ir = await api.submitIntake(sessionId, { text, chips: intakeChips, setting: intakeSetting });
      if (ir.action) {
        await applyAction(ir.action, age);
        return;
      }
      if (ir.question) {
        setQuestion(ir.question as unknown as BackendQuestion);
        setPhase("quiz");
        return;
      }
      if (ir.next_action === "recall_help") {
        setRecallOptions(
          ir.recall_options ?? Object.fromEntries((ir.recall_help_options ?? []).map((d) => [d, DOMAINS[d]?.label ?? d]))
        );
        setRecallMessage(ir.recall_message ?? "");
        setRecallPicked([]);
        setPhase("recall");
        return;
      }
      if (ir.next_action === "safety_notice") {
        setSafetyMessage(ir.safety_message ?? "");
        setHelplines(ir.helplines ?? {});
        setPhase("safety");
        return;
      }
      showToast(ir.recall_message || "Please add a little more detail so we can pick the right questions.");
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** Module B: resume the questionnaire with the areas the caregiver picked. */
  const submitRecallForm = async () => {
    if (busy || !sessionId) return;
    if (recallPicked.length === 0) {
      showToast("Pick at least one area to continue.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.submitRecall(sessionId, { domains: recallPicked });
      setRecallPicked([]);
      await applyAction(res, age);
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** Module B: continue past the safety notice into the safety questions. */
  const continueAfterSafety = async () => {
    if (busy || !sessionId) return;
    setBusy(true);
    try {
      await applyAction(await api.nextAction(sessionId), age);
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** Leave the Module B pre-quiz screens and start over. */
  const cancelToSetup = () => {
    persistSession(null);
    setPhase("setup");
    setQuestion(null);
    setResult(null);
    setBackendResult(null);
    setAnswers({});
    setIntakeText("");
    setIntakeChips([]);
    setRecallPicked([]);
  };

  // Resume an in-flight session on reload.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem("nirixon_screen_session_id");
    } catch {
      saved = null;
    }
    if (!saved) return;
    // Don't fire an unauthenticated request for a stale id from a previous session.
    if (!getAuthToken()) {
      persistSession(null);
      return;
    }
    (async () => {
      try {
        const s = await api.getSession(saved);
        if (s.completed && s.result) {
          finalize(s.result, saved, Math.round(s.corrected_age_months));
        } else if (s.next_question) {
          setSessionId(saved);
          setAge(Math.round(s.corrected_age_months));
          setModule((s.module ?? moduleForAge(s.corrected_age_months)) as Module);
          setQuestion(s.next_question as unknown as BackendQuestion);
          setPhase("quiz");
        } else if ((s.module ?? moduleForAge(s.corrected_age_months)) === "B") {
          // Module B in flight but no question queued yet — it still needs its intake note.
          setSessionId(saved);
          setAge(Math.round(s.corrected_age_months));
          setModule("B");
          setPhase("intake");
        }
      } catch {
        try {
          sessionStorage.removeItem("nirixon_screen_session_id");
        } catch {
          /* ignore */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "quiz") return;
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) void submit(ANSWER_OPTIONS[i].val);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const chooseModule = (next: Module) => {
    setModule(next);
    setAge((current) => (current >= modules[next].min && current <= modules[next].max ? current : next === "A" ? 36 : 96));
    if (targetChild && moduleForAge(targetChild.ageMonths) !== next) setTarget("");
  };

  /* ============================== SETUP ============================== */
  if (phase === "setup") {
    return (
      <Page>
        <Eyebrow index="01">{assisting ? `Assisting as ${ROLES[role].short}` : "Family check-in"}</Eyebrow>
        <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
            {assisting ? "Screen a" : "Start a"}
            <br />
            <span className="text-sea">{assisting ? "child." : "check-in."}</span>
          </Display>
          <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
            A short adaptive set of questions, one developmental area at a time. It skips ahead when answers are consistent.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-9 rounded-[36px] border border-line-2 bg-card p-7 sm:p-10">
            <div>
              <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Choose age pathway</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["A", "B"] as Module[]).map((m) => {
                  const cfg = modules[m];
                  const active = module === m;
                  const Icon = m === "A" ? Baby : GraduationCap;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => chooseModule(m)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-[26px] border p-5 text-left transition-all duration-300 hover:-translate-y-0.5",
                        active ? "border-ink bg-ink text-paper shadow-[0_18px_30px_-22px_rgba(31,20,9,.8)]" : "border-line-2 bg-card-2 hover:border-ink"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Icon className={cn("size-5", active ? "text-peach" : "text-rust")} />
                        <span className={cn("font-mono text-[10px] font-semibold tracking-[0.16em] uppercase", active ? "text-paper/60" : "text-muted")}>Module {m}</span>
                      </div>
                      <p className="mt-5 font-display text-[30px] leading-none uppercase">{cfg.label}</p>
                      <p className={cn("mt-2 text-[12px] font-semibold", active ? "text-paper/75" : "text-ink-2")}>{cfg.age}</p>
                      <p className={cn("mt-2 text-[11.5px] leading-relaxed", active ? "text-paper/55" : "text-muted")}>{cfg.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {assisting && (
              <label className="block">
                <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Which child?</span>
                <select
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    const c = children.find((x) => x.id === e.target.value);
                    if (c) {
                      setAge(Math.max(1, Math.min(144, c.ageMonths)));
                      setModule(moduleForAge(c.ageMonths));
                    }
                  }}
                  className="nrx-select w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 pr-12 font-mono text-[14px] font-semibold focus:border-sea focus:outline-none"
                >
                  <option value="">Walk-in child (not in caseload)</option>
                  <optgroup label={`Needs first check (${groups.unsc.length})`}>
                    {groups.unsc.map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.ageMonths} mo</option>
                    ))}
                  </optgroup>
                  <optgroup label={`Overdue visit (${groups.over.length})`}>
                    {groups.over.map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.ageMonths} mo</option>
                    ))}
                  </optgroup>
                  <optgroup label="Everyone else">
                    {groups.rest.map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.ageMonths} mo</option>
                    ))}
                  </optgroup>
                </select>
              </label>
            )}

            {!targetChild && (
              <label className="block">
                <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Child’s first name (optional)</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav"
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 text-[16px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
            )}

            <div>
              <div className="mb-3 flex items-end justify-between">
                <span className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Corrected age</span>
                 <span className="font-mono text-[11px] text-muted">Module {module} · bracket {ageBand(age)}</span>
              </div>
              <p className="font-display text-[84px] leading-none">
                {age}
                <span className="ml-2 text-[28px] text-muted">months</span>
              </p>
              <p className="mt-1 text-[13px] text-ink-2">about {(age / 12).toFixed(1).replace(".0", "")} years</p>
              <input
                type="range"
                min={moduleMeta.min}
                max={moduleMeta.max}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="nrx-range mt-4"
                style={{ ["--fill" as string]: `${((age - moduleMeta.min) / (moduleMeta.max - moduleMeta.min)) * 100}%`, ["--fill-color" as string]: "var(--color-ink)", ["--thumb" as string]: "#b9501f" }}
                aria-label="Corrected age in months"
              />
              <div className="flex justify-between font-mono text-[10px] text-muted">
                <span>{moduleMeta.min} mo</span>
                <span>{moduleMeta.max} mo</span>
              </div>
            </div>

            <div>
              <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Language</span>
              <div className="inline-flex rounded-full border border-line-2 bg-card-2 p-1">
                {(["en", "hi"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={cn("rounded-full px-7 py-3 text-[14px] font-bold transition-all", lang === l ? "bg-ink text-paper" : "text-ink-2")}
                  >
                    {l === "en" ? "English" : "हिन्दी"}
                  </button>
                ))}
              </div>
            </div>

            <CtaPill onClick={begin}>Begin check-in</CtaPill>
          </div>

          <aside className="relative min-h-[420px] overflow-hidden rounded-[36px] bg-night text-paper">
            <Photo src={PHOTO.blocksGirl} alt="" wrapperClassName="absolute inset-0" className="opacity-55" eager />
            <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/20" />
            <div className="relative flex h-full min-h-[420px] flex-col justify-end p-8">
              <Eyebrow tone="peach" index="02">Module {module} · {moduleMeta.label}</Eyebrow>
              <ul className="mt-5 space-y-4">
                {[
                  ["6–12", "questions, one area at a time"],
                  ["≈5", "minutes with your child"],
                  ["1·2·3", "keyboard shortcuts for answers"],
                ].map(([a, b]) => (
                  <li key={a} className="flex items-baseline gap-4 border-b border-white/10 pb-4">
                    <span className="w-24 font-display text-[40px] leading-none text-peach">{a}</span>
                    <span className="text-[14px] text-paper/80">{b}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[12px] leading-relaxed text-paper/60">
                {moduleMeta.note}
              </p>
            </div>
          </aside>
        </div>
      </Page>
    );
  }

  /* ============================== RESULT ============================== */
  if (phase === "result" && result) {
    const base = evaluate(result.scores, result.regression);
    // A safety override is not a score: the engine deliberately keeps the domain
    // verdicts but refers regardless (final_classification can still read
    // "Typical"), so the headline has to show the override, not the score tier.
    const override = result.regression || base.safety;
    const tier = override ? "Refer" : (result.tier ?? base.tier);
    const meta = TIER_META[tier];
    const safety = override;
    const reason = backendResult?.summary || (backendResult?.caveats?.length ? backendResult.caveats.join(" ") : base.reason);
    const lows = [...Object.keys(result.scores)].sort((a, b) => result.scores[a] - result.scores[b]).slice(0, tier === "Typical" ? 1 : 2);
    const activityFor = (k: string) => {
      const acts = (backendResult?.activities as Record<string, unknown> | undefined)?.[k];
      if (Array.isArray(acts) && acts.length) {
        const a = acts[0];
        if (typeof a === "string") return a;
        if (a && typeof a === "object" && "title" in a) return String((a as { title: unknown }).title);
      }
      return DOMAINS[k]?.activity ?? "";
    };
    const printPlan = () => {
      const items = lows
        .map((k) => {
          const acts = (backendResult?.activities as Record<string, unknown> | undefined)?.[k];
          const raw = Array.isArray(acts) && acts.length ? acts[0] : null;
          const obj = raw && typeof raw === "object" ? (raw as { title?: string; steps?: string; minutes?: number }) : null;
          return {
            label: DOMAINS[k]?.label ?? k,
            activity: (typeof raw === "string" ? raw : obj?.title) ?? DOMAINS[k]?.activity ?? "",
            detail: obj?.steps ?? (obj?.minutes ? `${obj.minutes} min` : undefined),
          };
        })
        .filter((i) => i.activity);
      printSheet(
        "Nirixon home activities",
        caregiverPlanBody(items, {
          childId: targetChild?.id,
          date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
        }),
      );
    };
    return (
      <Page>
        <section className="relative overflow-hidden rounded-[44px] bg-night text-paper">
          <div className="relative grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:p-14">
            <div>
              <Eyebrow tone="peach" index="01">Check-in complete</Eyebrow>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip tone="night">Module {result.module ?? module}</Chip>
                <Chip tone="night">{result.ageMonths} months · {ageBand(result.ageMonths)}</Chip>
                {backendResult?.triage_tier && <Chip tone="night">{backendResult.triage_tier}</Chip>}
              </div>
              <div className="mt-8 flex items-center gap-5">
                <GlowDot hex={meta.hexLight} glow={meta.glow} size={58} />
                <span className="font-mono text-[11px] tracking-[0.24em] text-paper/60 uppercase">Result tier</span>
              </div>
              <h1 className="nrx-pop mt-4 font-display text-[clamp(72px,10vw,150px)] leading-[0.86] uppercase" style={{ color: meta.hexLight }}>
                {tier}
              </h1>
              <p className="mt-2 font-display text-[clamp(26px,3vw,44px)] leading-none text-peach uppercase">({meta.hint})</p>
              <p className="mt-6 max-w-[470px] text-[15px] leading-relaxed text-paper/75">{meta.summary}</p>
              <p className="mt-4 flex max-w-[470px] items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12.5px] leading-relaxed text-paper/80">
                {safety && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />}
                <span><b className="text-paper">Why: </b>{reason}</span>
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[12px] font-semibold">
                <Check className="size-4 text-[#8fbf5a]" />
                {assisting
                  ? targetChild
                    ? `${targetChild.id} updated in the Ward 12 caseload${tier === "Refer" ? " · handoff queued" : ""}`
                    : "Walk-in result — not linked to a caseload record"
                  : `Saved to ${result.child}’s growth history`}
              </p>
            </div>
            <div>
              <Radar scores={result.scores} irt={result.irt} tone={meta.hexLight} />
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
            <Eyebrow index="02" tone="muted">{tier === "Typical" ? "Keep this going" : "Try these first"}</Eyebrow>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {lows.map((k) => (
                <div key={k} className="rounded-[26px] bg-rust p-6 text-white">
                  <Lightbulb className="size-6" />
                  <p className="mt-4 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase opacity-80">
                    {DOMAINS[k]?.label ?? k} · {domainStatus(result.scores[k]).label}
                  </p>
                  <p className="mt-2 font-display text-[26px] leading-[1.05] uppercase">{activityFor(k)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-[36px] border border-line-2 bg-sand/60 p-7 sm:p-9">
            <div>
              <Eyebrow index="03" tone="muted">Next step</Eyebrow>
              <p className="mt-5 font-display text-[34px] leading-[1.02] uppercase">{meta.next}</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {assisting ? (
                <Btn onClick={() => go(role === "clinician" ? "clinical" : "caseload")}><ArrowLeft className="size-4" /> Back to {role === "clinician" ? "clinical check" : "caseload"}</Btn>
              ) : (
                <>
                  <Btn onClick={() => go("growth")}><TrendingUp className="size-4" /> See growth</Btn>
                  <Btn variant="light" onClick={() => go("share")}><Share2 className="size-4" /> Share</Btn>
                </>
              )}
              <Btn variant={tier === "Refer" ? "rust" : "light"} onClick={() => go("help")}><MapPin className="size-4" /> Find help</Btn>
              <Btn variant="light" onClick={printPlan}><Printer className="size-4" /> Print plan</Btn>
              <Btn variant="soft" onClick={() => { setPhase("setup"); setResult(null); setBackendResult(null); setTarget(""); setQuestion(null); setAnswers({}); persistSession(null); window.scrollTo({ top: 0 }); }}>
                <RotateCcw className="size-4" /> Another
              </Btn>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  /* ========================= INTAKE (Module B) ========================= */
  if (phase === "intake") {
    return (
      <Page>
        <Eyebrow index="01">{assisting ? `Assisting as ${ROLES[role].short}` : "Module B · School age"}</Eyebrow>
        <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <Display as="h1" className="text-[clamp(48px,7vw,108px)]">
            What have you
            <br />
            <span className="text-sea">noticed?</span>
          </Display>
          <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
            Write it the way you would explain it to a friend. It is read once to choose the right questions — you can still add areas by hand.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-7 rounded-[36px] border border-line-2 bg-card p-7 sm:p-10">
            <label className="block">
              <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">In your own words</span>
              <textarea
                value={intakeText}
                onChange={(e) => setIntakeText(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="e.g. He loses focus in class, the teacher says he is falling behind in reading, and he avoids homework."
                className="w-full resize-y rounded-2xl border border-line-2 bg-card-2 px-5 py-4 text-[15px] leading-relaxed focus:border-sea focus:outline-none"
              />
            </label>

            <div>
              <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Areas you are already worried about</span>
              <div className="flex flex-wrap gap-2">
                {MODULE_B_DOMAINS.map((d) => {
                  const on = intakeChips.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setIntakeChips((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-4 py-2 text-[13px] font-semibold transition-all",
                        on ? "border-ink bg-ink text-paper" : "border-line-2 bg-card-2 text-ink-2 hover:border-ink/50"
                      )}
                    >
                      {DOMAINS[d]?.plain ?? d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-3 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Where do you see this?</span>
              <div className="inline-flex rounded-full border border-line-2 bg-card-2 p-1">
                {(["home", "school", "both"] as IntakeSetting[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setIntakeSetting(s)}
                    aria-pressed={intakeSetting === s}
                    className={cn("rounded-full px-6 py-3 text-[14px] font-bold capitalize transition-all", intakeSetting === s ? "bg-ink text-paper" : "text-ink-2")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <CtaPill onClick={submitIntakeForm}>{busy ? "Reading your note…" : "Continue"}</CtaPill>
              <Btn variant="soft" onClick={cancelToSetup}>Cancel</Btn>
            </div>
          </div>

          <aside className="relative min-h-[320px] overflow-hidden rounded-[36px] bg-night p-8 text-paper">
            <ShieldAlert className="size-6 text-peach" />
            <p className="mt-5 font-mono text-[10.5px] font-semibold tracking-[0.22em] text-peach uppercase">What happens to this</p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-paper/75">
              Your note is read once on the server to pick question areas, then discarded. Only an anonymised fingerprint is kept for the audit trail —
              the text itself is never stored.
            </p>
            <p className="mt-5 text-[12px] leading-relaxed text-paper/55">
              Prefer not to write anything? Pick the areas above instead; the check-in works either way.
            </p>
          </aside>
        </div>
      </Page>
    );
  }

  /* ========================= RECALL HELP (Module B) ========================= */
  if (phase === "recall") {
    const options = Object.entries(recallOptions);
    return (
      <Page>
        <Eyebrow index="01">Module B · School age</Eyebrow>
        <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,96px)]">
          Which of these <span className="text-sea">sound familiar?</span>
        </Display>
        <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-ink-2">
          {recallMessage || "Your note was a little general, so pick the areas you would like us to look at more closely."}
        </p>

        <div className="mt-10 max-w-[860px] rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map(([key, label]) => {
              const on = recallPicked.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRecallPicked((prev) => (on ? prev.filter((x) => x !== key) : [...prev, key]))}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-3.5 rounded-[22px] border px-5 py-4 text-left text-[14px] font-semibold transition-all",
                    on ? "border-ink bg-ink text-paper" : "border-line-2 bg-card-2 hover:border-ink/50"
                  )}
                >
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors", on ? "border-peach bg-peach text-night" : "border-ink/25")}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="flex-1 capitalize">{label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaPill onClick={submitRecallForm}>{busy ? "Starting…" : "Continue"}</CtaPill>
            <Btn variant="soft" onClick={cancelToSetup}>Cancel</Btn>
          </div>
        </div>
      </Page>
    );
  }

  /* ========================= SAFETY NOTICE (Module B) ========================= */
  if (phase === "safety") {
    return (
      <Page>
        <div className="mx-auto max-w-[720px]">
          <div className="rounded-[36px] border border-brick/40 bg-brick-bg p-8 sm:p-10">
            <ShieldAlert className="size-8 text-brick" />
            <Display as="h1" className="mt-6 text-[clamp(38px,5vw,64px)]">
              Please read this first.
            </Display>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
              {safetyMessage || "Something you shared suggests it is worth talking to someone now."}
            </p>

            {Object.keys(helplines).length > 0 && (
              <ul className="mt-7 space-y-3">
                {Object.entries(helplines).map(([key, text]) => {
                  const number = text.match(/[0-9][0-9\- ]{3,}/)?.[0]?.trim();
                  return (
                    <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 px-5 py-4">
                      <span className="text-[14px] font-semibold">{text}</span>
                      {number && (
                        <a
                          href={`tel:${number.replace(/[^0-9+]/g, "")}`}
                          className="rounded-full bg-brick px-5 py-2 text-[13px] font-bold text-white"
                        >
                          Call
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Btn size="lg" variant="rust" onClick={continueAfterSafety} disabled={busy}>
                {busy ? "Continuing…" : "Continue the check-in"}
              </Btn>
              <Btn size="lg" variant="light" onClick={cancelToSetup}>Stop here</Btn>
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-muted">
              These helplines are free and confidential. If anyone is in immediate danger, call 112.
            </p>
          </div>
        </div>
      </Page>
    );
  }

  /* =============================== QUIZ =============================== */
  const ui = UI[lang];
  const qText = question?.question_text ?? "";

  return (
    <Page>
      <div className="grid items-start gap-x-14 gap-y-10 lg:grid-cols-[1fr_430px]">
        <div className="lg:col-start-1 lg:row-start-1">
          <Eyebrow index="01">{assisting ? `Assisting as ${ROLES[role].short}` : "Try it together"}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(48px,7vw,108px)]">
            Tap an answer.
            <br />
            <span className="text-sea">Watch the picture form.</span>
          </Display>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-ink-2">
            Every tap updates the result on the right — and the reasons behind it. Press <b>1</b>, <b>2</b> or <b>3</b> to answer without touching the screen.
          </p>
        </div>

        {/* phone */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-28">
          <div className="relative mx-auto w-full max-w-[410px] rounded-[60px] bg-ink p-[11px] shadow-[0_70px_100px_-45px_rgba(31,20,9,0.95)]">
            <div className="relative flex min-h-[700px] flex-col overflow-hidden rounded-[50px] bg-card">
              <div className="relative flex items-center justify-between px-9 pt-5 text-[12.5px] font-bold">
                <span>9:41</span>
                <span className="absolute top-3.5 left-1/2 h-[28px] w-[112px] -translate-x-1/2 rounded-full bg-ink" />
                <span className="flex items-center gap-1.5">
                  <Signal className="size-3.5" />
                  <Wifi className="size-3.5" />
                  <BatteryFull className="size-4" />
                </span>
              </div>

              <div className="mt-6 flex items-center gap-3 px-6">
                <LogoMark size={38} />
                <div className="leading-tight">
                  <p className="text-[14.5px] font-bold">Nirixon</p>
                  <p className="text-[12px] text-muted">{targetChild ? targetChild.id : name || "Sample child"} · {age} months · Module {module}</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {question && (
                    <QuestionAudio
                      itemId={question.item_id}
                      lang={lang}
                      text={qText}
                      hindiText={moduleBHi?.[question.item_id]}
                    />
                  )}
                  <button
                    onClick={() => setLang(lang === "en" ? "hi" : "en")}
                    className="rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] font-bold transition-colors hover:bg-sand"
                    aria-label="Switch language"
                  >
                    {lang === "en" ? "हिन्दी" : "EN"}
                  </button>
                </div>
              </div>

              <div className="mt-5 px-6">
                <div className="flex items-center justify-between text-[12px] font-semibold">
                  <span>{ui.question} {qNumber} {lang === "en" ? `of ~${qCap}` : `/ ~${qCap}`}</span>
                  <span className="font-mono text-[11px] text-muted">{pct}% {ui.complete}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-sand">
                  <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </div>

              <div className="mt-7 flex-1 px-6">
                <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-rust uppercase">{ui.tag}</p>
                <h2 key={qNumber} className="nrx-rise mt-3 min-h-[96px] text-[20px] leading-snug font-bold">{qText}</h2>
                <div className="mt-5 space-y-2.5">
                  {ANSWER_OPTIONS.map((a, i) => (
                    <button
                      key={a.val}
                      onClick={() => void submit(a.val)}
                      disabled={busy}
                      className={cn(
                        "group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-4 text-left text-[14.5px] font-semibold transition-all duration-200 disabled:opacity-60",
                        picked === a.val ? "scale-[0.98] border-ink bg-ink text-paper" : "border-line-2 bg-card-2 hover:border-ink/60"
                      )}
                    >
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors", picked === a.val ? "border-peach bg-peach text-night" : "border-ink/30")}>
                        {picked === a.val && <Check className="size-3.5" />}
                      </span>
                      <span className="flex-1">{a[lang]}</span>
                      <span className="hidden font-mono text-[10px] text-muted sm:block">{i + 1}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-6 mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
                <p className="text-[12.5px] leading-snug font-semibold">{REGRESSION_Q[lang]}</p>
                <button
                  role="switch"
                  aria-checked={regression}
                  aria-label={REGRESSION_Q.en}
                  onClick={() => setRegression((r) => !r)}
                  className={cn("relative h-7 w-[50px] shrink-0 rounded-full transition-colors duration-300", regression ? "bg-brick" : "bg-sand")}
                >
                  <span className={cn("absolute top-1 size-5 rounded-full shadow transition-all duration-300", regression ? "left-[26px] bg-white" : "left-1 bg-ink")} />
                </button>
              </div>

              <div className="flex items-center justify-between px-6 pt-4 pb-6">
                <button
                  disabled
                  className="flex items-center gap-1.5 text-[13px] font-bold text-ink-2 disabled:opacity-30"
                >
                  <ArrowLeft className="size-4" /> {ui.back}
                </button>
                <span className="font-mono text-[10px] text-muted">{doneCount}/{qCap} areas</span>
              </div>
            </div>
          </div>
        </div>

        {/* live result */}
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="rounded-[40px] bg-night p-7 text-paper sm:p-10">
            <Eyebrow tone="peach" index="02">Result so far</Eyebrow>
            <div className="mt-7 flex items-center gap-6">
              <GlowDot hex={answeredAny ? liveMeta.hexLight : "#6b5a44"} glow={answeredAny ? liveMeta.glow : "rgba(0,0,0,0)"} size={64} />
              <div>
                <p className="font-mono text-[10.5px] tracking-[0.22em] text-paper/55 uppercase">Leaning</p>
                <p
                  key={answeredAny ? liveEv.tier : "none"}
                  className="nrx-pop font-display text-[clamp(52px,6vw,88px)] leading-[0.9] uppercase"
                  style={{ color: answeredAny ? liveMeta.hexLight : "rgba(255,244,220,.35)" }}
                >
                  {answeredAny ? liveEv.tier : "Waiting…"}
                </p>
              </div>
            </div>

            <ul className="mt-9 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {expectedDomains.map((k) => {
                const st = answers[k] ? "done" : "none";
                const z = previewScores[k] ?? 0;
                const s = domainStatus(z);
                return (
                  <li key={k}>
                    <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
                      <span className={cn("font-semibold", st === "none" && "text-paper/40")}>{DOMAINS[k]?.label ?? k}</span>
                      <span className="font-mono text-[10.5px]" style={{ color: st === "none" ? "rgba(255,244,220,.3)" : s.hex === "#46692a" ? "#8fbf5a" : s.hex }}>
                        {st === "none" ? "waiting" : s.label}
                      </span>
                    </div>
                    <div className={cn("h-2.5 overflow-hidden rounded-full", st === "none" ? "border border-dashed border-white/20" : "bg-white/10")}>
                      {st !== "none" && (
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: barW(z), background: s.hex === "#46692a" ? "#8fbf5a" : s.hex }}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-white/[0.06] p-4 text-[12.5px] leading-relaxed text-paper/80">
              {regression || (answeredAny && liveEv.safety) ? (
                <>
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />
                  <span><b className="text-paper">Safety rule active.</b> {liveEv.reason}</span>
                </>
              ) : (
                <>
                  <Chip tone="night">Live</Chip>
                  <span>{answeredAny ? liveEv.reason : "Answer the first question and the picture starts to form."}</span>
                </>
              )}
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
            <ArrowRight className="size-3.5" /> This preview is indicative; the final tier is calculated by the server when the check-in completes.
          </p>
        </div>
      </div>
    </Page>
  );
}
