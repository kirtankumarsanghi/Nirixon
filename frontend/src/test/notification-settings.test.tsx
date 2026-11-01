import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPreference } from "../api/types";
import { NotificationSettings } from "../components/NotificationSettings";
import { AppProvider } from "../store";

const mocks = vi.hoisted(() => ({
  getVapidKey: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    notificationApi: {
      ...actual.notificationApi,
      getVapidKey: mocks.getVapidKey,
      getPreferences: mocks.getPreferences,
      updatePreferences: mocks.updatePreferences,
      sendTest: mocks.sendTest,
    },
  };
});

const preference: NotificationPreference = {
  id: "pref-1",
  subject_type: "worker",
  subject_id: "w1",
  channels: { push: false, whatsapp: false, sms: false, ivr: false },
  phone: null,
  whatsapp_number: null,
  locale: "en",
  quiet_start: null,
  quiet_end: null,
  reminder_lead_days: 3,
  consent_recorded_at: null,
  enabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/";
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
  mocks.getVapidKey.mockResolvedValue({ public_key: "", enabled: false });
  mocks.getPreferences.mockResolvedValue(preference);
  mocks.updatePreferences.mockImplementation(async (body) => ({
    ...preference,
    ...body,
    consent_recorded_at: body.consent_given ? "2026-10-31T00:00:00Z" : null,
    enabled: body.enabled && body.consent_given,
  }));
  mocks.sendTest.mockResolvedValue({ scheduled: 1, delivered: 1, failed: 0, suppressed: 0 });
});

function renderSettings() {
  const onClose = vi.fn();
  render(
    <AppProvider>
      <NotificationSettings open onClose={onClose} />
    </AppProvider>,
  );
  return onClose;
}

describe("Notification settings", () => {
  it("loads preferences and saves channel choices with consent", async () => {
    const onClose = renderSettings();
    expect(await screen.findByText("Reminders")).toBeInTheDocument();
    // Preferences load asynchronously; the channel toggles only exist after
    // that request resolves. Waiting on the heading alone is racy on CI.
    const whatsapp = await screen.findByRole(
      "button",
      { name: /WhatsApp/i },
      { timeout: 3000 },
    );
    fireEvent.click(whatsapp);
    fireEvent.change(screen.getAllByPlaceholderText("+91 98000 00000")[0], {
      target: { value: "+919800000001" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Save preferences/i }));

    await waitFor(() => expect(mocks.updatePreferences).toHaveBeenCalled());
    const body = mocks.updatePreferences.mock.calls[0][0];
    expect(body.channels.whatsapp).toBe(true);
    expect(body.phone).toBe("+919800000001");
    expect(body.consent_given).toBe(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("queues a test notification", async () => {
    renderSettings();
    expect(await screen.findByText("Reminders")).toBeInTheDocument();
    await screen.findByRole("button", { name: /WhatsApp/i }, { timeout: 3000 });
    const sendTest = screen.getByRole("button", { name: /Send test/i });
    await waitFor(() => expect(sendTest).toBeEnabled(), { timeout: 3000 });
    fireEvent.click(sendTest);
    await waitFor(() => expect(mocks.sendTest).toHaveBeenCalled());
  });

  it("does not request push when the server has no VAPID key", async () => {
    renderSettings();
    expect(await screen.findByText(/no VAPID key configured/i)).toBeInTheDocument();
  });
});
