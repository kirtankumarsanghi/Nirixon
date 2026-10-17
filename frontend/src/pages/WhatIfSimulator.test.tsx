import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ResultPayload } from "../api/types";
import { WhatIfSimulator } from "./WhatIfSimulator";

// Mock sandboxApi
const mockSimulate = vi.fn();
vi.mock("../api/client", () => ({
  sandboxApi: {
    simulate: (...args: unknown[]) => mockSimulate(...args),
  },
  api: {
    login: vi.fn(),
  },
  setAuthToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

// Mock AuthContext
const mockLogin = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    role: "internal",
    token: "mock-token",
    login: mockLogin,
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}));

// Mock checkInHistory to provide predictable baseline
vi.mock("../lib/checkInHistory", () => ({
  loadCheckInHistory: () => [
    {
      id: "session-123",
      savedAt: new Date().toISOString(),
      childRef: "Child 1",
      correctedAgeMonths: 36,
      module: "A",
      final_classification: "Monitor",
      safety_override_triggered: false,
      override_rule: null,
      stopping_reason: "cap_reached",
      caveats: [],
      domains: [
        { domain: "gross_motor", label: "Gross Motor", level: "keep_an_eye" },
        { domain: "fine_motor", label: "Fine Motor", level: "typical" },
        { domain: "communication", label: "Communication", level: "typical" },
        { domain: "problem_solving", label: "Problem Solving", level: "typical" },
        { domain: "personal_social", label: "Personal-Social", level: "typical" },
        { domain: "adaptive", label: "Adaptive", level: "typical" },
      ],
      clinician: {
        ml_classification: "Monitor",
        ml_score: 0.52,
        probabilities: { Typical: 0.28, Monitor: 0.58, Refer: 0.14 },
        shap_top_features: [
          { feature: "gross_motor", shap_value: 0.35 },
          { feature: "fine_motor", shap_value: -0.12 },
        ],
        model_name: "prod_xgboost_v1",
      },
    },
  ],
  getLatestCheckIn: () => ({
    id: "session-123",
    savedAt: new Date().toISOString(),
    childRef: "Child 1",
    correctedAgeMonths: 36,
    module: "A",
    final_classification: "Monitor",
    safety_override_triggered: false,
    override_rule: null,
    stopping_reason: "cap_reached",
    caveats: [],
    domains: [
      { domain: "gross_motor", label: "Gross Motor", level: "keep_an_eye" },
      { domain: "fine_motor", label: "Fine Motor", level: "typical" },
      { domain: "communication", label: "Communication", level: "typical" },
      { domain: "problem_solving", label: "Problem Solving", level: "typical" },
      { domain: "personal_social", label: "Personal-Social", level: "typical" },
      { domain: "adaptive", label: "Adaptive", level: "typical" },
    ],
    clinician: {
      ml_classification: "Monitor",
      ml_score: 0.52,
      probabilities: { Typical: 0.28, Monitor: 0.58, Refer: 0.14 },
      shap_top_features: [
        { feature: "gross_motor", shap_value: 0.35 },
        { feature: "fine_motor", shap_value: -0.12 },
      ],
      model_name: "prod_xgboost_v1",
    },
  }),
}));

