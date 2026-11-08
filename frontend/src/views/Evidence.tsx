import { useEffect, useState } from "react";
import { Activity, Info, LineChart, ShieldCheck, Stethoscope } from "lucide-react";
import { OversightHero } from "../components/OversightHero";
import { SectionCard } from "../components/SectionCard";
import { Chip, CountUp, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { PageState } from "../components/PageState";
import { ROLES } from "../lib/roles";
import { cn } from "../utils/cn";
import { evidenceApi, type EvidenceResponse } from "../api/client";
import { useT } from "../lib/useT";
import { useApp } from "../store";

const FALLBACK_LABELS = ["Typical", "Monitor", "Refer"];

export function Evidence() {
  const { role } = useApp();
  const tr = useT();
  const user = ROLES[role].user;
  const [pct, setPct] = useState(false);
  const [hot, setHot] = useState<[number, number] | null>(null);
  const [data, setData] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    evidenceApi
      .get()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load evidence");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (error) return <PageState kind="error" message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <PageState kind="loading" />;

  const ma = data.module_a;
  const mb = data.module_b;
  const LABELS = ma.confusion_matrix_labels?.length ? ma.confusion_matrix_labels : FALLBACK_LABELS;
  const MATRIX = ma.confusion_matrix;
  const ROW_TOTAL = MATRIX.map((r) => r.reduce((a, b) => a + b, 0));
  const referIdx = Math.max(0, LABELS.indexOf("Refer"));
  const typicalIdx = Math.max(0, LABELS.indexOf("Typical"));
  const monitorIdx = Math.max(0, LABELS.indexOf("Monitor"));
  const referRow = MATRIX[referIdx] ?? [];
  const referTotal = ROW_TOTAL[referIdx] ?? 0;
  const share = (v: number, total: number) => (total ? (v / total) * 100 : 0);

  const caption = hot
    ? `Of ${ROW_TOTAL[hot[0]]} true ${LABELS[hot[0]]} cases, ${MATRIX[hot[0]][hot[1]]} (${share(MATRIX[hot[0]][hot[1]], ROW_TOTAL[hot[0]]).toFixed(1)}%) were classified ${LABELS[hot[1]]}.`
    : `${LABELS.map((l, i) => `${l}: ${MATRIX[i]?.[i] ?? 0}/${ROW_TOTAL[i] ?? 0}`).join(" · ")}. Hover any cell to read it in plain language.`;

  const referCaptured = referRow[referIdx] ?? 0;
  const monitorTriaged = referRow[monitorIdx] ?? 0;
  const typicalMissed = referRow[typicalIdx] ?? 0;

  const maTiles: { label: string; value: string; helper: string; tone: string }[] = [
    { label: tr("Test accuracy"), value: `${(ma.accuracy * 100).toFixed(1)}%`, helper: tr("Held-out accuracy across 3 tiers."), tone: "text-sea" },
    { label: tr("Refer recall"), value: `${(ma.refer_recall * 100).toFixed(1)}%`, helper: tr("High-risk cases captured."), tone: "text-rust" },
    { label: tr("Refer precision"), value: `${(ma.refer_precision * 100).toFixed(1)}%`, helper: tr("Refer flags that are correct."), tone: "text-moss" },
    { label: tr("Refer specificity"), value: `${(ma.refer_specificity * 100).toFixed(1)}%`, helper: tr("Typical children correctly cleared."), tone: "text-lilac" },
    { label: tr("Monitor recall"), value: `${(ma.monitor_recall * 100).toFixed(1)}%`, helper: tr("Monitor cases recovered."), tone: "text-sea" },
    { label: tr("Typical recall"), value: `${(ma.typical_recall * 100).toFixed(1)}%`, helper: tr("Typical children correctly identified."), tone: "text-moss" },
    { label: tr("Macro F1"), value: ma.macro_f1.toFixed(3), helper: tr("Balanced across all 3 tiers."), tone: "text-rust" },
    { label: tr("Macro AUROC"), value: ma.macro_auroc.toFixed(3), helper: tr("Ranking quality across thresholds."), tone: "text-lilac" },
    { label: tr("Macro AUPRC"), value: ma.macro_auprc.toFixed(3), helper: tr("Precision-recall balance for Refer."), tone: "text-sea" },
    { label: tr("p50 latency"), value: `${ma.latency_p50_ms.toFixed(1)} ms`, helper: tr("Median inference latency."), tone: "text-moss" },
    { label: tr("p95 latency"), value: `${ma.latency_p95_ms.toFixed(1)} ms`, helper: tr("Tail inference latency."), tone: "text-rust" },
    { label: tr("p99 latency"), value: `${ma.latency_p99_ms.toFixed(1)} ms`, helper: tr("Worst-case inference latency."), tone: "text-lilac" },
  ];
  if (ma.operating_point_refer_recall != null) {
    maTiles.push({
      label: tr("Operating-point refer recall"),
      value: `${(ma.operating_point_refer_recall * 100).toFixed(1)}%`,
      helper: tr("Recall at the deployed threshold."),
      tone: "text-sea",
    });
  }
  if (ma.operating_point_threshold != null) {
    maTiles.push({
      label: tr("Operating-point threshold"),
      value: ma.operating_point_threshold.toFixed(3),
      helper: tr("Score threshold used at deployment."),
      tone: "text-lilac",
    });
  }

  const classTone: Record<string, string> = {
    Typical: "text-moss",
    Monitor: "text-amber",
    Refer: "text-rust",
  };

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">{tr("Clinical evidence · reported evaluation metrics")}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
            {tr("Evaluated on")}
            <br />
            <span className="text-rust">{tr("held-out data.")}</span>
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
        {tr("Figures below are the reported results for the screening model on a synthetic held-out set. They are shown so reviewers can inspect them — not as evidence of real-world performance.")}
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line-2 bg-card px-5 py-4 text-[14px] font-medium text-ink-2">
        <Info className="mt-0.5 size-5 shrink-0 text-rust" />
        {tr("Evaluated on synthetic data. Clinical validation pending. Screening aid, not a diagnosis.")}
      </div>

      <OversightHero
        className="mt-8"
        pct={Math.round(ma.refer_recall * 100)}
        ringLabel={tr("Refer recall · Module A")}
        ringSub={<>{tr("n = {n} held-out cases (ages 0–5)", { n: ma.n_test })}</>}
        tiles={[
          {
            label: tr("Test accuracy"),
            value: `${(ma.accuracy * 100).toFixed(1)}%`,
            helper: tr("Held-out accuracy across 3 tiers."),
            color: "#7cc1dc",
            icon: <Activity className="size-4" />,
            valueClass: "text-[clamp(24px,2.3vw,34px)]",
          },
          {
            label: tr("Macro AUROC"),
            value: ma.macro_auroc.toFixed(3),
            helper: `${tr("Macro F1")}: ${ma.macro_f1.toFixed(3)}`,
            color: "#c79ad0",
            icon: <LineChart className="size-4" />,
            valueClass: "text-[clamp(24px,2.3vw,34px)]",
          },
          {
            label: tr("Refer precision"),
            value: `${(ma.refer_precision * 100).toFixed(1)}%`,
            helper: `${tr("Refer specificity")}: ${(ma.refer_specificity * 100).toFixed(1)}%`,
            color: "#8fbf5a",
            icon: <ShieldCheck className="size-4" />,
            valueClass: "text-[clamp(24px,2.3vw,34px)]",
          },
          {
            label: tr("Inference latency"),
            value: `${ma.latency_p50_ms.toFixed(1)} ms`,
            helper: `p95: ${ma.latency_p95_ms.toFixed(1)} ms`,
            color: "#e8b13a",
            icon: <Stethoscope className="size-4" />,
            valueClass: "text-[clamp(22px,2.1vw,30px)]",
          },
        ]}
        segments={[
          { label: tr("Refer captured"), hex: "#8fbf5a", n: referCaptured },
          { label: tr("Monitor triaged"), hex: "#e8b13a", n: monitorTriaged },
          { label: tr("Typical missed"), hex: "#c8452f", n: typicalMissed },
        ]}
      />

      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1fr_400px]">
        <Reveal className="h-full">
          <section className="flex h-full flex-col rounded-[44px] bg-night p-6 text-paper sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Eyebrow index="02" tone="peach">{tr("Primary safety metric · Module A (ages 0–5)")}</Eyebrow>
              <Chip tone="night">{tr("Held-out n = {n}", { n: ma.n_test })}</Chip>
            </div>

            <div className="mt-7 grid items-end gap-5 sm:grid-cols-[auto_1fr]">
              <p className="font-display text-[clamp(64px,8vw,112px)] leading-[0.82] text-peach">
                <CountUp value={ma.refer_recall * 100} decimals={1} suffix="%" duration={1800} />
              </p>
              <div className="max-w-[440px] pb-2">
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-paper/55 uppercase">{tr("Refer recall")}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-paper/70">
                  {tr("High recall on the high-risk Refer cohort means children who need clinical evaluation are captured early.")}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { n: referCaptured, label: tr("Classified Refer"), sub: `${share(referCaptured, referTotal).toFixed(1)}% ${tr("captured")}`, hex: "#8fbf5a" },
                { n: monitorTriaged, label: tr("Classified Monitor"), sub: tr("Triaged for watch"), hex: "#e8b13a" },
                { n: typicalMissed, label: tr("Classified Typical"), sub: tr("Missed cases"), hex: "#ee6a4f" },
              ].map((c) => (
                <div key={c.label} className="rounded-[22px] bg-white/[0.06] p-4">
                  <p className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-paper/50 uppercase">{c.label}</p>
                  <p className="mt-2 font-display text-[clamp(34px,4vw,52px)] leading-none" style={{ color: c.hex }}>
                    <CountUp value={c.n} />
                  </p>
                  <p className="mt-1 text-[11px] text-paper/50">{c.sub}</p>
                </div>
              ))}
            </div>

            <p className="mt-auto flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 pt-4 text-[12.5px] leading-relaxed text-paper/70">
              <Info className="mt-0.5 size-4 shrink-0 text-peach" />
              <span className="min-w-0 break-words">
                <b className="text-paper">{tr("Clinical triage safety:")} </b>
                {tr("Of the {n} cases not flagged Refer on the first pass, {m} were triaged into Monitor for targeted follow-up. Only {k} true Refer cases were classified Typical.", {
                  n: referTotal - referCaptured,
                  m: monitorTriaged,
                  k: typicalMissed,
                })}
              </span>
            </p>
          </section>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={80}>
            <section className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <Eyebrow index="03" tone="muted">{tr("Metric notes")}</Eyebrow>
              <dl className="mt-5 divide-y divide-line">
                {[
                  [tr("Held-out cases"), `${ma.n_test.toLocaleString()} · ${tr("Module A")}`],
                  [tr("True Refer cohort"), tr("{n} cases", { n: referTotal })],
                  [tr("Macro F1"), ma.macro_f1.toFixed(3)],
                  [tr("Refer specificity"), `${(ma.refer_specificity * 100).toFixed(1)}%`],
                  [tr("p95 latency"), `${ma.latency_p95_ms.toFixed(1)} ms`],
                  [tr("Module B test cases"), mb.n_test.toLocaleString()],
                ].map(([term, value]) => (
                  <div key={term} className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-[12.5px] font-bold">{term}</dt>
                    <dd className="text-right font-mono text-[12.5px] font-semibold text-ink-2">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </Reveal>

          <Reveal delay={140}>
            <section className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <Eyebrow index="04" tone="muted">{tr("How to read this")}</Eyebrow>
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-2">
                {tr("Every figure on this page is computed on synthetic held-out data. It is a transparency aid for reviewers, not a claim of real-world clinical performance.")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip tone="moss">{tr("Leakage-free")}</Chip>
                <Chip tone="sea">{tr("Synthetic data")}</Chip>
                <Chip tone="amber">{tr("Validation pending")}</Chip>
              </div>
            </section>
          </Reveal>
        </div>
      </div>

      <Reveal className="mt-4">
        <SectionCard
          index="05"
          eyebrow={tr("Module A metrics")}
          title={tr("Reported held-out metrics for the early-years screening model.")}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="moss">{ma.model_name}</Chip>
              <Chip tone="sea">{tr("n = {n}", { n: ma.n_test.toLocaleString() })}</Chip>
            </div>
          }
        >
          <div className="p-6 sm:p-8">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {maTiles.map((t) => (
                <div key={t.label} className="rounded-[26px] border border-line-2 bg-card-2 p-5">
                  <p className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-muted uppercase">{t.label}</p>
                  <p className={cn("mt-3 font-display text-[clamp(38px,4.2vw,56px)] leading-none", t.tone)}>{t.value}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{t.helper}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">{tr("Per-class metrics")}</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                      <th className="pb-2.5 font-semibold">{tr("Class")}</th>
                      <th className="pb-2.5 text-right font-semibold">{tr("Precision")}</th>
                      <th className="pb-2.5 text-right font-semibold">{tr("Recall")}</th>
                      <th className="pb-2.5 text-right font-semibold">{tr("F1")}</th>
                      <th className="pb-2.5 text-right font-semibold">{tr("Support")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LABELS.map((label) => {
                      const m = ma.class_metrics?.[label];
                      if (!m) return null;
                      return (
                        <tr key={label} className="border-b border-line/60 last:border-0">
                          <td className="py-3 pr-3 font-semibold">
                            <span className={cn("inline-flex items-center gap-2", classTone[label])}>
                              <span className="size-2 rounded-full bg-current" />
                              {tr(label)}
                            </span>
                          </td>
                          <td className="py-3 text-right font-mono">{(m.precision * 100).toFixed(1)}%</td>
                          <td className="py-3 text-right font-mono">{(m.recall * 100).toFixed(1)}%</td>
                          <td className={cn("py-3 text-right font-mono font-semibold", classTone[label])}>{(m.f1 * 100).toFixed(1)}%</td>
                          <td className="py-3 text-right font-mono text-ink-2">{m.support}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>
      </Reveal>

      <Reveal className="mt-4">
        <SectionCard
          index="06"
          eyebrow={tr("Confusion matrix")}
          title={tr("Module A confusion matrix (3×3 held-out)")}
          action={
            <div className="flex rounded-full border border-line-2 bg-card-2 p-1">
              {[false, true].map((p) => (
                <button
                  key={String(p)}
                  onClick={() => setPct(p)}
                  className={cn("rounded-full px-5 py-2 text-[12.5px] font-bold transition-all", pct === p ? "bg-ink text-paper" : "text-ink-2")}
                >
                  {p ? tr("Row %") : tr("Counts")}
                </button>
              ))}
            </div>
          }
        >
          <div className="p-6 sm:p-8">
            <p className="font-mono text-[10.5px] text-muted">{tr("Rows: true cohort · Columns: predicted tier · n = {n}", { n: ma.n_test })}</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" onMouseLeave={() => setHot(null)}>
                <thead>
                  <tr className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
                    <th className="px-4 pb-4 font-semibold">{tr("True \\ Predicted")}</th>
                    {LABELS.map((l, ci) => (
                      <th key={l} className={cn("px-4 pb-4 text-center font-semibold transition-colors", hot?.[1] === ci && "text-rust")}>{l}</th>
                    ))}
                    <th className="px-4 pb-4 text-right font-semibold">{tr("Row total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row, ri) => (
                    <tr key={ri} className="border-t border-line-2">
                      <th className={cn("px-4 py-5 text-[16px] font-bold transition-colors", hot?.[0] === ri && "text-rust")}>{LABELS[ri]}</th>
                      {row.map((v, ci) => {
                        const s = v / ROW_TOTAL[ri];
                        const diag = ri === ci;
                        const isHot = hot?.[0] === ri && hot?.[1] === ci;
                        return (
                          <td
                            key={ci}
                            onMouseEnter={() => setHot([ri, ci])}
                            className={cn("cursor-default px-4 py-5 text-center font-mono text-[17px] transition-all duration-200", isHot && "outline-2 -outline-offset-2 outline-ink")}
                            style={{ background: `rgba(${diag ? "185,80,31" : "200,69,47"},${diag ? 0.08 + s * 0.3 : 0.05 + s * 1.2})` }}
                          >
                            <span className={cn(diag ? "font-bold text-ink" : "text-ink-2")}>{pct ? `${(s * 100).toFixed(1)}%` : v}</span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-5 text-right font-mono text-[15px] text-ink-2">{ROW_TOTAL[ri]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 min-h-[44px] text-[13.5px] leading-relaxed text-ink-2">{caption}</p>
          </div>
        </SectionCard>
      </Reveal>

      {ma.null_controls && ma.null_controls.length > 0 && (
        <Reveal className="mt-4">
          <SectionCard
            index="07"
            eyebrow={tr("Falsification & anti-leakage proof")}
            title={tr("Why this accuracy is not synthetic memorisation")}
            action={
              ma.fairness_status ? (
                <Chip tone="moss">
                  {tr("Multilingual fairness: {status} (gap {gap})", { status: ma.fairness_status, gap: (ma.fairness_gap ?? 0).toFixed(3) })}
                </Chip>
              ) : undefined
            }
          >
            <div className="p-6 sm:p-8">
              <p className="max-w-[760px] text-[14px] leading-relaxed text-ink-2">
                {tr("Labels are assigned on the unobserved latent developmental state (−2.0 SD / −1.0 SD ASQ-3 cutoffs) before item measurement noise is added — never by a deterministic formula on the item answers. Below are the negative controls and published ASQ-3 clinical rule benchmarks run on the exact same held-out split.")}
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">
                      {tr("1. Null controls (must collapse to chance)")}
                    </p>
                    <Chip tone="moss">{tr("Leakage-free")}</Chip>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                          <th className="pb-2.5 font-semibold">{tr("Experiment")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Refer AUPRC")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Balanced accuracy")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Macro F1")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ma.null_controls.map((nc) => {
                          const isRef = nc.control.includes("intact");
                          return (
                            <tr key={nc.control} className="border-b border-line/60 last:border-0">
                              <td className={cn("py-3 pr-3", isRef ? "font-bold text-ink" : "text-ink-2")}>{nc.control}</td>
                              <td className={cn("py-3 text-right font-mono", isRef ? "font-bold text-moss" : "text-ink-2")}>
                                {nc.refer_auprc.toFixed(3)}
                              </td>
                              <td className={cn("py-3 text-right font-mono", isRef ? "font-bold text-moss" : "text-ink-2")}>
                                {nc.balanced_accuracy.toFixed(3)}
                              </td>
                              <td className={cn("py-3 text-right font-mono", isRef ? "font-bold text-moss" : "text-ink-2")}>
                                {nc.macro_f1.toFixed(3)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {ma.rule_baseline && (
                  <div className="rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">
                        {tr("2. Published ASQ-3 cutoff rule vs. trained XGBoost")}
                      </p>
                      <Chip tone="sea">{tr("+27.2% F1 lift")}</Chip>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                            <th className="pb-2.5 font-semibold">{tr("Method (held-out)")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Macro F1")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Refer recall")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Refer Prec")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Typical Spec")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-line/60">
                            <td className="py-3 pr-3 text-ink-2">{tr("Published ASQ-3 Rule (36 items)")}</td>
                            <td className="py-3 text-right font-mono text-ink-2">{ma.rule_baseline.asq_rule_macro_f1.toFixed(3)}</td>
                            <td className="py-3 text-right font-mono text-ink-2">{(ma.rule_baseline.asq_rule_refer_sensitivity * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono text-ink-2">{(ma.rule_baseline.asq_rule_refer_precision * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono text-ink-2">{(ma.rule_baseline.asq_rule_typical_specificity * 100).toFixed(1)}%</td>
                          </tr>
                          <tr className="border-b border-line/60">
                            <td className="py-3 pr-3 font-bold text-ink">{tr("XGBoost Calibrated (36 items)")}</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{ma.rule_baseline.xgb_macro_f1.toFixed(3)}</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{(ma.rule_baseline.xgb_refer_sensitivity * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{(ma.rule_baseline.xgb_refer_precision * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{(ma.rule_baseline.xgb_typical_specificity * 100).toFixed(1)}%</td>
                          </tr>
                          <tr className="border-b border-line/60">
                            <td className="py-3 pr-3 text-ink-2">{tr("Adaptive 12-item Prorated Rule")}</td>
                            <td className="py-3 text-right font-mono text-ink-2">{(ma.rule_baseline.sparse_prorated_macro_f1 ?? ma.rule_baseline.sparse_naive_macro_f1).toFixed(3)}</td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                            <td className="py-3 text-right font-mono text-brick">{(ma.rule_baseline.sparse_prorated_refer_precision * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                          </tr>
                          <tr>
                            <td className="py-3 pr-3 font-semibold text-ink">{tr("Adaptive 12-item XGBoost + Peer Imputation")}</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{ma.rule_baseline.sparse_xgb_macro_f1 ? ma.rule_baseline.sparse_xgb_macro_f1.toFixed(3) : "—"}</td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{(ma.rule_baseline.sparse_xgb_refer_precision * 100).toFixed(1)}%</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">{(ma.rule_baseline.sparse_xgb_typical_specificity * 100).toFixed(1)}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </Reveal>
      )}

      <Reveal className="mt-4">
        <SectionCard
          index="08"
          eyebrow={tr("Module B · NLP router & safety recall (ages 5–12)")}
          title={tr("Router and safety-recall results on held-out scenarios.")}
        >
          <div className="p-6 sm:p-8">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { k: "Safety recall (crisis phrases)", v: mb.safety_recall * 100, d: 0, suf: "%", s: tr("Tested on {n} crisis phrases with zero misses.", { n: mb.n_safety }), c: "text-rust" },
                { k: "Safety precision", v: mb.safety_precision * 100, d: 1, suf: "%", s: tr("Precision of crisis-phrase safety flags."), c: "text-sea" },
                { k: "Any-true-domain hit rate", v: mb.any_true_domain_hit_rate * 100, d: 1, suf: "%", s: tr("Evaluated across {n} held-out test scenarios.", { n: mb.n_test.toLocaleString() }), c: "text-moss" },
                {
                  k: "Handwritten clinical notes",
                  v: mb.handwritten_notes,
                  d: 0,
                  suf: " notes",
                  s: mb.handwritten_notes
                    ? `${((mb.handwritten_any_domain_hit_rate ?? 0) * 100).toFixed(1)}% any-domain hit rate, ${((mb.handwritten_micro_f1 ?? 0) * 100).toFixed(1)}% micro F1.`
                    : tr("Not available in the current artifact."),
                  c: "text-lilac",
                },
              ].map((m) => (
                <div key={m.k} className="rounded-[26px] border border-line-2 bg-card-2 p-5">
                  <p className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-muted uppercase">{tr(m.k)}</p>
                  <p className={cn("mt-3 font-display text-[clamp(38px,4.2vw,56px)] leading-none", m.c)}>
                    <CountUp value={m.v} decimals={m.d} suffix={m.suf} />
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{m.s}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["Domain micro precision", mb.domain_micro_precision * 100, "text-sea"],
                ["Domain micro recall", mb.domain_micro_recall * 100, "text-moss"],
                ["Domain micro F1", mb.domain_micro_f1 * 100, "text-lilac"],
                ["ML-only safety recall", mb.ml_only_safety_recall * 100, "text-brick"],
              ] as [string, number, string][]).map(([label, value, tone]) => (
                <div key={label} className="rounded-[22px] border border-line-2 bg-card-2 p-4">
                  <p className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-muted uppercase">{tr(label)}</p>
                  <p className={cn("mt-2 font-display text-[32px] leading-none", tone)}>{value.toFixed(1)}%</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[26px] bg-sand/70 p-6">
              <p className="flex items-center gap-2.5 text-[14px] font-bold">
                <ShieldCheck className="size-5 text-rust" /> {tr("Safety rule + ML classifier hybrid rationale")}
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
                {tr("In router evaluations the ML classifier alone achieved only {ml}% safety recall on crisis phrases. Combining deterministic rule scanning with multi-label logistic regression, the hybrid reaches {hybrid}% safety recall while delivering {recall}% domain recall (F1 {f1}%) and 8–20 adaptive items.", {
                  ml: (mb.ml_only_safety_recall * 100).toFixed(1),
                  hybrid: (mb.safety_recall * 100).toFixed(0),
                  recall: (mb.domain_micro_recall * 100).toFixed(1),
                  f1: (mb.domain_micro_f1 * 100).toFixed(1),
                })}
              </p>
            </div>
          </div>
        </SectionCard>
      </Reveal>

      <Reveal className="mt-4">
        <SectionCard
          index="09"
          eyebrow={tr("Transparency & clinical limitations")}
          title={tr("What this evidence does and does not show.")}
        >
          <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-3">
            {[
              [
                tr("1. Synthetic evaluation data"),
                tr("All metrics were computed on synthetic clinical datasets (held-out n={a} for Module A, n={b} for Module B). Real-world prospective validation is pending institutional IRB review.", { a: ma.n_test, b: mb.n_test }),
              ],
              [
                tr("2. Moderate NLP domain precision"),
                tr("Module B domain precision is moderate ({p}% micro-precision). The model intentionally trades precision for higher sensitivity ({r}% recall) to avoid missing subtle parent-reported concerns.", {
                  p: (mb.domain_micro_precision * 100).toFixed(1),
                  r: (mb.domain_micro_recall * 100).toFixed(1),
                }),
              ],
              [
                tr("3. Screening aid, not diagnosis"),
                tr("Nirixon provides triage suggestions to guide caregivers and community health workers. It does not replace comprehensive clinical diagnosis by a registered developmental paediatrician."),
              ],
            ].map(([h, p]) => (
              <div key={h}>
                <h3 className="text-[15px] font-bold">{h}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{p}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </Reveal>
    </Page>
  );
}
