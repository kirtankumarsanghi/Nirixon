/* ------------------------------------------------------------------ */
/*  Nirixon — domain model, tier metadata and presentation helpers     */
/* ------------------------------------------------------------------ */

export type Tier = "Typical" | "Monitor" | "Refer";

/** A per-domain score map. Keys are the domains actually present in the data:
 *  six for Module A, eight for Module B. Never padded to a fixed count. */
export type Scores = Record<string, number>;

/** Domain id (an opaque string — one of the keys in DOMAIN_META). */
export type Domain = string;

export interface DomainMeta {
  label: string;
  plain: string;
  blurb: string;
  activity: string;
  color: string;
}

/** Presentation metadata for every domain across both modules. */
export const DOMAINS: Record<string, DomainMeta> = {
  // Module A — early years (0–60 months), six ASQ-style areas.
  gross: {
    label: "Gross motor",
    plain: "Big movements",
    blurb: "Walking, running, climbing, jumping and balance.",
    activity: "Build a safe cushion trail to climb over, step around and jump off together.",
    color: "#c8452f",
  },
  fine: {
    label: "Fine motor",
    plain: "Hand & finger skills",
    blurb: "Grasping, stacking, scribbling and using small tools.",
    activity: "Thread large beads or pasta tubes onto a shoelace — let them lead, you hold the end.",
    color: "#d27a24",
  },
  comm: {
    label: "Communication",
    plain: "Talking & understanding",
    blurb: "Understanding words, naming things and putting words together.",
    activity: "Narrate your day in short sentences, then pause so your child can fill the gap.",
    color: "#2a6a85",
  },
  social: {
    label: "Personal-social",
    plain: "People skills",
    blurb: "Sharing attention, taking turns and playing with others.",
    activity: "Roll a ball back and forth: “my turn… your turn.” Add a song when it gets easy.",
    color: "#7d5a86",
  },
  cog: {
    label: "Cognitive",
    plain: "Thinking & learning",
    blurb: "Pretend play, matching, sorting and solving small problems.",
    activity: "Sort laundry or steel utensils by colour and shape — name each group out loud.",
    color: "#46692a",
  },
  adaptive: {
    label: "Self-help",
    plain: "Everyday independence",
    blurb: "Feeding, dressing and looking after themselves.",
    activity: "Let them pour water between cups and practise taking off their own shoes.",
    color: "#92650f",
  },
  // Module B — school age (60–144 months), eight areas.
  attention: {
    label: "Attention",
    plain: "Focus & attention",
    blurb: "Sustaining attention, following instructions and finishing tasks.",
    activity: "Play a short turn-taking game and build up the time before a break.",
    color: "#2a6a85",
  },
  listening_speaking: {
    label: "Listening & speaking",
    plain: "Listening & speaking",
    blurb: "Understanding spoken language and expressing ideas clearly.",
    activity: "Read a story aloud and ask “what happens next?”",
    color: "#6e4c78",
  },
  reading: {
    label: "Reading",
    plain: "Reading",
    blurb: "Recognising letters and words, and reading age-appropriate text.",
    activity: "Label everyday objects and read them together around the house.",
    color: "#46692a",
  },
  writing: {
    label: "Writing",
    plain: "Writing",
    blurb: "Letter formation, spelling and putting sentences on paper.",
    activity: "Practise drawing patterns and writing the child's name each day.",
    color: "#92650f",
  },
  numbers: {
    label: "Numbers",
    plain: "Numbers & maths",
    blurb: "Counting, comparing quantities and simple arithmetic.",
    activity: "Count steps, spoons and coins together; compare which pile is bigger.",
    color: "#a4441a",
  },
  motor: {
    label: "Motor skills",
    plain: "Motor skills",
    blurb: "Coordinated movement, balance and hand control.",
    activity: "Practise ball games, hopping and cutting shapes with safety scissors.",
    color: "#c8452f",
  },
  emotion_conduct: {
    label: "Emotion & conduct",
    plain: "Emotions & behaviour",
    blurb: "Regulating feelings, getting along and following routines.",
    activity: "Name feelings during the day and agree one calm-down routine together.",
    color: "#9a6aa6",
  },
};

export const TIER_META: Record<
  Tier,
  { title: string; hint: string; text: string; dot: string; soft: string; hex: string; hexLight: string; glow: string; summary: string; next: string }
