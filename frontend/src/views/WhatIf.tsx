import { useEffect, useState, type CSSProperties } from "react";
import { Play, RotateCcw, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { Photo } from "../components/Photo";
import { sandboxApi, type SessionSummary } from "../api/client";
import type { ResultPayload } from "../api/types";
import { DOMAINS, MODULE_A_DOMAINS, MODULE_B_DOMAINS, TIER_META, evaluate, type Scores, type Tier } from "../lib/model";
import { PHOTO } from "../photos";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Module = "A" | "B";

const BASE_A: Scores = { gross: 0.3, fine: 0.2, comm: 0.4, social: 0.1, cog: 0.3, adaptive: 0.2 };
const BASE_B: Scores = {
  attention: 0.3,
  listening_speaking: 0.3,
  reading: 0.2,
  writing: 0.2,
  numbers: 0.3,
  motor: 0.3,
  social: 0.3,
  emotion_conduct: 0.2,
};
const MODULE_BASE: Record<Module, Scores> = { A: BASE_A, B: BASE_B };
const MODULE_DOMAINS: Record<Module, string[]> = { A: MODULE_A_DOMAINS, B: MODULE_B_DOMAINS };
/** The one area the simple slider moves, chosen as a typical concern per module. */
const SIMPLE_KEY: Record<Module, string> = { A: "comm", B: "reading" };

/** Infer the module a seeded score map came from. The Module B-only domains are
 *  the giveaway; Module A's short keys never appear there. */
function moduleOf(scores: Scores): Module {
  return Object.keys(scores).some((k) => MODULE_B_DOMAINS.includes(k) && !MODULE_A_DOMAINS.includes(k)) ? "B" : "A";
}

const fmt = (z: number) => `${z > 0 ? "+" : z < 0 ? "−" : ""}${Math.abs(z).toFixed(1)}`;

function SafetyBadge() {
  const t = "SAFETY RULE • ALWAYS ON • NO MODEL CAN OVERRIDE IT • ";
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      <svg viewBox="0 0 400 400" className="nrx-spin-slow absolute inset-0 size-full" style={{ animationDuration: "40s" }} aria-hidden>
        <defs>
          <path id="nrx-ring" d="M200,200 m-172,0 a172,172 0 1,1 344,0 a172,172 0 1,1 -344,0" />
        </defs>
        <text fontSize="21" fontWeight="700" fill="#fff4dc" letterSpacing="5">
          <textPath href="#nrx-ring" textLength="1070" lengthAdjust="spacing">{t}</textPath>
        </text>
      </svg>
      <div className="absolute inset-[16%] overflow-hidden rounded-full border-[6px] border-night-3">
        <Photo src={PHOTO.girl} alt="" className="rounded-full" />
      </div>
    </div>
  );
}

const SANDBOX_BACKEND_DOMAIN: Record<string, string> = {
  gross: "gross_motor",
  fine: "fine_motor",
  comm: "communication",
  social: "personal_social",
  cog: "cognitive",
  adaptive: "self_help",
};

function sandboxDomains(module: Module): string[] {
  return module === "A" ? MODULE_A_DOMAINS : MODULE_B_DOMAINS;
}

function backendDomainKey(module: Module, domain: string): string {
  return module === "A" ? (SANDBOX_BACKEND_DOMAIN[domain] ?? domain) : domain;
}

function baselineValues(session: SessionSummary): Record<string, number> {
  const out: Record<string, number> = {};
  for (const domain of sandboxDomains(session.module)) {
    if (session.module === "A") {
      const value = session.domain_scores[backendDomainKey("A", domain)];
      if (typeof value === "number") out[domain] = Math.round(value * 100);
    } else {
      const detail = session.domain_details?.[domain];
      const concern = detail && typeof detail.score === "number" ? detail.score : null;
      out[domain] = concern === null ? 50 : Math.round((1 - concern) * 100);
    }
  }
  return out;
}

function sandboxDomainState(
  source: { domain_classifications?: Record<string, string>; domain_details?: Record<string, Record<string, unknown>> } | null,
  module: Module,
  domain: string,
): string {
  const key = backendDomainKey(module, domain);
  return (
    source?.domain_classifications?.[key] ??
    source?.domain_classifications?.[domain] ??
    (source?.domain_details?.[domain]?.state as string | undefined) ??
    "Not asked"
  );
}

