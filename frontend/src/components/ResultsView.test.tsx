import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsView } from "./ResultsView";
import type { ResultPayload } from "../api/types";

function baseResult(overrides: Partial<ResultPayload> = {}): ResultPayload {
  return {
    final_classification: "Monitor",
    ml_classification: "Monitor",
    ml_score: 0.42,
    probabilities: { Typical: 0.3, Monitor: 0.5, Refer: 0.2 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [],
    shap_values: {
      gm_01: 0.1,
      fm_02: 0.4,
      com_03: 0.05,
    },
    stopping_reason: "cap_reached",
    caveats: [],
    ...overrides,
  };
}

const DISCLAIMER = /screening check-in, not a medical diagnosis/i;

describe("ResultsView", () => {
  it("renders the standard layout when safety_override_triggered is false", () => {
    render(<ResultsView result={baseResult()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /keeping an eye/i,
    );
    expect(screen.queryByText(/Safety recommendation/i)).not.toBeInTheDocument();
    expect(document.querySelector(".results--standard")).toBeTruthy();
    expect(document.querySelector(".results--override")).toBeNull();
  });

  it("renders a distinct override layout when safety_override_triggered is true", () => {
    render(
      <ResultsView
        result={baseResult({
          safety_override_triggered: true,
          final_classification: "Refer",
          override_rule: "regression_flag",
        })}
      />,
    );
    expect(screen.getByText(/Safety recommendation/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /talk with your child’s clinician/i,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".results--override")).toBeTruthy();
    expect(document.querySelector(".results--standard")).toBeNull();
    expect(document.querySelector(".display--clay")).toBeTruthy();
  });

  it.each(["Typical", "Monitor", "Refer"] as const)(
    "shows the fixed screening disclaimer for %s (standard path)",
    (classification) => {
      render(
        <ResultsView
          result={baseResult({ final_classification: classification })}
        />,
      );
      expect(
        screen.getByRole("note", { name: /Important disclaimer/i }),
      ).toHaveTextContent(DISCLAIMER);
    },
  );

  it("shows early-intervention next-step resource on Refer (standard path)", () => {
    render(
      <ResultsView result={baseResult({ final_classification: "Refer" })} />,
    );
    const resource = screen.getByTestId("early-intervention-resource");
    expect(resource).toBeInTheDocument();
    expect(resource).toHaveTextContent(/early intervention/i);
    expect(resource).toHaveTextContent(/IDEA Part C/i);
  });

  it("shows disclaimer + early-intervention resource on safety-floor override", () => {
    render(
      <ResultsView
        result={baseResult({
          safety_override_triggered: true,
          final_classification: "Refer",
          override_rule: "regression_flag",
        })}
      />,
    );
    expect(
      screen.getByRole("note", { name: /Important disclaimer/i }),
    ).toHaveTextContent(DISCLAIMER);
    expect(screen.getByTestId("early-intervention-resource")).toBeInTheDocument();
  });

  it("does not show early-intervention resource for Typical / Monitor", () => {
    const { rerender } = render(
      <ResultsView result={baseResult({ final_classification: "Typical" })} />,
    );
    expect(screen.queryByTestId("early-intervention-resource")).toBeNull();
    rerender(
      <ResultsView result={baseResult({ final_classification: "Monitor" })} />,
    );
    expect(screen.queryByTestId("early-intervention-resource")).toBeNull();
  });
});
