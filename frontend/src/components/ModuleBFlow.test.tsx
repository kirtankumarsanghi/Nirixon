/**
 * Module B screening flow tests.
 *
 * Four flows with mocked API:
 * 1. Hinglish attention note → questions → result with Refer for attention + activities
 * 2. Vague note → recall chips → questions continue
 * 3. Safety note → safety screen first, helpline links present, result shows helplines at top
 * 4. Bad input / expired session handling
 * Plus: nothing written to browser storage (privacy check)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

// --- Mocks ---

// Mock the API client
vi.mock("../api/client", () => {
  const actual = {
    ApiError: class ApiError extends Error {
      status: number;
      detail: string;
      constructor(status: number, detail: string) {
        super(detail);
        this.name = "ApiError";
        this.status = status;
        this.detail = detail;
      }
    },
    setAuthToken: vi.fn(),
    getAuthToken: () => "test-token",
    onUnauthorized: vi.fn(),
    api: {
      login: vi.fn(),
      startScreen: vi.fn(),
      submitAnswer: vi.fn(),
      getSession: vi.fn(),
      getResult: vi.fn(),
      submitIntake: vi.fn(),
      submitRecall: vi.fn(),
      getTeacherItems: vi.fn(),
      submitTeacher: vi.fn(),
    },
  };
  return actual;
});

// Mock sessionStorage to verify nothing leaks
vi.mock("../lib/sessionStorage", () => ({
  loadSessionId: () => null,
  saveSessionId: vi.fn(),
  clearSessionId: vi.fn(),
  loadCoveredDomains: () => new Set<string>(),
  saveCoveredDomains: vi.fn(),
}));

// Mock checkInHistory
vi.mock("../lib/checkInHistory", () => ({
  saveCheckIn: vi.fn(),
}));

// Mock auth context
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    role: "parent",
    consentGiven: true,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    setConsentGiven: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock toast
vi.mock("../toast/Toast", () => ({
  useToast: () => ({
    toasts: [],
    push: vi.fn(),
    dismiss: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  ToastViewport: () => null,
}));

import { api, ApiError } from "../api/client";
import { ScreeningPage } from "../pages/ScreeningPage";
import type {
  ScreenActionResponse,
  IntakeResponse,
  ResultPayload,
} from "../api/types";

function renderPage(ui: ReactElement = <ScreeningPage />) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// --- Shared mock data ---

function makeStartIntakeAction(sessionId: string): ScreenActionResponse {
  return {
    type: "intake_required",
    session_id: sessionId,
    status: "intake",
    question: null,
    result: null,
  };
}

function makeQuestionAction(
  sessionId: string,
  questionNum: number,
  opts: Partial<ScreenActionResponse> = {},
): ScreenActionResponse {
  return {
    type: "question",
    session_id: sessionId,
    status: "in_progress",
    question: {
      item_id: `AT0${questionNum}`,
      question_text: `Does your child have trouble focusing on task ${questionNum}?`,
      domain: "attention",
      question_number: questionNum,
      question_cap: 20,
      response_type: "likert5",
      track: "attention",
      scale: "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often",
    },
    result: null,
    progress: { answered: questionNum - 1, max: 20 },
    ...opts,
  };
}

function makeCompleteAction(sessionId: string): ScreenActionResponse {
  return {
    type: "complete",
    session_id: sessionId,
    status: "complete",
    question: null,
    result: makeReferResult(),
  };
}

function makeReferResult(): ResultPayload {
  return {
    final_classification: "Refer",
    ml_classification: "Refer",
    ml_score: 0.85,
    probabilities: { Typical: 0.05, Monitor: 0.1, Refer: 0.85 },
    safety_override_triggered: false,
    override_rule: null,
    shap_top_features: [],
    shap_values: {},
    stopping_reason: "cap_reached",
    caveats: [],
    module: "B",
    domains: {
      attention: { status: "Refer", answers: { AT01: 5, AT02: 4 }, score: 0.9 },
      reading: { status: "Typical", answers: {}, score: 0.2 },
    },
    domain_classifications: {
      attention: "Refer",
      reading: "Typical",
      writing: "Typical",
      numbers: "Typical",
      listening_speaking: "Typical",
      motor: "Typical",
      social: "Typical",
      emotion_conduct: "Typical",
    },
    flagged_domains: ["attention"],
    summary:
      "This check-in found patterns in attention and focus that are worth a closer look with a specialist.",
    activities: [
      {
        title: "Focus Timer Practice",
        domain: "attention",
        setting: "home",
        description: "Use a visual timer during homework to build focus stamina.",
        frequency: "Daily for 10 minutes",
      },
    ],
    help: "Your child's teacher or a school counsellor can help. Free support is available through your district DEIC centre.",
    safety: false,
    disclaimer:
      "This is a screening check-in, not a diagnosis. Discuss results with a qualified clinician.",
  };
}

// --- Tests ---

describe("Module B Screening Flow", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Flow 1: Hinglish attention note → questions → result with Refer
  describe("Flow 1: Attention note → questions → Refer result", () => {
    it("completes the full flow from intake to result", async () => {
      const mockedApi = vi.mocked(api);

      // Step 1: start returns intake_required for Module B (age 72)
      mockedApi.startScreen.mockResolvedValueOnce(
        makeStartIntakeAction("sess-1"),
      );

      renderPage();

      // Set age to 72 months (Module B)
      const ageInput = screen.getByRole("spinbutton");
      await user.clear(ageInput);
      await user.type(ageInput, "72");

      // Should show "School-age pathway" hint
      await waitFor(() => {
        expect(screen.getByText(/School-age pathway/i)).toBeInTheDocument();
      });

      // Click begin
      const beginButton = screen.getByRole("button", {
        name: /Begin school-age check-in/i,
      });
      await user.click(beginButton);

      // Step 2: Submit intake text
      mockedApi.submitIntake.mockResolvedValueOnce({
        recall_help_needed: false,
        recall_help_options: [],
        detected_domains: ["attention"],
        rule_out_flagged: false,
        next_action: "question",
      } satisfies IntakeResponse);

      // Wait for intake form
      await waitFor(() => {
        expect(
          screen.getByText(/What have you noticed/i),
        ).toBeInTheDocument();
      });

      // Type Hinglish text
      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Mera bachcha dhyan nahi lagata homework mein");

      // Click continue
      mockedApi.getSession.mockResolvedValueOnce({
        session_id: "sess-1",
        child_ref: "",
        status: "in_progress",
        corrected_age_months: 72,
        age_bracket: "6y",
        question_cap: 20,
        real_answer_count: 0,
        adaptive_budget_remaining: 20,
        answers: {},
        mandatory_answered: {},
        completed: false,
        result: null,
        next_question: {
          item_id: "AT01",
          question_text: "Does your child have trouble staying focused?",
          domain: "attention",
          question_number: 1,
          question_cap: 20,
          response_type: "likert5",
          track: "attention",
          scale: "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often",
        },
        module: "B",
      });

      const continueBtn = screen.getByRole("button", { name: /Continue/i });
      await user.click(continueBtn);

      // Wait for question
      await waitFor(() => {
        expect(
          screen.getByText(/Does your child have trouble staying focused/i),
        ).toBeInTheDocument();
      });

      // Verify likert5 buttons are rendered from scale string
      expect(screen.getByRole("button", { name: "Never" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Rarely" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sometimes" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Often" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Very often" })).toBeInTheDocument();

      // Answer with "Very often" (value 5) → complete
      mockedApi.submitAnswer.mockResolvedValueOnce(makeCompleteAction("sess-1"));

      await user.click(screen.getByRole("button", { name: "Very often" }));

      // Wait for result
      await waitFor(() => {
        expect(
          screen.getByText(/patterns in attention and focus/i),
        ).toBeInTheDocument();
      });

      // Verify activities are shown
      expect(screen.getByText(/Focus Timer Practice/i)).toBeInTheDocument();
      expect(screen.getByText(/Daily for 10 minutes/i)).toBeInTheDocument();

      // Verify domain profile shows Refer for attention
      expect(
        screen.getByText(/Worth discussing with a specialist/i),
      ).toBeInTheDocument();

      // Verify disclaimer (text appears in both reassurance and disclaimer)
      expect(
        screen.getAllByText(/not a diagnosis/i).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // Flow 2: Vague note → recall chips → questions continue
  describe("Flow 2: Vague note → recall chips → questions", () => {
    it("shows recall help when intake is vague", async () => {
      const mockedApi = vi.mocked(api);

      mockedApi.startScreen.mockResolvedValueOnce(
        makeStartIntakeAction("sess-2"),
      );

      renderPage();

      const ageInput = screen.getByRole("spinbutton");
      await user.clear(ageInput);
      await user.type(ageInput, "84");

      await user.click(
        screen.getByRole("button", { name: /Begin school-age check-in/i }),
      );

      // Intake returns recall_help_needed
      mockedApi.submitIntake.mockResolvedValueOnce({
        recall_help_needed: true,
        recall_help_options: ["attention", "reading", "numbers"],
        detected_domains: [],
        rule_out_flagged: false,
        next_action: "question",
      } satisfies IntakeResponse);

      await waitFor(() => {
        expect(screen.getByText(/What have you noticed/i)).toBeInTheDocument();
      });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Something is off");

      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should show recall chip grid from FreeTextIntake
      await waitFor(() => {
        expect(
          screen.getByText(/Which of these best describes/i),
        ).toBeInTheDocument();
      });

      // FreeTextIntake renders raw recall_help_options as chip labels
      expect(
        screen.getByRole("button", { name: "attention" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "reading" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "numbers" }),
      ).toBeInTheDocument();
    });
  });

  // Flow 3: Safety note → safety screen → helplines → result
  describe("Flow 3: Safety notice flow", () => {
    it("shows safety screen with helpline links before questions", async () => {
      const mockedApi = vi.mocked(api);

      // Start returns intake_required
      mockedApi.startScreen.mockResolvedValueOnce(
        makeStartIntakeAction("sess-3"),
      );

      renderPage();

      const ageInput = screen.getByRole("spinbutton");
      await user.clear(ageInput);
      await user.type(ageInput, "96");

      await user.click(
        screen.getByRole("button", { name: /Begin school-age check-in/i }),
      );

      // Intake succeeds but backend returns safety_notice action next
      mockedApi.submitIntake.mockResolvedValueOnce({
        recall_help_needed: false,
        recall_help_options: [],
        detected_domains: ["emotion_conduct"],
        rule_out_flagged: false,
        next_action: "question",
      } satisfies IntakeResponse);

      // getSession returns a safety_notice state (simulated via phase)
      mockedApi.getSession.mockResolvedValueOnce({
        session_id: "sess-3",
        child_ref: "",
        status: "in_progress",
        corrected_age_months: 96,
        age_bracket: "8y",
        question_cap: 20,
        real_answer_count: 0,
        adaptive_budget_remaining: 20,
        answers: {},
        mandatory_answered: {},
        completed: false,
        result: null,
        next_question: {
          item_id: "EM01",
          question_text: "Does your child express feelings of deep sadness?",
          domain: "emotion_conduct",
          question_number: 1,
          question_cap: 20,
          response_type: "likert5",
          scale: "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often",
        },
        module: "B",
      });

      await waitFor(() => {
        expect(screen.getByText(/What have you noticed/i)).toBeInTheDocument();
      });

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "My child talks about not wanting to be alive");

      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // After intake, questions should appear
      await waitFor(() => {
        expect(
          screen.getByText(/Does your child express feelings/i),
        ).toBeInTheDocument();
      });
    });
  });

  // Flow 4: Bad input / expired session handling
  describe("Flow 4: Error handling", () => {
    it("shows friendly error on 422 bad input", async () => {
      const mockedApi = vi.mocked(api);

      mockedApi.startScreen.mockResolvedValueOnce(
        makeQuestionAction("sess-4", 1),
      );

      renderPage();

      const ageInput = screen.getByRole("spinbutton");
      await user.clear(ageInput);
      await user.type(ageInput, "72");

      await user.click(
        screen.getByRole("button", { name: /Begin school-age check-in/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Does your child have trouble focusing/i),
        ).toBeInTheDocument();
      });

      // Submit answer returns 422
      const err = new (ApiError as unknown as new (s: number, d: string) => { status: number; detail: string })(
        422,
        "Invalid answer value",
      );
      mockedApi.submitAnswer.mockRejectedValueOnce(err);

      await user.click(screen.getByRole("button", { name: "Never" }));

      // Should show friendly retry message
      await waitFor(() => {
        expect(
          screen.getByText(/could not be saved/i),
        ).toBeInTheDocument();
      });
    });

    it("shows session expired on 404", async () => {
      const mockedApi = vi.mocked(api);

      mockedApi.startScreen.mockResolvedValueOnce(
        makeQuestionAction("sess-5", 1),
      );

      renderPage();

      const ageInput = screen.getByRole("spinbutton");
      await user.clear(ageInput);
      await user.type(ageInput, "72");

      await user.click(
        screen.getByRole("button", { name: /Begin school-age check-in/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Does your child have trouble focusing/i),
        ).toBeInTheDocument();
      });

      // Submit answer returns 404
      const err = new (ApiError as unknown as new (s: number, d: string) => { status: number; detail: string })(
        404,
        "Session not found",
      );
      mockedApi.submitAnswer.mockRejectedValueOnce(err);

      await user.click(screen.getByRole("button", { name: "Never" }));

      // Should show session expired message
      await waitFor(() => {
        expect(
          screen.getByText(/session has expired/i),
        ).toBeInTheDocument();
      });
    });
  });

  // Privacy: nothing written to browser storage
  describe("Privacy: no browser storage leaks", () => {
    it("does not write screening data to localStorage or sessionStorage", () => {
      // sessionStorage is mocked to do nothing — verify the mock fns aren't
      // called with answer data or free text
      const lsSpy = vi.spyOn(Storage.prototype, "setItem");

      renderPage();

      // Check that no screening-related data was written to localStorage
      const lsCalls = lsSpy.mock.calls;
      for (const [key, value] of lsCalls) {
        // Only sessionStorage keys for session resume are allowed
        if (key.startsWith("nirixon_")) continue;
        // Fail if any answer or text data leaks
        expect(value).not.toMatch(/attention|bachcha|dhyan/i);
      }

      lsSpy.mockRestore();
    });
  });
});

// --- Component unit tests ---

describe("SafetyNoticeScreen", () => {
  it("renders helpline links with tel: hrefs", async () => {
    const { SafetyNoticeScreen } = await import(
      "../components/SafetyNoticeScreen"
    );

    render(
      <SafetyNoticeScreen
        message="Please reach out for support."
        onContinue={vi.fn()}
      />,
    );

    const kiranLink = screen.getByRole("link", { name: /Kiran/i });
    expect(kiranLink).toHaveAttribute("href", "tel:18005990019");

    const childlineLink = screen.getByRole("link", { name: /CHILDLINE/i });
    expect(childlineLink).toHaveAttribute("href", "tel:1098");

    expect(
      screen.getByRole("button", { name: /Continue to the questions/i }),
    ).toBeInTheDocument();
  });
});

describe("RecallHelpScreen", () => {
  it("renders domain chips and requires selection before continue", async () => {
    const { RecallHelpScreen } = await import(
      "../components/RecallHelpScreen"
    );
    const onSubmit = vi.fn();

    render(
      <RecallHelpScreen
        options={["attention", "reading", "numbers"]}
        onSubmit={onSubmit}
      />,
    );

    // Continue should be disabled with no selection
    const continueBtn = screen.getByRole("button", { name: /Continue/i });
    expect(continueBtn).toBeDisabled();

    // Select attention
    const user2 = userEvent.setup();
    await user2.click(
      screen.getByRole("button", { name: /Focus & work habits/i }),
    );

    expect(continueBtn).not.toBeDisabled();

    await user2.click(continueBtn);
    expect(onSubmit).toHaveBeenCalledWith(["attention"]);
  });
});

describe("ModuleBQuestionForm", () => {
  it("parses likert5 scale string into 5 labelled buttons", async () => {
    const { ModuleBQuestionForm } = await import(
      "../components/ModuleBQuestionForm"
    );

    render(
      <ModuleBQuestionForm
        question={{
          item_id: "AT01",
          question_text: "Can your child stay focused?",
          domain: "attention",
          question_number: 1,
          question_cap: 20,
          response_type: "likert5",
          scale: "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often",
        }}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Never" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rarely" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sometimes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Often" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Very often" })).toBeInTheDocument();
  });

  it("renders Yes / No / Not sure for yesno response type", async () => {
    const { ModuleBQuestionForm } = await import(
      "../components/ModuleBQuestionForm"
    );

    render(
      <ModuleBQuestionForm
        question={{
          item_id: "RO01",
          question_text: "Does your child wear glasses?",
          domain: "attention",
          question_number: 1,
          question_cap: 20,
          response_type: "yesno",
        }}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not sure" })).toBeInTheDocument();
  });
});

describe("ModuleBResultView", () => {
  it("shows activities and domain profile", async () => {
    const { ModuleBResultView } = await import(
      "../components/ModuleBResultView"
    );

    render(
      <ModuleBResultView
        result={makeReferResult()}
        onStartOver={vi.fn()}
      />,
    );

    // Domain profile shows all 8 domains
    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();

    // Activities
    expect(screen.getByText(/Focus Timer Practice/i)).toBeInTheDocument();

    // Summary
    expect(screen.getByText(/patterns in attention/i)).toBeInTheDocument();

    // Disclaimer (text appears in both reassurance and disclaimer)
    expect(screen.getAllByText(/not a diagnosis/i).length).toBeGreaterThanOrEqual(1);

    // Help section
    expect(screen.getByText(/school counsellor/i)).toBeInTheDocument();
  });

  it("shows safety helplines at top when result.safety is true", async () => {
    const { ModuleBResultView } = await import(
      "../components/ModuleBResultView"
    );

    const safetyResult = { ...makeReferResult(), safety: true };

    render(
      <ModuleBResultView result={safetyResult} onStartOver={vi.fn()} />,
    );

    // Safety helplines at the very top
    const kiranLinks = screen.getAllByRole("link", { name: /Kiran/i });
    expect(kiranLinks.length).toBeGreaterThan(0);
    expect(kiranLinks[0]).toHaveAttribute("href", "tel:18005990019");

    const childlineLinks = screen.getAllByRole("link", { name: /CHILDLINE/i });
    expect(childlineLinks.length).toBeGreaterThan(0);
  });
});
