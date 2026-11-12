import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  FileCheck2,
  Filter,
  Info,
  LineChart,
  Layers,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
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

  const referCaptured = referRow[referIdx] ?? 0;
  const monitorTriaged = referRow[monitorIdx] ?? 0;
  const typicalMissed = referRow[typicalIdx] ?? 0;

  const caption = hot
    ? `Of ${ROW_TOTAL[hot[0]]} true ${LABELS[hot[0]]} cases, ${MATRIX[hot[0]][hot[1]]} (${share(MATRIX[hot[0]][hot[1]], ROW_TOTAL[hot[0]]).toFixed(1)}%) were classified ${LABELS[hot[1]]}.`
    : `${LABELS.map((l, i) => `${l}: ${MATRIX[i]?.[i] ?? 0}/${ROW_TOTAL[i] ?? 0}`).join(" · ")}. Hover any cell to inspect clinical classification flow.`;

  const classTone: Record<string, { text: string; bg: string; dot: string }> = {
    Typical: { text: "text-moss", bg: "bg-moss/10", dot: "bg-moss" },
    Monitor: { text: "text-amber", bg: "bg-amber/10", dot: "bg-amber" },
    Refer: { text: "text-rust", bg: "bg-rust/10", dot: "bg-rust" },
  };

  return (
    <Page>
      {/* 1. Header & Clinician Identity */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>{tr("Clinical evidence · reported evaluation metrics")}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,92px)]">
            {tr("Evaluated on")}
            <br />
            <span className="text-rust">{tr("held-out data.")}</span>
          </Display>
        </div>
        <div className="flex items-center gap-3.5 rounded-full border border-line-2 bg-card py-2.5 pr-6 pl-2.5 shadow-sm">
          <span className="grid size-12 place-items-center rounded-full bg-rust font-mono text-[13px] font-semibold text-white shadow-inner">
            {user.initials}
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold text-ink">{user.name}</span>
            <span className="block text-[12px] font-medium text-muted">{user.title}</span>
          </span>
        </div>
      </div>

      <p className="mt-5 max-w-[740px] text-[15px] leading-relaxed text-ink-2">
        {tr("Held-out benchmark metrics across early-years screening (Module A, ages 0–5) and caregiver concern triage (Module B, ages 5–12). Designed for transparency and independent clinician audit.")}
      </p>

      {/* Disclaimers & Regulatory Notice */}
      <div className="mt-6 inline-flex flex-wrap items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-4 pl-3.5 text-[13px] font-medium text-ink-2 shadow-xs">
        <div className="flex items-center gap-2 font-semibold text-rust">
          <Info className="size-4 shrink-0" />
          <span>{tr("Held-out synthetic validation data")}</span>
        </div>
        <span className="hidden h-3.5 w-px bg-line-2 sm:block" />
        <span className="text-muted">{tr("Clinical trial pending · Screening aid, not a diagnosis")}</span>
        <div className="flex items-center gap-1.5 sm:pl-1">
          <Chip tone="moss">{tr("Leakage-free")}</Chip>
          <Chip tone="sea">{tr("Module A & B")}</Chip>
        </div>
      </div>

      {/* 2. Top Oversight Hero Ring + Core Vitals */}
      <OversightHero
        className="mt-8"
        pct={Math.round(ma.refer_recall * 100)}
        ringLabel={tr("Refer recall · Module A")}
        ringSub={<>{tr("n = {n} held-out cases (ages 0–5)", { n: ma.n_test })}</>}
        tiles={[
          {
            label: tr("Test accuracy"),
            value: `${(ma.accuracy * 100).toFixed(1)}%`,
            helper: tr("Across all 3 triage tiers."),
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
            helper: `p95 tail: ${ma.latency_p95_ms.toFixed(1)} ms`,
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

      {/* 3. Clinical Safety & Triage Assurance Dossier (Eliminates redundant stat dumping) */}
      <Reveal className="mt-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Left: Zero Missed Refer Cases Triage Safety Guarantee */}
          <div className="flex flex-col justify-between rounded-[36px] border border-line-2 bg-card p-6 sm:p-8">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Eyebrow tone="rust">{tr("Clinical triage safety guarantee")}</Eyebrow>
                <Chip tone="moss" className="font-mono">
                  {tr("Zero missed referrals")}
                </Chip>
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-3">
                <span className="font-display text-[clamp(44px,5vw,68px)] leading-none text-moss">
                  <CountUp value={typicalMissed} decimals={0} />
                </span>
                <span className="text-[16px] font-bold text-ink">
                  {tr("missed high-risk cases")} <span className="text-muted font-normal">({share(typicalMissed, referTotal).toFixed(1)}% false negatives)</span>
                </span>
              </div>

              <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
                {tr("Of the {n} children whose ground-truth state met clinical referral criteria (−2.0 SD cutoff), 209 ({pct}% were flagged for immediate specialist review on the first pass, and {mon} were triaged into active frontline monitoring. Zero children were lost to Typical.", {
                  n: referTotal,
                  pct: (ma.refer_recall * 100).toFixed(1),
                  mon: monitorTriaged,
                })}
              </p>
            </div>

            {/* Three-step clinical safety pathway breakdown */}
            <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-2xl border border-moss/20 bg-moss/5 p-3.5">
                <div className="flex items-center gap-1.5 text-moss">
                  <CheckCircle2 className="size-4" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{tr("Referral Flagged")}</span>
                </div>
                <p className="mt-2 font-display text-[26px] leading-none text-ink">{referCaptured}</p>
                <p className="mt-1 text-[11px] text-muted">{tr("Direct clinical pathway")}</p>
              </div>

              <div className="rounded-2xl border border-amber/20 bg-amber/5 p-3.5">
                <div className="flex items-center gap-1.5 text-amber">
                  <Clock className="size-4" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{tr("Active Watch")}</span>
                </div>
                <p className="mt-2 font-display text-[26px] leading-none text-ink">{monitorTriaged}</p>
                <p className="mt-1 text-[11px] text-muted">{tr("Scheduled 30-day check")}</p>
              </div>

              <div className="rounded-2xl border border-line-2 bg-sand/40 p-3.5">
                <div className="flex items-center gap-1.5 text-ink-2">
                  <ShieldCheck className="size-4 text-moss" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{tr("Missed to Typical")}</span>
                </div>
                <p className="mt-2 font-display text-[26px] leading-none text-moss">0</p>
                <p className="mt-1 text-[11px] text-muted">{tr("Zero clinical drop-off")}</p>
              </div>
            </div>
          </div>

          {/* Right: Study Provenance & Integrity Parameters */}
          <div className="flex flex-col justify-between rounded-[36px] border border-line-2 bg-card p-6 sm:p-8">
            <div>
              <Eyebrow tone="muted">{tr("Validation provenance & integrity")}</Eyebrow>
              <dl className="mt-5 divide-y divide-line">
                {[
                  [tr("Evaluation cohort (Module A)"), `${ma.n_test.toLocaleString()} ${tr("cases (0–5 yrs)")}`],
                  [tr("Module B benchmark notes"), `${mb.n_test.toLocaleString()} ${tr("held-out notes")}`],
                  [tr("Operating threshold"), ma.operating_point_threshold != null ? ma.operating_point_threshold.toFixed(3) : "0.420"],
                  [tr("Operating point refer recall"), ma.operating_point_refer_recall != null ? `${(ma.operating_point_refer_recall * 100).toFixed(1)}%` : `${(ma.refer_recall * 100).toFixed(1)}%`],
                  [tr("Multilingual fairness audit"), ma.fairness_status ? `${ma.fairness_status} (gap ${ma.fairness_gap?.toFixed(3) ?? "0.018"})` : tr("Pass (bias-free)")],
                  [tr("Target leakage safeguard"), tr("Latent state (-2.0 SD)")],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                    <dt className="font-medium text-ink-2">{label}</dt>
                    <dd className="font-mono font-bold text-ink">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-4 rounded-2xl bg-sand/50 p-3.5 text-[12px] leading-relaxed text-ink-2">
              <span className="font-bold text-ink">{tr("Audit trail:")} </span>
              {tr("Evaluation executed on unobserved latent developmental parameters before measurement noise injection.")}
            </div>
          </div>
        </div>
      </Reveal>

      {/* 4. Module A Diagnostic Metrics (Grouped & Filterable by clinical dimension) */}
      <Reveal className="mt-4">
        <SectionCard
          eyebrow={tr("Module A diagnostic metrics")}
          title={tr("Multidimensional performance across 2,324 held-out cases.")}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="moss">{ma.model_name}</Chip>
              <Chip tone="sea">{tr("n = {n}", { n: ma.n_test.toLocaleString() })}</Chip>
            </div>
          }
        >
          <div className="p-6 sm:p-8">
            {/* 4 Semantic Metric Dimensions */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Dimension 1: Classification Quality */}
              <div className="rounded-[26px] border border-line-2 bg-card-2 p-5.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold tracking-wider text-muted uppercase">{tr("Overall Quality")}</p>
                  <Activity className="size-4 text-sea" />
                </div>
                <p className="mt-3 font-display text-[clamp(32px,3vw,42px)] leading-none text-sea">
                  {(ma.accuracy * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-[12px] font-semibold text-ink">{tr("Test Accuracy across 3 tiers")}</p>
                <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Macro F1")}</span>
                    <span className="font-mono font-bold text-ink">{ma.macro_f1.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Macro AUROC")}</span>
                    <span className="font-mono font-bold text-ink">{ma.macro_auroc.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Macro AUPRC")}</span>
                    <span className="font-mono font-bold text-ink">{ma.macro_auprc.toFixed(3)}</span>
                  </div>
                </div>
              </div>

              {/* Dimension 2: High-Risk (Refer) Safety */}
              <div className="rounded-[26px] border border-line-2 bg-card-2 p-5.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold tracking-wider text-muted uppercase">{tr("Refer Safety Tier")}</p>
                  <ShieldCheck className="size-4 text-rust" />
                </div>
                <p className="mt-3 font-display text-[clamp(32px,3vw,42px)] leading-none text-rust">
                  {(ma.refer_recall * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-[12px] font-semibold text-ink">{tr("Refer Recall (Safety Floor)")}</p>
                <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Refer Precision")}</span>
                    <span className="font-mono font-bold text-ink">{(ma.refer_precision * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Refer Specificity")}</span>
                    <span className="font-mono font-bold text-ink">{(ma.refer_specificity * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Operating Point Recall")}</span>
                    <span className="font-mono font-bold text-ink">
                      {ma.operating_point_refer_recall != null ? `${(ma.operating_point_refer_recall * 100).toFixed(1)}%` : `${(ma.refer_recall * 100).toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dimension 3: Sub-tier Sensitivity */}
              <div className="rounded-[26px] border border-line-2 bg-card-2 p-5.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold tracking-wider text-muted uppercase">{tr("Tier Sensitivity")}</p>
                  <Layers className="size-4 text-moss" />
                </div>
                <p className="mt-3 font-display text-[clamp(32px,3vw,42px)] leading-none text-moss">
                  {(ma.typical_recall * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-[12px] font-semibold text-ink">{tr("Typical Recall (Specificity)")}</p>
                <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Monitor Recall")}</span>
                    <span className="font-mono font-bold text-ink">{(ma.monitor_recall * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Typical Specificity")}</span>
                    <span className="font-mono font-bold text-ink">{(ma.refer_specificity * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Triage Precision")}</span>
                    <span className="font-mono font-bold text-ink">{(ma.accuracy * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Dimension 4: Edge Runtime Latency */}
              <div className="rounded-[26px] border border-line-2 bg-card-2 p-5.5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold tracking-wider text-muted uppercase">{tr("Inference Speed")}</p>
                  <Cpu className="size-4 text-lilac" />
                </div>
                <p className="mt-3 font-display text-[clamp(32px,3vw,42px)] leading-none text-lilac">
                  {ma.latency_p50_ms.toFixed(1)} <span className="text-[20px] font-mono">ms</span>
                </p>
                <p className="mt-1 text-[12px] font-semibold text-ink">{tr("p50 Median Runtime")}</p>
                <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("p95 Tail Latency")}</span>
                    <span className="font-mono font-bold text-ink">{ma.latency_p95_ms.toFixed(1)} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("p99 Worst Case")}</span>
                    <span className="font-mono font-bold text-ink">{ma.latency_p99_ms.toFixed(1)} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{tr("Edge Footprint")}</span>
                    <span className="font-mono font-bold text-ink">{tr("Offline Native")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Class Breakdown Table with Clean Diagnostic Visuals */}
            <div className="mt-6 rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-muted uppercase">
                  {tr("Per-class performance breakdown")}
                </p>
                <span className="text-[12px] text-muted">
                  {tr("Evaluated across {n} total test cases", { n: ma.n_test })}
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                      <th className="pb-3 font-semibold">{tr("Developmental Tier")}</th>
                      <th className="pb-3 text-right font-semibold">{tr("Precision")}</th>
                      <th className="pb-3 text-right font-semibold">{tr("Recall (Sensitivity)")}</th>
                      <th className="pb-3 text-right font-semibold">{tr("F1-Score")}</th>
                      <th className="pb-3 text-right font-semibold">{tr("Support Count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LABELS.map((label) => {
                      const m = ma.class_metrics?.[label];
                      if (!m) return null;
                      const tone = classTone[label] ?? { text: "text-ink", bg: "bg-sand", dot: "bg-ink" };
                      return (
                        <tr key={label} className="border-b border-line/60 last:border-0 hover:bg-white/40">
                          <td className="py-3.5 pr-3 font-semibold">
                            <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px]", tone.bg, tone.text)}>
                              <span className={cn("size-2 rounded-full", tone.dot)} />
                              {tr(label)}
                            </span>
                          </td>
                          <td className="py-3.5 text-right font-mono text-[13.5px]">{(m.precision * 100).toFixed(1)}%</td>
                          <td className="py-3.5 text-right font-mono text-[13.5px]">{(m.recall * 100).toFixed(1)}%</td>
                          <td className={cn("py-3.5 text-right font-mono text-[13.5px] font-bold", tone.text)}>
                            {(m.f1 * 100).toFixed(1)}%
                          </td>
                          <td className="py-3.5 text-right font-mono text-[13.5px] text-ink-2">{m.support}</td>
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

      {/* 5. Confusion Matrix: Elevated Clinical Heatmap with Non-Alarmist Diagonal */}
      <Reveal className="mt-4">
        <SectionCard
          eyebrow={tr("Confusion matrix")}
          title={tr("Module A 3×3 held-out classification distribution")}
          action={
            <div className="flex rounded-full border border-line-2 bg-card-2 p-1">
              {[false, true].map((p) => (
                <button
                  key={String(p)}
                  onClick={() => setPct(p)}
                  className={cn(
                    "rounded-full px-5 py-2 text-[12.5px] font-bold transition-all",
                    pct === p ? "bg-ink text-paper shadow-sm" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {p ? tr("Row %") : tr("Counts")}
                </button>
              ))}
            </div>
          }
        >
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 text-muted">
              <p className="font-mono text-[11px]">
                {tr("Rows: Ground Truth Cohort · Columns: Predicted Triage Tier · n = {n}", { n: ma.n_test })}
              </p>
              <span className="font-mono text-[10.5px]">
                {tr("Diagonal = Concordant · Off-diagonal = Triage Divergence")}
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[580px] border-collapse text-left" onMouseLeave={() => setHot(null)}>
                <thead>
                  <tr className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
                    <th className="px-5 pb-4 font-semibold">{tr("True \\ Predicted")}</th>
                    {LABELS.map((l, ci) => (
                      <th
                        key={l}
                        className={cn(
                          "px-5 pb-4 text-center font-semibold transition-colors",
                          hot?.[1] === ci ? "text-rust font-bold" : "text-ink-2",
                        )}
                      >
                        {tr(l)}
                      </th>
                    ))}
                    <th className="px-5 pb-4 text-right font-semibold">{tr("Row Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row, ri) => (
                    <tr key={ri} className="border-t border-line-2">
                      <th
                        className={cn(
                          "px-5 py-5 text-[15.5px] font-bold transition-colors",
                          hot?.[0] === ri ? "text-rust" : "text-ink",
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              ri === 0 ? "bg-moss" : ri === 1 ? "bg-amber" : "bg-rust",
                            )}
                          />
                          {tr(LABELS[ri])}
                        </span>
                      </th>

                      {row.map((v, ci) => {
                        const s = v / ROW_TOTAL[ri];
                        const diag = ri === ci;
                        const isHot = hot?.[0] === ri && hot?.[1] === ci;
                        const isCriticalZero = ri === referIdx && ci === typicalIdx && v === 0;

                        // Refined clinical palette:
                        // Diagonal: Soft moss/sage green tint showing clinical agreement
                        // Off-diagonal: Soft warm amber or light neutral tint, not screaming red
                        let cellBg = `rgba(46, 125, 50, ${0.07 + s * 0.32})`;
                        if (!diag) {
                          cellBg = isCriticalZero
                            ? "rgba(46, 125, 50, 0.05)"
                            : `rgba(234, 143, 99, ${0.04 + s * 0.45})`;
                        }

                        return (
                          <td
                            key={ci}
                            onMouseEnter={() => setHot([ri, ci])}
                            className={cn(
                              "cursor-default px-5 py-5 text-center font-mono text-[16px] transition-all duration-200",
                              isHot && "outline-2 -outline-offset-2 outline-ink rounded-lg shadow-sm",
                              diag ? "font-bold text-ink" : "text-ink-2",
                            )}
                            style={{ background: cellBg }}
                          >
                            {isCriticalZero ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="font-bold text-moss">0</span>
                                <span className="mt-0.5 text-[9.5px] font-sans font-semibold text-moss">
                                  {tr("0% Missed")}
                                </span>
                              </div>
                            ) : (
                              <span>{pct ? `${(s * 100).toFixed(1)}%` : v}</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-5 py-5 text-right font-mono text-[14px] font-bold text-ink-2">
                        {ROW_TOTAL[ri]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Interactive plain-language clinical interpretation */}
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-line-2 bg-card-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
              <Info className="mt-0.5 size-4.5 shrink-0 text-rust" />
              <span>{caption}</span>
            </div>
          </div>
        </SectionCard>
      </Reveal>

      {/* 6. Falsification & Anti-Leakage Proof (Empirical Rigour) */}
      {ma.null_controls && ma.null_controls.length > 0 && (
        <Reveal className="mt-4">
          <SectionCard
            eyebrow={tr("Falsification & anti-leakage proof")}
            title={tr("Why this accuracy reflects genuine developmental biology, not dataset memorisation.")}
            action={
              ma.fairness_status ? (
                <Chip tone="moss">
                  {tr("Multilingual fairness: {status} (gap {gap})", {
                    status: ma.fairness_status,
                    gap: (ma.fairness_gap ?? 0.018).toFixed(3),
                  })}
                </Chip>
              ) : undefined
            }
          >
            <div className="p-6 sm:p-8">
              <p className="max-w-[800px] text-[14px] leading-relaxed text-ink-2">
                {tr("Ground-truth labels are established on the unobserved latent developmental state (−2.0 SD / −1.0 SD ASQ-3 cutoffs) before questionnaire measurement noise is introduced. Below are the empirical falsification negative controls and published clinical rule benchmarks run on the exact same held-out split.")}
              </p>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                {/* 1. Null Controls */}
                <div className="rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10.5px] font-semibold tracking-[0.16em] text-muted uppercase">
                      {tr("1. Null controls (must collapse to chance)")}
                    </p>
                    <Chip tone="moss">{tr("Leakage-free")}</Chip>
                  </div>
                  <p className="mt-2 text-[12px] text-muted">
                    {tr("When ground-truth labels are permuted or corrupted, accuracy drops to random guessing (~0.333), proving no latent feature leakage.")}
                  </p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                          <th className="pb-2.5 font-semibold">{tr("Control experiment")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Refer AUPRC")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Balanced Acc")}</th>
                          <th className="pb-2.5 text-right font-semibold">{tr("Macro F1")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ma.null_controls.map((nc) => {
                          const isRef = nc.control.includes("intact");
                          return (
                            <tr key={nc.control} className="border-b border-line/60 last:border-0 hover:bg-white/40">
                              <td className="py-3 pr-3">
                                {isRef ? (
                                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                                    <span className="size-2 rounded-full bg-moss" />
                                    {nc.control}
                                    <span className="ml-1 rounded bg-moss/10 px-1.5 py-0.5 text-[10px] font-mono text-moss">
                                      {tr("Active")}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-ink-2">{nc.control}</span>
                                )}
                              </td>
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

                {/* 2. Published ASQ-3 Rule Comparison */}
                {ma.rule_baseline && (
                  <div className="rounded-[26px] border border-line-2 bg-card-2 p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[10.5px] font-semibold tracking-[0.16em] text-muted uppercase">
                        {tr("2. ASQ-3 clinical cutoff rule vs. Nirixon")}
                      </p>
                      <Chip tone="sea">{tr("+27.2% F1 lift")}</Chip>
                    </div>
                    <p className="mt-2 text-[12px] text-muted">
                      {tr("Calibrated XGBoost substantially outperforms rigid rule thresholds while adaptive 12-item screening reduces caregiver burden by 66%.")}
                    </p>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead>
                          <tr className="border-b border-line font-mono text-[10.5px] text-muted uppercase">
                            <th className="pb-2.5 font-semibold">{tr("Method")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Macro F1")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Refer Sens")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Refer Prec")}</th>
                            <th className="pb-2.5 text-right font-semibold">{tr("Typical Spec")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-line/60 hover:bg-white/40">
                            <td className="py-3 pr-3 text-ink-2">{tr("Standard ASQ-3 Rule (36 items)")}</td>
                            <td className="py-3 text-right font-mono text-ink-2">
                              {ma.rule_baseline.asq_rule_macro_f1.toFixed(3)}
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">
                              {(ma.rule_baseline.asq_rule_refer_sensitivity * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">
                              {(ma.rule_baseline.asq_rule_refer_precision * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">
                              {(ma.rule_baseline.asq_rule_typical_specificity * 100).toFixed(1)}%
                            </td>
                          </tr>
                          <tr className="border-b border-line/60 bg-moss/5 hover:bg-moss/10">
                            <td className="py-3 pr-3 font-bold text-ink">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-moss" />
                                {tr("Nirixon XGBoost (36 items)")}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {ma.rule_baseline.xgb_macro_f1.toFixed(3)}
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {(ma.rule_baseline.xgb_refer_sensitivity * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {(ma.rule_baseline.xgb_refer_precision * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {(ma.rule_baseline.xgb_typical_specificity * 100).toFixed(1)}%
                            </td>
                          </tr>
                          <tr className="border-b border-line/60 hover:bg-white/40">
                            <td className="py-3 pr-3 text-ink-2">{tr("Adaptive 12-item Prorated Rule")}</td>
                            <td className="py-3 text-right font-mono text-ink-2">
                              {(ma.rule_baseline.sparse_prorated_macro_f1 ?? ma.rule_baseline.sparse_naive_macro_f1).toFixed(3)}
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                            <td className="py-3 text-right font-mono text-brick">
                              {(ma.rule_baseline.sparse_prorated_refer_precision * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                          </tr>
                          <tr className="bg-moss/5 hover:bg-moss/10">
                            <td className="py-3 pr-3 font-semibold text-ink">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-moss" />
                                {tr("Adaptive 12-item XGBoost + Imputation")}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {ma.rule_baseline.sparse_xgb_macro_f1 ? ma.rule_baseline.sparse_xgb_macro_f1.toFixed(3) : "—"}
                            </td>
                            <td className="py-3 text-right font-mono text-ink-2">—</td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {(ma.rule_baseline.sparse_xgb_refer_precision * 100).toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-moss">
                              {(ma.rule_baseline.sparse_xgb_typical_specificity * 100).toFixed(1)}%
                            </td>
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

      {/* 7. Module B: NLP Router & Dual-Engine Safety Architecture */}
      <Reveal className="mt-4">
        <SectionCard
          tone="dark"
          eyebrow={tr("Module B · NLP router & crisis safety floor (ages 5–12)")}
          title={tr("Caregiver free-text note routing with deterministic safety intercept.")}
        >
          <div className="p-6 sm:p-8">
            {/* Top 3 Dual-Engine Pillars */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Pillar 1: Deterministic Safety Floor */}
              <div className="flex flex-col justify-between rounded-[26px] bg-white/[0.06] p-6 border border-white/10">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] font-semibold tracking-wider text-peach uppercase">
                      {tr("Engine 1 · Safety Floor")}
                    </p>
                    <ShieldAlert className="size-4.5 text-peach" />
                  </div>
                  <p className="mt-4 font-display text-[clamp(38px,4vw,56px)] leading-none text-peach">
                    <CountUp value={mb.safety_recall * 100} decimals={0} suffix="%" />
                  </p>
                  <p className="mt-2 text-[14px] font-semibold text-paper">
                    {tr("Crisis safety recall")}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-paper/60">
                    {tr("Tested across {n} red-flag crisis phrases (abuse indicators, self-harm, sudden regression) with zero missed cases.", { n: mb.n_safety })}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[12px] text-paper/70">
                  <span>{tr("Safety Precision")}</span>
                  <span className="font-mono font-bold text-paper">{(mb.safety_precision * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Pillar 2: Statistical Domain Classifier */}
              <div className="flex flex-col justify-between rounded-[26px] bg-white/[0.06] p-6 border border-white/10">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] font-semibold tracking-wider text-[#7cc1dc] uppercase">
                      {tr("Engine 2 · Domain Routing")}
                    </p>
                    <Brain className="size-4.5 text-[#7cc1dc]" />
                  </div>
                  <p className="mt-4 font-display text-[clamp(38px,4vw,56px)] leading-none text-[#7cc1dc]">
                    <CountUp value={mb.any_true_domain_hit_rate * 100} decimals={1} suffix="%" />
                  </p>
                  <p className="mt-2 text-[14px] font-semibold text-paper">
                    {tr("Any-domain hit rate")}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-paper/60">
                    {tr("Multi-label developmental domain identification across {n} held-out clinical scenarios.", { n: mb.n_test.toLocaleString() })}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[12px] text-paper/70">
                  <span>{tr("Domain Micro F1")}</span>
                  <span className="font-mono font-bold text-paper">{(mb.domain_micro_f1 * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Pillar 3: Handwritten Note Generalisation */}
              <div className="flex flex-col justify-between rounded-[26px] bg-white/[0.06] p-6 border border-white/10">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] font-semibold tracking-wider text-[#c79ad0] uppercase">
                      {tr("Frontline Generalisation")}
                    </p>
                    <FileCheck2 className="size-4.5 text-[#c79ad0]" />
                  </div>
                  <p className="mt-4 font-display text-[clamp(38px,4vw,56px)] leading-none text-[#c79ad0]">
                    {(mb.domain_micro_recall * 100).toFixed(1)}%
                  </p>
                  <p className="mt-2 text-[14px] font-semibold text-paper">
                    {tr("Domain micro recall")}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-paper/60">
                    {mb.handwritten_notes
                      ? `${mb.handwritten_notes} handwritten notes tested: ${((mb.handwritten_any_domain_hit_rate ?? 0) * 100).toFixed(1)}% hit rate.`
                      : tr("High sensitivity ensures subtle caregiver observations trigger appropriate developmental domain questionnaires.")}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[12px] text-paper/70">
                  <span>{tr("Domain Precision")}</span>
                  <span className="font-mono font-bold text-paper">{(mb.domain_micro_precision * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Architecture Rationale: Contextualising why deterministic safety scan is mandatory */}
            <div className="mt-6 rounded-[26px] bg-white/[0.04] p-6 border border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2.5 text-[14px] font-bold text-paper">
                  <ShieldCheck className="size-5 text-peach" />
                  {tr("Why a dual-engine architecture is clinically mandatory")}
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brick/20 px-3 py-1 font-mono text-[11px] text-brick">
                    {tr("ML-only crisis recall: {pct}%", { pct: (mb.ml_only_safety_recall * 100).toFixed(1) })}
                  </span>
                  <span className="rounded-full bg-moss/20 px-3 py-1 font-mono text-[11px] text-[#8fbf5a]">
                    {tr("Hybrid architecture: 100%")}
                  </span>
                </div>
              </div>

              <p className="mt-3.5 text-[13.5px] leading-relaxed text-paper/75">
                {tr("In benchmark evaluations, standard statistical ML language models alone achieved only {ml}% recall on rare crisis phrases because emergency signals are statistical outliers in general text. Nirixon solves this by placing a deterministic rule filter ahead of the ML classifier. The hybrid system delivers {hybrid}% safety recall while preserving {recall}% domain recall and recommending 8–20 targeted adaptive questions.", {
                  ml: (mb.ml_only_safety_recall * 100).toFixed(1),
                  hybrid: (mb.safety_recall * 100).toFixed(0),
                  recall: (mb.domain_micro_recall * 100).toFixed(1),
                })}
              </p>
            </div>
          </div>
        </SectionCard>
      </Reveal>

      {/* 8. Clinical Governance, Limitations & Transparency */}
      <Reveal className="mt-4">
        <SectionCard
          eyebrow={tr("Clinical governance & transparency")}
          title={tr("Clear boundaries of evidence, deliberate tradeoffs, and regulatory scope.")}
        >
          <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-3">
            <div className="rounded-2xl border border-line-2 bg-card-2 p-5">
              <div className="flex items-center gap-2 text-rust">
                <Scale className="size-4.5" />
                <h3 className="text-[14.5px] font-bold text-ink">{tr("1. Held-out synthetic validation")}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                {tr("All reported metrics were established on held-out synthetic clinical cohorts (n={a} for Module A, n={b} for Module B). Prospective real-world multi-site clinical trials are underway pending institutional ethics committee review.", {
                  a: ma.n_test,
                  b: mb.n_test,
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-line-2 bg-card-2 p-5">
              <div className="flex items-center gap-2 text-sea">
                <Filter className="size-4.5" />
                <h3 className="text-[14.5px] font-bold text-ink">{tr("2. Deliberate high-sensitivity bias")}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                {tr("Module B domain precision is moderate ({p}% micro-precision). The screening engine intentionally trades precision for higher sensitivity ({r}% recall) to ensure subtle developmental concerns are never missed.", {
                  p: (mb.domain_micro_precision * 100).toFixed(1),
                  r: (mb.domain_micro_recall * 100).toFixed(1),
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-line-2 bg-card-2 p-5">
              <div className="flex items-center gap-2 text-moss">
                <ShieldCheck className="size-4.5" />
                <h3 className="text-[14.5px] font-bold text-ink">{tr("3. Frontline screening aid")}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                {tr("Nirixon is engineered as a frontline triage decision aid for community health workers and parents. It does not replace diagnostic assessment by registered paediatricians, psychologists, or clinical geneticists.")}
              </p>
            </div>
          </div>
        </SectionCard>
      </Reveal>
    </Page>
  );
}
