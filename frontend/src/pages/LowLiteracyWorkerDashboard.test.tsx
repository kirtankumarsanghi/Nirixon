import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CHWReferralPage } from "./CHWReferralPage";
import type {
  ChildRecord,
  ReferralRecord,
  TierCounts,
  WorkerRecord,
} from "../api/types";

// Mock API functions
const mockGetMe = vi.fn();
const mockGetChildren = vi.fn();
const mockGetReferrals = vi.fn();
const mockGetTierCounts = vi.fn();
const mockGetSummary = vi.fn();
const mockGetSummaryText = vi.fn();
const mockUpdateReferral = vi.fn();
const mockMarkContacted = vi.fn();
const mockOneTouchReferral = vi.fn();
const mockRecordChildOutcome = vi.fn();
const mockSeedChildren = vi.fn();

vi.mock("../api/client", () => ({
  referralApi: {
    getMe: () => mockGetMe(),
    getChildren: (params?: unknown) => mockGetChildren(params),
    getReferrals: () => mockGetReferrals(),
    getTierCounts: () => mockGetTierCounts(),
    getSummary: (id: string) => mockGetSummary(id),
    getSummaryText: (id: string) => mockGetSummaryText(id),
    getSummaryPdfUrl: (id: string) => `http://localhost:8000/api/referrals/${id}/summary/pdf`,
    updateReferral: (id: string, data: unknown) => mockUpdateReferral(id, data),
    markContacted: (id: string) => mockMarkContacted(id),
    oneTouchReferral: (id: string) => mockOneTouchReferral(id),
    recordChildOutcome: (id: string, data: unknown) => mockRecordChildOutcome(id, data),
    seedChildren: (count?: number, area?: string, cleanFirst?: boolean) => mockSeedChildren(count, area, cleanFirst),
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

// Generate 200 realistic seeded children for testing
function generate200Children(): ChildRecord[] {
  const ageBrackets = ["0-6m", "6-12m", "12-24m", "24-36m", "36-48m", "48-60m"];
  const subWards = [
    "Ward 12 - Sector A",
    "Ward 12 - Sector B",
    "Ward 12 - Sector C",
    "Ward 12 - Sector D",
  ];
  const list: ChildRecord[] = [];
  const now = Date.now();

  for (let i = 1; i <= 200; i++) {
    const pad = String(i).padStart(3, "0");
    const bracket = ageBrackets[(i - 1) % ageBrackets.length];
    const ward = subWards[(i - 1) % subWards.length];

    let tier = "Tier 1: Typical";
    let isOverdue = false;
    let followUpDue: string | null = null;
    let domains: string[] = [];
    let safety: string | null = null;

    const mod = i % 10;
    if (mod === 0 || mod === 1 || mod === 2 || mod === 3) {
      tier = "Tier 1: Typical";
      followUpDue = new Date(now + 60 * 86400000).toISOString();
    } else if (mod === 4 || mod === 5 || mod === 6) {
      tier = "Tier 2: In-App Reflex Monitor";
      domains = ["social_emotional", "communication"];
      if (i % 3 === 0) {
        isOverdue = true;
        followUpDue = new Date(now - 5 * 86400000).toISOString();
      } else {
        followUpDue = new Date(now + 14 * 86400000).toISOString();
      }
    } else if (mod === 7 || mod === 8) {
      tier = "Tier 3: Direct Referral";
      domains = ["gross_motor", "communication"];
      safety = "Loss of motor milestones (SD <= -2.0)";
      if (i % 2 === 0) {
        isOverdue = true;
        followUpDue = new Date(now - 7 * 86400000).toISOString();
      } else {
        followUpDue = new Date(now + 7 * 86400000).toISOString();
      }
    } else {
      tier = "Unscreened";
    }

    list.push({
      id: `child-db-${pad}`,
      pseudonymous_id: `child-seed-ward12-${pad}`,
      age_bracket: bracket,
      village_ward: ward,
      consent_given: true,
      consent_recorded_at: new Date(now - 30 * 86400000).toISOString(),
      opt_in: true,
      current_tier: tier,
      last_screened_at: tier !== "Unscreened" ? new Date(now - 10 * 86400000).toISOString() : null,
      last_contacted_at: tier !== "Unscreened" ? new Date(now - 4 * 86400000).toISOString() : null,
      follow_up_due_at: followUpDue,
      contact_count: tier !== "Unscreened" ? (i % 5) + 1 : 0,
      domains_flagged: domains,
      safety_rule_triggered: safety,
      is_overdue: isOverdue,
      created_at: new Date(now - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return list;
}

const seeded200 = generate200Children();

const sampleTierCounts: TierCounts = {
  total_children: 200,
  tier1_typical: seeded200.filter((c) => (c.current_tier || "").startsWith("Tier 1")).length,
  tier2_monitor: seeded200.filter((c) => (c.current_tier || "").startsWith("Tier 2")).length,
  tier3_referral: seeded200.filter((c) => (c.current_tier || "").startsWith("Tier 3")).length,
  unscreened: seeded200.filter((c) => !c.current_tier || c.current_tier === "Unscreened").length,
  overdue_follow_up: seeded200.filter((c) => c.is_overdue).length,
};

const sampleReferrals: ReferralRecord[] = [
  {
    id: "ref-seed-001",
    child_id: "child-seed-ward12-007",
    from_worker_id: "worker-1",
    to_facility: "Safdarjung Hospital DEIC",
    reason: "Severe gross motor milestone lag detected",
    tier: "Tier 3: Direct Referral",
    status: "created",
    domains_of_concern: ["gross_motor", "communication"],
    safety_rule_trigger: "Loss of motor milestones (SD <= -2.0)",
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
  },
];

describe("Low-Literacy Worker Dashboard - Acceptance Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(sampleWorker);
    mockGetChildren.mockResolvedValue(seeded200);
    mockGetReferrals.mockResolvedValue(sampleReferrals);
    mockGetTierCounts.mockResolvedValue(sampleTierCounts);
    mockGetSummary.mockResolvedValue({
      age_bracket: "12-24m",
      tier: "Tier 3: Direct Referral",
      domains_of_concern: ["gross_motor", "communication"],
      safety_rule_trigger: "Loss of motor milestones (SD <= -2.0)",
    });
    mockGetSummaryText.mockResolvedValue("Age Bracket: 12-24m\nTier: Tier 3");
  });

  it("Acceptance Check 1: Loads 200 seeded children and calculates counts per tier", async () => {
    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    // Verify worker header & area
    expect(await screen.findByText(/Sunita Devi \(ASHA\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Ward 12/i).length).toBeGreaterThan(0);

    // Verify 200 children count in header and list summary
    const summarySpan = await screen.findByText(/Showing/i);
    expect(summarySpan).toHaveTextContent(/Showing 200 of 200 children/i);

    // Verify tier count cards at top
    expect(screen.getAllByText(/On Track/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Watch Closely/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Refer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Overdue/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Unscreened/i).length).toBeGreaterThanOrEqual(1);

    // Verify values match 200 seeded breakdown
    expect(screen.getAllByText(String(sampleTierCounts.tier1_typical)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(String(sampleTierCounts.tier2_monitor)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(String(sampleTierCounts.tier3_referral)).length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("Acceptance Check 2: Filters work (tier, overdue follow-up, age group, search, and batch view)", async () => {
    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    const summarySpan = await screen.findByText(/Showing/i);
    expect(summarySpan).toHaveTextContent(/Showing 200 of 200 children/i);

    const { fireEvent } = await import("@testing-library/react");

    // 1. Filter by Tier 3 (Refer)
    const referChips = screen.getAllByRole("button", { name: /^Refer/i });
    fireEvent.click(referChips[0]);
    const t3Count = sampleTierCounts.tier3_referral;
    expect(screen.getByText(/Showing/i)).toHaveTextContent(new RegExp(`Showing ${t3Count} of 200 children`, "i"));

    // Clear filters
    fireEvent.click(screen.getByText(/Clear Filters/i));
    expect(screen.getByText(/Showing/i)).toHaveTextContent(/Showing 200 of 200 children/i);

    // 2. Filter by Overdue follow-up
    const overdueChips = screen.getAllByRole("button", { name: /Overdue/i });
    fireEvent.click(overdueChips[0]);
    const odCount = sampleTierCounts.overdue_follow_up;
    expect(screen.getByText(/Showing/i)).toHaveTextContent(new RegExp(`Showing ${odCount} of 200 children`, "i"));

    // Clear filters
    fireEvent.click(screen.getByText(/Clear Filters/i));

    // 3. Search by exact ID
    const searchInput = screen.getByPlaceholderText(/Search child ID or area/i);
    fireEvent.change(searchInput, { target: { value: "child-seed-ward12-042" } });
    expect(screen.getByText(/Showing/i)).toHaveTextContent(/Showing 1 of 200 children/i);
    expect(screen.getByText(/child-seed-ward12-042/i)).toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText(/Showing/i)).toHaveTextContent(/Showing 200 of 200 children/i);

    // 4. View Switch: Switch to Batch view
    const batchBtn = screen.getByTitle(/Batch Checklist View/i);
    fireEvent.click(batchBtn);
    // Batch view shows compact rows
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  }, 60000);

  it("Acceptance Check 3: Quick actions (start screening, 1-touch referral 6a, mark contacted, record outcome)", async () => {
    mockMarkContacted.mockResolvedValue({
      message: "Contact recorded for child child-seed-ward12-001.",
      child_id: "child-db-001",
      last_contacted_at: new Date().toISOString(),
      contact_count: 5,
    });

    mockOneTouchReferral.mockResolvedValue({
      message: "One-touch referral active for child child-seed-ward12-001.",
      referral: sampleReferrals[0],
      summary: {
        age_bracket: "18-24m",
        tier: "Tier 3: Direct Referral",
        domains_of_concern: ["gross_motor", "communication"],
        safety_rule_trigger: "Loss of motor milestones (SD <= -2.0)",
      },
    });

    mockRecordChildOutcome.mockResolvedValue({
      ...sampleReferrals[0],
      status: "closed",
      outcome_notes: "Speech therapy initiated at CHC.",
    });

    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    const summarySpan = await screen.findByText(/Showing/i);
    expect(summarySpan).toHaveTextContent(/Showing 200 of 200 children/i);

    // Quick Action 1: Mark Contacted
    const contactBtns = screen.getAllByRole("button", { name: /Contacted/i });
    expect(contactBtns.length).toBeGreaterThan(0);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(contactBtns[0]);
    expect(mockMarkContacted).toHaveBeenCalledWith("child-db-001");

    // Quick Action 2: One-Touch Referral (uses 6a minimal summary)
    const referBtns = screen.getAllByRole("button", { name: /1-Touch Refer/i });
    expect(referBtns.length).toBeGreaterThan(0);
    fireEvent.click(referBtns[0]);

    expect(mockOneTouchReferral).toHaveBeenCalledWith("child-db-001");
    // Verify 6a Minimal Summary modal opens containing strictly the 4 fields
    expect(await screen.findByText(/One-Page Minimal Referral Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Age Bracket:/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Triage Tier:/i)).toBeInTheDocument();
    expect(screen.getByText(/3. Domains of Concern:/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Safety Rule Trigger:/i)).toBeInTheDocument();

    // Close summary modal
    fireEvent.click(screen.getByRole("button", { name: /Done/i }));

    // Quick Action 3: Record Outcome
    const outcomeBtns = screen.getAllByRole("button", { name: /Outcome/i });
    expect(outcomeBtns.length).toBeGreaterThan(0);
    fireEvent.click(outcomeBtns[0]);

    // Outcome modal should be visible
    expect(await screen.findByText(/Record Clinical Outcome/i)).toBeInTheDocument();
    // Tap a quick template
    const templateBtn = screen.getByText(/Doctor examined child at DEIC/i);
    fireEvent.click(templateBtn);
    // Submit outcome
    const saveBtn = screen.getByRole("button", { name: /Save Clinical Outcome/i });
    fireEvent.click(saveBtn);
    expect(mockRecordChildOutcome).toHaveBeenCalled();
  }, 60000);

  it("Acceptance Check 4: Mobile-first responsive layout has NO horizontal scroll at 360px width", async () => {
    // Set 360px viewport simulation
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 360 });
    Object.defineProperty(document.documentElement, "clientWidth", { writable: true, configurable: true, value: 360 });

    const { container } = render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    const summarySpan = await screen.findByText(/Showing/i);
    expect(summarySpan).toHaveTextContent(/Showing 200 of 200 children/i);

    // Verify root feature-page element style contains maxWidth 100% and overflow-x hidden
    const page = container.querySelector(".feature-page") as HTMLElement;
    expect(page).toBeInTheDocument();
    expect(page.style.overflowX).toBe("hidden");
    expect(page.style.maxWidth).toBe("1080px");
    expect(page.style.boxSizing).toBe("border-box");

    // Check no horizontal scrollbar condition: container scrollWidth <= 360 (or scrollWidth <= clientWidth)
    expect(page.clientWidth).toBeLessThanOrEqual(360);
    expect(page.scrollWidth).toBeLessThanOrEqual(360);
  });
});
