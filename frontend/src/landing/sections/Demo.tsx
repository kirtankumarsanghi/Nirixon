import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import { LogoMark } from "../components/system";
import { EASE, Kicker, MaskedHeadline } from "../components/editorial";
import { EvaluatorNote, SampleBadge, TIER_COLORS, TIER_RGBA, useView } from "../components/ViewContext";
import { cn } from "../utils/cn";
import { useLiveDemo } from "../hooks/useLiveDemo";
import claimsRegister from "../claims_register.json";

const claims = claimsRegister.claims;
const DISCLAIMER_STRIP = claimsRegister.metadata.disclaimer;

type Answer = "easy" | "hesitated" | "notyet";
type Tier = "green" | "amber" | "red";

const ANSWERS: { id: Answer; label: string }[] = [
  { id: "easy", label: "Yes, did it easily" },
  { id: "hesitated", label: "Tried, but fell or hesitated" },
  { id: "notyet", label: "Not yet" },
];

// ─── Tier mapping ────────────────────────────────────────────────────────────
const RESULTS: Record<Tier, { title: string; body: string }> = {
  green: { title: "Typical (On track)", body: "Here are activities to try at home." },
  amber: { title: "Monitor (Look closer)", body: "A few more questions, or a quick activity to try with your child right now." },
  red: { title: "Refer (See a doctor)", body: "Direct referral to your nearest early-intervention centre (DEIC)." },
};

function classificationToTier(cls: string | undefined, override: boolean): Tier | null {
  if (!cls) return null;
  if (override || cls === "Refer") return "red";
  if (cls === "Monitor") return "amber";
  if (cls === "Typical") return "green";
  return null;
}

type Why = { area: string; status: string; tone: string };
type Contribution = { area: string; value: number; imputed?: boolean };

