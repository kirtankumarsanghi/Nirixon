import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import { CheckIn } from "../views/CheckIn";

/** Spies for the Module B endpoints. `startScreen` always answers with
 *  `intake_required`, which is what the backend does for ages >= 60 months. */
const mocks = vi.hoisted(() => ({
  startScreen: vi.fn(),
  submitIntake: vi.fn(),
  submitRecall: vi.fn(),
  nextAction: vi.fn(),
  submitAnswer: vi.fn(),
}));

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      startScreen: mocks.startScreen,
      submitIntake: mocks.submitIntake,
      submitRecall: mocks.submitRecall,
      nextAction: mocks.nextAction,
      submitAnswer: mocks.submitAnswer,
      getSessions: vi.fn(async () => []),
    },
    referralApi: { ...actual.referralApi, getChildren: vi.fn(async () => []) },
    shareApi: {
      ...actual.shareApi,
      getAudioItem: vi.fn(async () => ({
        item_id: "test",
        has_audio: false,
        fallback_to_text: true,
        reason: "test: text only",
        text: null,
        audio: null,
        available_languages: [],
      })),
    },
  };
});

const INTAKE_REQUIRED = {
  type: "intake_required",
  session_id: "s1",
  status: "in_progress",
  question: null,
  result: null,
};

const QUESTION = {
  item_id: "att_start.P.5-7.a0",
  question_text: "Does your child finish what they start?",
  domain: "attention",
  question_number: 1,
  question_cap: 20,
  response_type: "likert5",
};

const QUESTION_ACTION = {
  type: "question",
  session_id: "s1",
  status: "in_progress",
  question: QUESTION,
  result: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/parent/checkin";
  window.scrollTo = () => {};
});

async function startModuleB() {
  mocks.startScreen.mockResolvedValue(INTAKE_REQUIRED);
  render(
    <AppProvider>
      <CheckIn />
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /school age/i }));
  fireEvent.click(screen.getByRole("button", { name: /begin check-in/i }));
  await waitFor(() => expect(screen.getByRole("heading", { name: /what have you/i })).toBeInTheDocument());
}

