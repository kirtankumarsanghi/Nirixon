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
import {
  domainFromItemId,
  domainsForModule,
  type ModuleKind,
} from "../lib/domainConcern";

export type ScreenPhase =
  | "idle"
  | "loading"
  | "question"
  | "complete"
  | "error"
  | "intake";

export interface AdaptiveQuestionnaireState {
  phase: ScreenPhase;
  sessionId: string | null;
  question: QuestionPayload | null;
  result: ResultPayload | null;
  answers: Record<string, number>;
  coveredDomains: Set<string>;
  totalDomains: number;
  module: ModuleKind;
  correctedAgeMonths: number | null;
  childRef: string;
  error: string | null;
  submitting: boolean;
  start: (opts: {
    corrected_age_months: number;
    child_ref?: string;
    question_cap?: 10 | 15 | 20;
    consent_given?: boolean;
    module?: "A" | "B";
  }) => Promise<{ type: string } | undefined>;
  advanceAfterIntake: (detectedDomains: string[]) => Promise<void>;
  submitAnswer: (answer: number) => Promise<void>;
  reset: () => void;
}

function isKnownDomain(domain: string, module: ModuleKind): boolean {
  return domainsForModule(module).includes(domain);
}

function coveredFromAnswerKeys(
  answers: Record<string, number>,
  module: ModuleKind,
): Set<string> {
  const covered = new Set<string>();
  for (const itemId of Object.keys(answers)) {
    const domain = domainFromItemId(itemId);
    if (domain && isKnownDomain(domain, module)) {
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
  if (action.type === "intake_required") {
    return {
      phase: "intake",
      sessionId: action.session_id,
      question: null,
      result: null,
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
  const [module, setModule] = useState<ModuleKind>("A");
  const [correctedAgeMonths, setCorrectedAgeMonths] = useState<number | null>(
    null,
  );
  const [childRef, setChildRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionIdRef = useRef(sessionId);
  const questionRef = useRef(question);
  const answersRef = useRef(answers);
  const coveredRef = useRef(coveredDomains);
  const moduleRef = useRef(module);
  sessionIdRef.current = sessionId;
  questionRef.current = question;
  answersRef.current = answers;
  coveredRef.current = coveredDomains;
  moduleRef.current = module;

  const reset = useCallback(() => {
    clearSessionId();
    setPhase("idle");
    setSessionId(null);
    setQuestion(null);
    setResult(null);
    setAnswers({});
    setCoveredDomains(new Set());
    setModule("A");
    setCorrectedAgeMonths(null);
    setChildRef("");
    setError(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    const existing = loadSessionId();
    if (!existing) return;

    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const state = await api.getSession(existing);
        if (cancelled) return;
        setSessionId(state.session_id);
        setCorrectedAgeMonths(state.corrected_age_months);
        setChildRef(state.child_ref ?? "");

        const inferredModule: ModuleKind =
          state.module ??
          (state.corrected_age_months >= 60 ? "B" : "A");
        setModule(inferredModule);

        const mergedAnswers = {
          ...state.answers,
          ...state.mandatory_answered,
        };
        setAnswers(mergedAnswers);

        const persisted = loadCoveredDomains();
        const inferred = coveredFromAnswerKeys(state.answers, inferredModule);
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
        } else if (
          inferredModule === "B" &&
          Object.keys(state.answers).length === 0
        ) {
          // Mid-intake resume: session exists but questions not started
          setPhase("intake");
        } else {
          setPhase("idle");
        }
      } catch (err) {
        if (cancelled) return;
        clearSessionId();
        setPhase("idle");
        if (err instanceof ApiError && err.status === 401) {
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
      consent_given?: boolean;
      module?: "A" | "B";
    }) => {
      clearSessionId();
      setSessionId(null);
      setQuestion(null);
      setResult(null);
      setAnswers({});
      setCoveredDomains(new Set());
      setCorrectedAgeMonths(opts.corrected_age_months);
      setChildRef(opts.child_ref ?? "");
      const inferred: ModuleKind =
        opts.module ?? (opts.corrected_age_months >= 60 ? "B" : "A");
      setModule(inferred);
      setPhase("loading");
      setError(null);
      saveCoveredDomains(new Set());
      try {
        const action = await api.startScreen({
          corrected_age_months: opts.corrected_age_months,
          child_ref: opts.child_ref ?? "",
          question_cap: opts.question_cap ?? 10,
          consent_given: opts.consent_given ?? true,
          module: opts.module,
        });
        const next = applyAction(action, new Set(), {});
        setSessionId(next.sessionId);
        setQuestion(next.question);
        setResult(next.result);
        setAnswers(next.answers);
        setCoveredDomains(next.coveredDomains);
        setPhase(next.phase);
        return action;
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
      if (isKnownDomain(domain, moduleRef.current)) {
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

  const advanceAfterIntake = useCallback(async (_detectedDomains: string[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setPhase("loading");
    setError(null);
    try {
      const state = await api.getSession(sid);
      if (state.next_question) {
        setPhase("question");
        setQuestion(state.next_question);
        setResult(null);
      } else if (state.completed && state.result) {
        setPhase("complete");
        setResult(state.result);
        setQuestion(null);
      } else {
        setError(
          "No next question was available after intake. Please try describing again or restart.",
        );
        setPhase("intake");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Could not load next question.",
      );
      setPhase("error");
    }
  }, []);

  return {
    phase,
    sessionId,
    question,
    result,
    answers,
    coveredDomains,
    totalDomains: domainsForModule(module).length,
    module,
    correctedAgeMonths,
    childRef,
    error,
    submitting,
    start,
    advanceAfterIntake,
    submitAnswer,
    reset,
  };
}