function RealSandbox() {
  const { whatIfSeed } = useApp();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [age, setAge] = useState(60);
  const [values, setValues] = useState<Record<string, number>>({});
  const [regression, setRegression] = useState(false);
  const [scenario, setScenario] = useState<ResultPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    sandboxApi
      .sessions()
      .then((rows) => {
        if (cancelled) return;
        setSessions(rows);
        const preferred =
          whatIfSeed?.sessionId && rows.some((row) => row.id === whatIfSeed.sessionId)
            ? whatIfSeed.sessionId
            : (rows[0]?.id ?? "");
        setSelectedId(preferred);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load completed sessions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [whatIfSeed?.sessionId]);

  const baseline = sessions.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!baseline) return;
    setAge(Math.round(baseline.corrected_age_months ?? (baseline.module === "B" ? 96 : 36)));
    setValues(baselineValues(baseline));
    setRegression(false);
    setScenario(null);
  }, [baseline]);

  const run = async () => {
    if (!baseline) return;
    setBusy(true);
    setError("");
    try {
      const domain_scores = Object.fromEntries(
        Object.entries(values).map(([domain, score]) => [
          backendDomainKey(baseline.module, domain),
          score,
        ]),
      );
      const answer_overrides: Record<string, number> =
        baseline.module === "A" && regression ? { regression_flag: 1 } : {};
      const result = await sandboxApi.simulate(baseline.id, {
        corrected_age_months: age,
        domain_scores,
        answer_overrides,
      });
      setScenario(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sandbox could not score this scenario.");
    } finally {
      setBusy(false);
    }
  };

  const domains = baseline ? sandboxDomains(baseline.module) : [];
  const baselineTier = (baseline?.final_classification ?? "Typical") as Tier;
  const scenarioTier = (scenario?.final_classification ?? "Typical") as Tier;
  const baselineMeta = TIER_META[baselineTier] ?? TIER_META.Typical;
  const scenarioMeta = TIER_META[scenarioTier] ?? TIER_META.Typical;

  return (
    <section className="mt-8 rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow index="00" tone="muted">Real session sandbox</Eyebrow>
          <h2 className="mt-3 font-display text-[clamp(32px,4vw,56px)] leading-[0.95] uppercase">
            Re-score a completed check-in.
          </h2>
          <p className="mt-3 max-w-[620px] text-[13.5px] leading-relaxed text-ink-2">
            Pick a real completed session, change the age or an area score, and the backend re-runs the same
            Module A model or Module B engine that produced the original result. Nothing here is invented in the browser.
          </p>
        </div>
        <Chip tone="sea">Live backend</Chip>
      </div>

      <div className="mt-7 grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-line-2 bg-sand/30 p-5">
          {loading ? (
            <p className="text-[13px] text-muted">Loading completed sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-[13px] text-muted">No completed sessions yet. Finish a check-in first.</p>
          ) : (
            <>
              <label className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-muted uppercase" htmlFor="sandbox-session">
                Completed session
              </label>
              <select
                id="sandbox-session"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-[13px] font-semibold text-ink outline-none focus:border-sea"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.child_name ?? "Child"} · Module {session.module} ·{" "}
                    {(session.completed_at ?? session.started_at ?? "").slice(0, 10)} ·{" "}
                    {session.final_classification ?? "—"}
                  </option>
                ))}
              </select>

              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <label className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-muted uppercase" htmlFor="sandbox-age">
                    Corrected age
                  </label>
                  <span className="font-mono text-[12px] font-semibold">{age} months</span>
                </div>
                <input
                  id="sandbox-age"
                  type="range"
                  min={baseline?.module === "B" ? 60 : 0}
                  max={baseline?.module === "B" ? 144 : 60}
                  step={1}
                  value={age}
                  onChange={(event) => setAge(Number(event.target.value))}
                  className="nrx-range mt-3"
                  style={{ ["--fill" as string]: `${((age - (baseline?.module === "B" ? 60 : 0)) / (baseline?.module === "B" ? 84 : 60)) * 100}%` } as CSSProperties}
                />
              </div>

              {baseline?.module === "A" && (
                <button
                  type="button"
                  onClick={() => setRegression((value) => !value)}
                  aria-pressed={regression}
                  className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-line-2 bg-card p-3 text-left"
                >
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2", regression ? "border-brick bg-brick text-paper" : "border-line-2")}>
                    {regression && <ShieldAlert className="size-3.5" />}
                  </span>
                  <span className="text-[12.5px] font-bold">What if regression were reported?</span>
                </button>
              )}

              <div className="mt-6 space-y-4">
                {domains.map((domain) => (
                  <div key={domain}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] font-bold">{DOMAINS[domain]?.label ?? domain}</span>
                      <span className="font-mono text-[11.5px] font-semibold">{values[domain] ?? 50}/100</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={values[domain] ?? 50}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [domain]: Number(event.target.value) }))
                      }
                      className="nrx-range mt-2"
                      style={{ ["--fill" as string]: `${values[domain] ?? 50}%`, ["--fill-color" as string]: DOMAINS[domain]?.color ?? "var(--color-ink)" } as CSSProperties}
                      aria-label={`${DOMAINS[domain]?.label ?? domain} score`}
                    />
                  </div>
                ))}
              </div>

              <Btn className="mt-6 w-full" onClick={() => void run()} disabled={busy || !baseline}>
                <Play className="size-4" /> {busy ? "Scoring…" : "Run real scenario"}
              </Btn>
              {error && <p className="mt-3 text-[12.5px] font-semibold text-brick">{error}</p>}
            </>
          )}
        </div>

        <div className="space-y-4">
          {baseline && (
            <div className="rounded-3xl border border-line-2 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-muted uppercase">Baseline</p>
                  <p className="mt-1 text-[13px] font-semibold">
                    {baseline.child_name ?? "Child"} · Module {baseline.module} ·{" "}
                    {baseline.corrected_age_months ?? "—"} months
                  </p>
                </div>
                <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: baselineMeta.hex }}>
                  <GlowDot hex={baselineMeta.hex} glow={baselineMeta.glow} size={18} />
                  {baselineTier}
                </span>
              </div>
              <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {domains.map((domain) => (
                  <div key={domain} className="flex items-center justify-between rounded-lg bg-sand/50 px-2.5 py-1.5 text-[11.5px]">
                    <span className="text-ink-2">{DOMAINS[domain]?.label ?? domain}</span>
                    <span className="font-mono font-semibold">{sandboxDomainState(baseline, baseline.module, domain)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scenario ? (
            <div className="rounded-3xl border border-line-2 bg-night p-5 text-paper">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-paper/55 uppercase">Real scenario</p>
                  <p className="mt-1 text-[13px] font-semibold text-paper/80">
                    {scenario.model_name ?? "backend"} · {scenario.latency_ms ?? 0} ms
                  </p>
                </div>
                <span className="flex items-center gap-2 font-display text-[26px] uppercase" style={{ color: scenarioMeta.hexLight }}>
                  <GlowDot hex={scenarioMeta.hexLight} glow={scenarioMeta.glow} size={20} />
                  {scenarioTier}
                </span>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-paper/70">
                {scenario.triage_tier ?? scenarioMeta.next}
              </p>
              {scenario.safety_override_triggered && (
                <p className="mt-2 rounded-xl border border-brick/40 bg-brick/15 px-3 py-2 text-[11.5px] font-semibold text-peach">
                  Safety override · {scenario.override_rule ?? "deterministic rule"}
                </p>
              )}
              <p className="mt-3 text-[12.5px] leading-relaxed text-paper/80">
                {scenario.summary ?? "The backend completed the scenario."}
              </p>
              <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {domains.map((domain) => (
                  <div key={domain} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11.5px]">
                    <span className="text-paper/60">{DOMAINS[domain]?.label ?? domain}</span>
                    <span className="font-mono font-semibold">{sandboxDomainState(scenario, baseline?.module ?? "A", domain)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-line-2 bg-sand/20 p-5 text-[12.5px] leading-relaxed text-muted">
              Change the age, regression flag, or any area score and run the scenario. The result on this side comes
              back from <span className="font-mono font-semibold text-ink">/api/sandbox/&lt;session&gt;/simulate</span>.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function WhatIf() {
  const { whatIfSeed, setWhatIfSeed } = useApp();
  const seedModule = whatIfSeed ? (whatIfSeed.module ?? moduleOf(whatIfSeed.scores)) : null;
  const [module, setModule] = useState<Module>(seedModule ?? "A");
  const [mode, setMode] = useState<"simple" | "advanced">(seedModule ? "advanced" : "simple");
  const [lowZ, setLowZ] = useState(-1.4);
  const [adv, setAdv] = useState<Scores>(() => ({
    ...MODULE_BASE[seedModule ?? "A"],
    ...(seedModule && whatIfSeed ? whatIfSeed.scores : {}),
  }));
  const [reg, setReg] = useState(whatIfSeed?.regression ?? false);

  const domains = MODULE_DOMAINS[module];
  const base = MODULE_BASE[module];
  const seedScores = seedModule === module ? whatIfSeed?.scores : null;
  const baseline = evaluate(seedScores ? { ...base, ...seedScores } : base, whatIfSeed?.regression ?? false);
  const simpleKey = SIMPLE_KEY[module];
  const effective: Scores = mode === "simple" ? { ...base, [simpleKey]: lowZ } : adv;
  const ev = evaluate(effective, reg);
  const meta = TIER_META[ev.tier];
  const shownZ = mode === "simple" ? lowZ : ev.min;

  const chooseModule = (next: Module) => {
    if (next === module) return;
    const seed = seedModule === next ? whatIfSeed?.scores : null;
    setModule(next);
    setMode(seed ? "advanced" : "simple");
    setAdv({ ...MODULE_BASE[next], ...(seed ?? {}) });
    setReg(seedModule === next ? (whatIfSeed?.regression ?? false) : false);
    setLowZ(-1.4);
  };

  const reset = () => {
    setMode("simple");
    setLowZ(-1.4);
    setAdv(MODULE_BASE[module]);
    setReg(false);
    setWhatIfSeed(null);
  };

  return (
    <Page>
      <RealSandbox />
      <div className="mt-16">
        <Eyebrow index="01">Illustrative safety demo</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
          What if…?
        </Display>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-line-2 bg-card p-1" role="group" aria-label="Screening module">
            {(["A", "B"] as Module[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => chooseModule(m)}
                aria-pressed={module === m}
                className={cn(
                  "rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
                  module === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                )}
              >
                {m === "A" ? "Early years" : "School age"}
              </button>
            ))}
          </div>
          {whatIfSeed && seedModule === module && <Chip tone="sea">Loaded from {whatIfSeed.label}</Chip>}
          <Btn variant="light" onClick={reset}>
            <RotateCcw className="size-4" /> Reset
          </Btn>
        </div>
      </div>

      {/* ============================ safety stage ============================ */}
      <section className="relative mt-8 overflow-hidden rounded-[48px] bg-night p-7 text-paper sm:p-12 lg:p-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h2 className="font-display text-[clamp(48px,6.4vw,100px)] leading-[0.9] uppercase">
              Cross the line.
              <br />
              <span className="text-peach">The model steps aside.</span>
            </h2>
            <p className="mt-6 max-w-[500px] text-[15px] leading-relaxed text-paper/70">
              If a child has lost a skill, or is far behind in any one area, Nirixon skips the model and refers straight to a doctor. Drag the score and watch it happen.
            </p>

            {/* slider */}
            <div className="mt-12">
              <div className="flex items-end justify-between font-mono text-[11px] font-semibold tracking-[0.2em] uppercase">
                <span className="text-paper/60">
                  {mode === "simple"
                    ? `Module ${module} · drag the ${DOMAINS[simpleKey]?.label ?? "area"} score`
                    : `Module ${module} · lowest area in your scenario`}
                </span>
                <span className="text-[15px] tracking-normal" style={{ color: ev.safety ? "#ee6a4f" : "#fff4dc" }}>
                  {fmt(shownZ)} SD
                </span>
              </div>
              <div className="relative mt-9">
                <span className="absolute -top-7 font-mono text-[10px] font-bold tracking-[0.18em] whitespace-nowrap text-[#ee6a4f]" style={{ left: "25%", transform: "translateX(-50%)" }}>
                  SAFETY LINE −2.0
                </span>
                <span className="absolute -top-2 -bottom-2 z-10 w-px bg-paper/80" style={{ left: "25%" }} />
                <input
                  type="range"
                  min={-3}
                  max={1}
                  step={0.1}
                  value={shownZ}
                  disabled={mode === "advanced"}
                  onChange={(e) => setLowZ(Number(e.target.value))}
                  className={cn("nrx-range nrx-range-safety relative", mode === "advanced" && "opacity-60")}
                  style={{ ["--thumb" as string]: ev.tier === "Refer" ? "#c8452f" : ev.tier === "Monitor" ? "#b8801c" : "#46692a" } as CSSProperties}
                  aria-label="Lowest area score in standard deviations"
                />
                <div className="mt-1 flex justify-between font-mono text-[10.5px] text-paper/50">
                  {[-3, -2, -1, 0, 1].map((n) => (
                    <span key={n}>{n > 0 ? "+" : n < 0 ? "−" : ""}{Math.abs(n)}</span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setReg((r) => !r)}
                aria-pressed={reg}
                className="mt-8 flex items-center gap-4 text-left"
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-all", reg ? "border-[#ee6a4f] bg-[#ee6a4f] text-night" : "border-paper/60")}>
                  {reg && <ShieldAlert className="size-4" />}
                </span>
                <span className="text-[16px] font-bold">My child has stopped doing something they used to do</span>
              </button>
            </div>

            {/* result */}
            <div className="mt-12 flex items-center gap-6 border-t border-white/10 pt-9">
              <GlowDot hex={meta.hexLight} glow={meta.glow} size={76} />
              <div>
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-paper/55 uppercase">Result tier</p>
                <p key={ev.tier} className="nrx-pop font-display text-[clamp(42px,5.4vw,80px)] leading-[0.92] uppercase">
                  {ev.tier} <span className="text-[0.5em] text-paper/75">({meta.hint})</span>
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Chip tone="night">{ev.safety ? "Model skipped" : "Model ran"}</Chip>
              <p className="max-w-[520px] text-[13px] leading-relaxed text-paper/75">{ev.reason}</p>
            </div>
          </div>

          <div className="hidden lg:block">
            <SafetyBadge />
          </div>
        </div>
      </section>

      {/* ============================ detail ============================ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow index="02" tone="muted">Probabilities</Eyebrow>
              <span className="font-mono text-[10.5px] text-muted">baseline → scenario</span>
            </div>
            <div className="mt-7 space-y-6">
              {(["typical", "monitor", "refer"] as const).map((k) => {
                const color = k === "typical" ? "var(--color-moss)" : k === "monitor" ? "var(--color-amber)" : "var(--color-brick)";
                return (
                  <div key={k}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="font-display text-[26px] leading-none uppercase">{k}</span>
                      <span className="font-mono text-[13px] font-semibold">
                        <span className="text-muted">{Math.round(baseline.probs[k] * 100)}%</span> → <span style={{ color }}>{Math.round(ev.probs[k] * 100)}%</span>
                      </span>
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-sand">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-ink/15" style={{ width: `${baseline.probs[k] * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${ev.probs[k] * 100}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-8 rounded-2xl bg-sand/70 p-4 text-[12.5px] leading-relaxed text-ink-2">
              <b>Illustrative formula.</b> This sandbox runs a simple local scoring function so you can see how the safety rule behaves. It is not a trained or clinically validated model.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="h-full rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow index="03" tone="muted">Fine-tune each area</Eyebrow>
              <Btn
                size="xs"
                variant={mode === "advanced" ? "dark" : "outline"}
                onClick={() => {
                  if (mode === "simple") setAdv({ ...base, [simpleKey]: lowZ });
                  setMode(mode === "simple" ? "advanced" : "simple");
                }}
              >
                <SlidersHorizontal className="size-3.5" /> {mode === "advanced" ? "Advanced on" : "Enable"}
              </Btn>
            </div>
            <div className={cn("mt-7 space-y-5 transition-opacity", mode === "simple" && "pointer-events-none")}>
              {domains.map((k) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13.5px] font-bold">{DOMAINS[k]?.label ?? k}</span>
                    <span className="font-mono text-[12.5px] font-semibold text-ink">
                      {fmt(adv[k])}
                    </span>
                  </div>
                  <p className="mb-1 text-[11.5px] text-muted">{DOMAINS[k]?.blurb}</p>
                  <input
                    type="range"
                    min={-3}
                    max={1}
                    step={0.1}
                    value={adv[k]}
                    onChange={(e) => setAdv((p) => ({ ...p, [k]: Number(e.target.value) }))}
                    className="nrx-range"
                    style={{ ["--fill" as string]: `${((adv[k] + 3) / 4) * 100}%`, ["--fill-color" as string]: DOMAINS[k]?.color ?? "var(--color-ink)", ["--thumb" as string]: DOMAINS[k]?.color ?? "var(--color-ink)" } as CSSProperties}
                    aria-label={DOMAINS[k]?.label ?? k}
                    tabIndex={mode === "simple" ? -1 : 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
      </div>
    </Page>
  );
}
