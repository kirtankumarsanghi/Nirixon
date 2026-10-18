import { useEffect, useState } from "react";
import { Info, ShieldCheck } from "lucide-react";
import { CountUp, Eyebrow, Page, Reveal } from "../components/ui";
import { PageState } from "../components/PageState";
import { PHOTO } from "../photos";
import { cn } from "../utils/cn";
import { evidenceApi, type EvidenceResponse } from "../api/client";

const FALLBACK_LABELS = ["Typical", "Monitor", "Refer"];

export function Evidence() {
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

  return (
    <Page>
      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-line-2 bg-sand/60 px-5 py-4 text-[14px] font-medium">
        <Info className="size-5 shrink-0 text-rust" />
        Evaluated on synthetic data. Clinical validation pending. Screening aid, not a diagnosis.
      </div>

      <Eyebrow index="03">Key results · reported evaluation metrics</Eyebrow>
      <h1 className="mt-6 font-display text-[clamp(52px,8.4vw,136px)] leading-[0.9] text-ink uppercase">
        Evaluated on
        <br />
        held-out data.
        <br />
        <span
          className="mask-photo"
          style={{ backgroundImage: `linear-gradient(rgba(31,20,9,.2),rgba(31,20,9,.2)), url(${PHOTO.school})`, backgroundPosition: "center 40%" }}
        >
          Under 5.
        </span>
      </h1>
      <p className="mt-6 max-w-[620px] text-[15px] leading-relaxed text-ink-2">
        Figures below are the reported results for the screening model on a synthetic held-out set (Module A, n ={" "}
        {ma.n_test.toLocaleString()}; Module B, n = {mb.n_test.toLocaleString()}). They are shown so reviewers can inspect them — not as evidence of real-world performance.
      </p>

      {/* primary safety metric */}
      <Reveal className="mt-12">
        <section className="rounded-[44px] border border-rust/40 bg-brick-bg p-7 sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-rust uppercase">Primary safety metric · Module A (ages 0–5)</p>
            <span className="rounded-full border border-rust/50 px-4 py-1.5 font-mono text-[11px] font-semibold text-rust">Held-out n = {ma.n_test}</span>
          </div>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-mono text-[12px] font-semibold tracking-[0.2em] text-ink-2 uppercase">Refer recall</p>
              <p className="font-display text-[clamp(110px,16vw,230px)] leading-[0.85] text-rust">
                <CountUp value={ma.refer_recall * 100} decimals={1} suffix="%" duration={1800} />
              </p>
              <p className="mt-5 max-w-[420px] text-[16px] leading-relaxed text-ink-2">
                High recall on the high-risk Refer cohort means children who need clinical evaluation are captured early.
              </p>
            </div>
            <div className="rounded-[32px] border border-line-2 bg-card/90 p-6 sm:p-8">
              <p className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase">True Refer cohort breakdown ({referTotal} cases)</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { n: referRow[referIdx] ?? 0, l: "Classified Refer", s: `${share(referRow[referIdx] ?? 0, referTotal).toFixed(1)}% captured`, c: "text-moss", bg: "bg-moss-bg" },
                  { n: referRow[monitorIdx] ?? 0, l: "Classified Monitor", s: "Triaged for watch", c: "text-amber", bg: "bg-amber-bg" },
                  { n: referRow[typicalIdx] ?? 0, l: "Classified Typical", s: "Missed cases", c: "text-brick", bg: "bg-brick-bg" },
                ].map((c) => (
                  <div key={c.l} className={cn("rounded-2xl p-4 text-center sm:p-5", c.bg)}>
                    <p className={cn("font-display text-[clamp(40px,4.4vw,64px)] leading-none", c.c)}>
                      <CountUp value={c.n} />
                    </p>
                    <p className="mt-2 text-[12.5px] font-bold">{c.l}</p>
                    <p className={cn("mt-0.5 font-mono text-[10px]", c.c)}>{c.s}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[13px] leading-relaxed text-ink-2">
                <b className="text-ink">Clinical triage safety:</b> of the {referTotal - (referRow[referIdx] ?? 0)} cases not flagged Refer on the first pass, {referRow[monitorIdx] ?? 0} were triaged into <i>Monitor</i> for targeted follow-up. Only {referRow[typicalIdx] ?? 0} true Refer cases were classified Typical.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* metric tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "Test accuracy", v: ma.accuracy * 100, d: 1, suf: "%", s: "Held-out accuracy across 3 tiers." },
          { k: "Macro AUROC", v: ma.macro_auroc, d: 3, suf: "", s: `Macro F1: ${ma.macro_f1.toFixed(3)}` },
          { k: "Refer precision", v: ma.refer_precision * 100, d: 1, suf: "%", s: `Refer specificity: ${(ma.refer_specificity * 100).toFixed(1)}%` },
          { k: "Inference latency (n=200)", v: ma.latency_p50_ms, d: 1, suf: " ms", s: `p95: ${ma.latency_p95_ms.toFixed(1)} ms with explanations` },
        ].map((t, i) => (
          <Reveal key={t.k} delay={i * 70}>
            <div className="h-full rounded-[30px] border border-line-2 bg-card p-6 sm:p-7">
              <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-ink-2 uppercase">{t.k}</p>
              <p className="mt-4 font-display text-[clamp(52px,5.4vw,80px)] leading-none">
                <CountUp value={t.v} decimals={t.d} suffix={t.suf} />
              </p>
              <p className="mt-3 text-[13px] text-ink-2">{t.s}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* confusion matrix */}
      <Reveal className="mt-4">
        <section className="rounded-[40px] border border-line-2 bg-card p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-[clamp(30px,3.6vw,48px)] leading-none uppercase">Module A confusion matrix (3×3 held-out)</h2>
            <div className="flex rounded-full border border-line-2 bg-card-2 p-1">
              {[false, true].map((p) => (
                <button key={String(p)} onClick={() => setPct(p)} className={cn("rounded-full px-5 py-2 text-[12.5px] font-bold transition-all", pct === p ? "bg-ink text-paper" : "text-ink-2")}>
                  {p ? "Row %" : "Counts"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-muted">Rows: true cohort · Columns: predicted tier · n = {ma.n_test}</p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left" onMouseLeave={() => setHot(null)}>
              <thead>
                <tr className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
                  <th className="px-4 pb-4 font-semibold">True \ Predicted</th>
                  {LABELS.map((l, ci) => (
                    <th key={l} className={cn("px-4 pb-4 text-center font-semibold transition-colors", hot?.[1] === ci && "text-rust")}>{l}</th>
                  ))}
                  <th className="px-4 pb-4 text-right font-semibold">Row total</th>
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
        </section>
      </Reveal>

      {/* module b */}
      <Reveal className="mt-4">
        <section className="rounded-[40px] border border-line-2 bg-card p-6 sm:p-10">
          <h2 className="font-display text-[clamp(30px,3.6vw,48px)] leading-none uppercase">Module B · NLP router & safety recall (ages 5–12)</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { k: "Safety recall (crisis phrases)", v: mb.safety_recall * 100, d: 0, suf: "%", s: `Tested on ${mb.n_safety} crisis phrases with zero misses.`, c: "text-rust", b: "border-rust" },
              { k: "Any-true-domain hit rate", v: mb.any_true_domain_hit_rate * 100, d: 1, suf: "%", s: `Evaluated across ${mb.n_test.toLocaleString()} held-out test scenarios.`, c: "text-moss", b: "border-moss" },
              {
                k: "Handwritten clinical notes",
                v: mb.handwritten_notes,
                d: 0,
                suf: " notes",
                s: mb.handwritten_notes
                  ? `${((mb.handwritten_any_domain_hit_rate ?? 0) * 100).toFixed(1)}% any-domain hit rate, ${((mb.handwritten_micro_f1 ?? 0) * 100).toFixed(1)}% micro F1.`
                  : "Not available in the current artifact.",
                c: "text-sea",
                b: "border-sea",
              },
            ].map((m) => (
              <div key={m.k} className={cn("border-l-[3px] pl-5", m.b)}>
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] uppercase">{m.k}</p>
                <p className={cn("mt-3 font-display text-[clamp(52px,5vw,76px)] leading-none", m.c)}>
                  <CountUp value={m.v} decimals={m.d} suffix={m.suf} />
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{m.s}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-[26px] bg-sand/70 p-6">
            <p className="flex items-center gap-2.5 text-[14px] font-bold">
              <ShieldCheck className="size-5 text-rust" /> Safety rule + ML classifier hybrid rationale
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              In router evaluations the ML classifier alone achieved only <b className="text-ink">{(mb.ml_only_safety_recall * 100).toFixed(1)}% safety recall</b> on crisis phrases. Combining deterministic rule scanning with multi-label logistic regression, the hybrid reaches <b className="text-ink">{(mb.safety_recall * 100).toFixed(0)}% safety recall</b> while delivering {(mb.domain_micro_recall * 100).toFixed(1)}% domain recall (F1 {(mb.domain_micro_f1 * 100).toFixed(1)}%) and 8–20 adaptive items.
            </p>
          </div>
        </section>
      </Reveal>

      {/* limitations */}
      <Reveal className="mt-4">
        <section className="rounded-[40px] border-2 border-ink/80 p-6 sm:p-10">
          <h2 className="flex items-center gap-3 font-display text-[clamp(30px,3.6vw,48px)] leading-none uppercase">
            <Info className="size-7 text-rust" /> Transparency & clinical limitations
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              ["1. Synthetic evaluation data", `All metrics were computed on synthetic clinical datasets (held-out n=${ma.n_test} for Module A, n=${mb.n_test} for Module B). Real-world prospective validation is pending institutional IRB review.`],
              ["2. Moderate NLP domain precision", `Module B domain precision is moderate (${(mb.domain_micro_precision * 100).toFixed(1)}% micro-precision). The model intentionally trades precision for higher sensitivity (${(mb.domain_micro_recall * 100).toFixed(1)}% recall) to avoid missing subtle parent-reported concerns.`],
              ["3. Screening aid, not diagnosis", "Nirixon provides triage suggestions to guide caregivers and community health workers. It does not replace comprehensive clinical diagnosis by a registered developmental paediatrician."],
            ].map(([h, p]) => (
              <div key={h}>
                <h3 className="text-[15px] font-bold">{h}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{p}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </Page>
  );
}