> = {
  Typical: {
    title: "Typical",
    hint: "On track",
    text: "text-moss",
    dot: "bg-moss",
    soft: "bg-moss-bg",
    hex: "#46692a",
    hexLight: "#8fbf5a",
    glow: "rgba(143,191,90,0.45)",
    summary: "Skills look in line with age across the checked areas. Keep playing, talking and exploring together.",
    next: "Check in again in about 3 months, or sooner if something changes.",
  },
  Monitor: {
    title: "Monitor",
    hint: "Look closer",
    text: "text-amber",
    dot: "bg-amber",
    soft: "bg-amber-bg",
    hex: "#92650f",
    hexLight: "#e8b13a",
    glow: "rgba(232,177,58,0.45)",
    summary: "Close to the line in at least one area. A few simple activities at home often help — then look again.",
    next: "Try the activities below for 4 weeks, then repeat the check-in.",
  },
  Refer: {
    title: "Refer",
    hint: "Talk to a doctor",
    text: "text-brick",
    dot: "bg-brick",
    soft: "bg-brick-bg",
    hex: "#c8452f",
    hexLight: "#ee6a4f",
    glow: "rgba(238,106,79,0.5)",
    summary: "One or more areas need a professional look. This is a screening result, not a diagnosis.",
    next: "Book a visit with a paediatrician or your nearest DEIC and share this summary.",
  },
};

/** The domains present in a score map, in insertion order. */
export function domainKeys(scores: Scores | undefined | null): string[] {
  return scores ? Object.keys(scores) : [];
}

/** Module A's six domains — the default axis set for surfaces that predate
 *  per-module axes (e.g. a brand-new, unspecified check-in). */
export const DOMAIN_KEYS: string[] = ["gross", "fine", "comm", "social", "cog", "adaptive"];

/* ------------------------------ display ------------------------------ */

const _sig = (x: number) => 1 / (1 + Math.exp(-x));

export interface Evaluation {
  tier: Tier;
  probs: { typical: number; monitor: number; refer: number };
  min: number;
  lowest: string;
  mean: number;
  safety: boolean;
  reason: string;
}

/**
 * Display-only tier derivation from a score map. This is NOT the clinical
 * model — the backend owns the authoritative classification (surfaced on
 * CheckIn.tier). Kept so per-domain visualisations have a band to colour by.
 */
export function evaluate(scores: Scores, regression = false): Evaluation {
  const keys = domainKeys(scores);
  const vals = keys.map((k) => scores[k]);
  const min = vals.length ? Math.min(...vals) : 0;
  const lowest = keys[vals.indexOf(min)] ?? "gross";
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  const pR = _sig((-1.9 - min) * 3);
  const pT = _sig((min + 1.1) * 3.2) * (1 - pR);
  const pM = Math.max(0, 1 - pR - pT);
  const sum = pR + pT + pM || 1;
  let probs = { typical: pT / sum, monitor: pM / sum, refer: pR / sum };

  const safety = regression || min < -2;
  let tier: Tier;
  let reason: string;
  if (safety) {
    tier = "Refer";
    const refer = Math.max(probs.refer, 0.92);
    const rest = 1 - refer;
    const o = probs.typical + probs.monitor || 1;
    probs = { refer, typical: (rest * probs.typical) / o, monitor: (rest * probs.monitor) / o };
    reason = regression
      ? "A lost skill was reported. The safety rule refers directly and skips the model."
      : `${DOMAINS[lowest]?.label ?? lowest} is at ${min.toFixed(1)} SD — below the −2.0 safety line.`;
  } else {
    tier =
      probs.typical >= probs.monitor && probs.typical >= probs.refer
        ? "Typical"
        : probs.refer > probs.monitor
          ? "Refer"
          : "Monitor";
    reason =
      tier === "Typical"
        ? "Every area sits inside the expected range."
        : tier === "Monitor"
          ? `${DOMAINS[lowest]?.label ?? lowest} is close to the line (${min.toFixed(1)} SD).`
          : "The model leans towards referral based on the pattern of scores.";
  }
  return { tier, probs, min, lowest, mean, safety, reason };
}

export function buildSummary(ci: CheckIn): string {
  const ev = evaluate(ci.scores, ci.regression);
  const keys = domainKeys(ci.scores);
  return [
    "Nirixon developmental check-in summary",
    `Child: ${ci.child} · ${ci.ageMonths} months · Module ${ci.module ?? (ci.ageMonths >= 60 ? "B" : "A")}`,
    `Date: ${fmtDate(ci.date, true)}`,
    `Overall: ${ev.tier} (${TIER_META[ev.tier].hint})`,
    "",
    "Areas in this check-in:",
    ...keys.map((k) => `• ${DOMAINS[k]?.label ?? k}: ${domainStatus(ci.scores[k]).label}`),
    "",
    TIER_META[ev.tier].next,
    "",
    "This is a screening summary for discussion — not a medical diagnosis.",
  ].join("\n");
}

