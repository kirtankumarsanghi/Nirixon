import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { HelpNearbyResponse } from "../api/types";
import { FindHelpPage } from "./FindHelpPage";

// Mock helpApi
const mockGetNearby = vi.fn();
vi.mock("../api/client", () => ({
  helpApi: {
    getNearby: (...args: unknown[]) => mockGetNearby(...args),
  },
  api: {},
  setAuthToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

// Mock AuthContext
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    role: "parent",
    token: "mock-token",
    isAuthenticated: true,
  }),
}));

// Mock checkInHistory
vi.mock("../lib/checkInHistory", () => ({
  getLatestCheckIn: () => null,
  loadCheckInHistory: () => [],
}));

function mockSuccessResponse(overrides: Partial<HelpNearbyResponse> = {}): HelpNearbyResponse {
  return {
    centres: [
      {
        id: "centre-1",
        name: "District Early Intervention Centre (DEIC), Safdarjung Hospital",
        address: "Ring Road, Safdarjung Enclave",
        district: "South Delhi",
        state: "Delhi",
        pin: "110029",
        latitude: 28.5684,
        longitude: 77.2062,
        phone: "+91-11-26165060",
        type: "DEIC",
        source_url: "https://delhihealth.gov.in/deic-safdarjung",
        last_verified_date: "2026-03-15",
        distance_km: 0.0,
        is_sample: true,
      },
    ],
    total: 1,
    pin: "110029",
    child_age_years: 4,
    helplines: [
      {
        name: "RBSK / Childline",
        number: "1098",
        available: "24/7 (Toll-Free)",
        description: "National emergency helpline for child health and early intervention.",
      },
      {
        name: "Tele-MANAS",
        number: "14416",
        available: "24/7 (Toll-Free 1800-891-4416)",
        description: "National mental health and developmental delay tele-consultation.",
      },
      {
        name: "National Health Mission (NHM)",
        number: "104",
        available: "24/7",
        description: "State health helpline for locating nearest public health centres.",
      },
    ],
    district_guidance: {
      title: "District Health Office (CMO) Guidance",
      steps: [
        "Visit the Chief Medical Officer (CMO) at your nearest District Hospital.",
        "Request the DEIC or RBSK nodal officer.",
      ],
    },
    ...overrides,
  };
}

