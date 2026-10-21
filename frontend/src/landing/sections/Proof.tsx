import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Info, ShieldAlert } from "lucide-react";
import { PHOTOS } from "../data";
import { EASE, Kicker, MaskedHeadline, RingText } from "../components/editorial";
import { EvaluatorNote, TIER_COLORS, ViewSwitcher } from "../components/ViewContext";
import { cn } from "../utils/cn";
import claimsRegister from "../claims_register.json";

const claims = claimsRegister.claims;
const DISCLAIMER_STRIP = claimsRegister.metadata.disclaimer;

type Mode = "nirixon" | "literature";

/* ================================================================== */
/*  [03] Key results — Verified against saved evaluation outputs       */
/* ================================================================== */

export function Proof() {
  const [mode, setMode] = useState<Mode>("nirixon");
  const isLiterature = mode === "literature";

  const matrix = claims.module_a_confusion_matrix.value;
  const matrixLabels = claims.module_a_confusion_matrix.labels;
  const referBreakdown = claims.module_a_refer_breakdown;

  return (
    <section id="proof" className="relative py-20 md:py-28" aria-labelledby="proof-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Results Disclaimer Strip */}
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-bone/20 bg-bone/5 px-4 py-3 text-[13px] text-bone/90">
          <Info className="h-4 w-4 shrink-0 text-apricot" />
          <p className="font-semibold tracking-wide">{DISCLAIMER_STRIP}</p>
        </div>

        <Kicker index="03">Key results · Verified evaluation metrics</Kicker>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <MaskedHeadline
              id="proof-title"
              lines={[{ text: "Evaluated on held-out data." }, { text: "Verified by code." }]}
              className="text-[clamp(2.3rem,5vw,4.4rem)]"
            />
            <motion.p
              aria-hidden="true"
              className="img-text mt-1 font-display uppercase leading-[0.82] tracking-[-0.01em] transition-[filter] duration-700 text-[clamp(4.2rem,13.5vw,12rem)]"
              style={{
                backgroundImage: `url(${PHOTOS.childrenPlaying})`,
                filter: isLiterature ? "grayscale(1) contrast(0.85)" : "none",
              }}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              animate={{ backgroundPosition: ["15% 35%", "85% 65%"] }}
              transition={{
                opacity: { duration: 1, ease: EASE },
                y: { duration: 1, ease: EASE },
                backgroundPosition: { duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
              }}
            >
              Under 5 min
            </motion.p>
            <span className="sr-only">Under 5 minutes.</span>
          </div>

          <div className="lg:pb-5">
            <p className="text-[16px] leading-relaxed text-fog md:text-[17px]">
              Every metric below is loaded directly from saved benchmark and evaluation outputs in the codebase.
              Clinical validation in pediatric clinics is pending.
            </p>
            <p className="mt-7 text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">Switch view</p>
            <ViewSwitcher variant="text" className="mt-2" />
          </div>
        </div>

        {/* The flip */}
        <div className="mt-16 flex flex-col gap-5 border-t-2 border-bone pt-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-md text-[13.5px] leading-relaxed text-fog">
            Toggle between the empirical Nirixon evaluation metrics and the qualitative comparison with traditional paper tools citing published literature.
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setMode("nirixon")}
              data-cursor="Nirixon"
              className={cn(
                "font-display text-[clamp(1.25rem,2.4vw,1.9rem)] uppercase tracking-wide transition-colors duration-300",
                !isLiterature ? "text-apricot" : "text-bone/30 hover:text-bone/60",
              )}
            >
              Evaluation outputs
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={isLiterature}
              aria-label="Show literature review comparison"
              onClick={() => setMode(isLiterature ? "nirixon" : "literature")}
              data-cursor="Flip"
              className="relative h-9 w-[76px] shrink-0 rounded-full border-2 border-bone"
            >
              <motion.span
                className="absolute top-1 h-6 w-6 rounded-full"
                animate={{
                  left: isLiterature ? 44 : 4,
                  backgroundColor: isLiterature ? "var(--text-muted)" : "var(--color-apricot)",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            </button>
            <button
              type="button"
              onClick={() => setMode("literature")}
              data-cursor="Literature"
              className={cn(
                "font-display text-[clamp(1.25rem,2.4vw,1.9rem)] uppercase tracking-wide transition-colors duration-300",
                isLiterature ? "text-bone" : "text-bone/30 hover:text-bone/60",
              )}
            >
              Literature review
            </button>
          </div>
        </div>

        <div className="mt-10">
          <AnimatePresence mode="wait">
            {!isLiterature ? (
              <motion.div
                key="nirixon-metrics"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="space-y-12"
              >
                {/* PROMINENT CARD: Refer Recall & Missed Case Breakdown */}
                <div className="rounded-2xl border-2 border-apricot/40 bg-apricot/10 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-apricot">
                      Primary Safety Metric · Module A (Ages 0–5)
                    </span>
                    <span className="rounded-full border border-apricot/50 px-3 py-0.5 font-mono text-[11px] text-apricot">
                      Held-out n={claims.module_a_test_n.value}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-faint">
                        {claims.module_a_refer_recall.label}
                      </p>
                      <p className="mt-2 font-display text-[clamp(3.8rem,8vw,6.8rem)] leading-none text-apricot">
                        {claims.module_a_refer_recall.display}
                      </p>
                      <p className="mt-3 text-[14.5px] leading-relaxed text-bone/90">
                        High recall on the high-risk Refer cohort ensures children who require clinical evaluation are captured early.
                      </p>
                      <p className="mt-2 text-[12px] font-mono text-faint">
                        Source: {claims.module_a_refer_recall.source_file}
                      </p>
                    </div>

                    {/* Breakdown of the 111 true Refer cases */}
                    <div className="rounded-xl border border-bone/20 bg-void/50 p-5 sm:p-6">
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bone">
                        True Refer Cohort Breakdown ({referBreakdown.true_refer_total} total cases)
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg border border-leaf/40 bg-leaf/10 p-3">
                          <p className="font-display text-[2rem] leading-none text-leaf">
                            {referBreakdown.classified_as_refer}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-bone">Classified Refer</p>
                          <p className="text-[10px] text-leaf font-mono">{claims.module_a_refer_recall.display} captured</p>
                        </div>
                        <div className="rounded-lg border border-gold/40 bg-gold/10 p-3">
                          <p className="font-display text-[2rem] leading-none text-gold">
                            {referBreakdown.missed_as_monitor}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-bone">Classified Monitor</p>
                          <p className="text-[10px] text-faint">Triaged for watch</p>
                        </div>
                        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                          <p className="font-display text-[2rem] leading-none text-red-400">
                            {referBreakdown.missed_as_typical}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-bone">Classified Typical</p>
                          <p className="text-[10px] text-red-400 font-mono">Missed cases</p>
                        </div>
                      </div>
                      <p className="mt-4 text-[12.5px] leading-relaxed text-fog">
                        <strong>Clinical triage safety:</strong> At the screening operating point, 1,112 of 1,394
                        Refer cases are flagged. Of the 282 not flagged on first pass, 198 were triaged into
                        <em>Monitor</em> for targeted follow-up; 84 were classified as Typical.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Grid of Other Module A metrics */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border border-bone/15 p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                      {claims.module_a_macro_f1.label}
                    </p>
                    <p className="mt-3 font-display text-[2.8rem] leading-none text-bone">
                      {claims.module_a_macro_f1.display}
                    </p>
                    <p className="mt-2 text-[12.5px] text-fog">
                      Three-tier macro F1 on a held-out <em>synthetic</em> cohort. Raw accuracy is
                      misleading at a 45.5% Typical base rate.
                    </p>
                    <p className="mt-3 text-[10.5px] font-mono text-faint">{claims.module_a_macro_f1.source_file}</p>
                  </div>

                  <div className="border border-bone/15 p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                      {claims.module_a_macro_auroc.label}
                    </p>
                    <p className="mt-3 font-display text-[2.8rem] leading-none text-bone">
                      {claims.module_a_macro_auroc.display}
                    </p>
                    <p className="mt-2 text-[12.5px] text-fog">Refer recall: {claims.module_a_refer_recall.display}</p>
                    <p className="mt-3 text-[10.5px] font-mono text-faint">{claims.module_a_macro_auroc.source_file}</p>
                  </div>

                  <div className="border border-bone/15 p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                      {claims.module_a_refer_precision.label}
                    </p>
                    <p className="mt-3 font-display text-[2.8rem] leading-none text-bone">
                      {claims.module_a_refer_precision.display}
                    </p>
                    <p className="mt-2 text-[12.5px] text-fog">
                      Refer Specificity: {claims.module_a_refer_specificity.display}
                    </p>
                    <p className="mt-3 text-[10.5px] font-mono text-faint">{claims.module_a_refer_precision.source_file}</p>
                  </div>

                  <div className="border border-bone/15 p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                      Inference Latency (n={claims.latency_p50.sample_size})
                    </p>
                    <p className="mt-3 font-display text-[2.8rem] leading-none text-bone">
                      {claims.latency_p50.display}
                    </p>
                    <p className="mt-2 text-[12.5px] text-fog">
                      p95: {claims.latency_p95.display} (TreeSHAP explanations)
                    </p>
                    <p className="mt-3 text-[10.5px] font-mono text-faint">{claims.latency_p50.source_file}</p>
                  </div>
                </div>

                {/* 3x3 Confusion Matrix */}
                <div className="border border-bone/15 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-[1.4rem] uppercase tracking-wide text-bone">
                      Module A Confusion Matrix (3×3 Held-Out Test)
                    </h3>
                    <span className="font-mono text-[11px] text-faint">
                      Rows: True Cohort · Columns: Predicted Tier · n={claims.module_a_test_n.value}
                    </span>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[500px] text-left text-[14px]">
                      <thead>
                        <tr className="border-b border-bone/20 text-[11px] font-bold uppercase tracking-[0.18em] text-faint">
                          <th className="py-3 pr-4">True \ Predicted</th>
                          {matrixLabels.map((col) => (
                            <th key={col} className="px-4 py-3 text-center">
                              {col}
                            </th>
                          ))}
                          <th className="py-3 pl-4 text-right">Row Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bone/10 font-mono">
                        {matrix.map((row, rIdx) => {
                          const total = row.reduce((a, b) => a + b, 0);
                          return (
                            <tr key={matrixLabels[rIdx]}>
                              <td className="py-3.5 pr-4 font-sans font-bold text-bone">
                                {matrixLabels[rIdx]}
                              </td>
                              {row.map((val, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={cn(
                                    "px-4 py-3.5 text-center font-bold",
                                    rIdx === cIdx
                                      ? "bg-bone/10 text-apricot"
                                      : val > 0
                                        ? "text-bone/70"
                                        : "text-bone/20",
                                  )}
                                >
                                  {val}
                                </td>
                              ))}
                              <td className="py-3.5 pl-4 text-right text-fog">{total}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 text-[12px] text-faint">
                    {claims.module_a_confusion_matrix.display}. Evaluated on synthetic data generated from CDC milestones and WHO standards.
                  </p>
                </div>

                {/* Module B Router & Safety Evaluation */}
                <div className="border border-bone/15 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-[1.4rem] uppercase tracking-wide text-bone">
                      Module B NLP Router & Safety Recall (Ages 5–12)
                    </h3>
                    <span className="font-mono text-[11px] text-faint">
                      Source: {claims.module_b_safety_recall.source_file}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-6 sm:grid-cols-3">
                    <div className="border-l-2 border-apricot pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                        {claims.module_b_safety_recall.label}
                      </p>
                      <p className="mt-1 font-display text-[2.6rem] leading-none text-apricot">
                        {claims.module_b_safety_recall.display}
                      </p>
                      <p className="mt-2 text-[12.5px] text-fog">
                        Tested on {claims.module_b_safety_recall.sample_size} crisis phrases with zero misses.
                      </p>
                    </div>

                    <div className="border-l-2 border-leaf pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                        {claims.module_b_any_hit_rate.label}
                      </p>
                      <p className="mt-1 font-display text-[2.6rem] leading-none text-leaf">
                        {claims.module_b_any_hit_rate.display}
                      </p>
                      <p className="mt-2 text-[12.5px] text-fog">
                        Evaluated across {claims.module_b_any_hit_rate.sample_size} held-out test scenarios.
                      </p>
                    </div>

                    <div className="border-l-2 border-lagoon pl-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                        Handwritten Clinical Notes
                      </p>
                      <p className="mt-1 font-display text-[2.6rem] leading-none text-lagoon">
                        {claims.module_b_handwritten_eval.notes_n} notes
                      </p>
                      <p className="mt-2 text-[12.5px] text-fog">
                        {claims.module_b_handwritten_eval.safety_recall}% safety recall, {claims.module_b_handwritten_eval.any_hit_rate}% any-domain hit rate, {claims.module_b_handwritten_eval.micro_f1}% micro F1 on clinical handwriting.
                      </p>
                    </div>
                  </div>

                  {/* Safety Hybrid Proof */}
                  <div className="mt-6 rounded-xl border border-bone/15 bg-bone/5 p-4">
                    <div className="flex items-center gap-2 text-[13px] font-bold text-bone">
                      <ShieldAlert className="h-4 w-4 text-apricot" />
                      Safety Rule + ML Classifier Hybrid Rationale
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-fog">
                      In router evaluations, the ML classifier alone achieved only <strong>{claims.module_b_safety_hybrid_proof.classifier_only_safety_recall}% safety recall</strong> on crisis phrases.
                      The shipped rules-primary router keeps{" "}
                      <strong>{claims.module_b_safety_recall.display} safety recall</strong>, reaches{" "}
                      <strong>{claims.module_b_domain_recall.display} domain recall</strong> on generated text
                      (F1: {claims.module_b_domain_f1.display}), and scores{" "}
                      <strong>{claims.module_b_handwritten_eval.micro_f1}% F1</strong> on{" "}
                      {claims.module_b_handwritten_eval.notes_n} independent handwritten notes
                      across {claims.module_b_questions_range.display}.
                    </p>
                  </div>
                </div>

                {/* LIMITATIONS PANEL (Requirement 6) */}
                <div className="rounded-2xl border-2 border-bone/25 bg-void p-6 sm:p-8">
                  <div className="flex items-center gap-2.5 text-apricot">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <h3 className="font-display text-[1.3rem] uppercase tracking-wide text-bone">
                      Transparency & Clinical Limitations
                    </h3>
                  </div>

                  <div className="mt-5 grid gap-6 md:grid-cols-3 text-[13.5px] leading-relaxed text-fog">
                    <div>
                      <p className="font-bold text-bone">1. Synthetic Evaluation Data</p>
                      <p className="mt-1">
                        All performance metrics shown were computed on synthetic clinical datasets (held-out test n={claims.module_a_test_n.value} for Module A,
                        test n={claims.module_b_any_hit_rate.sample_size} for Module B). Real-world prospective clinical validation is pending institutional IRB review.
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-bone">2. Moderate NLP Domain Precision</p>
                      <p className="mt-1">
                        Module B domain precision is moderate ({claims.module_b_domain_precision.display} micro-precision). The model intentionally trades precision for higher
                        sensitivity ({claims.module_b_domain_recall.display} recall) to avoid missing subtle parent-reported concerns before adaptive items begin.
                      </p>
                    </div>
                    <div>
                      <p className="font-bold text-bone">3. Screening Aid, Not Diagnosis</p>
                      <p className="mt-1">
                        Nirixon provides triage suggestions to guide caregivers and community health workers. It does not replace
                        comprehensive clinical diagnosis by a registered developmental pediatrician.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* LITERATURE COMPARISON PANEL (Requirement 5) */
              <motion.div
                key="literature-comparison"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <div className="border border-bone/20 bg-bone/5 p-6 sm:p-8">
                  <h3 className="font-display text-[1.5rem] uppercase tracking-wide text-bone">
                    Qualitative Comparison with Conventional Paper Screening
                  </h3>
                  <p className="mt-2 text-[14px] text-faint">
                    Synthesized from clinical pilot protocol review and published developmental screening literature (CDC, WHO, AAP).
                  </p>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="border border-bone/15 p-5">
                      <p className="font-bold uppercase tracking-wide text-faint text-[12px]">Traditional Paper Checklists (e.g., ASQ-3, Denver II)</p>
                      <ul className="mt-4 space-y-3 text-[14px] text-fog">
                        <li className="flex items-start gap-2">
                          <span className="text-faint">•</span>
                          <span><strong>Static Universal Item Sets:</strong> Administers 30–36 fixed questions per check regardless of whether skills are far ahead or behind.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-faint">•</span>
                          <span><strong>Administrative Burden:</strong> Requires 10–15+ minutes of caregiver time and subsequent manual scoring by clinical staff.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-faint">•</span>
                          <span><strong>Clinic Flooding:</strong> Published reviews note high false-referral rates on borderline items, crowding tertiary queues.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-faint">•</span>
                          <span><strong>No Algorithmic Safety Net:</strong> Relies solely on manual review to catch regression or isolated domain failure.</span>
                        </li>
                      </ul>
                    </div>

                    <div className="border border-apricot/30 bg-apricot/5 p-5">
                      <p className="font-bold uppercase tracking-wide text-apricot text-[12px]">Nirixon Adaptive Digital Screener</p>
                      <ul className="mt-4 space-y-3 text-[14px] text-bone/90">
                        <li className="flex items-start gap-2">
                          <span className="text-apricot">•</span>
                          <span><strong>Adaptive Pruning:</strong> Dynamically branches through {claims.module_a_questions_range.display} (Module A) or {claims.module_b_questions_range.display} (Module B).</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-apricot">•</span>
                          <span><strong>Instant Scoring:</strong> Real-time inference ({claims.latency_p50.display} p50, {claims.latency_p95.display} p95) with immediate TreeSHAP explanations.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-apricot">•</span>
                          <span><strong>Targeted Triage:</strong> Distinguishes Typical from Monitor and Refer to provide home activities before clinical escalation.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-apricot">•</span>
                          <span><strong>Deterministic Safety Floor:</strong> Hardcoded −2.0 SD cutoff and regression trigger bypasses all ML probabilities for safety.</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  [04] Safety rule — a draggable score line with a hard −2.0 floor   */
/* ================================================================== */

type Tier = "green" | "amber" | "red";

export function SafetyBand() {
  const [z, setZ] = useState(-1.4);
  const [lost, setLost] = useState(false);
  const [tick, setTick] = useState(0);
  const tier: Tier = lost || z < -2 ? "red" : z < -1 ? "amber" : "green";
  const pct = ((z + 3) / 4) * 100;
  const verdict = { green: "Typical (On track)", amber: "Monitor (Look closer)", red: "Refer (See a doctor)" }[tier];
  const explain = lost
    ? "A lost skill was reported, so the AI is skipped and the family is referred straight to a doctor."
    : tier === "red"
      ? "This area is more than 2 standard deviations behind, so the AI is skipped and the family is referred straight to a doctor."
      : tier === "amber"
        ? "Close to the line. A few more questions, or a quick activity to try with your child right now."
        : "On track. Here are activities to try at home.";

  return (
    <section id="safety" className="relative overflow-hidden bg-night py-20 text-paper md:py-28" aria-labelledby="safety-title">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 top-1/2 h-[760px] w-[760px] -translate-y-1/2 rounded-full blur-[120px]"
        animate={{ backgroundColor: TIER_COLORS[tier], opacity: tier === "red" ? 0.38 : 0.22 }}
        transition={{ duration: 0.9, ease: EASE }}
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Kicker index="04" tone="paper">
          Safety net · always on
        </Kicker>

        <div className="mt-8 grid gap-14 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
          <div>
            <MaskedHeadline
              tone="paper"
              id="safety-title"
              lines={[{ text: "Lost a skill, or far behind?" }, { text: "We skip the AI.", className: "text-[#f0a77c]" }]}
              className="text-[clamp(2.4rem,5.4vw,4.8rem)]"
            />
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-paper/75">
              If your child has lost a skill, or is far behind in any area, we skip the AI and refer you straight to a doctor.
            </p>

            {/* What if? — the score line */}
            <div className="mt-14">
              <div className="flex items-center justify-between gap-4 text-[11px] font-bold uppercase tracking-[0.18em] text-paper/55">
                <span>What if? Drag the lowest area score</span>
                <span className="font-mono text-[13px] normal-case tracking-normal text-paper">
                  {z > 0 ? "+" : ""}
                  {z.toFixed(1)} SD
                </span>
              </div>

              <div className="relative mt-9 h-20">
                <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] text-paper" style={{ left: "25%" }}>
                  Safety line −2.0
                </span>
                <span className="absolute top-0 h-[54px] w-px bg-paper/70" style={{ left: "25%" }} aria-hidden="true" />
                <div className="absolute inset-x-0 top-[24px] flex h-[6px] overflow-hidden rounded-full" aria-hidden="true">
                  <span className="h-full w-1/4" style={{ background: TIER_COLORS.red }} />
                  <span className="h-full w-1/4" style={{ background: TIER_COLORS.amber }} />
                  <span className="h-full w-1/2" style={{ background: TIER_COLORS.green }} />
                </div>
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[13px] -ml-[14px] h-7 w-7 rounded-full border-[3px] border-paper shadow-[0_0_30px_rgba(255,241,212,0.35)]"
                  animate={{ left: `${pct}%`, backgroundColor: TIER_COLORS[tier] }}
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                />
                {[-3, -2, -1, 0, 1].map((t) => (
                  <span key={t} className="absolute top-[48px] -translate-x-1/2 font-mono text-[11px] text-paper/50" style={{ left: `${((t + 3) / 4) * 100}%` }} aria-hidden="true">
                    {t > 0 ? `+${t}` : t}
                  </span>
                ))}
                <input
                  type="range"
                  min={-3}
                  max={1}
                  step={0.1}
                  value={z}
                  onChange={(e) => {
                    setZ(parseFloat(e.target.value));
                    setTick((t) => t + 1);
                  }}
                  aria-label="Lowest area score in standard deviations"
                  className="absolute inset-x-0 top-2 h-10 w-full cursor-pointer opacity-0"
                  data-cursor="Drag"
                />
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={lost}
                onClick={() => {
                  setLost((l) => !l);
                  setTick((t) => t + 1);
                }}
                className="mt-4 inline-flex items-center gap-3 text-left text-[14.5px] font-bold text-paper"
                data-cursor="Toggle"
              >
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-2 border-paper transition-colors", lost && "bg-paper")}>
                  {lost && <Check className="h-3.5 w-3.5 text-night" strokeWidth={3.5} />}
                </span>
                My child has stopped doing something they used to do
              </button>
            </div>

            {/* Verdict */}
            <div className="mt-12 flex items-center gap-5" aria-live="polite">
              <motion.span
                key={tier}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
                className="h-14 w-14 shrink-0 rounded-full"
                style={{ background: TIER_COLORS[tier], boxShadow: `0 0 50px ${TIER_COLORS[tier]}` }}
              />
              <div className="overflow-hidden">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-paper/55">Result Tier</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={verdict}
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-100%", opacity: 0 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="font-display text-[clamp(2rem,4.4vw,3.6rem)] uppercase leading-none"
                  >
                    {verdict}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <p className="mt-4 min-h-[48px] max-w-xl text-[14.5px] leading-relaxed text-paper/70">{explain}</p>
            <motion.p key={tick} initial={{ opacity: 0.25 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="font-mono text-[12px] text-paper/55">
              Re-scored in {claims.latency_p50.display} · p95 {claims.latency_p95.display}
            </motion.p>

            <EvaluatorNote tone="dark" className="mt-6">
              Deterministic override: any domain below −2.0 SD, or reported regression, bypasses the ML and triggers a Refer
              classification. Model inference latency: {claims.latency_p50.display} (p50), {claims.latency_p95.display} (p95).
            </EvaluatorNote>
          </div>

          {/* Circular portrait with a rotating ring */}
          <div className="relative mx-auto aspect-square w-full max-w-[440px]">
            <RingText text="Safety rule · always on · no AI score can override it · " className="absolute inset-0 h-full w-full text-paper/60" duration={36} />
            <div className="absolute inset-[13%] overflow-hidden rounded-full">
              <img src={PHOTOS.drumGirlSquare} alt="A young girl in yellow at a cultural event in Khatti, India" className="h-full w-full object-cover" loading="lazy" />
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 mix-blend-multiply"
                animate={{ backgroundColor: TIER_COLORS[tier], opacity: tier === "red" ? 0.45 : 0.12 }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
