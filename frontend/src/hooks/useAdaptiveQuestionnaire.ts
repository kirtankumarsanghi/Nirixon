import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type {
  ProgressPayload,
  QuestionPayload,
  ResultPayload,
  ScreenActionResponse,
} from "../api/types";
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
  | "intake"
  | "recall_help"
  | "safety_notice";

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
  /** Module B: progress counter. */
  progress: ProgressPayload | null;
  /** Module B: domain keys for recall-help chip selection (extracted from recall_options dict). */
  recallOptions: string[];
  /** Module B: safety helpline text to display prominently. */
  safetyMessage: string | null;
  /** Module B: whether the safety link should remain visible. */
  showSafetyLink: boolean;
  start: (opts: {
    corrected_age_months: number;
    child_ref?: string;
    question_cap?: 10 | 15 | 20;
    consent_given?: boolean;
    module?: "A" | "B";
    child_name?: string;
    parent_name?: string;
    parent_phone?: string;
    relationship_to_child?: string;
    location_pincode?: string;
    location_city?: string;
    location_state?: string;
    location_address?: string;
  }) => Promise<{ type: string } | undefined>;
  advanceAfterIntake: (detectedDomains: string[], intakeAction?: ScreenActionResponse | null) => Promise<void>;
  submitAnswer: (answer: number, source?: "recall" | "observed") => Promise<void>;
  submitRecall: (selectedDomains: string[]) => Promise<void>;
  dismissSafety: () => void;
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

interface ApplyResult {
  phase: ScreenPhase;
  sessionId: string;
  question: QuestionPayload | null;
  result: ResultPayload | null;
  coveredDomains: Set<string>;
  answers: Record<string, number>;
  recallOptions: string[];
  safetyMessage: string | null;
}

function applyAction(
  action: ScreenActionResponse,
  prevCovered: Set<string>,
  prevAnswers: Record<string, number>,
): ApplyResult {
  saveSessionId(action.session_id);
  saveCoveredDomains(prevCovered);

  // recall_options is a dict[str, str] — extract keys as the domain list
  const recallKeys = action.recall_options
    ? Object.keys(action.recall_options)
    : [];

  const base = {
    sessionId: action.session_id,
    coveredDomains: prevCovered,
    answers: prevAnswers,
    recallOptions: recallKeys,
    safetyMessage: action.safety_message ?? null,
  };

  if ((action.type === "complete" || action.type === "done") && action.result) {
    return {
      ...base,
      phase: "complete",
      question: null,
      result: action.result,
    };
  }
  if (action.type === "intake_required") {
    return {
      ...base,
      phase: "intake",
      question: null,
      result: null,
    };
  }
  if (action.type === "recall_help") {
    return {
      ...base,
      phase: "recall_help",
      question: null,
      result: null,
    };
  }
  if (action.type === "safety_notice") {
    return {
      ...base,
      phase: "safety_notice",
      question: null,
      result: null,
    };
  }
  return {
    ...base,
    phase: "question",
    question: action.question,
    result: null,
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
  const [recallOptions, setRecallOptions] = useState<string[]>([]);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [showSafetyLink, setShowSafetyLink] = useState(false);

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

  function applyNext(next: ApplyResult) {
    setSessionId(next.sessionId);
    setQuestion(next.question);
    setResult(next.result);
    setAnswers(next.answers);
    setCoveredDomains(next.coveredDomains);
    setPhase(next.phase);
    setRecallOptions(next.recallOptions);
    if (next.safetyMessage) {
      setSafetyMessage(next.safetyMessage);
      setShowSafetyLink(true);
    }
  }

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
    setRecallOptions([]);
    setSafetyMessage(null);
    setShowSafetyLink(false);
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
      child_name?: string;
      parent_name?: string;
      parent_phone?: string;
      relationship_to_child?: string;
      location_pincode?: string;
      location_city?: string;
      location_state?: string;
      location_address?: string;
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
      setRecallOptions([]);
      setSafetyMessage(null);
      setShowSafetyLink(false);
      saveCoveredDomains(new Set());
      try {
        const action = await api.startScreen({
          corrected_age_months: opts.corrected_age_months,
          child_ref: opts.child_ref ?? "",
          question_cap: opts.question_cap ?? 10,
          consent_given: opts.consent_given ?? true,
          module: opts.module,
          child_name: opts.child_name,
          parent_name: opts.parent_name,
          parent_phone: opts.parent_phone,
          relationship_to_child: opts.relationship_to_child,
          location_pincode: opts.location_pincode,
          location_city: opts.location_city,
          location_state: opts.location_state,
          location_address: opts.location_address,
        });
        const next = applyAction(action, new Set(), {});
        applyNext(next);
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

  const submitAnswer = useCallback(
    async (answer: number, source: "recall" | "observed" = "recall") => {
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
          source,
        });
      const nextAnswers = { ...answersRef.current, [itemId]: answer };
      const nextCovered = new Set(coveredRef.current);
      if (isKnownDomain(domain, moduleRef.current)) {
        nextCovered.add(domain);
      }
      const next = applyAction(action, nextCovered, nextAnswers);
      applyNext(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError("That answer could not be saved. Please try a different option.");
      } else if (err instanceof ApiError && err.status === 404) {
        setError("Your session has expired. Please start a new check-in.");
        setPhase("error");
      } else {
        setError(
          err instanceof ApiError
            ? err.detail
            : "Could not submit your answer. Please try again.",
        );
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const submitRecallCb = useCallback(async (selectedDomains: string[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setSubmitting(true);
    setError(null);
    try {
      const action = await api.submitRecall(sid, {
        domains: selectedDomains,
      });
      const next = applyAction(action, coveredRef.current, answersRef.current);
      applyNext(next);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Could not submit your selection. Please try again.",
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const dismissSafety = useCallback(() => {
    // After dismissing the safety screen, fetch the next action from the session
    const sid = sessionIdRef.current;
    if (!sid) return;
    setPhase("loading");
    setError(null);
    (async () => {
      try {
        const state = await api.getSession(sid);
        if (state.completed && state.result) {
          setPhase("complete");
          setResult(state.result);
          setQuestion(null);
        } else if (state.next_question) {
          setPhase("question");
          setQuestion(state.next_question);
          setResult(null);
        } else {
          setPhase("question");
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.detail : "Could not load next question.",
        );
        setPhase("error");
      }
    })();
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

  const progress: ProgressPayload | null = question
    ? {
        answered: Math.max(0, question.question_number - 1),
        max: question.question_cap || 20,
      }
    : null;

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
    progress,
    recallOptions,
    safetyMessage,
    showSafetyLink,
    start,
    advanceAfterIntake,
    submitAnswer,
    submitRecall: submitRecallCb,
    dismissSafety,
    reset,
  };
}