// Fallback sample data used when the API hasn't returned a result yet
function sampleExplain(answer: Answer): { plain: Why[]; contributions: Contribution[] } {
  const walking: Record<Answer, Why> = {
    easy: { area: "Walking", status: "ahead", tone: TIER_COLORS.green },
    hesitated: { area: "Walking", status: "slightly behind", tone: TIER_COLORS.amber },
    notyet: { area: "Walking", status: "behind", tone: TIER_COLORS.amber },
  };
  const motor = { easy: 0.31, hesitated: -0.16, notyet: -0.38 }[answer];
  return {
    plain: [
      walking[answer],
      { area: "Speech", status: "slightly behind", tone: TIER_COLORS.amber },
      { area: "Hand skills", status: "on track", tone: TIER_COLORS.green },
    ],
    contributions: [
      { area: "Large body movement", value: motor },
      { area: "Speech & understanding", value: -0.12 },
      { area: "Hand & finger skills", value: 0.06 },
      { area: "Social connection", value: 0.03, imputed: true },
      { area: "Daily-life independence", value: 0.02, imputed: true },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  The phone — the only "box" here is a real device                    */
/* ------------------------------------------------------------------ */

function Phone({
  answer,
  setAnswer,
  lost,
  setLost,
  questionLabel,
  progressPct,
  questionText,
  isLoading,
}: {
  answer: Answer | null;
  setAnswer: (a: Answer) => void;
  lost: boolean;
  setLost: (fn: (v: boolean) => boolean) => void;
  questionLabel: string;
  progressPct: number;
  questionText: string;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotate: 3 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 1.1, ease: EASE }}
      className="relative mx-auto w-[300px] sm:w-[330px]"
      data-overlay-protect
    >
      <div className="rounded-[54px] bg-[#16100a] p-[11px] shadow-[0_60px_120px_-40px_rgba(29,20,9,0.7),inset_0_0_0_2px_rgba(255,255,255,0.07)]">
        <div className="relative overflow-hidden rounded-[44px] bg-paper">
          <div className="relative flex items-center justify-between px-7 pt-[14px] text-[11px] font-bold text-[#211709]">
            <span>9:41</span>
            <span className="absolute left-1/2 top-[9px] h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#16100a]" aria-hidden="true" />
            <span className="flex items-center gap-1" aria-hidden="true">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="px-5 pb-7 pt-5">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-7 w-7" />
              <div className="leading-tight">
                <p className="text-[12.5px] font-bold text-[#211709]">Nirixon</p>
                <p className="text-[10px] text-[#5b4a38]">Sample child · 20 months</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-[10.5px] font-semibold text-[#5b4a38]">
                {/* ── LIVE: question counter from API ── */}
                <span>{questionLabel}</span>
                <span className="font-mono text-[10px] text-[#8a7a64]">{progressPct}% complete</span>
              </div>
              <div className="mt-1.5 h-[3px] rounded-full bg-[#211709]/10">
                <motion.div
                  className="h-full rounded-full bg-[#c9602f]"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </div>
            </div>

            <p className="mt-5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-apricot">Try this together right now · 30 sec</p>
            {/* ── LIVE: question text from API (falls back to static text while idle) ── */}
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[#211709]">
              {isLoading
                ? "Loading…"
                : questionText || "Place a small toy on the floor and ask your child to bend down and pick it up without holding on."}
            </p>

            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Your child's response">
              {ANSWERS.map((a) => {
                const on = answer === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={isLoading}
                    onClick={() => setAnswer(a.id)}
                    data-cursor="Answer"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-[13px] font-bold transition-all duration-300 disabled:opacity-40",
                      on ? "border-[#211709] bg-[#211709] text-[#fff1d4]" : "border-[#211709]/25 text-[#211709] hover:border-[#211709]/50",
                    )}
                  >
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-[#fff1d4]" : "border-[#211709]/35")}>
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-[#fff1d4]" />}
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={lost}
              disabled={isLoading}
              onClick={() => setLost((v) => !v)}
              data-cursor="Toggle"
              className="mt-5 flex w-full items-center justify-between gap-3 border-t border-[#211709]/15 pt-4 text-left text-[#211709] disabled:opacity-40"
            >
              <span className="flex-1 pr-1 text-[11px] font-semibold leading-snug">
                Has your child stopped doing something they used to do?
              </span>
              <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", lost ? "bg-[#b8432f]" : "bg-[#211709]/20")}>
                <motion.span animate={{ x: lost ? 18 : 2 }} className="absolute top-0.5 h-4 w-4 rounded-full bg-[#211709] shadow" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  [05] Try it                                                         */
/* ------------------------------------------------------------------ */

export function Demo() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [lost, setLost] = useState(false);
  const { view } = useView();

  // ── Live backend hook ─────────────────────────────────────────────
  const demo = useLiveDemo();
  const isLoading = demo.phase === "loading";
  const isLiveComplete = demo.phase === "complete";

  // ── Derived tier: live result wins; otherwise derive from answer+lost ──
  let tier: Tier | null = null;
  if (isLiveComplete && demo.result) {
    tier = classificationToTier(demo.result.final_classification, demo.safetyOverrideTriggered);
  } else if (lost) {
    tier = "red";
  } else if (answer === "easy") {
    tier = "green";
  } else if (answer) {
    tier = "amber";
  }

  // ── Sample fallback for the "Why this result" panel (shown pre-result) ──
  const sampleWhy = answer ? sampleExplain(answer) : null;

  // ── Live SHAP / domain data ─────────────────────────────────────────
  const liveContributions = demo.shapReasons.map((r) => ({ area: r.feature, value: r.value }));
  const liveDomainEntries = Object.entries(demo.domainLevels);

  // Choose which contributions to display
  const displayContributions =
    isLiveComplete && liveContributions.length > 0
      ? liveContributions
      : (sampleWhy?.contributions ?? []);
  const isLiveContributions = isLiveComplete && liveContributions.length > 0;

  // ── Question text ──────────────────────────────────────────────────
  const questionText = demo.question?.question_text ?? "";
  const questionLabel = demo.questionLabel;
  const progressPct = isLiveComplete ? 100 : demo.progressPct;

  // ── Safety override ────────────────────────────────────────────────
  const showSafetyOverride = lost || demo.safetyOverrideTriggered;
  const overrideRule = demo.result?.override_rule;

  // ── Tier label for the result box ────────────────────────────────────
  const tierLabel = demo.triageTier;

  // Submit to live API on every answer + regression toggle change
  function handleSetAnswer(a: Answer) {
    setAnswer(a);
    void demo.submit(a, lost);
  }

  function handleSetLost(fn: (v: boolean) => boolean) {
    const next = fn(lost);
    setLost(next);
    if (answer) void demo.submit(answer, next);
  }

  return (
    <section id="try" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="try-title">
      {/* The whole section takes on the result's colour */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] mix-blend-multiply"
        animate={{ backgroundColor: tier ? TIER_RGBA[tier] : "rgba(255,241,212,0)" }}
        transition={{ duration: 0.9, ease: EASE }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_310px] xl:grid-cols-[minmax(0,1fr)_330px_250px] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Kicker index="05">Try it · 30 seconds</Kicker>
              {/* Badge is "Live" when backend is running, "Illustrative demo" otherwise */}
              {isLiveComplete || demo.phase === "question" ? (
                <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-leaf">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf" />
                  Live · API connected
                </span>
              ) : (
                <SampleBadge>Illustrative demo</SampleBadge>
              )}
            </div>
            <MaskedHeadline
              id="try-title"
              lines={[{ text: "Answer one question." }, { text: "Watch the result change.", className: "text-lagoon" }]}
              className="mt-6 text-[clamp(2.3rem,4.8vw,4.2rem)]"
            />

            {/* Error notice */}
            {demo.phase === "error" && demo.errorMsg && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 max-w-md rounded-xl border border-[color:var(--tier-amber)] bg-[color:var(--tier-amber)]/10 px-4 py-3 text-[13px] leading-relaxed text-bone"
              >
                <strong>Demo API:</strong> {demo.errorMsg}
              </motion.p>
            )}

            {/* Verdict */}
            <div className="mt-10 min-h-[176px]" aria-live="polite">
              <AnimatePresence mode="wait">
                {tier ? (
                  <motion.div key={tier + (showSafetyOverride ? "-override" : "")} initial="hidden" animate="show" exit="exit">
                    <div className="flex items-center gap-4">
                      <motion.span
                        className="h-12 w-12 shrink-0 rounded-full"
                        style={{ background: TIER_COLORS[tier], boxShadow: `0 0 0 10px ${TIER_RGBA[tier]}` }}
                        variants={{ hidden: { scale: 0 }, show: { scale: 1, transition: { type: "spring", stiffness: 420, damping: 18 } }, exit: { scale: 0, transition: { duration: 0.2 } } }}
                      />
                      <span className="block overflow-hidden pb-[0.06em]">
                        <motion.span
                          className="block font-display uppercase leading-[0.9] text-[clamp(2.3rem,4.8vw,4.2rem)]"
                          style={{ color: TIER_COLORS[tier] }}
                          variants={{ hidden: { y: "105%" }, show: { y: "0%", transition: { duration: 0.6, ease: EASE } }, exit: { y: "-105%", transition: { duration: 0.25 } } }}
                        >
                          {RESULTS[tier].title}
                        </motion.span>
                      </span>
                    </div>

                    {/* ── LIVE: triage tier label ── */}
                    {tierLabel && (
                      <motion.p
                        className="mt-2 text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-faint"
                        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.1 } }, exit: { opacity: 0 } }}
                      >
                        {tierLabel}
                      </motion.p>
                    )}

                    <motion.p
                      className="mt-4 max-w-md text-[16px] leading-relaxed text-bone/80"
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.4 } }, exit: { opacity: 0 } }}
                    >
                      {RESULTS[tier].body}
                    </motion.p>

                    <p className="mt-3 text-[11.5px] font-medium text-apricot/90">
                      {DISCLAIMER_STRIP}
                    </p>

                    {/* ── LIVE: safety override explanation ── */}
                    {showSafetyOverride && (
                      <motion.p
                        className="mt-3 max-w-md border-l-2 pl-3 text-[13.5px] leading-relaxed text-bone" style={{ borderColor: "var(--tier-red)" }}
                        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.3 } }, exit: { opacity: 0 } }}
                      >
                        <strong>Safety rule.</strong>{" "}
                        {demo.safetyOverrideTriggered && overrideRule
                          ? `The model was bypassed (rule: ${overrideRule}) and the family is referred straight to a doctor.`
                          : "A lost skill was reported, so the AI was skipped and the family is referred straight to a doctor."}
                      </motion.p>
                    )}
                  </motion.div>
                ) : (
                  <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-sm text-[17px] leading-relaxed text-fog">
                    Pick an answer on the phone. The result — and the reasons behind it — update the moment you tap.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* ── Why this result ─────────────────────────────────────────── */}
            {(sampleWhy || isLiveComplete) && !showSafetyOverride && (
              <div className="border-t border-bone/15 pt-5">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">Why this result</p>

                {/* ── LIVE: domain-level status ── */}
                {isLiveComplete && liveDomainEntries.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {liveDomainEntries.map(([domain, status]) => {
                      const t = status === "Refer" ? TIER_COLORS.red : status === "Monitor" ? TIER_COLORS.amber : TIER_COLORS.green;
                      return (
                        <span key={domain} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: t, color: t }}>
                          {domain.replace(/_/g, " ")}
                          <span className="font-normal opacity-70">{status}</span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Clinician SHAP view */}
                {view === "clinician" ? (
                  <div className="mt-4 space-y-2.5">
                    {displayContributions.map((c) => (
                      <div key={c.area} className="grid grid-cols-[150px_1fr] items-center gap-3 text-[12px] sm:grid-cols-[180px_1fr]">
                        <span className="truncate font-semibold text-bone">
                          {c.area}
                          {!isLiveContributions && (c as { imputed?: boolean }).imputed && <sup className="ml-1 font-bold uppercase text-gold">imputed</sup>}
                        </span>
                        <span className="relative h-[3px] bg-bone/10">
                          <span className="absolute -top-1.5 left-1/2 h-[15px] w-px bg-bone/30" />
                          <motion.span
                            className="absolute inset-y-0"
                            style={{ background: c.value >= 0 ? TIER_COLORS.green : TIER_COLORS.red }}
                            initial={false}
                            animate={{ left: c.value >= 0 ? "50%" : `${50 - (Math.abs(c.value) / 0.45) * 50}%`, width: `${(Math.abs(c.value) / 0.45) * 50}%` }}
                            transition={{ duration: 0.55, ease: EASE }}
                          />
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-faint">
                      {isLiveContributions ? "Live TreeSHAP contributions from the backend model." : "Illustrative TreeSHAP-style contributions with imputed-item markers."}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[15.5px] leading-loose text-bone">
                    {sampleWhy?.plain.map((p, i) => (
                      <span key={p.area} className="whitespace-nowrap">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: p.tone }} />
                        {p.area}: <strong style={{ color: p.tone }}>{p.status}</strong>
                        {i < sampleWhy.plain.length - 1 && <span className="mx-3 text-faint">·</span>}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            {/* The three possible results */}
            <ul className="mt-8 border-t border-bone/15">
              {(["green", "amber", "red"] as Tier[]).map((t) => (
                <li
                  key={t}
                  className={cn("grid grid-cols-[14px_150px_1fr] items-baseline gap-3 border-b border-bone/15 py-3 transition-opacity duration-500 sm:grid-cols-[14px_170px_1fr]", tier && tier !== t ? "opacity-30" : "opacity-100")}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLORS[t] }} />
                  <span className="text-[14px] font-bold" style={{ color: TIER_COLORS[t] }}>
                    {RESULTS[t].title}
                  </span>
                  <span className="text-[13px] leading-snug text-fog">{RESULTS[t].body}</span>
                </li>
              ))}
            </ul>

            <EvaluatorNote>
              The phone demonstrates the live backend flow. The safety rule shown (reported regression → Refer
              classification) is the deployed deterministic override. Model inference {claims.latency_p50.display} (p50).{" "}
              {isLiveComplete
                ? "This result came from a live API call to the real backend model."
                : "Connect the backend (uvicorn app.main:app) to see live data here."}
            </EvaluatorNote>
          </div>

          <Phone
            answer={answer}
            setAnswer={handleSetAnswer}
            lost={lost}
            setLost={handleSetLost}
            questionLabel={questionLabel}
            progressPct={progressPct}
            questionText={questionText}
            isLoading={isLoading}
          />
          {/* Photo has an independent desktop lane. Its portrait stays clear of the phone. */}
          <div className="relative hidden min-h-[540px] overflow-hidden xl:block" aria-hidden="true">
            <img
              src="https://images.pexels.com/photos/18094985/pexels-photo-18094985.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=900&h=1200"
              srcSet="https://images.pexels.com/photos/18094985/pexels-photo-18094985.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=700&h=900 700w, https://images.pexels.com/photos/18094985/pexels-photo-18094985.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1100&h=1400 1100w"
              sizes="250px"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "center 24%", filter: "contrast(1.02) brightness(0.98) saturate(1.03)" }}
              loading="lazy"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void/55 via-transparent to-void/10" />
          </div>
        </div>

        {/* Held-out test performance banner */}
        <div className="mt-16 flex flex-col gap-6 border-t-2 border-bone pt-8 sm:flex-row sm:items-center">
          <div className="grid shrink-0 gap-[4px]" style={{ gridTemplateColumns: "repeat(20, 8px)" }} aria-hidden="true">
            {Array.from({ length: 100 }).map((_, i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full"
                style={{ background: i < 81 ? TIER_COLORS.green : TIER_COLORS.amber }}
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.008, duration: 0.3 }}
              />
            ))}
          </div>
          <div>
            <p className="max-w-xl text-[clamp(1.05rem,1.6vw,1.3rem)] font-medium leading-snug text-bone">
              On held-out testing ({claims.module_a_test_n.display}), <strong className="text-leaf">{claims.module_a_refer_recall.display}</strong> of true
              Refer cases were identified ({claims.module_a_refer_breakdown.classified_as_refer} of {claims.module_a_refer_breakdown.true_refer_total}), with {claims.module_a_refer_specificity.display} specificity.
            </p>
            <p className="mt-2 text-[12px] font-semibold text-apricot tracking-wide">
              {DISCLAIMER_STRIP}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