describe("Module B intake", () => {
  it("asks for the caregiver's note instead of posting an empty intake", async () => {
    mocks.submitIntake.mockResolvedValue({
      recall_help_needed: false,
      recall_help_options: [],
      detected_domains: ["attention"],
      rule_out_flagged: false,
      next_action: "question",
      action: QUESTION_ACTION,
      question: QUESTION,
    });
    await startModuleB();

    // Empty submit must not reach the API (the backend answers 422 for it).
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(mocks.submitIntake).not.toHaveBeenCalled();

    const note = "He loses focus in class and the teacher says he avoids reading.";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: note } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mocks.submitIntake).toHaveBeenCalledTimes(1));
    expect(mocks.submitIntake).toHaveBeenCalledWith("s1", { text: note, chips: [], setting: "both" });

    // The flow continues into the adaptive questions.
    await waitFor(() => expect(screen.getByText(/finish what they start/i)).toBeInTheDocument());
  });

  it("sends picked concern areas when no note is written", async () => {
    mocks.submitIntake.mockResolvedValue({
      recall_help_needed: false,
      recall_help_options: [],
      detected_domains: ["reading"],
      rule_out_flagged: false,
      next_action: "question",
      action: QUESTION_ACTION,
      question: QUESTION,
    });
    await startModuleB();

    fireEvent.click(screen.getByRole("button", { name: /reading/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mocks.submitIntake).toHaveBeenCalledTimes(1));
    expect(mocks.submitIntake).toHaveBeenCalledWith("s1", { text: "", chips: ["reading"], setting: "both" });
  });

  it("shows recall-help areas and resumes with the selected ones", async () => {
    const options = { attention: "attention and work habits", reading: "reading and decoding" };
    mocks.submitIntake.mockResolvedValue({
      recall_help_needed: true,
      recall_help_options: ["attention", "reading"],
      detected_domains: [],
      rule_out_flagged: false,
      next_action: "recall_help",
      recall_message: "Your note was a little general.",
      recall_options: options,
      action: {
        type: "recall_help",
        session_id: "s1",
        status: "in_progress",
        question: null,
        result: null,
        recall_message: "Your note was a little general.",
        recall_options: options,
      },
    });
    mocks.submitRecall.mockResolvedValue(QUESTION_ACTION);
    await startModuleB();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "he is weak in studies" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: /which of these/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /reading and decoding/i }));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mocks.submitRecall).toHaveBeenCalledWith("s1", { domains: ["reading"] }));
    await waitFor(() => expect(screen.getByText(/finish what they start/i)).toBeInTheDocument());
  });

  it("shows helplines on a safety notice and continues past it", async () => {
    mocks.submitIntake.mockResolvedValue({
      recall_help_needed: false,
      recall_help_options: [],
      detected_domains: [],
      rule_out_flagged: false,
      next_action: "safety_notice",
      safety_message: "It sounds like you need support right now.",
      helplines: { kiran: "Kiran: 1800-599-0019 (24x7)", childline: "CHILDLINE: 1098 (24x7)" },
      action: {
        type: "safety_notice",
        session_id: "s1",
        status: "in_progress",
        question: null,
        result: null,
        safety_message: "It sounds like you need support right now.",
        helplines: { kiran: "Kiran: 1800-599-0019 (24x7)", childline: "CHILDLINE: 1098 (24x7)" },
      },
    });
    mocks.nextAction.mockResolvedValue(QUESTION_ACTION);
    await startModuleB();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "he says he wants to hurt himself" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: /please read this first/i })).toBeInTheDocument());
    expect(screen.getByText(/1800-599-0019/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue the check-in/i }));
    await waitFor(() => expect(mocks.nextAction).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(screen.getByText(/finish what they start/i)).toBeInTheDocument());
  });

  it("headlines the safety override instead of the score tier", async () => {
    // The engine keeps the domain verdicts for a safety case, so
    // final_classification still reads "Typical" — the UI must not show that.
    const safetyResult = {
      final_classification: "Typical",
      ml_classification: "Typical",
      model_name: "module_b_engine",
      ml_score: 0,
      probabilities: { Typical: 0, Monitor: 0, Refer: 0 },
      safety_override_triggered: true,
      override_rule: "safety_helpline",
      shap_top_features: [],
      shap_values: {},
      stopping_reason: "module_b_engine",
      caveats: ["Screening summary, not a diagnosis."],
      domain_classifications: { attention: "Typical", reading: "Typical", numbers: "Typical" },
      domain_details: {
        attention: { state: "Typical", score: 0.1, n: 3, because: [], irt_theta: -0.2, irt_se: 0.4 },
        reading: { state: "Typical", score: 0.1, n: 3, because: [], irt_theta: -0.3, irt_se: 0.4 },
        numbers: { state: "Typical", score: 0.1, n: 3, because: [], irt_theta: -0.1, irt_se: 0.4 },
      },
      module: "B",
      summary: "What you described needs a person to talk to. Please contact Kiran: 1800-599-0019 (24x7).",
      triage_tier: "Tier 3: Direct Referral",
    };

    mocks.submitIntake.mockResolvedValue({
      recall_help_needed: false,
      recall_help_options: [],
      detected_domains: [],
      rule_out_flagged: false,
      next_action: "safety_notice",
      safety_message: "It sounds like you need support right now.",
      helplines: { kiran: "Kiran: 1800-599-0019 (24x7)" },
      action: {
        type: "safety_notice",
        session_id: "s1",
        status: "in_progress",
        question: null,
        result: null,
        safety_message: "It sounds like you need support right now.",
        helplines: { kiran: "Kiran: 1800-599-0019 (24x7)" },
      },
    });
    mocks.nextAction.mockResolvedValue(QUESTION_ACTION);
    mocks.submitAnswer.mockResolvedValue({
      type: "complete",
      session_id: "s1",
      status: "completed",
      question: null,
      result: safetyResult,
    });

    await startModuleB();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "he says he wants to die" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /please read this first/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue the check-in/i }));

    await waitFor(() => expect(screen.getByText(/finish what they start/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /yes, does this consistently/i }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Refer" })).toBeInTheDocument());
    expect(screen.getByText(/tier 3: direct referral/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Typical" })).not.toBeInTheDocument();
  });
});