describe("FindHelpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Acceptance Check 1: PIN with results returns centres with distance, verified date, and source", async () => {
    mockGetNearby.mockResolvedValueOnce(mockSuccessResponse());

    render(
      <MemoryRouter initialEntries={["/help?pin=110029&age=4"]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetNearby).toHaveBeenCalledWith(
        expect.objectContaining({ pin: "110029", age: 4 }),
      );
    });

    // Verify centre details are rendered
    expect(
      screen.getByText(/District Early Intervention Centre \(DEIC\), Safdarjung Hospital/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Same PIN \(110029\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Last verified: 2026-03-15/i)).toBeInTheDocument();

    // Verify source link
    const sourceLink = screen.getByRole("link", { name: /Verified Source/i });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://delhihealth.gov.in/deic-safdarjung",
    );
  });

  it("Acceptance Check 2: Sample data is always labelled 'Sample data' in the UI", async () => {
    mockGetNearby.mockResolvedValueOnce(
      mockSuccessResponse({
        centres: [
          {
            id: "centre-sample-1",
            name: "Sample Test Centre",
            address: "123 Sample Rd",
            district: "South Delhi",
            state: "Delhi",
            pin: "110029",
            latitude: 28.5684,
            longitude: 77.2062,
            phone: "+91-11-26165060",
            type: "DEIC",
            source_url: "https://example.gov.in",
            last_verified_date: "2026-03-15",
            distance_km: 0.0,
            is_sample: true,
          },
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/help?pin=110029&age=4"]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetNearby).toHaveBeenCalled();
    });

    // Check that "Sample data" badge appears
    const sampleBadges = screen.getAllByText(/Sample data/i);
    expect(sampleBadges.length).toBeGreaterThan(0);
  });

  it("Acceptance Check 3: PIN with none returns empty list with helplines and district guidance", async () => {
    mockGetNearby.mockResolvedValueOnce(
      mockSuccessResponse({
        centres: [],
        total: 0,
        pin: "999999",
      }),
    );

    render(
      <MemoryRouter initialEntries={["/help?pin=999999"]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetNearby).toHaveBeenCalledWith(
        expect.objectContaining({ pin: "999999" }),
      );
    });

    // Verify empty state callout
    expect(
      screen.getByText(/No specialized centres found in this immediate area/i),
    ).toBeInTheDocument();

    // Verify helplines are rendered
    expect(screen.getByText("RBSK / Childline")).toBeInTheDocument();
    expect(screen.getByText(/1098/)).toBeInTheDocument();
    expect(screen.getByText(/14416/)).toBeInTheDocument();
    expect(screen.getByText(/104/)).toBeInTheDocument();

    // Verify District Health Office guidance
    expect(
      screen.getByText(/District Health Office \(CMO\) Guidance/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Visit the Chief Medical Officer \(CMO\)/i),
    ).toBeInTheDocument();
  });

  it("Acceptance Check 4: Invalid PIN returns clear error without crashing the UI", async () => {
    render(
      <MemoryRouter initialEntries={["/help?pin="]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    const pinInput = screen.getByLabelText(/Postal PIN Code/i);
    const submitBtn = screen.getByRole("button", { name: /Find Nearest Help/i });

    // Enter letters / invalid 3-digit PIN
    await userEvent.clear(pinInput);
    await userEvent.type(pinInput, "123");
    await userEvent.click(submitBtn);

    // Verify clear validation error is rendered without crashing
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(/must be a 6-digit number/i),
    ).toBeInTheDocument();

    // API should not have been called with invalid PIN
    expect(mockGetNearby).not.toHaveBeenCalled();
  });

  it("Acceptance Check 5: Age 4 returns DEICs and Age 9 returns none in DEIC-only PIN", async () => {
    // 1. Age 4 query
    mockGetNearby.mockResolvedValueOnce(
      mockSuccessResponse({
        centres: [
          {
            id: "deic-1",
            name: "Bengaluru IGICH DEIC",
            address: "Dharmaram Post",
            district: "Bengaluru",
            state: "Karnataka",
            pin: "560029",
            latitude: 12.9345,
            longitude: 77.5998,
            phone: "+91-80-26566624",
            type: "DEIC",
            source_url: "https://igich.karnataka.gov.in/deic",
            last_verified_date: "2026-03-12",
            distance_km: 0.0,
            is_sample: true,
          },
        ],
        total: 1,
        pin: "560029",
        child_age_years: 4,
      }),
    );

    const { unmount } = render(
      <MemoryRouter initialEntries={["/help?pin=560029&age=4"]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetNearby).toHaveBeenCalledWith(
        expect.objectContaining({ pin: "560029", age: 4 }),
      );
    });

    expect(screen.getByText("Bengaluru IGICH DEIC")).toBeInTheDocument();
    expect(screen.getByText("DEIC")).toBeInTheDocument();

    unmount();

    // 2. Age 9 query on same DEIC-only PIN returns none
    mockGetNearby.mockResolvedValueOnce(
      mockSuccessResponse({
        centres: [],
        total: 0,
        pin: "560029",
        child_age_years: 9,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/help?pin=560029&age=9"]}>
        <FindHelpPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockGetNearby).toHaveBeenCalledWith(
        expect.objectContaining({ pin: "560029", age: 9 }),
      );
    });

    // Age 9 returns none: DEICs not shown, empty state with helplines appears
    expect(screen.queryByText("Bengaluru IGICH DEIC")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No specialized centres found in this immediate area/i),
    ).toBeInTheDocument();
  });
});
