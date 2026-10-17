import { useMemo, useState, type CSSProperties } from "react";
import { RotateCcw, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { Photo } from "../components/Photo";
import { DOMAINS, DOMAIN_KEYS, TIER_META, evaluate, type Scores } from "../lib/model";
import { PHOTO } from "../photos";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const BASE: Scores = { gross: 0.3, fine: 0.2, comm: 0.4, social: 0.1, cog: 0.3, adaptive: 0.2 };
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

export function WhatIf() {
  const { whatIfSeed, setWhatIfSeed } = useApp();
  const [mode, setMode] = useState<"simple" | "advanced">(whatIfSeed ? "advanced" : "simple");
  const [lowZ, setLowZ] = useState(-1.4);
  const [adv, setAdv] = useState<Scores>(whatIfSeed?.scores ?? BASE);
  const [reg, setReg] = useState(whatIfSeed?.regression ?? false);

  const baseline = useMemo(() => (whatIfSeed ? evaluate(whatIfSeed.scores, whatIfSeed.regression) : evaluate(BASE, false)), [whatIfSeed]);
  const effective: Scores = mode === "simple" ? { ...BASE, comm: lowZ } : adv;
  const ev = evaluate(effective, reg);
  const meta = TIER_META[ev.tier];
  const shownZ = mode === "simple" ? lowZ : ev.min;

  const reset = () => {
    setMode("simple");
    setLowZ(-1.4);
    setAdv(BASE);
    setReg(false);
    setWhatIfSeed(null);
  };

  return (
    <Page>
      <Eyebrow index="01">Interactive sandbox</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
          What if…?
        </Display>
        <div className="flex flex-wrap items-center gap-3">
          {whatIfSeed && <Chip tone="sea">Loaded from {whatIfSeed.label.replace("child-seed-", "")}</Chip>}
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
                <span className="text-paper/60">{mode === "simple" ? "Drag the lowest area score" : "Lowest area in your scenario"}</span>
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
                  if (mode === "simple") setAdv({ ...BASE, comm: lowZ });
                  setMode(mode === "simple" ? "advanced" : "simple");
                }}
              >
                <SlidersHorizontal className="size-3.5" /> {mode === "advanced" ? "Advanced on" : "Enable"}
              </Btn>
            </div>
            <div className={cn("mt-7 space-y-5 transition-opacity", mode === "simple" && "pointer-events-none")}>
              {DOMAIN_KEYS.map((k) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13.5px] font-bold">{DOMAINS[k].label}</span>
                    <span className="font-mono text-[12.5px] font-semibold text-ink">
                      {fmt(adv[k])}
                    </span>
                  </div>
                  <p className="mb-1 text-[11.5px] text-muted">{DOMAINS[k].blurb}</p>
                  <input
                    type="range"
                    min={-3}
                    max={1}
                    step={0.1}
                    value={adv[k]}
                    onChange={(e) => setAdv((p) => ({ ...p, [k]: Number(e.target.value) }))}
                    className="nrx-range"
                    style={{ ["--fill" as string]: `${((adv[k] + 3) / 4) * 100}%`, ["--fill-color" as string]: DOMAINS[k].color, ["--thumb" as string]: DOMAINS[k].color } as CSSProperties}
                    aria-label={DOMAINS[k].label}
                    tabIndex={mode === "simple" ? -1 : 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </Page>
  );
}
