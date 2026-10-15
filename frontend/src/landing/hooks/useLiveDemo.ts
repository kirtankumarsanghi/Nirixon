/**
 * useLiveDemo
 *
 * Drives the Demo section's phone UI against the real backend.
 *
 * State machine:
 *   idle → loading → question → (more questions) → complete
 *                              ↓
 *                           (regression toggle set) → safety_override complete
 *
 * The hook is intentionally self-contained: it starts a fresh session the
 * first time `beginSession()` is called, then submits one real answer per
 * interactive choice and surfaces the live result fields.
 */

import { useCallback, useRef, useState } from "react";
import {
  demoAnswerValue,
  startDemoScreening,
  submitDemoAnswer,
  type QuestionPayload,
  type ResultPayload,
} from "../api/client";

export type DemoPhase = "idle" | "loading" | "question" | "complete" | "error";

export interface LiveDemoState {
  phase: DemoPhase;
  /** Currently active question from the real backend. */
  question: QuestionPayload | null;
  /** Live result returned by the backend after the session completes. */
  result: ResultPayload | null;
  /** Concise error message, only set when phase === "error". */
  errorMsg: string | null;
  /** Whether the backend returned a safety override (regression → Refer). */
  safetyOverrideTriggered: boolean;
  /** Live question counter string, e.g. "Question 3 of ~14". */
  questionLabel: string;
  /** Progress 0–100. */
  progressPct: number;
  /** Resolved triage tier label from the result. */
  triageTier: string | null;
  /** SHAP / contribution reasons (capped at 5). */
  shapReasons: Array<{ feature: string; value: number }>;
  /** Domain-level classification map. */
  domainLevels: Record<string, string>;
  /**
   * Submit one answer choice.
   * Will lazily start a session the first time it is called.
   */
  submit: (choice: "easy" | "hesitated" | "notyet", isRegression: boolean) => Promise<void>;
  reset: () => void;
}

export function useLiveDemo(): LiveDemoState {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const questionRef = useRef<QuestionPayload | null>(null);
  questionRef.current = question;

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setPhase("idle");
    setQuestion(null);
    setResult(null);
    setErrorMsg(null);
  }, []);

  const submit = useCallback(
    async (choice: "easy" | "hesitated" | "notyet", isRegression: boolean) => {
      setErrorMsg(null);

      try {
        // Start session lazily on first interaction
        if (!sessionIdRef.current) {
          setPhase("loading");
          const startAction = await startDemoScreening(20);
          sessionIdRef.current = startAction.session_id;

          if (startAction.type === "complete" && startAction.result) {
            setResult(startAction.result);
            setPhase("complete");
            return;
          }
          if (startAction.question) {
            setQuestion(startAction.question);
            questionRef.current = startAction.question;
            setPhase("question");
          }
        }

        const sid = sessionIdRef.current;
        const q = questionRef.current;
        if (!sid || !q) return;

        setPhase("loading");

        const answerValue = demoAnswerValue(choice, isRegression, q.response_type);
        const action = await submitDemoAnswer(sid, q.item_id, answerValue);

        if (action.type === "complete" && action.result) {
          setResult(action.result);
          setQuestion(null);
          setPhase("complete");
          // Reset session so next interaction starts fresh
          sessionIdRef.current = null;
        } else if (action.question) {
          setQuestion(action.question);
          questionRef.current = action.question;
          setPhase("question");
        } else {
          // Unexpected state — fall back to idle
          setPhase("idle");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "API error";
        // If it's a network error, surface a friendly message
        const friendly = msg.includes("Failed to fetch")
          ? "Backend not reachable — start the FastAPI server on port 8000."
          : msg;
        setErrorMsg(friendly);
        setPhase("error");
        sessionIdRef.current = null;
      }
    },
    [],
  );

  // Derived display values
  const safetyOverrideTriggered = result?.safety_override_triggered ?? false;

  const questionLabel =
    phase === "question" && question
      ? `Question ${question.question_number} of ~${question.question_cap}`
      : "Question 1 of ~15";

  const progressPct =
    phase === "question" && question
      ? Math.round(((question.question_number - 1) / question.question_cap) * 100)
      : 0;

  const triageTier =
    result?.triage_tier ??
    (result?.final_classification === "Refer"
      ? "Tier 3: Direct Referral"
      : result?.final_classification === "Monitor"
        ? "Tier 2: Reflex-Branch"
        : result?.final_classification === "Typical"
          ? "Tier 1: Routine Pass"
          : null);

  const shapReasons = (result?.shap_top_features ?? [])
    .slice(0, 5)
    .map((f) => ({ feature: f.feature, value: f.shap_value }));

  const domainLevels = result?.domain_classifications ?? {};

  return {
    phase,
    question,
    result,
    errorMsg,
    safetyOverrideTriggered,
    questionLabel,
    progressPct,
    triageTier,
    shapReasons,
    domainLevels,
    submit,
    reset,
  };
}
