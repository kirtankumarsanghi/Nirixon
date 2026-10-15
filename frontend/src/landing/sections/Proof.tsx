import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { PHOTOS } from "../data";
import { EASE, Kicker, MaskedHeadline, RingText, RollingText } from "../components/editorial";
import { EvaluatorNote, TIER_COLORS, ViewSwitcher } from "../components/ViewContext";
import { cn } from "../utils/cn";

type Mode = "nirixon" | "paper";

const STATS = [
  {
    id: "questions",
    label: "Half the questions",
    n: "12–18",
    p: "30–36",
    unit: "questions per check",
    plainN: "Personalized. We skip what doesn’t apply to your child.",
    plainP: "The same fixed list for every child.",
    evaluator:
      "Adaptive tree pruning, minimum 8 and maximum 18 items across 6 domains, with peer-median imputation for unasked items. The paper tool (ASQ-3) uses 30–36 fixed items.",
  },
  {
    id: "time",
    label: "Time to finish",
    n: "<5",
    p: "10+",
    unit: "minutes",
    plainN: "A full check, scored the moment an answer changes.",
    plainP: "Then scored by hand afterwards.",
    evaluator: "12–18 adaptive items with instant scoring (model inference 14.3 ms p50) versus 30–36 fixed items scored manually.",
  },
  {
    id: "precision",
    label: "Right when it says “see a doctor”",
    n: "9/10",
    p: "<4/10",
    unit: "referrals that are correct",
    plainN: "Families sent to a doctor are the ones who need one.",
    plainP: "Most families sent to a doctor didn’t need to go.",
    evaluator: "Refer precision 87.4–94.5% vs 38.5% for the ASQ-3 rule baseline. AUPRC 0.891 vs 0.119.",
  },
  {
    id: "false",
    label: "Few false worries",
    n: "1/100",
    p: "12/100",
    unit: "healthy children wrongly flagged",
    plainN: "Out of 100 healthy children, we wrongly worry about 1.",
    plainP: "Out of 100 healthy children, paper worries about 12.",
    evaluator: "Specificity 99.1% vs 88.1%. Macro AUROC 0.978.",
  },
];

/* ================================================================== */
/*  [03] Key results — one switch flips every number                   */
/* ================================================================== */

export function Proof() {
  const [mode, setMode] = useState<Mode>("nirixon");
  const paper = mode === "paper";

  return (
    <section id="proof" className="relative py-20 md:py-28" aria-labelledby="proof-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Kicker index="03">Key results</Kicker>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <MaskedHeadline id="proof-title" lines={[{ text: "Check your child’s" }, { text: "development in" }]} className="text-[clamp(2.3rem,5vw,4.4rem)]" />
            <motion.p
              aria-hidden="true"
              className="img-text mt-1 font-display uppercase leading-[0.82] tracking-[-0.01em] transition-[filter] duration-700 text-[clamp(4.2rem,13.5vw,12rem)]"
              style={{ backgroundImage: `url(${PHOTOS.childrenPlaying})`, filter: paper ? "grayscale(1) contrast(0.85)" : "none" }}
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
              Most children are cleared at home. Only those who need a doctor are sent to one, and a safety rule that no AI
              score can override watches every answer.
            </p>
            <p className="mt-7 text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">Switch view</p>
            <ViewSwitcher variant="text" className="mt-2" />
          </div>
        </div>

        {/* The flip */}
        <div className="mt-16 flex flex-col gap-5 border-t-2 border-bone pt-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-sm text-[13.5px] leading-relaxed text-fog">
            Flip the switch to see the same measures for the paper checklist (ASQ-3) used today.
          </p>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setMode("nirixon")}
              data-cursor="Nirixon"
              className={cn("font-display text-[clamp(1.25rem,2.4vw,1.9rem)] uppercase tracking-wide transition-colors duration-300", !paper ? "text-apricot" : "text-bone/30 hover:text-bone/60")}
            >
              Nirixon
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={paper}
              aria-label="Show paper checklist numbers"
              onClick={() => setMode(paper ? "nirixon" : "paper")}
              data-cursor="Flip"
              className="relative h-9 w-[76px] shrink-0 rounded-full border-2 border-bone"
            >
              <motion.span
                className="absolute top-1 h-6 w-6 rounded-full"
                animate={{ left: paper ? 44 : 4, backgroundColor: paper ? "var(--text-muted)" : "var(--color-apricot)" }}
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            </button>
            <button
              type="button"
              onClick={() => setMode("paper")}
              data-cursor="Paper"
              className={cn("font-display text-[clamp(1.25rem,2.4vw,1.9rem)] uppercase tracking-wide transition-colors duration-300", paper ? "text-bone" : "text-bone/30 hover:text-bone/60")}
            >
              Paper checklist
            </button>
          </div>
        </div>

        <div className="grid gap-x-12 lg:grid-cols-[0.72fr_1.28fr]">
          {/* Reserved left lane for the persistent traveling portrait (arch shape) */}
          <div className="relative hidden py-8 lg:flex lg:flex-col lg:justify-end min-h-[520px]">
            {/* Reserved space ensures text never renders in this lane */}
            <div data-portrait-lane="proof" className="proof-portrait-lane relative w-full min-h-[380px] flex-1" />
            <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-faint">Dhari, Gujarat</p>
          </div>

          <div className="grid sm:grid-cols-2">
            {STATS.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ duration: 0.8, delay: (i % 2) * 0.1, ease: EASE }}
                className={cn("border-b border-bone/15 py-8", i % 2 === 1 ? "sm:border-l sm:pl-8" : "sm:pr-8")}
              >
                <div className="flex items-start justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.16em]">
                  <span className="font-mono tracking-normal text-apricot">({String(i + 1).padStart(2, "0")})</span>
                  <span className="max-w-[70%] text-right text-faint">{s.label}</span>
                </div>
                <p className={cn("mt-6 font-display leading-[0.85] tracking-tight transition-colors duration-500 text-[clamp(3.6rem,7.2vw,6.4rem)]", paper ? "text-faint" : "text-bone")}>
                  <RollingText value={paper ? s.p : s.n} />
                </p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-faint">{s.unit}</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={mode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="mt-4 text-[15px] leading-relaxed text-bone/80"
                  >
                    {paper ? s.plainP : s.plainN}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-2 text-[12.5px] text-faint">
                  {paper ? (
                    <>
                      Nirixon: <strong className="text-apricot">{s.n}</strong>
                    </>
                  ) : (
                    <>
                      Paper checklist: <span className="line-through decoration-apricot/70">{s.p}</span>
                    </>
                  )}
                </p>
                <EvaluatorNote>{s.evaluator}</EvaluatorNote>
              </motion.div>
            ))}
          </div>
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
  const verdict = { green: "On track", amber: "Let’s look closer", red: "See a doctor" }[tier];
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
                <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-paper/55">Result</p>
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
              Re-scored in 14.3 ms · p95 27.0 ms
            </motion.p>

            <EvaluatorNote tone="dark" className="mt-6">
              Deterministic override. Any domain below −2.0 SD, or reported regression, bypasses the ML and triggers a Tier 3
              referral. The −1.0 boundary on this page is illustrative; the model scores all domains together. Model inference
              14.3 ms (p50), 27.0 ms (p95).
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
