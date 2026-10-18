import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Baby, BatteryFull, Check, GraduationCap, Lightbulb, MapPin, RotateCcw, Share2, ShieldAlert, Signal, TrendingUp, Wifi } from "lucide-react";
import { LogoMark } from "../components/Brand";
import { Photo } from "../components/Photo";
import { Radar } from "../components/Radar";
import { Btn, Chip, CtaPill, Display, Eyebrow, GlowDot, Page } from "../components/ui";
import { ANSWERS, MODULES, QUESTION_BANK, REGRESSION_Q, SCHOOL_ACTIVITIES, UI, domainScore, moduleForAge, type Lang, type Module } from "../lib/questions";
import {
  DOMAINS,
  DOMAIN_KEYS,
  TIER_META,
  ageBand,
  domainStatus,
  evaluate,
  type CheckIn as CheckInT,
  type Domain,
  type Scores,
} from "../lib/model";
import { PHOTO } from "../photos";
import { ROLES } from "../lib/roles";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Val = 0 | 1 | 2;
type Level = "B" | "A";
interface Entry {
  domain: Domain;
  level: Level;
  val: Val;
}
type Phase = "setup" | "quiz" | "result";

function nextQuestion(log: Entry[]): { domain: Domain; level: Level } | null {
  for (const d of DOMAIN_KEYS) {
    const b = log.find((l) => l.domain === d && l.level === "B");
    if (!b) return { domain: d, level: "B" };
    if (b.val === 2) continue;
    const a = log.find((l) => l.domain === d && l.level === "A");
    if (!a) return { domain: d, level: "A" };
  }
  return null;
}

function scoresFromLog(log: Entry[]) {
  const scores = {} as Scores;
  const state = {} as Record<Domain, "none" | "partial" | "done">;
  for (const d of DOMAIN_KEYS) {
    const b = log.find((l) => l.domain === d && l.level === "B");
    const a = log.find((l) => l.domain === d && l.level === "A");
    if (!b) {
      scores[d] = 0;
      state[d] = "none";
    } else if (b.val === 2 || a) {
      scores[d] = domainScore(b.val, a?.val);
      state[d] = "done";
    } else {
      scores[d] = -0.9;
      state[d] = "partial";
    }
  }
  return { scores, state };
}

const barW = (z: number) => `${((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100}%`;

