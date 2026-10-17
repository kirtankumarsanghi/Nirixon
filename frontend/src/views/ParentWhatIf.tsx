import { ArrowRight, FlaskConical, LockKeyhole, ShieldAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, domainKeys, TIER_META, evaluate } from "../lib/model";
import { useApp } from "../store";

const percent = (z: number) => Math.round(((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100);

export function ParentWhatIf() {
  const { checkIns, login } = useApp();
  const latest = checkIns[0];
  const ev = evaluate(latest.scores, latest.regression);
  const meta = TIER_META[ev.tier];

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Eyebrow index="01">Interactive illustration · Parent view</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,118px)]">What-if simulator.</Display>
          <p className="mt-5 max-w-[600px] text-[15px] leading-relaxed text-ink-2">
            See how {latest.child}’s latest {latest.ageMonths}-month check-in is translated into a screening tier. This parent view explains the picture without letting a demo slider look like medical advice.
          </p>
        </div>
        <div className="flex rounded-full border border-line-2 bg-card p-1">
          <span className="rounded-full bg-ink px-5 py-2.5 text-[12px] font-bold text-paper">Parent view</span>
          <button onClick={() => login("clinician", "whatif")} className="rounded-full px-5 py-2.5 text-[12px] font-bold text-ink-2 hover:text-ink">Clinician view</button>
        </div>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-[24px] border border-amber/40 bg-amber-bg p-5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber" />
        <p className="text-[12.5px] leading-relaxed text-ink-2"><b className="text-ink">An illustration, not a prediction.</b> These values show how the saved milestone pattern relates to a screening tier. They are read-only in Parent view and are not a clinical diagnosis.</p>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Reveal>
          <section className="rounded-[38px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Eyebrow index="02" tone="muted">Domain score illustration</Eyebrow>
                <p className="mt-2 text-[12px] italic text-muted">Read-only for families · Module {latest.module ?? "A"} · {latest.ageMonths} months</p>
              </div>
              <LockKeyhole className="size-5 text-muted" />
            </div>
            <div className="mt-7 space-y-6">
              {domainKeys(latest.scores).map((key) => {
                const value = percent(latest.scores[key]);
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-bold">{DOMAINS[key].label}</span>
                      <span className="font-mono text-[12px] font-semibold">{value}%</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted">{DOMAINS[key].blurb}</p>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value}
                      disabled
                      aria-label={`${DOMAINS[key].label} read-only illustration`}
                      className="nrx-range mt-1 opacity-65"
                      style={{ ["--fill" as string]: `${value}%`, ["--fill-color" as string]: DOMAINS[key].color, ["--thumb" as string]: "var(--color-muted)" } as CSSProperties}
                    />
                    <div className="mt-1 flex justify-between font-mono text-[9px] text-muted"><span>Delay</span><span>Monitor</span><span>Typical</span></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-7 rounded-[22px] border border-dashed border-line-2 bg-card-2 p-4">
              <p className="flex items-center gap-2 text-[12px] font-bold"><span className="size-3 rounded bg-muted" /> Simulate skill regression</p>
              <p className="mt-1.5 pl-5 text-[10.5px] leading-relaxed text-muted">Locked in Parent view. The clinician sandbox can test the deterministic safety rule for lost skills.</p>
            </div>
          </section>
        </Reveal>

        <Reveal delay={80}>
          <section className="rounded-[38px] border border-line-2 bg-card p-7 sm:p-9">
            <Eyebrow index="03" tone="muted">Screening tier comparison</Eyebrow>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["Original result", ev.tier, "Saved check-in"],
                ["Illustrated outcome", ev.tier, "No values changed"],
              ].map(([label, tier, helper], index) => (
                <div key={label} className={index ? "rounded-[24px] border border-sea bg-sea-bg p-5" : "rounded-[24px] border border-line-2 bg-card-2 p-5"}>
                  <p className="font-mono text-[9px] font-semibold tracking-[0.13em] text-muted uppercase">{label}</p>
                  <Chip tone={tier === "Typical" ? "moss" : tier === "Monitor" ? "amber" : "brick"} className="mt-3">{tier}</Chip>
                  <p className="mt-2 text-[10.5px] text-muted">{helper}</p>
                  <dl className="mt-5 space-y-2 text-[11.5px]">
                    {([
                      ["Typical", ev.probs.typical],
                      ["Monitor", ev.probs.monitor],
                      ["Refer", ev.probs.refer],
                    ] as const).map(([name, value]) => (
                      <div key={name} className="flex justify-between"><dt>{name}</dt><dd className="font-mono font-semibold">{Math.round(value * 100)}%</dd></div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-[26px] bg-night p-6 text-paper">
              <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-peach uppercase">What this means</p>
              <p className="mt-3 font-display text-[34px] leading-[1.02] uppercase" style={{ color: meta.hexLight }}>{ev.tier} · {meta.hint}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-paper/70">{meta.summary}</p>
              <p className="mt-4 text-[12px] leading-relaxed text-paper/60"><b className="text-paper">Why:</b> {ev.reason}</p>
            </div>

            <Btn size="lg" className="mt-6 w-full" onClick={() => login("clinician", "whatif")}>
              <FlaskConical className="size-4" /> Open clinician sandbox <ArrowRight className="size-4" />
            </Btn>
          </section>
        </Reveal>
      </div>
    </Page>
  );
}