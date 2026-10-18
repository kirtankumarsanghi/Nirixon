import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { SessionSummary } from "../api/client";
import type { Child } from "../lib/model";
import { sessionsToCheckIns } from "../lib/apiAdapters";
import { ChildDrawer } from "../components/ChildDrawer";
import { AppProvider, useApp } from "../store";
import { Home } from "../views/Home";
import { Growth } from "../views/Growth";
import { Share } from "../views/Share";
import { ParentWhatIf } from "../views/ParentWhatIf";

/** Real-shaped sessions taken from the dev DB: some answered only a few domains,
 *  several have zero answers (empty scores), and modules A and B are mixed. */
const sessions: SessionSummary[] = [
  {
    id: "s-newest",
    status: "completed",
    module: "A",
    corrected_age_months: 30,
    age_bracket: "24-36",
    completed_at: "2026-10-17T17:30:42",
    started_at: "2026-10-17T17:20:00",
    child_name: "Aarav",
    final_classification: "Monitor",
    probabilities: { Typical: 0.4, Monitor: 0.45, Refer: 0.15 },
    safety_override_triggered: false,
    domain_classifications: {},
    domain_scores: {
      gross_motor: 0.5,
      fine_motor: 1.0,
      communication: 0.75,
      cognitive: 1.0,
      self_help: 0.5,
    },
    domain_details: {},
  },
  {
    // Non-empty, but scored a *different* set of areas than the newest check-in —
    // this is what used to make the hover tooltip read `.toFixed` off undefined.
    id: "s-partial",
    status: "completed",
    module: "A",
    corrected_age_months: 28,
    age_bracket: "24-36",
    completed_at: "2026-10-16T15:00:00",
    started_at: null,
    child_name: "Aarav",
    final_classification: "Monitor",
    probabilities: { Typical: 0.5, Monitor: 0.4, Refer: 0.1 },
    safety_override_triggered: false,
    domain_classifications: {},
    domain_scores: { cognitive: 0.6, self_help: 0.4 },
    domain_details: {},
  },
  {
    id: "s-empty-1",
    status: "completed",
    module: "A",
    corrected_age_months: 28,
    age_bracket: "24-36",
    completed_at: "2026-10-16T13:06:34",
    started_at: null,
    child_name: "Aarav",
    final_classification: null,
    probabilities: {},
    safety_override_triggered: false,
    domain_classifications: {},
    domain_scores: {},
    domain_details: {},
  },
  {
    id: "s-moduleB",
    status: "completed",
    module: "B",
    corrected_age_months: 96,
    age_bracket: "84-108",
    completed_at: "2026-10-15T18:49:42",
    started_at: null,
    child_name: "Aarav",
    final_classification: "Refer",
    probabilities: { Typical: 0.1, Monitor: 0.2, Refer: 0.7 },
    safety_override_triggered: true,
    domain_classifications: {},
    domain_scores: {},
    domain_details: {},
  },
  {
    id: "s-full-A",
    status: "completed",
    module: "A",
    corrected_age_months: 20,
    age_bracket: "12-24",
    completed_at: "2026-10-15T18:48:45",
    started_at: null,
    child_name: "Aarav",
    final_classification: "Typical",
    probabilities: { Typical: 0.8, Monitor: 0.15, Refer: 0.05 },
    safety_override_triggered: false,
    domain_classifications: {},
    domain_scores: {
      gross_motor: 1.0,
      fine_motor: 1.0,
      communication: 1.0,
      personal_social: 1.0,
      cognitive: 1.0,
      self_help: 1.0,
    },
    domain_details: {},
  },
];

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: { ...actual.api, getSessions: vi.fn(async () => sessions) },
    referralApi: { ...actual.referralApi, getChildren: vi.fn(async () => []) },
  };
});

beforeEach(() => {
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
});

/** Mirrors the app's own loading guard from App.tsx `Screen`. */
function Guard({ children }: { children: ReactNode }) {
  const { loading, error, checkIns } = useApp();
  if (loading) return <p>loading</p>;
  if (error) return <p role="alert">{error}</p>;
  if (checkIns.length === 0) return <p>empty</p>;
  return <>{children}</>;
}

const ERR = /is not a function|Cannot read properties of undefined|Cannot read properties of null/i;

async function renderView(view: ReactNode) {
  window.location.hash = "#/parent/home";
  const out = render(
    <AppProvider>
      <Guard>{view}</Guard>
    </AppProvider>,
  );
  // `loading` starts false, so the guard briefly shows its empty state before the
  // mocked fetch resolves — wait until real content is on screen.
  await waitFor(
    () => {
      const text = out.container.textContent ?? "";
      expect(text).not.toBe("loading");
      expect(text).not.toBe("empty");
    },
    { timeout: 3000 },
  );
  return out;
}

describe("parent workspace with real-shaped data", () => {
  const cases: [string, ReactNode][] = [
    ["Home", <Home />],
    ["Growth", <Growth />],
    ["Share", <Share />],
    ["ParentWhatIf", <ParentWhatIf />],
  ];

  for (const [name, node] of cases) {
    it(`renders ${name} without crashing`, async () => {
      const out = await renderView(node);
      expect(out.container.textContent).not.toMatch(ERR);
      expect(out.container.textContent).not.toBe("");
      expect(out.container.textContent).not.toContain("NaN");
    });
  }

  it("survives hovering a check-in whose areas differ from the latest", async () => {
    const out = await renderView(<Growth />);
    const rects = out.container.querySelectorAll('svg rect[fill="transparent"]');
    expect(rects.length).toBeGreaterThan(1);
    fireEvent.mouseEnter(rects[1]!);
    expect(out.container.textContent).not.toMatch(ERR);
    expect(out.container.textContent).not.toContain("NaN");
  });

  it("drops completed sessions that scored no areas", () => {
    const mapped = sessionsToCheckIns(sessions);
    expect(mapped.map((c) => c.id)).not.toContain("s-empty-1");
    expect(mapped.length).toBeGreaterThan(0);
  });
});

describe("child record drawer with partial area scores", () => {
  it("renders a child who only answered some areas", () => {
    const partial: Child = {
      id: "child-1",
      sector: "A",
      ageMonths: 24,
      status: "watch",
      scores: { gross: 0.5, cog: 1.0 },
      regression: false,
      visits: 2,
      lastVisitDays: 4,
      handoff: "none",
    };
    const out = render(
      <AppProvider>
        <ChildDrawer
          child={partial}
          onClose={() => {}}
          onScreen={() => {}}
          onRefer={() => {}}
          onContacted={() => {}}
          onOutcome={() => {}}
        />
      </AppProvider>,
    );
    expect(out.container.textContent).not.toMatch(ERR);
  });
});
