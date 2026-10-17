import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TouchCanvasSuite } from "./TouchCanvasSuite";

vi.mock("../api/client", () => ({
  api: {
    getTouchConfig: vi.fn().mockResolvedValue({
      is_provisional: true,
      status: "provisional",
      notice: "Provisional reference ranges",
      minimum_age_months: 24,
      supported_brackets: ["24-36m", "36-48m", "48-60m"],
      brackets: {
        "24-36m": {
          tap: {
            reaction_time_ms_expected: [350, 900],
            path_accuracy_pct_expected: [60.0, 95.0],
            jitter_px_expected: [0.0, 15.0],
            sample_size_n: 60,
            provisional_source: "Pilot cohort",
          },
        },
      },
    }),
    submitTouchTelemetry: vi.fn().mockResolvedValue({
      status: "received",
      session_id: "test-sess-1",
      touch_count: 3,
      exploratory_notice: "Exploratory motor telemetry. Not used in diagnostic scoring.",
      provisional_evaluations: [],
    }),
  },
}));

describe("TouchCanvasSuite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows age restriction advisory when child is under 24 months", async () => {
    render(<TouchCanvasSuite childAgeMonths={18} />);

    expect(
      await screen.findByText(/Touch Tasks Restricted to 24 Months and Older/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/18 months/i)).toBeInTheDocument();
  });

  it("renders exploratory notice and privacy guarantee for eligible children (24m+)", async () => {
    render(<TouchCanvasSuite childAgeMonths={30} />);

    expect(
      await screen.findByText(/Exploratory, not used in the result/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Provisional Reference/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No images, video, or audio are ever captured or sent/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Start Task 1: Tap Target/i }),
    ).toBeInTheDocument();
  });
});
