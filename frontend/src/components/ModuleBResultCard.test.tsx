import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModuleBResultCard } from "./ModuleBResultCard";
import type { ResultPayload } from "../api/types";

function moduleBResult(overrides: Partial<ResultPayload> = {}): ResultPayload {
  return {
    final_classification: "Monitor",
    ml_classification: "Monitor",
    ml_score: 0.55,
    probabilities: { Typical: 0.2, Monitor: 0.5, Refer: 0.3 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [],
    shap_values: {},
    stopping_reason: "cap_reached",
    caveats: [],
    domain_classifications: {
      attention: "Monitor",
      reading: "Typical",
      numbers: "Refer",
    },
    consistency_flags: { attention: true },
    consistency_score: 0.72,
    module: "B",
    real_answer_count: 8,
    ...overrides,
  };
}

describe("ModuleBResultCard", () => {
  it("renders Module B domain labels that match the school-age bank", () => {
    render(<ModuleBResultCard result={moduleBResult()} />);
    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getAllByText("Reading").length).toBeGreaterThan(0);
    expect(screen.getByText("Numbers")).toBeInTheDocument();
    expect(
      screen.getByText(/screening check-in, not a medical diagnosis/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/This check-in at a glance/i)).toBeInTheDocument();
    expect(screen.getByText(/Print \/ save as PDF/i)).toBeInTheDocument();
  });

  it("shows early-intervention resource on Refer", () => {
    render(
      <ModuleBResultCard
        result={moduleBResult({ final_classification: "Refer" })}
      />,
    );
    expect(
      screen.getByTestId("early-intervention-resource"),
    ).toBeInTheDocument();
  });
});
