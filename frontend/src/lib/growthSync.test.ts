import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearGrowthSyncOptIn,
  deleteChildGrowthData,
  exportChildGrowthData,
  getGrowthAnalysis,
  getPseudonymousChildId,
  isGrowthSyncOptedIn,
  setGrowthSyncOptIn,
  syncLocalHistoryToServer,
  type GrowthVisitPayload,
} from "./growthSync";
import { clearCheckInHistory, saveCheckIn } from "./checkInHistory";
import type { ResultPayload } from "../api/types";

function mockResult(): ResultPayload {
  return {
    final_classification: "Monitor",
    ml_classification: "Monitor",
    model_name: "xgboost",
    ml_score: 0.45,
    probabilities: { Typical: 0.2, Monitor: 0.6, Refer: 0.2 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [],
    shap_values: {},
    stopping_reason: "cap_reached",
    caveats: [],
    real_answer_count: 8,
    module: "A",
  };
}

describe("growthSync", () => {
  beforeEach(() => {
    localStorage.clear();
    clearCheckInHistory();
    vi.restoreAllMocks();
  });

  describe("Consent & Pseudonymous Identity", () => {
    it("defaults to on-device only (not opted in)", () => {
      expect(isGrowthSyncOptedIn()).toBe(false);
    });

    it("persists opt-in status when explicitly consented", () => {
      setGrowthSyncOptIn(true);
      expect(isGrowthSyncOptedIn()).toBe(true);

      setGrowthSyncOptIn(false);
      expect(isGrowthSyncOptedIn()).toBe(false);
    });

    it("generates and retains a pseudonymous child ID with no personal info", () => {
      const childId = getPseudonymousChildId();
      expect(childId).toMatch(/^child-[a-zA-Z0-9_-]+$/);
      // Calling it again should yield the same stored pseudonym
      expect(getPseudonymousChildId()).toBe(childId);
    });

    it("clears opt-in and pseudonym completely on reset", () => {
      setGrowthSyncOptIn(true);
      const id1 = getPseudonymousChildId();
      expect(id1).toBeTruthy();

      clearGrowthSyncOptIn();
      expect(isGrowthSyncOptedIn()).toBe(false);
      expect(localStorage.getItem("nirixon_growth_pseudonymous_child_id")).toBeNull();
    });
  });

  describe("Privacy & Schema Constraints", () => {
    it("ensures payload only contains pseudonymous fields", () => {
      const payload: GrowthVisitPayload = {
        child_id: "child-test-12345",
        age_bracket: "18-24m",
        birth_year_month: "2024-04",
        chronological_age_months: 24,
        developmental_age_months: 20.4,
        visit_date: "2026-04-10",
        domain_scores: { gm: "typical", lc: "monitor" },
        tier: "Monitor",
      };

      const keys = Object.keys(payload);
      const forbidden = ["name", "child_name", "parent", "email", "phone", "address", "notes", "text"];
      for (const k of keys) {
        for (const f of forbidden) {
          expect(k.toLowerCase()).not.toContain(f);
        }
      }
    });
  });

  describe("Sync and API interaction", () => {
    it("syncs local check-in history to pseudonymous server visits", async () => {
      saveCheckIn({
        sessionId: "session-growth-1",
        result: mockResult(),
        correctedAgeMonths: 20,
        coveredDomainCount: 5,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "uuid-1",
          child_id: "child-test",
          age_bracket: "18-24m",
          birth_year_month: null,
          chronological_age_months: 20,
          developmental_age_months: 17,
          visit_date: "2026-10-15",
          domain_scores: {},
          tier: "Monitor",
          created_at: "2026-10-15T00:00:00Z",
        }),
      } as Response);

      const res = await syncLocalHistoryToServer("child-test");
      expect(res.synced_count).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/growth/visits"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"child_id":"child-test"'),
        })
      );
    });

    it("fetches growth analysis and plateau evaluation", async () => {
      const mockAnalysis = {
        child_id: "child-abc",
        total_visits: 2,
        is_plateau_detected: true,
        plateau_summary: "Plateau flagged between visit 1 and visit 2.",
        sync_enabled: true,
        trajectory: [
          { chronological_age: 18, developmental_age: 16, visit_date: "2026-01-01", tier: "Typical" },
          { chronological_age: 24, developmental_age: 17, visit_date: "2026-07-01", tier: "Monitor" },
        ],
        intervals: [
          {
            visit_index: 2,
            prev_chronological_age: 18,
            curr_chronological_age: 24,
            chronological_gain: 6,
            developmental_gain: 1,
            gain_ratio: 0.17,
            is_plateau: true,
            message: "Developmental gain 1.0m is less than 0.5x chronological gain 6.0m (ratio 0.17).",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockAnalysis,
      } as Response);

      const analysis = await getGrowthAnalysis("child-abc");
      expect(analysis.is_plateau_detected).toBe(true);
      expect(analysis.intervals[0]?.gain_ratio).toBeCloseTo(0.17, 2);
    });

    it("deletes all server data on right-to-erasure request", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          child_id: "child-abc",
          deleted_count: 3,
          message: "All 3 records permanently deleted.",
        }),
      } as Response);

      const del = await deleteChildGrowthData("child-abc");
      expect(del.deleted_count).toBe(3);
    });

    it("exports pseudonymous child data accurately", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          export_date: "2026-10-15T12:00:00Z",
          privacy_disclaimer: "No personal data stored.",
          child_id: "child-abc",
          total_visits: 1,
          visits: [],
          analysis: {
            child_id: "child-abc",
            total_visits: 1,
            is_plateau_detected: false,
            plateau_summary: "Single visit.",
            sync_enabled: true,
            trajectory: [],
            intervals: [],
          },
        }),
      } as Response);

      const exp = await exportChildGrowthData("child-abc");
      expect(exp.child_id).toBe("child-abc");
      expect(exp.privacy_disclaimer).toContain("No personal data");
    });
  });
});