export function CheckIn() {
  const { role, children, checkInTarget, setCheckInTarget, addCheckIn, patchChild, go } = useApp();
  const assisting = role !== "parent";
  const initialChild = children.find((c) => c.id === checkInTarget);
  const initialAge = initialChild?.ageMonths ?? (assisting ? 30 : 39);

  const [phase, setPhase] = useState<Phase>("setup");
  const [lang, setLang] = useState<Lang>("en");
  const [target, setTarget] = useState<string>(() => checkInTarget ?? "");
  const targetChild = children.find((c) => c.id === target);
  const [name, setName] = useState(assisting ? "" : "Aarav");
  const [module, setModule] = useState<Module>(() => moduleForAge(initialAge));
  const [age, setAge] = useState(() => Math.max(1, Math.min(144, initialAge)));
  const [log, setLog] = useState<Entry[]>([]);
  const [regression, setRegression] = useState(false);
  const [picked, setPicked] = useState<Val | null>(null);
  const [result, setResult] = useState<CheckInT | null>(null);

  useEffect(() => () => setCheckInTarget(null), [setCheckInTarget]);

  const groups = useMemo(
    () => ({
      unsc: children.filter((c) => c.status === "unscreened"),
      over: children.filter((c) => c.status === "overdue"),
      rest: children.filter((c) => c.status !== "unscreened" && c.status !== "overdue"),
    }),
    [children]
  );

  const q = nextQuestion(log);
  const { scores: liveScores, state: liveState } = scoresFromLog(log);
  const doneCount = DOMAIN_KEYS.filter((d) => liveState[d] === "done").length;
  const partialCount = DOMAIN_KEYS.filter((d) => liveState[d] === "partial").length;
  const pct = Math.round(((doneCount + partialCount * 0.5) / DOMAIN_KEYS.length) * 100);
  const answeredAny = doneCount + partialCount > 0;
  const liveEv = evaluate(liveScores, regression);
  const liveMeta = TIER_META[liveEv.tier];
  const remaining = DOMAIN_KEYS.length - doneCount;
  const est = Math.min(12, Math.max(9, log.length + remaining));
  const moduleMeta = MODULES[module];

  const chooseModule = (next: Module) => {
    setModule(next);
    setAge((current) =>
      current >= MODULES[next].min && current <= MODULES[next].max
        ? current
        : next === "A"
          ? 36
          : 96
    );
    if (targetChild && moduleForAge(targetChild.ageMonths) !== next) setTarget("");
  };

  const begin = () => {
    setLog([]);
    setRegression(false);
    setPicked(null);
    setResult(null);
    setPhase("quiz");
    window.scrollTo({ top: 0 });
  };

  const finish = (finalLog: Entry[]) => {
    const { scores } = scoresFromLog(finalLog);
    const ci: CheckInT = {
      id: `live-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      ageMonths: age,
      child: name.trim() || (assisting ? targetChild?.id ?? "Walk-in child" : "Aarav"),
      scores,
      regression,
      source: "live",
      module,
    };
    const ev = evaluate(scores, regression);
    if (!assisting) addCheckIn(ci);
    if (targetChild) {
      patchChild(targetChild.id, {
        scores,
        regression,
        status: ev.tier === "Typical" ? "ontrack" : ev.tier === "Monitor" ? "watch" : "refer",
        visits: targetChild.visits + 1,
        lastVisitDays: 0,
        handoff: ev.tier === "Refer" ? "queued" : targetChild.handoff,
      });
    }
    setResult(ci);
    setPhase("result");
    window.scrollTo({ top: 0 });
  };

  const answer = (val: Val) => {
    if (picked !== null || !q) return;
    setPicked(val);
    window.setTimeout(() => {
      const nl = [...log, { domain: q.domain, level: q.level, val }];
      setLog(nl);
      setPicked(null);
      if (!nextQuestion(nl)) finish(nl);
    }, 340);
  };

  useEffect(() => {
    if (phase !== "quiz") return;
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) answer(ANSWERS[i].val);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

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
                  const cfg = MODULES[m];
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
                {moduleMeta.note} This prototype loads a separate question bank for Module {module}.
              </p>
            </div>
          </aside>
        </div>
      </Page>
    );
  }

  /* ============================== RESULT ============================== */
  if (phase === "result" && result) {
    const ev = evaluate(result.scores, result.regression);
    const meta = TIER_META[ev.tier];
    const lows = [...DOMAIN_KEYS].sort((a, b) => result.scores[a] - result.scores[b]).slice(0, ev.tier === "Typical" ? 1 : 2);
    return (
      <Page>
        <section className="relative overflow-hidden rounded-[44px] bg-night text-paper">
          <div className="relative grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:p-14">
            <div>
              <Eyebrow tone="peach" index="01">Check-in complete</Eyebrow>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip tone="night">Module {result.module ?? module}</Chip>
                <Chip tone="night">{result.ageMonths} months · {ageBand(result.ageMonths)}</Chip>
              </div>
              <div className="mt-8 flex items-center gap-5">
                <GlowDot hex={meta.hexLight} glow={meta.glow} size={58} />
                <span className="font-mono text-[11px] tracking-[0.24em] text-paper/60 uppercase">Result tier</span>
              </div>
              <h1 className="nrx-pop mt-4 font-display text-[clamp(72px,10vw,150px)] leading-[0.86] uppercase" style={{ color: meta.hexLight }}>
                {ev.tier}
              </h1>
              <p className="mt-2 font-display text-[clamp(26px,3vw,44px)] leading-none text-peach uppercase">({meta.hint})</p>
              <p className="mt-6 max-w-[470px] text-[15px] leading-relaxed text-paper/75">{meta.summary}</p>
              <p className="mt-4 flex max-w-[470px] items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12.5px] leading-relaxed text-paper/80">
                {ev.safety && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />}
                <span><b className="text-paper">Why: </b>{ev.reason}</span>
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[12px] font-semibold">
                <Check className="size-4 text-[#8fbf5a]" />
                {assisting
                  ? targetChild
                    ? `${targetChild.id} updated in the Ward 12 caseload${ev.tier === "Refer" ? " · handoff queued" : ""}`
                    : "Walk-in result — not linked to a caseload record"
                  : `Saved to ${result.child}’s growth history`}
              </p>
            </div>
            <div>
              <Radar scores={result.scores} tone={meta.hexLight} />
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
            <Eyebrow index="02" tone="muted">{ev.tier === "Typical" ? "Keep this going" : "Try these first"}</Eyebrow>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {lows.map((k) => (
                <div key={k} className="rounded-[26px] bg-rust p-6 text-white">
                  <Lightbulb className="size-6" />
                  <p className="mt-4 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase opacity-80">
                    {DOMAINS[k].label} · {domainStatus(result.scores[k]).label}
                  </p>
                  <p className="mt-2 font-display text-[26px] leading-[1.05] uppercase">{module === "B" ? SCHOOL_ACTIVITIES[k] : DOMAINS[k].activity}</p>
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
              <Btn variant={ev.tier === "Refer" ? "rust" : "light"} onClick={() => go("help")}><MapPin className="size-4" /> Find help</Btn>
              <Btn variant="soft" onClick={() => { setPhase("setup"); setResult(null); setTarget(""); window.scrollTo({ top: 0 }); }}>
                <RotateCcw className="size-4" /> Another
              </Btn>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  /* =============================== QUIZ =============================== */
  const ui = UI[lang];
  const qText = q ? QUESTION_BANK[module][q.domain][q.level][lang] : "";

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
                  <p className="text-[12px] text-muted">{targetChild ? targetChild.id.replace("child-seed-", "") : name || "Sample child"} · {age} months · Module {module}</p>
                </div>
                <button
                  onClick={() => setLang(lang === "en" ? "hi" : "en")}
                  className="ml-auto rounded-full border border-line-2 px-3.5 py-1.5 text-[12px] font-bold transition-colors hover:bg-sand"
                  aria-label="Switch language"
                >
                  {lang === "en" ? "हिन्दी" : "EN"}
                </button>
              </div>

              <div className="mt-5 px-6">
                <div className="flex items-center justify-between text-[12px] font-semibold">
                  <span>{ui.question} {log.length + 1} {lang === "en" ? `of ~${est}` : `/ ~${est}`}</span>
                  <span className="font-mono text-[11px] text-muted">{pct}% {ui.complete}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-sand">
                  <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              </div>

              <div className="mt-7 flex-1 px-6">
                <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-rust uppercase">{ui.tag}</p>
                <h2 key={log.length} className="nrx-rise mt-3 min-h-[96px] text-[20px] leading-snug font-bold">{qText}</h2>
                <div className="mt-5 space-y-2.5">
                  {ANSWERS.map((a, i) => (
                    <button
                      key={a.val}
                      onClick={() => answer(a.val)}
                      className={cn(
                        "group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-4 text-left text-[14.5px] font-semibold transition-all duration-200",
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
                  onClick={() => log.length > 0 && picked === null && setLog(log.slice(0, -1))}
                  disabled={log.length === 0}
                  className="flex items-center gap-1.5 text-[13px] font-bold text-ink-2 disabled:opacity-30"
                >
                  <ArrowLeft className="size-4" /> {ui.back}
                </button>
                <span className="font-mono text-[10px] text-muted">{doneCount}/6 areas</span>
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
              {DOMAIN_KEYS.map((k) => {
                const st = liveState[k];
                const s = domainStatus(liveScores[k]);
                return (
                  <li key={k}>
                    <div className="mb-2 flex items-baseline justify-between text-[12.5px]">
                      <span className={cn("font-semibold", st === "none" && "text-paper/40")}>{DOMAINS[k].label}</span>
                      <span className="font-mono text-[10.5px]" style={{ color: st === "none" ? "rgba(255,244,220,.3)" : s.hex === "#46692a" ? "#8fbf5a" : s.hex }}>
                        {st === "none" ? "waiting" : st === "partial" ? "checking…" : s.label}
                      </span>
                    </div>
                    <div className={cn("h-2.5 overflow-hidden rounded-full", st === "none" ? "border border-dashed border-white/20" : "bg-white/10")}>
                      {st !== "none" && (
                        <div
                          className={cn("h-full rounded-full transition-all duration-700 ease-out", st === "partial" && "opacity-60")}
                          style={{ width: barW(liveScores[k]), background: s.hex === "#46692a" ? "#8fbf5a" : s.hex }}
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
            <ArrowRight className="size-3.5" /> This preview is indicative; the final tier is calculated when all areas are done.
          </p>
        </div>
      </div>
    </Page>
  );
}
