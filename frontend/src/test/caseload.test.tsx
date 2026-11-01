import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CHWAnalytics, ChildRecord } from "../api/types";
import { AppProvider, useApp } from "../store";
import { Caseload } from "../views/Caseload";

const child = (over: Partial<ChildRecord>): ChildRecord => ({
  id: "NRX-001",
  pseudonymous_id: "p1",
  age_bracket: "24-36m",
  village_ward: "Ward 12 - Sector B",
  consent_given: true,
  consent_recorded_at: "2026-01-01T00:00:00Z",
  opt_in: true,
  current_tier: "",
  last_screened_at: "2026-10-01T00:00:00Z",
  last_contacted_at: null,
  follow_up_due_at: null,
  contact_count: 0,
  domains_flagged: [],
  domain_scores: {},
  safety_rule_triggered: null,
  is_overdue: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const children: ChildRecord[] = [
  child({
    id: "NRX-001",
    current_tier: "Refer",
    is_overdue: true,
    contact_count: 3,
    last_contacted_at: "2026-10-20T00:00:00Z",
    follow_up_due_at: "2026-11-02T09:00:00Z",
    domain_scores: { gross_motor: 0.2, communication: 0.6 },
  }),
  child({ id: "NRX-002", current_tier: "Typical" }),
  child({ id: "NRX-003", current_tier: "" }),
  child({ id: "NRX-004", current_tier: "Monitor", follow_up_due_at: "2026-11-05T09:00:00Z" }),
];

const analytics: CHWAnalytics = {
  funnel: {
    screened: 3,
    created: 1,
    sent: 1,
    seen: 0,
    outcome_recorded: 0,
    closed: 0,
    overdue: 1,
    total_referrals: 1,
  },
  time_to_intervention: {
    median_screened_to_referral_days: 2,
    median_referral_to_seen_days: null,
  },
  coverage_by_ward: [
    { village_ward: "Ward 12", children: 4, screened: 3, coverage_pct: 75, referrals: 1 },
  ],
};

const mocks = vi.hoisted(() => ({
  getChildren: vi.fn(),
  getAnalytics: vi.fn(),
  markContacted: vi.fn(),
  oneTouchReferral: vi.fn(),
  recordChildOutcome: vi.fn(),
}));

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: { ...actual.api, getSessions: vi.fn(async () => []) },
    referralApi: {
      ...actual.referralApi,
      getChildren: mocks.getChildren,
      getAnalytics: mocks.getAnalytics,
      markContacted: mocks.markContacted,
      oneTouchReferral: mocks.oneTouchReferral,
      recordChildOutcome: mocks.recordChildOutcome,
    },
  };
});

function Guard({ children: view }: { children: ReactNode }) {
  const { loading, error, children: kids } = useApp();
  if (loading) return <p>loading</p>;
  if (error) return <p role="alert">{error}</p>;
  if (kids.length === 0) return <p>empty</p>;
  return <>{view}</>;
}

async function renderCaseload(hash: string) {
  window.location.hash = hash;
  const out = render(
    <AppProvider>
      <Guard>
        <Caseload />
      </Guard>
    </AppProvider>,
  );
  await waitFor(() => {
    const text = out.container.textContent ?? "";
    expect(text).not.toBe("loading");
    expect(text).not.toBe("empty");
  });
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  window.scrollTo = () => {};
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  mocks.getChildren.mockImplementation(async ({ offset }: { offset?: number } = {}) =>
    (offset ?? 0) === 0 ? children : [],
  );
  mocks.getAnalytics.mockResolvedValue(analytics);
  mocks.markContacted.mockResolvedValue({});
  mocks.oneTouchReferral.mockResolvedValue({});
  mocks.recordChildOutcome.mockResolvedValue({});
});

describe("Frontline caseload dashboard", () => {
  it("renders the ward coverage and per-status counts from the API", async () => {
    const out = await renderCaseload("#/chw/caseload");
    expect(out.container.textContent).toMatch(/Your ward/);
    expect(out.container.textContent).toMatch(/3 of 4 children/);
    expect(out.container.textContent).not.toContain("NaN");
    expect(mocks.getChildren).toHaveBeenCalled();
    expect(screen.getAllByText(/NRX-001/).length).toBeGreaterThan(0);
  });

  it("filters the registry when a status tile is pressed", async () => {
    await renderCaseload("#/chw/caseload");
    const referTile = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("Tier 3 · Clinical"));
    expect(referTile).toBeTruthy();
    fireEvent.click(referTile as HTMLElement);
    expect(referTile).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/NRX-001/).length).toBeGreaterThan(0);
  });

  it("does not call supervisor analytics for a CHW", async () => {
    await renderCaseload("#/chw/caseload");
    expect(mocks.getAnalytics).not.toHaveBeenCalled();
  });

  it("shows programme analytics for a supervisor", async () => {
    const out = await renderCaseload("#/supervisor/caseload");
    await waitFor(() => expect(mocks.getAnalytics).toHaveBeenCalled());
    expect(out.container.textContent).toMatch(/3 screened · 1 referred/);
    expect(out.container.textContent).not.toContain("NaN");
  });

  it("renders the follow-up card with a calendar export", async () => {
    const out = await renderCaseload("#/chw/caseload");
    expect(out.container.textContent).toMatch(/Follow-ups/);
    expect(out.container.textContent).toMatch(/Export \.ics/);
  });
});
