import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LiveElicitationTask, TouchMicroTask, SandboxPage } from "./DeferredPages";
import * as checkInHistory from "../lib/checkInHistory";

vi.mock("../api/client", () => ({
  api: {
    getLiveTasks: vi.fn().mockResolvedValue([
      {
        task_id: "live_24_fm_blocks",
        milestone_item_id: "asq_24_fine_motor_1",
        domain: "fine_motor",
        age_bracket: "24m",
        title: "Block Tower Construction",
        instruction: "Place 6 small blocks in front of the child.",
        what_to_observe: "Child stacks 4 or more blocks vertically.",
        response_options: [
          { label: "Not Yet", value: 0 },
          { label: "Sometimes", value: 1 },
          { label: "Consistently", value: 2 },
        ],
      },
    ]),
    getSession: vi.fn().mockResolvedValue({
      session_id: "sess-123",
      corrected_age_months: 24,
      age_bracket: "24m",
      answers: {},
    }),
    getSessionLiveTasks: vi.fn().mockResolvedValue([]),
    submitAnswer: vi.fn().mockResolvedValue({
      type: "question",
      session_id: "sess-123",
      status: "in_progress",
    }),
    getTouchConfig: vi.fn().mockResolvedValue({
      is_provisional: true,
      status: "provisional",
      notice: "Provisional reference ranges",
      minimum_age_months: 24,
      supported_brackets: ["24-36m"],
      brackets: {},
    }),
    submitTouchTelemetry: vi.fn().mockResolvedValue({
      status: "received",
      session_id: "sess-123",
      touch_count: 3,
      exploratory_notice: "Exploratory motor telemetry. Not used in diagnostic scoring.",
      provisional_evaluations: [],
    }),
  },
}));

describe("Live Elicitation & Touch Tasks Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("LiveElicitationTask renders direct observation tasks with source='observed' note", async () => {
    render(
      <MemoryRouter>
        <LiveElicitationTask />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /Live Elicitation Tasks/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Block Tower Construction/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Item: asq_24_fine_motor_1/i),
    ).toBeInTheDocument();
  });

  it("TouchMicroTask renders exploratory fine motor telemetry banner and tasks", async () => {
    render(
      <MemoryRouter>
        <TouchMicroTask />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /Toddler Touch Tasks \(24m\+\)/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Exploratory, not used in the result/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No images, video, or audio are ever captured or sent/i),
    ).toBeInTheDocument();
  });

  it("SandboxPage displays exploratory touch telemetry with 'Exploratory, not used in the result'", () => {
    vi.spyOn(checkInHistory, "getLatestCheckIn").mockReturnValue({
      id: "sess-test",
      savedAt: new Date().toISOString(),
      childRef: "CR-101",
      correctedAgeMonths: 30,
      module: "A",
      final_classification: "Typical",
      safety_override_triggered: false,
      override_rule: null,
      stopping_reason: null,
      caveats: [],
      domains: [{ domain: "fine_motor", label: "Fine Motor", level: "typical" }],
      clinician: {
        ml_classification: "Typical",
        ml_score: 0.12,
        probabilities: { Typical: 0.95, Monitor: 0.04, Refer: 0.01 },
        shap_top_features: [],
        model_name: "xgboost_v1",
      },
      answer_sources: {
        asq_24_fine_motor_1: "observed",
      },
      touch_telemetry: [
        {
          task_type: "tap",
          reaction_time_ms: 540,
          path_accuracy_pct: 92.5,
          jitter_px: 2.1,
          completed: true,
        },
      ],
    });

    render(
      <MemoryRouter>
        <SandboxPage />
      </MemoryRouter>,
    );

    // Direct observation verification notice
    expect(
      screen.getByText(/Direct Observation Verified:/i),
    ).toBeInTheDocument();

    // Touch telemetry section
    expect(
      screen.getByRole("heading", { name: /Quantitative Touch Motor Telemetry/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Exploratory, not used in the result/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reaction Time:/i)).toBeInTheDocument();
    expect(screen.getByText(/540 ms/i)).toBeInTheDocument();
  });
});
