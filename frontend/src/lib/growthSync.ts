/**
 * Optional synchronized growth tracking client and local opt-in manager.
 *
 * PRIVACY GUARANTEES:
 * - Default: on-device only (no server calls).
 * - Opt-in: requires clear parental consent explaining stored pseudonymous data.
 * - Server stores: pseudonymous child ID, age bracket / birth month & year, visit date,
 *   domain scores, tier, and computed developmental/chronological ages.
 * - Zero personal data: no names, no phones, no emails, no addresses, no free-text notes.
 * - Right to erasure: permanent deletion via API wipes all visits for the child ID.
 */

import { loadCheckInHistory } from "./checkInHistory";

const OPT_IN_KEY = "nirixon_growth_sync_opt_in";
const CHILD_ID_KEY = "nirixon_growth_pseudonymous_child_id";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export interface GrowthVisitPayload {
  child_id: string;
  age_bracket: string;
  birth_year_month?: string | null;
  chronological_age_months: number;
  developmental_age_months?: number;
  visit_date?: string;
  domain_scores: Record<string, string | number>;
  tier: string;
}

export interface GrowthVisitRecord {
  id: string;
  child_id: string;
  age_bracket: string;
  birth_year_month: string | null;
  chronological_age_months: number;
  developmental_age_months: number;
  visit_date: string;
  domain_scores: Record<string, string | number>;
  tier: string;
  created_at: string;
}

export interface PlateauInterval {
  visit_index: number;
  prev_chronological_age: number;
  curr_chronological_age: number;
  chronological_gain: number;
  developmental_gain: number;
  gain_ratio: number | null;
  is_plateau: boolean;
  message: string;
}

export interface TrajectoryPoint {
  chronological_age: number;
  developmental_age: number;
  visit_date: string;
  tier: string;
}

export interface GrowthAnalysis {
  child_id: string;
  total_visits: number;
  is_plateau_detected: boolean;
  plateau_summary: string;
  sync_enabled: boolean;
  trajectory: TrajectoryPoint[];
  intervals: PlateauInterval[];
}

export interface GrowthExport {
  export_date: string;
  privacy_disclaimer: string;
  child_id: string;
  total_visits: number;
  visits: GrowthVisitRecord[];
  analysis: GrowthAnalysis;
}

export interface GrowthDeleteResult {
  child_id: string;
  deleted_count: number;
  message: string;
}

// ── Opt-in & Pseudonymous Identity Management ──────────────────────────────

export function isGrowthSyncOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === "true";
  } catch {
    return false;
  }
}

export function setGrowthSyncOptIn(optedIn: boolean): void {
  try {
    if (optedIn) {
      localStorage.setItem(OPT_IN_KEY, "true");
    } else {
      localStorage.removeItem(OPT_IN_KEY);
    }
  } catch {
    // ignore
  }
}

export function getPseudonymousChildId(): string {
  try {
    let id = localStorage.getItem(CHILD_ID_KEY);
    if (!id) {
      id = "child-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 18) : Math.random().toString(36).substring(2, 12));
      localStorage.setItem(CHILD_ID_KEY, id);
    }
    return id;
  } catch {
    return "child-ephemeral-" + Math.random().toString(36).substring(2, 8);
  }
}

export function clearGrowthSyncOptIn(): void {
  try {
    localStorage.removeItem(OPT_IN_KEY);
    localStorage.removeItem(CHILD_ID_KEY);
  } catch {
    // ignore
  }
}

// ── API Client ─────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

export async function checkSyncStatus(): Promise<{ sync_enabled: boolean; privacy_model: string }> {
  return fetchJson<{ sync_enabled: boolean; privacy_model: string }>("/api/growth/status");
}

export async function saveGrowthVisit(visit: GrowthVisitPayload): Promise<GrowthVisitRecord> {
  return fetchJson<GrowthVisitRecord>("/api/growth/visits", {
    method: "POST",
    body: JSON.stringify(visit),
  });
}

export async function listGrowthVisits(childId: string): Promise<GrowthVisitRecord[]> {
  return fetchJson<GrowthVisitRecord[]>(`/api/growth/visits/${encodeURIComponent(childId)}`);
}

export async function getGrowthAnalysis(childId: string): Promise<GrowthAnalysis> {
  return fetchJson<GrowthAnalysis>(`/api/growth/analysis/${encodeURIComponent(childId)}`);
}

export async function deleteChildGrowthData(childId: string): Promise<GrowthDeleteResult> {
  return fetchJson<GrowthDeleteResult>(`/api/growth/data/${encodeURIComponent(childId)}`, {
    method: "DELETE",
  });
}

export async function exportChildGrowthData(childId: string): Promise<GrowthExport> {
  return fetchJson<GrowthExport>(`/api/growth/export/${encodeURIComponent(childId)}`);
}

/** Sync all existing local device check-in history to the server under the pseudonymous child ID. */
export async function syncLocalHistoryToServer(childId: string): Promise<{ synced_count: number }> {
  const history = loadCheckInHistory();
  if (history.length === 0) return { synced_count: 0 };

  let count = 0;
  for (const snapshot of history) {
    const domainScores: Record<string, string> = {};
    for (const d of snapshot.domains) {
      domainScores[d.domain] = d.level;
    }

    const ageBracket = snapshot.correctedAgeMonths <= 12
      ? "6-12m"
      : snapshot.correctedAgeMonths <= 24
      ? "18-24m"
      : snapshot.correctedAgeMonths <= 36
      ? "24-36m"
      : snapshot.correctedAgeMonths <= 60
      ? "36-60m"
      : "60-144m";

    // Estimate developmental age based on tier and age if not explicit
    const factor = snapshot.final_classification === "Refer" ? 0.7 : snapshot.final_classification === "Monitor" ? 0.85 : 1.0;
    const devAge = Math.round(snapshot.correctedAgeMonths * factor * 10) / 10;

    await saveGrowthVisit({
      child_id: childId,
      age_bracket: ageBracket,
      chronological_age_months: snapshot.correctedAgeMonths,
      developmental_age_months: devAge,
      visit_date: snapshot.savedAt,
      domain_scores: domainScores,
      tier: snapshot.final_classification,
    });
    count++;
  }

  return { synced_count: count };
}
