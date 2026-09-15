import { describe, expect, it, beforeEach } from "vitest";
import {
  buildSnapshot,
  clearCheckInHistory,
  formatFamilyShareText,
  loadCheckInHistory,
  saveCheckIn,
} from "./checkInHistory";
import type { ResultPayload } from "../api/types";

function result(overrides: Partial<ResultPayload> = {}): ResultPayload {
  return {
    final_classification: "Monitor",
    ml_classification: "Monitor",
    model_name: "xgboost",
    ml_score: 0.4,
    probabilities: { Typical: 0.2, Monitor: 0.6, Refer: 0.2 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [{ feature: "gm_01", shap_value: 0.12 }],
    shap_values: { gm_01: 0.3, fm_02: 0.1 },
    stopping_reason: "cap_reached",
    caveats: [],
    real_answer_count: 8,
    module: "A",
    ...overrides,
  };
}

describe("checkInHistory", () => {
  beforeEach(() => {
    clearCheckInHistory();
  });

  it("saves and loads a real Module A snapshot", () => {
    saveCheckIn({
      sessionId: "sess-1",
      result: result(),
      correctedAgeMonths: 24,
      childRef: "AK",
      coveredDomainCount: 5,
    });
    const history = loadCheckInHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.final_classification).toBe("Monitor");
    expect(history[0]?.domains.length).toBe(6);
    expect(history[0]?.clinician.model_name).toBe("xgboost");
  });

  it("dedupes by session id", () => {
    saveCheckIn({
      sessionId: "sess-1",
      result: result(),
      correctedAgeMonths: 24,
    });
    saveCheckIn({
      sessionId: "sess-1",
      result: result({ final_classification: "Typical" }),
      correctedAgeMonths: 24,
    });
    expect(loadCheckInHistory()).toHaveLength(1);
    expect(loadCheckInHistory()[0]?.final_classification).toBe("Typical");
  });

  it("formats a family share text from snapshot data", () => {
    const snap = buildSnapshot({
      sessionId: "s",
      result: result({ final_classification: "Refer" }),
      correctedAgeMonths: 18,
      childRef: "Maya",
    });
    const text = formatFamilyShareText(snap);
    expect(text).toMatch(/Refer/);
    expect(text).toMatch(/Maya/);
    expect(text).toMatch(/18 months/);
    expect(text).toMatch(/not a medical diagnosis/i);
  });
});
