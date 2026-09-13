import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { QuestionPayload, ResultPayload } from "../api/types";
import {
  clearSessionId,
  loadCoveredDomains,
  loadSessionId,
  saveCoveredDomains,
  saveSessionId,
} from "../lib/sessionStorage";
import { domainFromItemId, SCREENING_DOMAINS } from "../lib/domainConcern";

export type ScreenPhase =
  | "idle"
  | "loading"
  | "question"
  | "complete"
  | "error";

export interface AdaptiveQuestionnaireState {
  phase: ScreenPhase;
  sessionId: string | null;
  question: QuestionPayload | null;
  result: ResultPayload | null;
  answers: Record<string, number>;
  /** Domains that have received at least one milestone answer this session. */
  coveredDomains: Set<string>;
  totalDomains: number;
  error: string | null;
  submitting: boolean;
  start: (opts: {
    corrected_age_months: number;
    child_ref?: string;
    question_cap?: 10 | 15 | 20;
  }) => Promise<void>;
  submitAnswer: (answer: number) => Promise<void>;
  reset: () => void;
}

function isScreeningDomain(domain: string): boolean {
  return (SCREENING_DOMAINS as readonly string[]).includes(domain);
}

function coveredFromAnswerKeys(answers: Record<string, number>): Set<string> {
  const covered = new Set<string>();
  for (const itemId of Object.keys(answers)) {
    const domain = domainFromItemId(itemId);
    if (domain && isScreeningDomain(domain)) {
      covered.add(domain);
    }
  }
  return covered;
}

function applyAction(
  action: {
    session_id: string;
    type: string;
    question: QuestionPayload | null;
    result: ResultPayload | null;
  },
  prevCovered: Set<string>,
  prevAnswers: Record<string, number>,
): Pick<
  AdaptiveQuestionnaireState,
  "phase" | "sessionId" | "question" | "result" | "coveredDomains" | "answers"
> {
  saveSessionId(action.session_id);
  saveCoveredDomains(prevCovered);
  if (action.type === "complete" && action.result) {
    return {
      phase: "complete",
      sessionId: action.session_id,
      question: null,
      result: action.result,
      coveredDomains: prevCovered,
      answers: prevAnswers,
    };
  }
  return {
    phase: "question",
    sessionId: action.session_id,
    question: action.question,
    result: null,
    coveredDomains: prevCovered,
    answers: prevAnswers,
  };
}

export function useAdaptiveQuestionnaire(): AdaptiveQuestionnaireState {
  const [phase, setPhase] = useState<ScreenPhase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [coveredDomains, setCoveredDomains] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resumedRef = useRef(false);

  // Keep latest values for submit without stale closures / missing deps churn
  const sessionIdRef = useRef(sessionId);
  const questionRef = useRef(question);
  const answersRef = useRef(answers);
  const coveredRef = useRef(coveredDomains);
  sessionIdRef.current = sessionId;
  questionRef.current = question;
  answersRef.current = answers;
  coveredRef.current = coveredDomains;

  const reset = useCallback(() => {
    clearSessionId();
    setPhase("idle");
    setSessionId(null);
    setQuestion(null);
    setResult(null);
    setAnswers({});
    setCoveredDomains(new Set());
    setError(null);
    setSubmitting(false);
  }, []);

  // Resume from sessionStorage on mount
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const existing = loadSessionId();
    if (!existing) return;

    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const state = await api.getSession(existing);
        if (cancelled) return;
        setSessionId(state.session_id);

        const mergedAnswers = {
          ...state.answers,
          ...state.mandatory_answered,
        };
        setAnswers(mergedAnswers);

        // Prefer persisted coverage; fall back to inferring from answer item ids
        const persisted = loadCoveredDomains();
        const inferred = coveredFromAnswerKeys(state.answers);
        const covered =
          persisted.size > 0
            ? new Set([...persisted, ...inferred])
            : inferred;
        setCoveredDomains(covered);
        saveCoveredDomains(covered);

        if (state.completed && state.result) {
          setPhase("complete");
          setResult(state.result);
          setQuestion(null);
        } else if (state.next_question) {
          setPhase("question");
          setQuestion(state.next_question);
          setResult(null);
        } else {
          setPhase("idle");
        }
      } catch (err) {
        if (cancelled) return;
        clearSessionId();
        setPhase("idle");
        if (err instanceof ApiError && err.status === 401) {
          // Global 401 handler redirects; avoid noisy local error.
          return;
        }
        setError(
          err instanceof ApiError
            ? err.detail
            : "Could not resume your previous session.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(
    async (opts: {
      corrected_age_months: number;
      child_ref?: string;
      question_cap?: 10 | 15 | 20;
    }) => {
      setPhase("loading");
      setError(null);
      saveCoveredDomains(new Set());
      try {
        const action = await api.startScreen({
          corrected_age_months: opts.corrected_age_months,
          child_ref: opts.child_ref ?? "",
          question_cap: opts.question_cap ?? 10,
          consent_given: true,
        });
        const next = applyAction(action, new Set(), {});
        setSessionId(next.sessionId);
        setQuestion(next.question);
        setResult(next.result);
        setAnswers(next.answers);
        setCoveredDomains(next.coveredDomains);
        setPhase(next.phase);
      } catch (err) {
        setPhase("error");
        setError(
          err instanceof ApiError ? err.detail : "Could not start screening.",
        );
        throw err;
      }
    },
    [],
  );

  const submitAnswer = useCallback(async (answer: number) => {
    const sid = sessionIdRef.current;
    const q = questionRef.current;
    if (!sid || !q) return;
    setSubmitting(true);
    setError(null);
    const itemId = q.item_id;
    const domain = q.domain;
    try {
      const action = await api.submitAnswer(sid, {
        item_id: itemId,
        answer,
      });
      const nextAnswers = { ...answersRef.current, [itemId]: answer };
      const nextCovered = new Set(coveredRef.current);
      if (domain !== "background" && isScreeningDomain(domain)) {
        nextCovered.add(domain);
      }
      const next = applyAction(action, nextCovered, nextAnswers);
      setSessionId(next.sessionId);
      setQuestion(next.question);
      setResult(next.result);
      setAnswers(next.answers);
      setCoveredDomains(next.coveredDomains);
      setPhase(next.phase);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Could not submit your answer. Please try again.",
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    phase,
    sessionId,
    question,
    result,
    answers,
    coveredDomains,
    totalDomains: SCREENING_DOMAINS.length,
    error,
    submitting,
    start,
    submitAnswer,
    reset,
  };
}
