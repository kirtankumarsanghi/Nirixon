import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
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

function renderResults(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const DISCLAIMER = /screening check-in, not a medical diagnosis/i;

describe("ResultsView", () => {
  it("renders the standard layout when safety_override_triggered is false", () => {
    renderResults(<ResultsView result={baseResult()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /keeping an eye/i,
    );
    expect(screen.queryByText(/Safety recommendation/i)).not.toBeInTheDocument();
    expect(document.querySelector(".results--standard")).toBeTruthy();
    expect(document.querySelector(".results--override")).toBeNull();
  });

  it("renders a distinct override layout when safety_override_triggered is true", () => {
    renderResults(
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
      renderResults(
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
    renderResults(
      <ResultsView result={baseResult({ final_classification: "Refer" })} />,
    );
    const resource = screen.getByTestId("early-intervention-resource");
    expect(resource).toBeInTheDocument();
    expect(resource).toHaveTextContent(/District Early Intervention Centre/i);
    expect(resource).toHaveTextContent(/RBSK/i);
    expect(resource).not.toHaveTextContent(/IDEA Part C/i);
  });

  it("shows disclaimer + early-intervention resource on safety-floor override", () => {
    renderResults(
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
    const { rerender } = renderResults(
      <ResultsView result={baseResult({ final_classification: "Typical" })} />,
    );
    expect(screen.queryByTestId("early-intervention-resource")).toBeNull();
    rerender(
      <MemoryRouter>
        <ResultsView result={baseResult({ final_classification: "Monitor" })} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("early-intervention-resource")).toBeNull();
  });

  it("explains the six developmental areas for parents", () => {
    renderResults(<ResultsView result={baseResult()} />);
    expect(
      screen.getByRole("heading", {
        name: /The six areas this check-in looks at/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Big movements/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /Growth trends/i }).length,
    ).toBeGreaterThan(0);
  });
});
