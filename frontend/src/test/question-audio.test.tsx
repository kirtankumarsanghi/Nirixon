import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    shareApi: { ...actual.shareApi, getAudioItem: vi.fn() },
  };
});

import { shareApi } from "../api/client";
import type { AudioItemQueryResponse } from "../api/types";
import { QuestionAudio } from "../components/QuestionAudio";

const withAudio: AudioItemQueryResponse = {
  item_id: "GM01",
  has_audio: true,
  fallback_to_text: false,
  reason: null,
  text: "Does the child sit without support?",
  audio: {
    item_id: "GM01",
    language: "en",
    language_label: "English",
    audio_url: "/audio/narration/en/GM01.wav",
    text: "Does the child sit without support?",
    duration_ms: 5600,
    reviewed_by: "Dr. Anita Sharma",
    reviewed_date: "2026-03-20",
    status: "reviewed",
  },
  available_languages: ["en", "hi"],
};

const textOnly: AudioItemQueryResponse = {
  item_id: "AT01",
  has_audio: false,
  fallback_to_text: true,
  reason: "No clinically reviewed audio available for language 'en'.",
  text: "A reading item",
  audio: null,
  available_languages: [],
};

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function stubSpeech() {
  const speak = vi.fn();
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [], speaking: false });
  return speak;
}

describe("QuestionAudio", () => {
  beforeEach(() => {
    vi.mocked(shareApi.getAudioItem).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a play control and speed toggle when reviewed audio exists", async () => {
    vi.mocked(shareApi.getAudioItem).mockResolvedValue(withAudio);
    render(<QuestionAudio itemId="GM01" lang="en" />);

    expect(await screen.findByRole("button", { name: /play question audio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /playback speed/i })).toBeInTheDocument();
  });

  it("renders nothing when only the text fallback exists", async () => {
    vi.mocked(shareApi.getAudioItem).mockResolvedValue(textOnly);
    const { container } = render(<QuestionAudio itemId="AT01" lang="en" />);

    await waitFor(() => expect(container.querySelector(".animate-spin")).toBeNull());
    expect(container.querySelector("button")).toBeNull();
  });

  it("requests the selected language", async () => {
    vi.mocked(shareApi.getAudioItem).mockResolvedValue(withAudio);
    render(<QuestionAudio itemId="GM01" lang="hi" />);

    await waitFor(() => expect(shareApi.getAudioItem).toHaveBeenCalledWith("GM01", "hi"));
  });

  it("reads the on-screen question when there is no reviewed clip", async () => {
    const speak = stubSpeech();

    vi.mocked(shareApi.getAudioItem).mockResolvedValue({
      item_id: "att_start.P.5-7.a0",
      has_audio: false,
      fallback_to_text: true,
      reason: "Item not present in audio manifest",
      text: null,
      audio: null,
      available_languages: [],
    });

    render(
      <QuestionAudio
        itemId="att_start.P.5-7.a0"
        lang="en"
        text="Your child needs repeated reminders before beginning a worksheet."
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /play question audio/i }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(speak.mock.calls[0][0].text).toBe(
      "Your child needs repeated reminders before beginning a worksheet.",
    );
  });

  it("speaks English and flags it when Hindi has no source text", async () => {
    const speak = stubSpeech();

    vi.mocked(shareApi.getAudioItem).mockResolvedValue({
      item_id: "att_start.P.5-7.a0",
      has_audio: false,
      fallback_to_text: true,
      reason: "Item not present in audio manifest",
      text: null,
      audio: null,
      available_languages: [],
    });

    render(
      <QuestionAudio itemId="att_start.P.5-7.a0" lang="hi" text="Your child needs repeated reminders." />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /play question audio in english/i }),
    );
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(speak.mock.calls[0][0].text).toBe("Your child needs repeated reminders.");
    expect(speak.mock.calls[0][0].lang).toBe("en-IN");
    expect(screen.getByText("EN")).toBeTruthy();
  });
});
