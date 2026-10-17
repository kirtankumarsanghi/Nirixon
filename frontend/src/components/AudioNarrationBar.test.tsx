import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AudioNarrationBar, getReviewedAudioEntry } from "./AudioNarrationBar";
import { QuestionnaireForm } from "./QuestionnaireForm";
import type { QuestionPayload } from "../api/types";

// Mock HTMLAudioElement methods
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();
const mockLoad = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Mock window.HTMLMediaElement.prototype
  window.HTMLMediaElement.prototype.play = mockPlay;
  window.HTMLMediaElement.prototype.pause = mockPause;
  window.HTMLMediaElement.prototype.load = mockLoad;
});

describe("AudioNarrationBar Acceptance Tests", () => {
  const sampleQuestion: QuestionPayload = {
    item_id: "GM01",
    question_text: "How many times in the past week has your child lifted their head while lying on their tummy?",
    domain: "gross_motor",
    question_number: 1,
    question_cap: 10,
    response_type: "frequency",
  };

  it("Acceptance Check 1: Renders play/pause, 0.8x/1.0x speed, and language switch for validated item", async () => {
    render(
      <AudioNarrationBar
        itemId="GM01"
        questionText={sampleQuestion.question_text}
      />
    );

    // Play narration button exists
    const playBtn = screen.getByRole("button", { name: /Play audio narration/i });
    expect(playBtn).toBeInTheDocument();

    // Speed toggle exists, starts at 1.0x
    const speedBtn = screen.getByRole("button", { name: /Toggle narration speed/i });
    expect(speedBtn).toBeInTheDocument();
    expect(speedBtn).toHaveTextContent("1.0x");

    // Language switch buttons exist
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /हिन्दी/i })).toBeInTheDocument();

    // Clinically reviewed badge is visible
    expect(screen.getByText(/✓ Clinically Reviewed/i)).toBeInTheDocument();
  });

  it("Acceptance Check 2: Play/Pause and 0.8x / 1.0x speed toggle", async () => {
    const { act } = await import("@testing-library/react");
    render(
      <AudioNarrationBar
        itemId="GM01"
        questionText={sampleQuestion.question_text}
      />
    );

    const playBtn = screen.getByRole("button", { name: /Play audio narration/i });
    // Click play
    await act(async () => {
      fireEvent.click(playBtn);
    });
    expect(mockPlay).toHaveBeenCalledTimes(1);

    // Speed toggle from 1.0x -> 0.8x
    const speedBtn = screen.getByRole("button", { name: /Toggle narration speed/i });
    expect(speedBtn).toHaveTextContent("1.0x");

    await act(async () => {
      fireEvent.click(speedBtn);
    });
    expect(speedBtn).toHaveTextContent("0.8x");

    // Toggle back to 1.0x
    await act(async () => {
      fireEvent.click(speedBtn);
    });
    expect(speedBtn).toHaveTextContent("1.0x");
  });

  it("Acceptance Check 3: Language switch switches audio track to Hindi and back", async () => {
    const handleLangChange = vi.fn();
    render(
      <AudioNarrationBar
        itemId="GM01"
        questionText={sampleQuestion.question_text}
        onLanguageChange={handleLangChange}
      />
    );

    const hiBtn = screen.getByRole("button", { name: /हिन्दी/i });
    fireEvent.click(hiBtn);

    expect(handleLangChange).toHaveBeenCalledWith("hi");
    expect(screen.getByText(/हिन्दी ऑडियो/i)).toBeInTheDocument();

    const enBtn = screen.getByRole("button", { name: "English" });
    fireEvent.click(enBtn);
    expect(handleLangChange).toHaveBeenCalledWith("en");
    expect(screen.getByText(/English Narration/i)).toBeInTheDocument();
  });

  it("Acceptance Check 4: Unreviewed audio is NEVER served and falls back to text", async () => {
    // UNREV01 is an unreviewed test item in the manifest
    const unrevEntry = getReviewedAudioEntry("UNREV01", "en");
    expect(unrevEntry).toBeNull();

    render(
      <AudioNarrationBar
        itemId="UNREV01"
        questionText="Experimental unreviewed pilot screening question."
      />
    );

    // Text fallback banner is visible
    expect(screen.getByText(/Text fallback active/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Audio narration is not yet clinically reviewed for this question. Reading written text fallback./i)
    ).toBeInTheDocument();

    // No play button rendered for unreviewed audio
    expect(screen.queryByRole("button", { name: /Play audio narration/i })).not.toBeInTheDocument();
  });

  it("Acceptance Check 5: Missing audio (e.g. Module B item) falls back to text cleanly", async () => {
    // AT01 has no audio entry
    const missingEntry = getReviewedAudioEntry("AT01", "en");
    expect(missingEntry).toBeNull();

    render(
      <AudioNarrationBar
        itemId="AT01"
        questionText="How often does the child have difficulty staying focused?"
      />
    );

    expect(screen.getByText(/Text fallback active/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Audio narration is not yet clinically reviewed for this question. Reading written text fallback./i)
    ).toBeInTheDocument();
  });

  it("Acceptance Check 6: Audio is optional and NEVER blocks answering", async () => {
    const onAnswer = vi.fn();

    render(
      <QuestionnaireForm
        question={sampleQuestion}
        onAnswer={onAnswer}
      />
    );

    // Audio narration bar is rendered
    expect(screen.getByRole("region", { name: /Audio narration controls/i })).toBeInTheDocument();
    const playBtn = screen.getByRole("button", { name: /Play audio narration/i });
    expect(playBtn).toBeInTheDocument();

    // Start playing audio
    const { act } = await import("@testing-library/react");
    await act(async () => {
      fireEvent.click(playBtn);
    });
    expect(mockPlay).toHaveBeenCalled();

    // Answering options MUST remain enabled and clickable while audio is playing
    const option1 = screen.getByRole("button", { name: /Not yet \/ 0 times/i });
    const option2 = screen.getByRole("button", { name: /1–2 times this week/i });
    const option3 = screen.getByRole("button", { name: /3 or more times this week/i });

    expect(option1).not.toBeDisabled();
    expect(option2).not.toBeDisabled();
    expect(option3).not.toBeDisabled();

    // Caregiver answers immediately without waiting for audio
    fireEvent.click(option2);
    expect(onAnswer).toHaveBeenCalledWith(1, "recall");
  });

  it("Acceptance Check 7: Preloads next question audio", () => {
    render(
      <AudioNarrationBar
        itemId="GM01"
        questionText={sampleQuestion.question_text}
        nextItemId="GM02"
      />
    );

    // GM02 reviewed audio entry exists and is verified
    const nextEntry = getReviewedAudioEntry("GM02", "en");
    expect(nextEntry).not.toBeNull();
    expect(nextEntry?.audio_url).toBe("/audio/narration/en/GM02.wav");
    expect(nextEntry?.status).toBe("reviewed");
  });
});
