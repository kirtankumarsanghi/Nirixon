import type { CheckIn, Child, ChildStatus, Domain, Scores, Tier } from "./model";
import type { ChildRecord } from "../api/types";
import type { SessionSummary } from "../api/client";

/** Backend domain id → design domain key. Module A ids are remapped to the
 *  design's short keys; Module B ids pass through unchanged. */
const DOMAIN_MAP: Record<string, Domain> = {
  gross_motor: "gross",
  fine_motor: "fine",
  communication: "comm",
  personal_social: "social",
  cognitive: "cog",
  self_help: "adaptive",
  // Module B ids (already the design's keys)
  attention: "attention",
  listening_speaking: "listening_speaking",
  reading: "reading",
  writing: "writing",
  numbers: "numbers",
  motor: "motor",
  emotion_conduct: "emotion_conduct",
};

const designDomain = (key: string): Domain => DOMAIN_MAP[key] ?? key;

/**
 * Display calibration. The backend returns a real per-domain score in [0,1]
 * (mean answer / 2) for Module A; the design's charts are drawn on an SD-like
 * axis (−2.5 … +0.4). This maps the real score onto that axis so full marks read
 * as "going well" (≥ −1) and an empty domain sits below the −2.0 refer line.
 * It is a documented display transform of real data, NOT a clinical z-score.
 */
export function score01ToZ(score: number): number {
  const s = Math.max(0, Math.min(1, score));
  return -2.5 + s * 2.9;
}

export function toScores(domainScores: Record<string, number> | null | undefined): Scores {
  // Only the domains actually present are included — never padded to six.
  const out: Scores = {};
  if (!domainScores) return out;
  for (const [key, val] of Object.entries(domainScores)) {
    const dom = DOMAIN_MAP[key];
    if (dom && Number.isFinite(Number(val))) out[dom] = score01ToZ(Number(val));
  }
  return out;
}

export function toTier(classification: string | null | undefined): Tier {
  return classification === "Refer" || classification === "Monitor" ? classification : "Typical";
}

const clampZ = (v: number) => Math.max(-3, Math.min(1, v));

/** Per-domain score map: Module A from normalized domain_scores, Module B from
 *  the per-domain IRT theta in domain_details. Domains present are never padded. */
export function scoresFromSession(s: SessionSummary): Scores {
  const details = s.domain_details ?? {};
  if (Object.keys(details).length) {
    const out: Scores = {};
    for (const [key, d] of Object.entries(details)) {
      const theta = d?.irt_theta;
      if (typeof theta === "number") out[designDomain(key)] = clampZ(theta);
    }
    if (Object.keys(out).length) return out;
  }
  return toScores(s.domain_scores);
}

export function irtFromSession(s: SessionSummary): Record<string, number> | undefined {
  const details = s.domain_details ?? {};
  const out: Record<string, number> = {};
  for (const [key, d] of Object.entries(details)) {
    const theta = d?.irt_theta;
    if (typeof theta === "number") out[designDomain(key)] = theta;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Backend completed session → the design's CheckIn shape. */
export function sessionToCheckIn(s: SessionSummary): CheckIn {
  const date = (s.completed_at ?? s.started_at ?? "").slice(0, 10);
  const probs = {
    typical: s.probabilities?.Typical ?? 0,
    monitor: s.probabilities?.Monitor ?? 0,
    refer: s.probabilities?.Refer ?? 0,
  };
  return {
    id: s.id,
    date,
    ageMonths: Math.round(s.corrected_age_months ?? 0),
    child: s.child_name ?? "Child",
    scores: scoresFromSession(s),
    irt: irtFromSession(s),
    tier: toTier(s.final_classification),
    probs,
    regression: Boolean(s.safety_override_triggered),
    source: "live",
    module: s.module,
  };
}

const SECTORS = ["A", "B", "C", "D"] as const;

/** Prefer a real "Sector X" marker in the ward label (the seeded data uses
 *  "Ward 12 - Sector B"); otherwise fold the free-text label into one of the
 *  design's four displayed sectors. */
function wardToSector(ward: string): (typeof SECTORS)[number] {
  const m = ward.match(/sector\s*([A-D])/i);
  if (m) return m[1].toUpperCase() as (typeof SECTORS)[number];
  let h = 0;
  for (let i = 0; i < ward.length; i++) h = (h * 31 + ward.charCodeAt(i)) >>> 0;
  return SECTORS[h % SECTORS.length];
}

/** Backend triage tier string → the design's caseload status. */
function tierToStatus(tier: string | null | undefined): ChildStatus {
  const t = (tier ?? "").toLowerCase();
  if (t.includes("unscreened") || t === "") return "unscreened";
  if (t.includes("refer") || t.includes("tier 3")) return "refer";
  if (t.includes("monitor") || t.includes("reflex") || t.includes("tier 2")) return "watch";
  return "ontrack";
}

/** "24-36m" / "60-84" → midpoint in months (best-effort). */
function ageBracketToMonths(bracket: string): number {
  const nums = bracket.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  if (nums.length === 1) return nums[0];
  return 0;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

/** Backend ChildRecord → the design's Child shape. */
export function childRecordToChild(rec: ChildRecord): Child {
  const status = tierToStatus(rec.current_tier);
  return {
    id: rec.id,
    sector: wardToSector(rec.village_ward ?? ""),
    ageMonths: ageBracketToMonths(rec.age_bracket ?? ""),
    status: rec.is_overdue && status !== "refer" ? "overdue" : status,
    // Per-domain scores when the child has a completed Module A session.
    scores:
      rec.domain_scores && Object.keys(rec.domain_scores).length
        ? toScores(rec.domain_scores)
        : undefined,
    regression: false,
    visits: rec.contact_count ?? 0,
    lastVisitDays: daysSince(rec.last_contacted_at ?? rec.last_screened_at),
    handoff: "none",
  };
}
