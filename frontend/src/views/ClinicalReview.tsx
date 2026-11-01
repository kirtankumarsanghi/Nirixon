import { Activity, ArrowRight, FlaskConical, LineChart, Share2, ShieldAlert, Stethoscope } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, domainKeys, TIER_META, domainStatus, evaluate, fmtDate } from "../lib/model";
import { useApp } from "../store";

export function ClinicalReview() {
  const { checkIns, go, login, setWhatIfSeed } = useApp();
  const latest = checkIns[0];
  if (!latest) {
    return (
      <Page>
        <Eyebrow index="01">Clinician tools</Eyebrow>
        <Display as="h1" className="mt-5 text-[clamp(48px,7vw,96px)]">
          No completed
          <br />
          <span className="text-sea">check-ins yet.</span>
        </Display>
        <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-2">
          Finish a screening as a parent or frontline worker, then come back here
          to review the result and run a real what-if scenario.
        </p>
        <Btn className="mt-7" onClick={() => go("cases")}>
          Open referrals
        </Btn>
      </Page>
    );
  }
  const ev = evaluate(latest.scores, latest.regression);
  // The backend classification is authoritative. The local formula is only a
  // display heuristic (and Module B is scored by its engine, not probabilities).
  const tier = latest.tier ?? ev.tier;
  const meta = TIER_META[tier];
  const backendProbs = latest.probs;
  const hasBackendProbs = Boolean(
    backendProbs &&
      backendProbs.typical + backendProbs.monitor + backendProbs.refer > 0,
  );
  const probs = hasBackendProbs && backendProbs ? backendProbs : ev.probs;
  const confidence = Math.max(probs.typical, probs.monitor, probs.refer);
  const safety = latest.regression || ev.safety;
  const modelLabel =
    latest.source === "live"
      ? latest.module === "B"
        ? "Module B engine"
        : "Module A XGBoost"
      : "Illustrative logistic triage";

  const openWhatIf = () => {
    setWhatIfSeed({
      scores: latest.scores,
      regression: latest.regression,
      sessionId: latest.id,
      module: latest.module ?? (latest.ageMonths >= 60 ? "B" : "A"),
      label: `${latest.child} · ${fmtDate(latest.date)}`,
    });
    go("whatif");
  };

  return (
    <Page>
      <Eyebrow index="01">Clinician tools · latest completed screening</Eyebrow>
      <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          Last check-in.
          <br />
          <span className="text-sea">Clinical view.</span>
        </Display>
        <p className="max-w-[390px] text-[15px] leading-relaxed text-ink-2">
          The family-facing recommendation, model context, safety rule and area scores in one review. Intended for discussion with a paediatrician — not a substitute for clinical judgement.
        </p>
      </div>

      <div className="mt-10 grid items-start gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <section className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[42px] leading-none uppercase">{latest.child}</p>
                <p className="mt-2 font-mono text-[11px] text-muted">{fmtDate(latest.date, true)} · {latest.ageMonths} months · Module {latest.module ?? "A"}</p>
              </div>
              <Chip tone="sea">{latest.source === "live" ? "Live backend result" : "Synthetic check-in"}</Chip>
            </div>

            <dl className="mt-8 space-y-4">
              {[
                ["Parent-facing recommendation", tier],
                ["Model classification", tier],
                ["Model", modelLabel],
                [
                  "Highest class probability",
                  hasBackendProbs ? `${(confidence * 100).toFixed(1)}%` : "Per-domain engine result",
                ],
                ["Age", `${latest.ageMonths} months`],
                ["Safety override", safety ? "Yes" : "No"],
              ].map(([term, value]) => (
                <div key={term} className="grid grid-cols-[1.15fr_0.85fr] gap-4 border-b border-line pb-4 last:border-0">
                  <dt className="text-[12.5px] font-bold">{term}</dt>
                  <dd className="text-[12.5px] text-ink-2">{value}</dd>
                </div>
              ))}
            </dl>

            {safety && (
              <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-brick-bg p-4 text-[12.5px] leading-relaxed text-ink-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brick" />
                <span><b className="text-ink">Protective override:</b> {ev.reason}</span>
              </p>
            )}
          </section>
        </Reveal>

        <Reveal delay={80}>
          <section className="rounded-[40px] bg-night p-7 text-paper sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow index="02" tone="peach">Class probabilities</Eyebrow>
                <p className="mt-3 font-display text-[42px] leading-none uppercase" style={{ color: meta.hexLight }}>{tier}</p>
              </div>
              <Chip tone="night">{safety ? "Safety rule" : "Model output"}</Chip>
            </div>

            <div className="mt-7 space-y-4">
              {([
                ["Typical", probs.typical, "#8fbf5a"],
                ["Monitor", probs.monitor, "#e8b13a"],
                ["Refer", probs.refer, "#ee6a4f"],
              ] as const).map(([label, value, color]) => (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between text-[12.5px]">
                    <span>{label}</span>
                    <span className="font-mono font-semibold">{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value * 100}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-7 flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12px] leading-relaxed text-paper/65">
              <Activity className="mt-0.5 size-4 shrink-0 text-peach" />
              {hasBackendProbs
                ? "Probabilities are the backend model outputs for this completed session."
                : latest.module === "B"
                  ? "Module B reports per-domain engine states rather than calibrated probabilities; these bars are illustrative only."
                  : "Probabilities are illustrative outputs from this prototype’s local scoring formula. Clinical validation is pending."}
            </p>
          </section>
        </Reveal>
      </div>

      <Reveal className="mt-4">
        <section className="rounded-[40px] border border-line-2 bg-card p-7 sm:p-9">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow index="03" tone="muted">Parent area highlights</Eyebrow>
              <p className="mt-3 text-[13px] text-ink-2">The same areas the family sees, with the underlying SD score.</p>
            </div>
            <Btn onClick={openWhatIf}><FlaskConical className="size-4" /> Open in what-if</Btn>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {domainKeys(latest.scores).map((key) => {
              const status = domainStatus(latest.scores[key]);
              return (
                <div key={key} className="rounded-[26px] border border-line-2 bg-card-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-[27px] leading-none uppercase">{DOMAINS[key].label}</p>
                      <p className="mt-1.5 text-[11.5px] text-muted">{DOMAINS[key].plain}</p>
                    </div>
                    <span className="font-mono text-[13px] font-semibold" style={{ color: status.ink }}>{latest.scores[key] > 0 ? "+" : ""}{latest.scores[key].toFixed(1)}</span>
                  </div>
                  <p className="mt-4 text-[12px] font-semibold" style={{ color: status.ink }}>{status.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      <div className="mt-6 flex flex-wrap gap-3">
        <Btn size="lg" onClick={openWhatIf}><FlaskConical className="size-4" /> What-if simulator</Btn>
        <Btn size="lg" variant="outline" onClick={() => go("cases")}><Stethoscope className="size-4" /> Referral cases</Btn>
        <Btn size="lg" variant="light" onClick={() => login("parent", "share")}><Share2 className="size-4" /> Family sharing</Btn>
        <Btn size="lg" variant="light" onClick={() => login("parent", "growth")}><LineChart className="size-4" /> Growth trends</Btn>
        <Btn size="lg" variant="soft" onClick={() => go("evidence")}>Evidence <ArrowRight className="size-4" /></Btn>
      </div>
    </Page>
  );
}