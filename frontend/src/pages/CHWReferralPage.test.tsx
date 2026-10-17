import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CHWReferralPage } from "./CHWReferralPage";
import type { ReferralRecord, ReferralSummary, WorkerRecord, ChildRecord } from "../api/types";

const mockGetMe = vi.fn();
const mockGetChildren = vi.fn();
const mockGetReferrals = vi.fn();
const mockGetSummary = vi.fn();
const mockGetSummaryText = vi.fn();
const mockUpdateReferral = vi.fn();

vi.mock("../api/client", () => ({
  referralApi: {
    getMe: () => mockGetMe(),
    getChildren: () => mockGetChildren(),
    getReferrals: () => mockGetReferrals(),
    getSummary: (id: string) => mockGetSummary(id),
    getSummaryText: (id: string) => mockGetSummaryText(id),
    getSummaryPdfUrl: (id: string) => `http://localhost:8000/api/referrals/${id}/summary/pdf`,
    updateReferral: (id: string, data: unknown) => mockUpdateReferral(id, data),
    createChild: vi.fn(),
    deleteChild: vi.fn(),
    createReferral: vi.fn(),
    recordOutcome: vi.fn(),
    deleteReferral: vi.fn(),
  },
  api: {},
  setAuthToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    role: "chw",
    token: "mock-token",
    isAuthenticated: true,
  }),
}));

const sampleWorker: WorkerRecord = {
  id: "worker-1",
  user_id: "user-1",
  name: "Sunita Devi (ASHA)",
  role: "chw",
  area: "Ward 12",
  phone: "9876500001",
  created_at: new Date().toISOString(),
};

const sampleChild: ChildRecord = {
  id: "c-1",
  pseudonymous_id: "child-ward12-001",
  age_bracket: "18-24m",
  village_ward: "Ward 12",
  consent_given: true,
  consent_recorded_at: new Date().toISOString(),
  opt_in: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleReferral: ReferralRecord = {
  id: "ref-1",
  child_id: "child-ward12-001",
  from_worker_id: "worker-1",
  to_facility: "Safdarjung Hospital DEIC",
  reason: "Severe gross motor milestone loss",
  tier: "Tier 3: Direct Referral",
  status: "created",
  domains_of_concern: ["gross_motor", "communication"],
  safety_rule_trigger: "Motor score drop <= -2.0 SD",
  outcome_notes: null,
  created_at: new Date().toISOString(),
  sent_at: null,
  seen_at: null,
  outcome_recorded_at: null,
  closed_at: null,
  updated_at: new Date().toISOString(),
  timestamps: {
    created_at: new Date().toISOString(),
    sent_at: null,
    seen_at: null,
    outcome_recorded_at: null,
    closed_at: null,
    updated_at: new Date().toISOString(),
  },
};

const sampleSummary: ReferralSummary = {
  age_bracket: "18-24m",
  tier: "Tier 3: Direct Referral",
  domains_of_concern: ["gross_motor", "communication"],
  safety_rule_trigger: "Motor score drop <= -2.0 SD",
};

describe("CHWReferralPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(sampleWorker);
    mockGetChildren.mockResolvedValue([sampleChild]);
    mockGetReferrals.mockResolvedValue([sampleReferral]);
    mockGetSummary.mockResolvedValue(sampleSummary);
    mockGetSummaryText.mockResolvedValue("Age Bracket: 18-24m\nTier: Tier 3");
  });

  it("renders worker area badge and privacy guarantee", async () => {
    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Sunita Devi \(ASHA\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ward 12/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Privacy Guarantee:/i)).toBeInTheDocument();
  });

  it("displays referrals list with status badge and advance actions", async () => {
    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Safdarjung Hospital DEIC/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark Sent →/i)).toBeInTheDocument();
    expect(screen.getByText(/One-Page Minimal Summary/i)).toBeInTheDocument();
  });

  it("opens one-page minimal summary modal containing strictly the 4 fields", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    const summaryBtn = await screen.findByText(/One-Page Minimal Summary/i);
    await user.click(summaryBtn);

    expect(await screen.findByText(/1. Age Bracket:/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Triage Tier:/i)).toBeInTheDocument();
    expect(screen.getByText(/3. Domains of Concern:/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Safety Rule Trigger:/i)).toBeInTheDocument();

    // Verify values rendered
    expect(screen.getAllByText(/18-24m/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Motor score drop <= -2.0 SD/i).length).toBeGreaterThanOrEqual(1);

    // Verify download PDF and copy text controls exist
    expect(screen.getByText(/Download Printable PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy Shareable Text/i)).toBeInTheDocument();
  });
});
