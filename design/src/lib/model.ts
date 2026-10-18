/* ------------------------------------------------------------------ */
/*  Nirixon — scoring model, check-in history and sample caseload      */
/*  Everything here is synthetic demo data.                            */
/* ------------------------------------------------------------------ */

export type Domain = "gross" | "fine" | "comm" | "social" | "cog" | "adaptive";
export type Scores = Record<Domain, number>;
export type Tier = "Typical" | "Monitor" | "Refer";

export const DOMAIN_KEYS: Domain[] = ["gross", "fine", "comm", "social", "cog", "adaptive"];

export const DOMAINS: Record<Domain, { label: string; plain: string; blurb: string; activity: string; color: string }> = {
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
    summary: "Skills look in line with age across all six areas. Keep playing, talking and exploring together.",
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

/* ------------------------------ scoring ------------------------------ */

const sig = (x: number) => 1 / (1 + Math.exp(-x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface Evaluation {
  tier: Tier;
  probs: { typical: number; monitor: number; refer: number };
  min: number;
  lowest: Domain;
  mean: number;
  safety: boolean;
  reason: string;
}

export function evaluate(scores: Scores, regression = false): Evaluation {
  const vals = DOMAIN_KEYS.map((k) => scores[k]);
  const min = Math.min(...vals);
  const lowest = DOMAIN_KEYS[vals.indexOf(min)];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;

  const pR = sig((-1.9 - min) * 3);
  const pT = sig((min + 1.1) * 3.2) * (1 - pR);
  const pM = Math.max(0, 1 - pR - pT);
  const sum = pR + pT + pM;
  let probs = { typical: pT / sum, monitor: pM / sum, refer: pR / sum };

  const byScore = min < -2;
  const safety = regression || byScore;
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
      : `${DOMAINS[lowest].label} is at ${min.toFixed(1)} SD — below the −2.0 safety line. The model is skipped.`;
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
          ? `${DOMAINS[lowest].label} is close to the line (${min.toFixed(1)} SD). Worth a closer look.`
          : "The model leans towards referral based on the pattern of scores.";
  }
  return { tier, probs, min, lowest, mean, safety, reason };
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
  regression: boolean;
  source: "seed" | "live";
  module?: "A" | "B";
}

export const SEED_CHECKINS: CheckIn[] = [
  {
    id: "ci-oct",
    date: "2026-10-16",
    ageMonths: 36,
    child: "Aarav",
    regression: false,
    source: "seed",
    module: "A",
    scores: { gross: 0.3, fine: -0.4, comm: -0.7, social: -0.2, cog: -0.1, adaptive: -0.3 },
  },
  {
    id: "ci-jul",
    date: "2026-07-18",
    ageMonths: 30,
    child: "Aarav",
    regression: false,
    source: "seed",
    module: "A",
    scores: { gross: 0.0, fine: -0.9, comm: -1.3, social: -0.5, cog: -0.4, adaptive: -0.8 },
  },
  {
    id: "ci-apr",
    date: "2026-04-14",
    ageMonths: 24,
    child: "Aarav",
    regression: false,
    source: "seed",
    module: "A",
    scores: { gross: -0.4, fine: -1.3, comm: -2.2, social: -0.9, cog: -0.7, adaptive: -1.2 },
  },
];

export function fmtDate(iso: string, long = false) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" });
}

export function developmentalAge(ci: CheckIn) {
  const mean = DOMAIN_KEYS.reduce((a, k) => a + ci.scores[k], 0) / DOMAIN_KEYS.length;
  return ci.ageMonths * (1 + mean * 0.08);
}

export function buildSummary(ci: CheckIn): string {
  const ev = evaluate(ci.scores, ci.regression);
  return [
    "Nirixon developmental check-in summary",
    `Child: ${ci.child} · ${ci.ageMonths} months · Module ${ci.module ?? (ci.ageMonths >= 60 ? "B" : "A")}`,
    `Date: ${fmtDate(ci.date, true)}`,
    `Overall: ${ev.tier} (${TIER_META[ev.tier].hint})`,
    "",
    "Areas in this check-in:",
    ...DOMAIN_KEYS.map((k) => `• ${DOMAINS[k].label}: ${domainStatus(ci.scores[k]).label}`),
    "",
    TIER_META[ev.tier].next,
    "",
    "This is a screening summary for discussion — not a medical diagnosis.",
  ].join("\n");
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

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genScores(kind: "ontrack" | "watch" | "refer", rand: () => number): Scores {
  const lo = (a: number, b: number) => r1(a + rand() * (b - a));
  const s = {} as Scores;
  DOMAIN_KEYS.forEach((k) => (s[k] = lo(-0.7, 0.9)));
  const pick = () => DOMAIN_KEYS[Math.floor(rand() * DOMAIN_KEYS.length)];
  if (kind === "watch") s[pick()] = lo(-1.9, -1.2);
  if (kind === "refer") {
    const a = pick();
    s[a] = lo(-2.9, -2.1);
    const b = pick();
    if (b !== a) s[b] = lo(-1.8, -1.1);
  }
  return s;
}

export function generateChildren(): Child[] {
  const rand = mulberry32(20261016);
  const quota: [ChildStatus, number][] = [
    ["ontrack", 80],
    ["watch", 45],
    ["refer", 30],
    ["overdue", 25],
    ["unscreened", 20],
  ];
  const pool: ChildStatus[] = quota.flatMap(([s, n]) => Array<ChildStatus>(n).fill(s));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.map((status, i) => {
    const sector = (["A", "B", "C", "D"] as const)[Math.floor(i / 50)];
    let regression = false;
    let scores: Scores | undefined;
    if (status === "ontrack") scores = genScores("ontrack", rand);
    else if (status === "watch") scores = genScores("watch", rand);
    else if (status === "refer") {
      if (rand() < 0.2) {
        regression = true;
        scores = genScores("watch", rand);
      } else scores = genScores("refer", rand);
    } else if (status === "overdue") scores = genScores(rand() < 0.5 ? "ontrack" : "watch", rand);
    return {
      id: `child-seed-ward12-${String(i + 1).padStart(3, "0")}`,
      sector,
      ageMonths: 1 + Math.floor(rand() * 144),
      status,
      scores,
      regression,
      visits: status === "unscreened" ? 0 : 1 + Math.floor(rand() * 4),
      lastVisitDays: status === "unscreened" ? null : status === "overdue" ? 35 + Math.floor(rand() * 60) : 2 + Math.floor(rand() * 28),
      handoff: "none",
    };
  });
}
