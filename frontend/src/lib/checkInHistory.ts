/**
 * Device-local check-in history for Growth / Share / Clinician tools.
 *
 * Intentionally not a server child profile — parents keep snapshots on this
 * browser only. Cleared when they clear site data. Used so nav features work
 * against real completed results instead of mocks.
 */

import type { ResultPayload, ShapFeature } from "../api/types";
import {
  DOMAIN_LABELS,
  toDomainConcerns,
  type ConcernLevel,
  type ModuleKind,
} from "./domainConcern";

const STORAGE_KEY = "nirixon_checkin_history_v1";
const MAX_ENTRIES = 24;

export interface DomainSnapshot {
  domain: string;
  label: string;
  level: ConcernLevel;
}

export interface ClinicianSnapshot {
  ml_classification: string;
  ml_score: number;
  probabilities: Record<string, number>;
  shap_top_features: ShapFeature[];
  model_name?: string | null;
}

export interface CheckInSnapshot {
  id: string;
  savedAt: string;
  childRef: string;
  correctedAgeMonths: number;
  module: ModuleKind;
  final_classification: string;
  safety_override_triggered: boolean;
  override_rule: string | null;
  stopping_reason: string | null;
  caveats: string[];
  real_answer_count?: number | null;
  coveredDomainCount?: number;
  domains: DomainSnapshot[];
  domain_classifications?: Record<string, "Typical" | "Monitor" | "Refer">;
  clinician: ClinicianSnapshot;
}

export interface SaveCheckInInput {
  sessionId: string;
  result: ResultPayload;
  correctedAgeMonths: number;
  childRef?: string;
  coveredDomainCount?: number;
  module?: ModuleKind;
}

export function buildSnapshot(input: SaveCheckInInput): CheckInSnapshot {
  const { result, sessionId } = input;
  const module: ModuleKind =
    input.module ??
    result.module ??
    (input.correctedAgeMonths >= 60 ? "B" : "A");

  const concerns =
    module === "B" && result.domain_classifications
      ? Object.entries(result.domain_classifications).map(([domain, cls]) => ({
          domain,
          label: DOMAIN_LABELS[domain] ?? domain.replace(/_/g, " "),
          level: classificationToLevel(cls),
        }))
      : toDomainConcerns(result.shap_values, result.final_classification).map(
          (c) => ({
            domain: c.domain,
            label: c.label,
            level: c.level,
          }),
        );

  return {
    id: sessionId,
    savedAt: new Date().toISOString(),
    childRef: (input.childRef ?? "").trim(),
    correctedAgeMonths: input.correctedAgeMonths,
    module,
    final_classification: result.final_classification,
    safety_override_triggered: result.safety_override_triggered,
    override_rule: result.override_rule,
    stopping_reason: result.stopping_reason,
    caveats: [...result.caveats],
    real_answer_count: result.real_answer_count ?? null,
    coveredDomainCount: input.coveredDomainCount,
    domains: concerns,
    domain_classifications: result.domain_classifications,
    clinician: {
      ml_classification: result.ml_classification,
      ml_score: result.ml_score,
      probabilities: { ...result.probabilities },
      shap_top_features: [...result.shap_top_features],
      model_name: result.model_name ?? null,
    },
  };
}

function classificationToLevel(
  cls: "Typical" | "Monitor" | "Refer",
): ConcernLevel {
  if (cls === "Refer") return "worth_discussing";
  if (cls === "Monitor") return "keep_an_eye";
  return "typical";
}

export function loadCheckInHistory(): CheckInSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).sort(bySavedAtDesc);
  } catch {
    return [];
  }
}

export function saveCheckIn(input: SaveCheckInInput): CheckInSnapshot {
  const snapshot = buildSnapshot(input);
  const existing = loadCheckInHistory().filter((e) => e.id !== snapshot.id);
  const next = [snapshot, ...existing].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota — history features degrade gracefully
  }
  return snapshot;
}

export function clearCheckInHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getLatestCheckIn(): CheckInSnapshot | null {
  return loadCheckInHistory()[0] ?? null;
}

export function formatFamilyShareText(snapshot: CheckInSnapshot): string {
  const when = new Date(snapshot.savedAt).toLocaleString();
  const label = snapshot.childRef
    ? `Label: ${snapshot.childRef}`
    : "Label: (none — this session only)";
  const domainLines = snapshot.domains
    .map((d) => `• ${d.label}: ${levelPhrase(d.level)}`)
    .join("\n");

  return [
    "Nirixon developmental check-in summary",
    `Date: ${when}`,
    label,
    `Age at check-in: ${snapshot.correctedAgeMonths} months`,
    `Overall recommendation: ${snapshot.final_classification}`,
    snapshot.safety_override_triggered
      ? "Note: A protective safety rule recommended referral for this check-in."
      : null,
    "",
    "Areas reflected in this check-in:",
    domainLines || "• (no area breakdown available)",
    "",
    "This is a screening summary for discussion — not a medical diagnosis.",
    "Please talk with your child’s paediatrician or DEIC about any concerns.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function levelPhrase(level: ConcernLevel): string {
  switch (level) {
    case "typical":
      return "Typical for this check-in";
    case "keep_an_eye":
      return "Keep an eye on this";
    case "worth_discussing":
      return "Worth discussing";
  }
}

function bySavedAtDesc(a: CheckInSnapshot, b: CheckInSnapshot): number {
  return b.savedAt.localeCompare(a.savedAt);
}

function isSnapshot(value: unknown): value is CheckInSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.savedAt === "string" &&
    typeof v.final_classification === "string" &&
    Array.isArray(v.domains) &&
    typeof v.clinician === "object" &&
    v.clinician !== null
  );
}
