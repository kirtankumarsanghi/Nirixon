import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilitiesResponse } from "../api/types";
import { AppProvider } from "../store";
import { FindHelp } from "../views/FindHelp";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    facilitiesApi: { get: mocks.get },
    api: { ...actual.api, getSessions: vi.fn(async () => []) },
    referralApi: { ...actual.referralApi, getChildren: vi.fn(async () => []) },
  };
});

const nearby: FacilitiesResponse = {
  pin: "302031",
  age_group: "0-5",
  result: null,
  resolved: { district: "Jaipur", state: "Rajasthan", lat: 26.89, lng: 75.9, approximate: false, match: "exact" },
  coverage: "nearby",
  facilities: [
    {
      id: 1,
      name: "SMS Hospital",
      type: "District Hospital",
      km: 3.2,
      phone: "0141-2560291",
      address: "JLN Marg, Jaipur",
      district: "Jaipur",
      state: "Rajasthan",
      lat: 26.9,
      lng: 75.81,
      source: "OpenStreetMap (ODbL)",
      verified_at: null,
      specialty: ["pediatric"],
      relevance: { tier: 0, label: "Developmental / early-intervention service" },
    },
    {
      id: 2,
      name: "Jeevan Clinic",
      type: "Clinic",
      km: 4.8,
      phone: null,
      address: "",
      district: "Jaipur",
      state: "Rajasthan",
      lat: 26.92,
      lng: 75.79,
      source: "OpenStreetMap (ODbL)",
      verified_at: "2026-01-05",
      specialty: [],
      relevance: { tier: 2, label: "General facility" },
    },
  ],
  nearest_specialist: null,
  suggestions: [],
  advice: null,
  state_deic: { state: "Rajasthan", operational: 12, source: "Rajya Sabha Session 262" },
  helplines: [
    { name: "Tele-MANAS", number: "14416", note: "National tele-mental-health helpline" },
    { name: "Childline", number: "1098", note: "Child helpline" },
  ],
};

const empty: FacilitiesResponse = {
  ...nearby,
  pin: "781001",
  coverage: "none",
  facilities: [],
  resolved: { district: "Kamrup", state: "Assam", lat: 26.18, lng: 91.75, approximate: true, match: "prefix4" },
  state_deic: { state: "Assam", operational: 0, source: "Rajya Sabha Session 262" },
  suggestions: [
    {
      id: "deic",
      title: "Visit the District Early Intervention Centre (DEIC)",
      detail: "Under the government RBSK programme, DEICs at district hospitals assess and support developmental delays.",
      maps_url: "https://www.google.com/maps/search/?api=1&query=District+Hospital+Kamrup%2C+Assam",
      phone: null,
      note: "No DEIC is reported as operational in Assam; go to the district hospital instead.",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/parent/help";
  window.scrollTo = () => {};
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});

function renderView() {
  return render(
    <AppProvider>
      <FindHelp />
    </AppProvider>,
  );
}

async function searchFor(pin: string) {
  fireEvent.change(screen.getByPlaceholderText("110029"), { target: { value: pin } });
  fireEvent.click(screen.getByRole("button", { name: /find nearest help/i }));
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
}

describe("Find Help against the facility directory", () => {
  it("looks a PIN up in the API and renders real facilities", async () => {
    mocks.get.mockResolvedValue(nearby);
    const out = renderView();
    await searchFor("302031");

    expect(mocks.get).toHaveBeenCalledWith("302031", { ageGroup: "0-5", limit: 12 });
    await waitFor(() => expect(screen.getByText("SMS Hospital")).toBeInTheDocument());
    const text = out.container.textContent ?? "";
    expect(text).toContain("about 3.2 km");
    expect(text).toContain("0141-2560291");
    expect(text).toContain("Jaipur, Rajasthan");
    // The null-phone row must not print an empty contact line.
    expect(screen.getByText("Jeevan Clinic")).toBeInTheDocument();
    expect(text).toContain("about 4.8 km");
    expect(text).not.toContain("null");
    // Verified state is labelled honestly.
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText(/Verified Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
  });

  it("falls back to DEIC counts, pathways and helplines when nothing is listed", async () => {
    mocks.get.mockResolvedValue(empty);
    const out = renderView();
    await searchFor("781001");

    await waitFor(() => expect(out.container.textContent).toContain("Visit the District Early Intervention Centre"));
    const text = out.container.textContent ?? "";
    expect(text).toContain("No DEIC is reported as operational in Assam");
    expect(text).toContain("Approximate location");
    expect(screen.getByText("14416")).toBeInTheDocument();
    expect(screen.getByText("1098")).toBeInTheDocument();
  });

  it("refuses an invalid PIN without calling the API", async () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("110029"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: /find nearest help/i }));
    await waitFor(() => expect(screen.getByPlaceholderText("110029")).toHaveValue("12345"));
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
