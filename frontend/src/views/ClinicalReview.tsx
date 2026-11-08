import { Activity, ArrowRight, FlaskConical, LineChart, Share2, ShieldAlert, Stethoscope } from "lucide-react";
import { OversightHero } from "../components/OversightHero";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, domainKeys, TIER_META, domainStatus, evaluate, fmtDate } from "../lib/model";
import { ROLES } from "../lib/roles";
import { useT } from "../lib/useT";
import { useApp } from "../store";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";

const statusTone = (level: 0 | 1 | 2): "moss" | "amber" | "brick" =>
  level === 0 ? "moss" : level === 1 ? "amber" : "brick";

export function ClinicalReview() {
  const { role, checkIns, go, login, setWhatIfSeed } = useApp();
  const tr = useT();
  const user = ROLES[role].user;
  const latest = checkIns[0];

  if (!latest) {
    return (
      <Page>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow index="01">{tr("Clinician tools")}</Eyebrow>
            <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
              {tr("No completed")}
              <br />
              <span className="text-rust">{tr("check-ins yet.")}</span>
            </Display>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-6 pl-2">
            <span className="grid size-12 place-items-center rounded-full bg-rust font-mono text-[12px] font-semibold text-white">{user.initials}</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold">{user.name}</span>
              <span className="block text-[12px] text-muted">{user.title}</span>
            </span>
          </div>
        </div>
        <p className="mt-5 max-w-[680px] text-[15px] leading-relaxed text-ink-2">
          {tr("Finish a screening as a parent or frontline worker, then come back here to review the result and run a real what-if scenario.")}
        </p>
        <div className="mt-10 rounded-[36px] border border-dashed border-line-2 bg-card p-10 text-center">
          <Stethoscope className="mx-auto size-8 text-ink/25" />
          <p className="mt-4 font-display text-[clamp(34px,4vw,52px)] leading-none text-ink/30 uppercase">{tr("No completed check-ins yet.")}</p>
          <Btn className="mt-6" onClick={() => go("cases")}>
            <Stethoscope className="size-4" /> {tr("Open referrals")}
          </Btn>
        </div>
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
    backendProbs && backendProbs.typical + backendProbs.monitor + backendProbs.refer > 0,
  );
  const probs = hasBackendProbs && backendProbs ? backendProbs : ev.probs;
  const confidence = Math.max(probs.typical, probs.monitor, probs.refer);
  const safety = latest.regression || ev.safety;
  const modelLabel =
    latest.source === "live"
      ? latest.module === "B"
        ? "Module B engine"
        : "Module A XGBoost"
      : tr("Illustrative logistic triage");

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
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">{tr("Clinician tools · latest completed screening")}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
            {tr("Last check-in.")}
            <br />
            <span className="text-rust">{tr("Clinical view.")}</span>
          </Display>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-6 pl-2">
          <span className="grid size-12 place-items-center rounded-full bg-rust font-mono text-[12px] font-semibold text-white">{initials(latest.child)}</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">{latest.child}</span>
            <span className="block text-[12px] text-muted">
              {fmtDate(latest.date, true)} · {latest.ageMonths} months
            </span>
          </span>
        </div>
      </div>
      <p className="mt-5 max-w-[680px] text-[15px] leading-relaxed text-ink-2">
        {tr("The family-facing recommendation, model context, safety rule and area scores in one review. Intended for discussion with a paediatrician — not a substitute for clinical judgement.")}
      </p>

      <OversightHero
        className="mt-10"
        pct={Math.round(confidence * 100)}
        ringLabel={tr("Highest class probability")}
        ringSub={<>{hasBackendProbs ? tr("Backend model output for this session") : tr("Illustrative local scoring formula")}</>}
        tiles={[
          {
            label: tr("Parent-facing tier"),
            value: tr(tier),
            helper: tr(meta.hint),
            color: meta.hexLight,
            icon: <Activity className="size-4" />,
            valueClass: "text-[clamp(26px,2.6vw,38px)] uppercase",
          },
          {
            label: tr("Model"),
            value: latest.module === "B" ? "Module B" : "Module A",
            helper: modelLabel,
            color: "#7cc1dc",
            icon: <Stethoscope className="size-4" />,
            valueClass: "text-[clamp(24px,2.4vw,34px)] uppercase",
          },
          {
            label: tr("Safety override"),
            value: safety ? tr("Yes") : tr("No"),
            helper: safety ? tr("Protective rule applied") : tr("No rule-out triggered"),
            color: safety ? "#ee6a4f" : "#8fbf5a",
            icon: <ShieldAlert className="size-4" />,
          },
          {
            label: tr("Age"),
            value: `${latest.ageMonths}`,
            helper: `${tr("months")} · ${tr("Module")} ${latest.module ?? (latest.ageMonths >= 60 ? "B" : "A")}`,
            color: "#c79ad0",
            icon: <LineChart className="size-4" />,
          },
        ]}
        segments={[
          { label: tr("Typical"), hex: "#8fbf5a", n: Math.round(probs.typical * 100), display: `${Math.round(probs.typical * 100)}%` },
          { label: tr("Monitor"), hex: "#e8b13a", n: Math.round(probs.monitor * 100), display: `${Math.round(probs.monitor * 100)}%` },
          { label: tr("Refer"), hex: "#ee6a4f", n: Math.round(probs.refer * 100), display: `${Math.round(probs.refer * 100)}%` },
        ]}
      />

      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1fr_400px]">
        <Reveal className="h-full">
          <section className="flex h-full flex-col rounded-[44px] bg-night p-6 text-paper sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow index="02" tone="peach">{tr("Class probabilities")}</Eyebrow>
                <p className="mt-3 font-display text-[clamp(40px,5vw,64px)] leading-none uppercase" style={{ color: meta.hexLight }}>
                  {tr(tier)}
                </p>
              </div>
              <Chip tone="night">{safety ? tr("Safety rule") : tr("Model output")}</Chip>
            </div>

            <div className="mt-8 space-y-5">
              {([
                ["Typical", probs.typical, "#8fbf5a"],
                ["Monitor", probs.monitor, "#e8b13a"],
                ["Refer", probs.refer, "#ee6a4f"],
              ] as const).map(([label, value, color]) => (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between text-[13px]">
                    <span className="font-semibold">{tr(label)}</span>
                    <span className="font-mono font-semibold">{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value * 100}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12px] leading-relaxed text-paper/65">
              <Activity className="mt-0.5 size-4 shrink-0 text-peach" />
              {hasBackendProbs
                ? tr("Probabilities are the backend model outputs for this completed session.")
                : latest.module === "B"
                  ? tr("Module B reports per-domain engine states rather than calibrated probabilities; these bars are illustrative only.")
                  : tr("Probabilities are illustrative outputs from this prototype’s local scoring formula. Clinical validation is pending.")}
            </p>

            {safety && (
              <p className="mt-auto flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 pt-4 text-[12.5px] leading-relaxed text-paper/80">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />
                <span>
                  <b className="text-paper">{tr("Protective override:")} </b>
                  {ev.reason}
                </span>
              </p>
            )}
          </section>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={80}>
            <section className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow index="03" tone="muted">{tr("Review summary")}</Eyebrow>
                <Chip tone="sea">{latest.source === "live" ? tr("Live backend result") : tr("Synthetic check-in")}</Chip>
              </div>
              <dl className="mt-5 divide-y divide-line">
                {[
                  [tr("Parent-facing recommendation"), tr(tier)],
                  [tr("Model classification"), tr(tier)],
                  [tr("Model"), modelLabel],
                  [tr("Highest class probability"), hasBackendProbs ? `${(confidence * 100).toFixed(1)}%` : tr("Per-domain engine result")],
                  [tr("Age"), `${latest.ageMonths} ${tr("months")}`],
                  [tr("Safety override"), safety ? tr("Yes") : tr("No")],
                ].map(([term, value]) => (
                  <div key={term} className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[12.5px] font-bold">{term}</dt>
                    <dd className="text-right text-[12.5px] font-semibold text-ink-2">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </Reveal>

          <Reveal delay={140}>
            <section className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <Eyebrow index="04" tone="muted">{tr("Next steps")}</Eyebrow>
              <div className="mt-4 grid gap-2">
                <Btn variant="rust" onClick={openWhatIf}>
                  <FlaskConical className="size-4" /> {tr("What-if simulator")}
                </Btn>
                <Btn variant="light" onClick={() => go("cases")}>
                  <Stethoscope className="size-4" /> {tr("Referral cases")}
                </Btn>
                <Btn variant="light" onClick={() => login("parent", "share")}>
                  <Share2 className="size-4" /> {tr("Family sharing")}
                </Btn>
                <Btn variant="light" onClick={() => login("parent", "growth")}>
                  <LineChart className="size-4" /> {tr("Growth trends")}
                </Btn>
                <Btn variant="soft" onClick={() => go("evidence")}>
                  {tr("Evidence")} <ArrowRight className="size-4" />
                </Btn>
              </div>
            </section>
          </Reveal>
        </div>
      </div>

      <Reveal className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow index="05">{tr("Parent area highlights")}</Eyebrow>
            <h2 className="mt-3 max-w-[760px] font-display text-[clamp(30px,4vw,52px)] leading-none uppercase">
              {tr("The same areas the family sees, with the underlying SD score.")}
            </h2>
          </div>
          <Btn size="sm" variant="light" onClick={openWhatIf}>
            <FlaskConical className="size-3.5" /> {tr("Open in what-if")}
          </Btn>
        </div>

        <div className="overflow-hidden rounded-[36px] border border-line-2 bg-card">
          {domainKeys(latest.scores).map((key) => {
            const status = domainStatus(latest.scores[key]);
            const score = latest.scores[key];
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 transition-colors last:border-0 hover:bg-card-2/60 sm:px-7"
              >
                <span className="size-3 shrink-0 rounded-[4px]" style={{ background: status.hex }} />
                <span className="w-[190px] shrink-0 truncate font-display text-[22px] leading-none uppercase sm:w-[240px]">
                  {DOMAINS[key].label}
                </span>
                <span className="hidden flex-1 truncate text-[11.5px] text-muted md:block">{DOMAINS[key].plain}</span>
                <Chip tone={statusTone(status.level)}>{status.label}</Chip>
                <span className="ml-auto w-14 text-right font-mono text-[13px] font-semibold" style={{ color: status.ink }}>
                  {score > 0 ? "+" : ""}
                  {score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      </Reveal>
    </Page>
  );
}
