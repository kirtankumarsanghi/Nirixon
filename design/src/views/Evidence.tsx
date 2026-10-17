import { useState } from "react";
import { Info, ShieldCheck } from "lucide-react";
import { CountUp, Eyebrow, Page, Reveal } from "../components/ui";
import { PHOTO } from "../photos";
import { cn } from "../utils/cn";

const LABELS = ["Typical", "Monitor", "Refer"] as const;
const MATRIX = [
  [1142, 25, 3],
  [23, 286, 10],
  [3, 18, 90],
];
const ROW_TOTAL = MATRIX.map((r) => r.reduce((a, b) => a + b, 0));

export function Evidence() {
  const [pct, setPct] = useState(false);
  const [hot, setHot] = useState<[number, number] | null>(null);

  const caption = hot
    ? `Of ${ROW_TOTAL[hot[0]]} true ${LABELS[hot[0]]} cases, ${MATRIX[hot[0]][hot[1]]} (${((MATRIX[hot[0]][hot[1]] / ROW_TOTAL[hot[0]]) * 100).toFixed(1)}%) were classified ${LABELS[hot[1]]}.`
    : "Typical: 1142/1170 · Monitor: 286/319 · Refer: 90/111. Hover any cell to read it in plain language.";

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
        Figures below are the reported results for the screening model on a synthetic held-out set (Module A, n = 1,600; Module B, n = 5,700). They are shown so reviewers can inspect them — not as evidence of real-world performance.
      </p>

      {/* primary safety metric */}
      <Reveal className="mt-12">
        <section className="rounded-[44px] border border-rust/40 bg-brick-bg p-7 sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-rust uppercase">Primary safety metric · Module A (ages 0–5)</p>
            <span className="rounded-full border border-rust/50 px-4 py-1.5 font-mono text-[11px] font-semibold text-rust">Held-out n = 1600</span>
          </div>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-mono text-[12px] font-semibold tracking-[0.2em] text-ink-2 uppercase">Refer recall</p>
              <p className="font-display text-[clamp(110px,16vw,230px)] leading-[0.85] text-rust">
                <CountUp value={81.1} decimals={1} suffix="%" duration={1800} />
              </p>
              <p className="mt-5 max-w-[420px] text-[16px] leading-relaxed text-ink-2">
                High recall on the high-risk Refer cohort means children who need clinical evaluation are captured early.
              </p>
            </div>
            <div className="rounded-[32px] border border-line-2 bg-card/90 p-6 sm:p-8">
              <p className="font-mono text-[11px] font-semibold tracking-[0.2em] uppercase">True Refer cohort breakdown (111 cases)</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { n: 90, l: "Classified Refer", s: "81.1% captured", c: "text-moss", bg: "bg-moss-bg" },
                  { n: 18, l: "Classified Monitor", s: "Triaged for watch", c: "text-amber", bg: "bg-amber-bg" },
                  { n: 3, l: "Classified Typical", s: "Missed cases", c: "text-brick", bg: "bg-brick-bg" },
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
                <b className="text-ink">Clinical triage safety:</b> of the 21 cases not flagged Refer on the first pass, 18 were triaged into <i>Monitor</i> for targeted follow-up. Only 3 true Refer cases were classified Typical.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* metric tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "Test accuracy", v: 94.9, d: 1, suf: "%", s: "Held-out accuracy across 3 tiers.", s2: "" },
          { k: "Macro AUROC", v: 0.977, d: 3, suf: "", s: "Macro F1: 0.900", s2: "" },
          { k: "Refer precision", v: 87.4, d: 1, suf: "%", s: "Refer specificity: 99.1%", s2: "" },
          { k: "Inference latency (n=200)", v: 14.3, d: 1, suf: " ms", s: "p95: 27.0 ms with explanations", s2: "" },
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
          <p className="mt-2 font-mono text-[10.5px] text-muted">Rows: true cohort · Columns: predicted tier · n = 1600</p>

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
                      const share = v / ROW_TOTAL[ri];
                      const diag = ri === ci;
                      const isHot = hot?.[0] === ri && hot?.[1] === ci;
                      return (
                        <td
                          key={ci}
                          onMouseEnter={() => setHot([ri, ci])}
                          className={cn("cursor-default px-4 py-5 text-center font-mono text-[17px] transition-all duration-200", isHot && "outline-2 -outline-offset-2 outline-ink")}
                          style={{ background: `rgba(${diag ? "185,80,31" : "200,69,47"},${diag ? 0.08 + share * 0.3 : 0.05 + share * 1.2})` }}
                        >
                          <span className={cn(diag ? "font-bold text-ink" : "text-ink-2")}>{pct ? `${(share * 100).toFixed(1)}%` : v}</span>
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
              { k: "Safety recall (crisis phrases)", v: 100, d: 0, suf: "%", s: "Tested on 138 crisis phrases with zero misses.", c: "text-rust", b: "border-rust" },
              { k: "Any-true-domain hit rate", v: 74.8, d: 1, suf: "%", s: "Evaluated across 5,700 held-out test scenarios.", c: "text-moss", b: "border-moss" },
              { k: "Handwritten clinical notes", v: 76, d: 0, suf: " notes", s: "100% safety recall, 80.4% any-domain hit rate, 66.7% micro F1.", c: "text-sea", b: "border-sea" },
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
              In router evaluations the ML classifier alone achieved only <b className="text-ink">12.3% safety recall</b> on crisis phrases. Combining deterministic rule scanning with multi-label logistic regression, the hybrid reaches <b className="text-ink">100% safety recall</b> while delivering 67.4% domain recall (F1 57.1%) and 8–20 adaptive items.
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
              ["1. Synthetic evaluation data", "All metrics were computed on synthetic clinical datasets (held-out n=1600 for Module A, n=5700 for Module B). Real-world prospective validation is pending institutional IRB review."],
              ["2. Moderate NLP domain precision", "Module B domain precision is moderate (49.6% micro-precision). The model intentionally trades precision for higher sensitivity (67.4% recall) to avoid missing subtle parent-reported concerns."],
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