function baseSimResult(overrides: Partial<ResultPayload> = {}): ResultPayload {
  return {
    final_classification: "Typical",
    ml_classification: "Typical",
    ml_score: 0.15,
    probabilities: { Typical: 0.82, Monitor: 0.12, Refer: 0.06 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [
      { feature: "gross_motor", shap_value: -0.22 },
      { feature: "fine_motor", shap_value: -0.15 },
    ],
    shap_values: { gross_motor: -0.22, fine_motor: -0.15 },
    stopping_reason: "sandbox_simulation",
    caveats: [],
    triage_tier: "Tier 1: Routine Typical",
    latency_ms: 14.2,
    ...overrides,
  };
}

describe("WhatIfSimulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Acceptance Check 1: a simulated value that triggers the safety rule returns Refer regardless of model output", async () => {
    // When safety rule triggers, backend returns Refer + safety_override_triggered = true
    mockSimulate.mockResolvedValueOnce(
      baseSimResult({
        final_classification: "Monitor",
        ml_classification: "Monitor",
        triage_tier: "Tier 2: Reflex Monitor",
      }),
    );

    render(
      <MemoryRouter>
        <WhatIfSimulator />
      </MemoryRouter>,
    );

    // Initial mount triggers debounced simulation
    await waitFor(() => {
      expect(mockSimulate).toHaveBeenCalled();
    });

    // Check regression toggle
    const regressionCheckbox = screen.getByRole("checkbox", {
      name: /Simulate Skill Regression/i,
    });

    mockSimulate.mockResolvedValueOnce(
      baseSimResult({
        final_classification: "Refer",
        ml_classification: "Typical", // Model output was Typical, but safety rule overrides to Refer
        triage_tier: "Tier 3: Direct Referral",
        safety_override_triggered: true,
        override_rule: "regression_flag",
      }),
    );

    await userEvent.click(regressionCheckbox);

    // Wait for the safety override alert heading to display
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Referral rule applies/i }),
      ).toBeInTheDocument();
    });

    // Check that simulated tier is displayed as Refer
    const referBadges = screen.getAllByText("Refer");
    expect(referBadges.length).toBeGreaterThan(0);

    // Check that plain line explains the referral rule
    expect(
      screen.getByText(
        /Referral rule applies: When skill regression is reported, the child is referred directly regardless of model output/i,
      ),
    ).toBeInTheDocument();
  });

  it("Acceptance Check 2: invalid input returns a clear error without crashing the UI", async () => {
    mockSimulate.mockResolvedValueOnce(baseSimResult());

    render(
      <MemoryRouter>
        <WhatIfSimulator />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockSimulate).toHaveBeenCalled();
    });

    // Simulate API returning a 422 Unprocessable Entity error (e.g. out-of-range value)
    mockSimulate.mockRejectedValueOnce(
      new Error("Domain score for 'gross_motor' out of range: must be between 0 and 100"),
    );

    // Trigger simulation via slider
    const gmSlider = screen.getByRole("slider", { name: /Gross Motor simulated score/i });
    fireEvent.change(gmSlider, { target: { value: "95" } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByText(/must be between 0 and 100/i),
      ).toBeInTheDocument();
    });

    // Verify UI is still fully intact and interactive
    expect(screen.getByRole("heading", { name: /What-If Simulator/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Fine Motor simulated score/i })).toBeInTheDocument();
  });

  it("Acceptance Check 3: slider movement updates tier, probabilities, and plain language line", async () => {
    mockSimulate.mockResolvedValueOnce(
      baseSimResult({
        final_classification: "Monitor",
        triage_tier: "Tier 2: Reflex Monitor",
      }),
    );

    render(
      <MemoryRouter>
        <WhatIfSimulator />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockSimulate).toHaveBeenCalled();
    });

    // Mock the subsequent call after slider moves higher
    mockSimulate.mockResolvedValueOnce(
      baseSimResult({
        final_classification: "Typical",
        triage_tier: "Tier 1: Routine Typical",
        probabilities: { Typical: 0.85, Monitor: 0.1, Refer: 0.05 },
        latency_ms: 14.2,
      }),
    );

    // Move Gross Motor slider from initial 50 to 90
    const gmSlider = screen.getByRole("slider", { name: /Gross Motor simulated score/i });
    fireEvent.change(gmSlider, { target: { value: "90" } });

    // Verify sentence updates: "If Gross Motor were higher, the result would change from Monitor to Typical."
    await waitFor(() => {
      expect(
        screen.getByText(
          /If Gross Motor were higher, the result would change from Monitor to Typical/i,
        ),
      ).toBeInTheDocument();
    });

    // Verify side-by-side comparison cards
    expect(screen.getByText("Original Result")).toBeInTheDocument();
    expect(screen.getByText("Simulated Outcome")).toBeInTheDocument();

    // Verify latency badge is shown because latency_ms was returned
    expect(screen.getByText(/14.2 ms/i)).toBeInTheDocument();
  });

  it("omits inference time badge if latency_ms is null or omitted", async () => {
    mockSimulate.mockResolvedValueOnce(
      baseSimResult({
        latency_ms: null,
      }),
    );

    render(
      <MemoryRouter>
        <WhatIfSimulator />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockSimulate).toHaveBeenCalled();
    });

    // Should NOT display latency badge
    expect(screen.queryByTitle(/Model inference latency/i)).not.toBeInTheDocument();
  });

  it("Parent view is simplified, read-only, and displays 'An illustration, not a prediction.'", async () => {
    mockSimulate.mockResolvedValueOnce(baseSimResult());

    render(
      <MemoryRouter>
        <WhatIfSimulator />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockSimulate).toHaveBeenCalled();
    });

    // Switch to Parent view
    const parentTab = screen.getByRole("tab", { name: /Parent view/i });
    await userEvent.click(parentTab);

    // Verify illustration label
    expect(screen.getByText(/An illustration, not a prediction/i)).toBeInTheDocument();

    // Verify sliders are disabled (read-only)
    const gmSlider = screen.getByRole("slider", { name: /Gross Motor simulated score/i });
    expect(gmSlider).toBeDisabled();

    // Verify SHAP list is omitted in parent view
    expect(screen.queryByText(/TreeSHAP Feature Attributions/i)).not.toBeInTheDocument();
  });
});
