import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { JointRespondentPage } from "./JointRespondentPage";
import { JointFamilyInvite } from "./DeferredPages";
import { shareApi, ApiError } from "../api/client";
import { ToastProvider } from "../toast/Toast";
import { saveSessionId } from "../lib/sessionStorage";

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
  api: {
    getSession: vi.fn().mockResolvedValue({
      session_id: "sess-joint-123",
      corrected_age_months: 24,
      age_bracket: "24m",
      answers: {},
    }),
  },
  shareApi: {
    getInviteQuestions: vi.fn(),
    submitResponse: vi.fn(),
    createInvite: vi.fn(),
    listInvites: vi.fn(),
    getConcordance: vi.fn(),
    merge: vi.fn(),
    deleteSession: vi.fn(),
  },
}));

describe("Joint Family & Multi-Caregiver Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("JointRespondentPage: renders questions with role label and privacy guarantee (zero child data)", async () => {
    vi.mocked(shareApi.getInviteQuestions).mockResolvedValueOnce({
      valid: true,
      role_label: "Grandmother",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      item_count: 2,
      items: [
        {
          item_id: "regression_flag",
          question_text: "Has the child lost any skill they previously mastered?",
          domain: "background",
          response_type: "yes_no",
          options: [
            { value: 1, label: "Yes" },
            { value: 0, label: "No" },
          ],
        },
        {
          item_id: "comm_24m_1",
          question_text: "Does the child say 2 or more words together?",
          domain: "communication",
          response_type: "frequency",
          options: [
            { value: 0, label: "Not Yet" },
            { value: 1, label: "Sometimes" },
            { value: 2, label: "Consistently" },
          ],
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/joint-respond/token-valid-123"]}>
        <Routes>
          <Route path="/joint-respond/:token" element={<JointRespondentPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify role label and privacy guarantee
    expect(await screen.findByText(/Role: Grandmother/i)).toBeInTheDocument();
    expect(screen.getByText(/Zero Personal Data Exposed|Privacy by Design/i)).toBeInTheDocument();

    // Verify questions are rendered
    expect(screen.getByText(/Has the child lost any skill/i)).toBeInTheDocument();
    expect(screen.getByText(/Does the child say 2 or more words together/i)).toBeInTheDocument();
  });

  it("JointRespondentPage: renders 410 Expired state clearly when token has expired", async () => {
    vi.mocked(shareApi.getInviteQuestions).mockRejectedValueOnce(
      new ApiError(410, "This invite link has expired.")
    );

    render(
      <MemoryRouter initialEntries={["/joint-respond/token-expired-xyz"]}>
        <Routes>
          <Route path="/joint-respond/:token" element={<JointRespondentPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/This Invite Link Has Expired/i)).toBeInTheDocument();
    expect(screen.getByText(/invite links expire automatically/i)).toBeInTheDocument();
  });

  it("JointRespondentPage: renders 409 Conflict state when token is already used", async () => {
    vi.mocked(shareApi.getInviteQuestions).mockRejectedValueOnce(
      new ApiError(409, "This invite token has already been used (single-use only).")
    );

    render(
      <MemoryRouter initialEntries={["/joint-respond/token-used-abc"]}>
        <Routes>
          <Route path="/joint-respond/:token" element={<JointRespondentPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Invite Link Already Used/i)).toBeInTheDocument();
    expect(screen.getByText(/Each link is single-use to ensure observations remain confidential/i)).toBeInTheDocument();
  });

  it("JointFamilyInvite: lists active invites, shows completed respondents, and displays concordance & disagreements", async () => {
    saveSessionId("sess-joint-123");

    vi.mocked(shareApi.listInvites).mockResolvedValueOnce({
      session_id: "sess-joint-123",
      max_limit: 3,
      invites: [
        {
          id: "inv-1",
          token: "tok-abc",
          role_label: "Grandmother",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_used: false,
          used_at: null,
          is_expired: false,
        },
      ],
      completed_respondents: [
        {
          id: "resp-1",
          role_label: "Father",
          answers_count: 5,
          submitted_at: new Date().toISOString(),
        },
      ],
      respondent_count: 1,
    });

    vi.mocked(shareApi.getConcordance).mockResolvedValueOnce({
      session_id: "sess-joint-123",
      respondent_count: 1,
      roles: ["Father"],
      overall_concordance: 0.8,
      exact_agreement_pct: 66.7,
      total_overlapping_items: 3,
      concordance_level: "High Concordance",
      safety_override_triggered: true,
      override_rule: "regression_flag",
      safety_source: "secondary_respondent (Father)",
      final_classification: "Refer",
      ml_classification: "Typical",
      item_concordance: [],
      disagreements: [
        {
          item_id: "regression_flag",
          domain: "background",
          question_text: "Has the child lost any skill they previously mastered?",
          primary_answer: 0,
          respondent_answers: [{ role_label: "Father", answer: 1 }],
          max_delta: 1,
          most_concerning_answer: 1,
          most_concerning_role: "Father",
          follow_up_prompt: "CRITICAL SAFETY INQUIRY: Explore the timeline of skill loss observed by Father.",
        },
      ],
    });

    render(
      <ToastProvider>
        <MemoryRouter>
          <JointFamilyInvite />
        </MemoryRouter>
      </ToastProvider>
    );

    // Check title and observer dashboard
    expect(await screen.findByText(/Joint Family & Multi-Caregiver Screening/i)).toBeInTheDocument();
    expect(await screen.findByText("Father")).toBeInTheDocument();
    expect(await screen.findByText(/Response Received/i)).toBeInTheDocument();

    // Check concordance and combination rule
    expect(await screen.findByText(/High Concordance \(80%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Safety Floor Triggered/i)).toBeInTheDocument();
    expect(screen.getByText(/Primary Model Score:/i)).toBeInTheDocument();
    expect(screen.getByText("Typical")).toBeInTheDocument();
    expect(screen.getByText("Refer")).toBeInTheDocument();

    // Check disagreement listing and clinical follow-up inquiry
    expect(screen.getByText(/Discrepant Observations/i)).toBeInTheDocument();
    expect(screen.getByText(/CRITICAL SAFETY INQUIRY/i)).toBeInTheDocument();
  });
});