/** `hex` is for fills and dots on dark surfaces; `ink` is theme-aware text for light or card surfaces. */
export function domainStatus(z: number): { level: 0 | 1 | 2; label: string; text: string; hex: string; ink: string } {
  if (z >= -1) return { level: 0, label: "Going well", text: "text-moss", hex: "#46692a", ink: "var(--color-moss)" };
  if (z >= -2) return { level: 1, label: "Keep an eye on this", text: "text-amber", hex: "#b8801c", ink: "var(--color-amber)" };
  return { level: 2, label: "Worth discussing", text: "text-brick", hex: "#c8452f", ink: "var(--color-brick)" };
}

/* ----------------------------- check-ins ----------------------------- */

export interface CheckIn {
  id: string;
  date: string; // ISO yyyy-mm-dd
  ageMonths: number;
  child: string;
  scores: Scores;
  /** Per-domain IRT theta (Module B only; omitted for Module A). */
  irt?: Record<string, number>;
  tier?: Tier;
  /** Backend probability of each class, when available. */
  probs?: { typical: number; monitor: number; refer: number };
  regression: boolean;
  source: "seed" | "live";
  module?: "A" | "B";
}

export function fmtDate(iso: string, long = false) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" });
}

/** Mean of the checked areas (used only for the growth/pace display). */
export function meanScore(scores: Scores): number {
  const keys = domainKeys(scores);
  if (keys.length === 0) return 0;
  return keys.reduce((a, k) => a + scores[k], 0) / keys.length;
}

export function developmentalAge(ci: CheckIn) {
  return ci.ageMonths * (1 + meanScore(ci.scores) * 0.08);
}

/** Standard-normal CDF as a percentile (0–100), for labelling z-score bands.
 *  Abramowitz & Stegun 7.1.26 — accurate to ~1e-7. */
export function zToPercentile(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return (z > 0 ? 1 - p : p) * 100;
}

/* ----------------------------- caseload ------------------------------ */

export type ChildStatus = "ontrack" | "watch" | "refer" | "overdue" | "unscreened";
export type Sector = "A" | "B" | "C" | "D";

export const SECTORS: { id: Sector; worker: string; title: string }[] = [
  { id: "A", worker: "Sunita Devi", title: "ASHA" },
  { id: "B", worker: "Meena Kumari", title: "Anganwadi" },
  { id: "C", worker: "Anita Rao", title: "ASHA" },
  { id: "D", worker: "Pooja Yadav", title: "ANM" },
];

export interface Child {
  id: string;
  sector: Sector;
  ageMonths: number;
  status: ChildStatus;
  scores?: Scores;
  regression: boolean;
  visits: number;
  lastVisitDays: number | null;
  handoff: "none" | "queued" | "done";
  /** Next follow-up due (ISO), from the child record; drives calendar reminders. */
  followUpDueAt?: string | null;
}

export const AGE_BANDS = ["0–12m", "12–24m", "24–36m", "36–48m", "48–60m", "60–84m", "84–108m", "108–144m"];
export const ageBand = (m: number) => {
  if (m < 12) return AGE_BANDS[0];
  if (m < 24) return AGE_BANDS[1];
  if (m < 36) return AGE_BANDS[2];
  if (m < 48) return AGE_BANDS[3];
  if (m < 60) return AGE_BANDS[4];
  if (m < 84) return AGE_BANDS[5];
  if (m < 108) return AGE_BANDS[6];
  return AGE_BANDS[7];
};

export const STATUS_META: Record<ChildStatus, { label: string; long: string; hex: string; soft: string; text: string }> = {
  ontrack: { label: "On track", long: "Tier 1 · Typical", hex: "#6e9a3a", soft: "bg-moss-bg", text: "text-moss" },
  watch: { label: "Watch closely", long: "Tier 2 · Monitor", hex: "#e0a526", soft: "bg-amber-bg", text: "text-amber" },
  refer: { label: "Refer", long: "Tier 3 · Clinical", hex: "#d9533c", soft: "bg-brick-bg", text: "text-brick" },
  overdue: { label: "Overdue", long: "Home visit due", hex: "#9a6aa6", soft: "bg-lilac-bg", text: "text-lilac" },
  unscreened: { label: "Unscreened", long: "Needs first check", hex: "#cdb98c", soft: "bg-sand", text: "text-ink-2" },
};
