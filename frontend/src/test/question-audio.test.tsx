import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("QuestionAudio", () => {
  beforeEach(() => {
    vi.mocked(shareApi.getAudioItem).mockReset();
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
});
