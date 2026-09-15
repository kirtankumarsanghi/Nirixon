import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import type { ResultPayload, TeacherAnswerResponse } from "../api/types";
import { useAdaptiveQuestionnaire } from "../hooks/useAdaptiveQuestionnaire";
import { useToast } from "../toast/Toast";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { ResultsView } from "../components/ResultsView";
import { FreeTextIntake } from "../components/FreeTextIntake";
import { ModuleBResultCard } from "../components/ModuleBResultCard";
import { TeacherForm } from "../components/TeacherForm";
import { PageNav } from "../components/PageNav";
import { saveCheckIn } from "../lib/checkInHistory";

/** ASQ-3 bracket labels — Module A only (ages 1–59 months). */
function getAgeABracketLabel(months: number): string | null {
  if (months < 1 || months >= 60) return null;
  if (months < 3) return "2 months";
  if (months < 5) return "4 months";
  if (months < 7.5) return "6 months";
  if (months < 10.5) return "9 months";
  if (months < 13.5) return "12 months";
  if (months < 16.5) return "15 months";
  if (months < 19.5) return "18 months";
  if (months < 22.5) return "21 months";
  if (months < 25.5) return "24 months";
  if (months < 28.5) return "27 months";
  if (months < 31.5) return "30 months";
  if (months < 34.5) return "33 months";
  if (months < 39) return "36 months";
  if (months < 45) return "42 months";
  if (months < 51) return "48 months";
  if (months < 57) return "54 months";
  return "60 months";
}

function formatYearsHint(months: number): string {
  const years = months / 12;
  if (years < 1) return `${months} months`;
  const rounded = Math.round(years * 10) / 10;
  return `about ${rounded} years (${months} months)`;
}

function mergeTeacherIntoResult(
  result: ResultPayload,
  teacher: TeacherAnswerResponse | null,
): ResultPayload {
  if (!teacher) return result;
  const caveats = [...(result.caveats ?? [])];
  for (const note of teacher.caveats) {
    if (!caveats.includes(note)) caveats.push(note);
  }
  return {
    ...result,
    consistency_score: teacher.consistency_score,
    consistency_flags: teacher.consistency_flags,
    caveats,
  };
}

export function ScreeningPage() {
  const q = useAdaptiveQuestionnaire();
  const { push } = useToast();

  const [ageMonths, setAgeMonths] = useState("24");
  const [childRef, setChildRef] = useState("");
  const [starting, setStarting] = useState(false);
  const [ruleOut, setRuleOut] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(true);
  const [teacherResult, setTeacherResult] =
    useState<TeacherAnswerResponse | null>(null);

  const ageNum = Number(ageMonths);
  const isModuleB = Number.isFinite(ageNum) && ageNum >= 60;
  const ageBracketLabel = isModuleB ? null : getAgeABracketLabel(ageNum);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 144) {
      push("Please enter a corrected age between 1 and 144 months.", "error");
      return;
    }
    setStarting(true);
    setRuleOut(false);
    setTeacherResult(null);
    setShowTeacherForm(true);
    try {
      await q.start({
        corrected_age_months: ageNum,
        child_ref: childRef.trim() || undefined,
        consent_given: true,
      });
    } catch (err) {
      push(
        err instanceof ApiError ? err.detail : "Could not start screening.",
        "error",
      );
    } finally {
      setStarting(false);
    }
  }

  async function onAnswer(value: number) {
    try {
      await q.submitAnswer(value);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 429
            ? "You're sending answers a bit quickly — please wait a moment and try again."
            : err.detail
          : "Could not save that answer after retries. Check your connection and try again — your earlier answers are still saved.";
      push(msg, "error");
    }
  }

  if (q.phase === "complete" && q.result) {
    if (q.result.module === "B" || q.module === "B") {
      if (showTeacherForm) {
        return (
          <TeacherForm
            sessionId={q.sessionId!}
            onComplete={(res) => {
              if (res) setTeacherResult(res);
              setShowTeacherForm(false);
            }}
          />
        );
      }
      const merged = mergeTeacherIntoResult(q.result, teacherResult);
      return (
        <ModuleBResultsBridge
          result={merged}
          sessionId={q.sessionId}
          correctedAgeMonths={q.correctedAgeMonths}
          childRef={q.childRef}
          coveredDomainCount={q.coveredDomains.size}
          onStartOver={() => {
            q.reset();
            setRuleOut(false);
            setShowTeacherForm(true);
            setTeacherResult(null);
          }}
        />
      );
    }
    return (
      <ResultsView
        result={q.result}
        sessionId={q.sessionId}
        correctedAgeMonths={q.correctedAgeMonths}
        childRef={q.childRef}
        coveredDomainCount={q.coveredDomains.size}
        onStartOver={() => {
          q.reset();
        }}
      />
    );
  }

  if (ruleOut) {
    return (
      <section className="rule-out" aria-labelledby="rule-out-title">
        <h1 id="rule-out-title" className="display display--clay">
          A specialist evaluation is recommended
        </h1>
        <p className="lede">
          Based on your description, this child may benefit from assessment by
          a hearing, vision, or developmental specialist before completing this
          screener. Please speak with your paediatrician, a developmental
          specialist, or your local Anganwadi / PHC.
        </p>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setRuleOut(false);
            q.reset();
          }}
        >
          Back to the start
        </button>
      </section>
    );
  }

  if (q.phase === "intake" && q.sessionId) {
    return (
      <FreeTextIntake
        sessionId={q.sessionId}
        onComplete={(domains) => {
          void q.advanceAfterIntake(domains);
        }}
        onRuleOut={() => setRuleOut(true)}
      />
    );
  }

  if (q.phase === "question" && q.question) {
    return (
      <div className="screening">
        <PageNav
          backLabel="Leave check-in"
          onBack={() => {
            if (
              window.confirm(
                "Leave this check-in? Your progress is saved for this session if you return soon.",
              )
            ) {
              q.reset();
            }
          }}
          preferHistoryBack={false}
        />
        <ProgressIndicator
          coveredCount={q.coveredDomains.size}
          totalDomains={q.totalDomains}
          label={
            q.module === "B"
              ? "functioning areas covered"
              : "domains covered"
          }
        />
        {q.error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {q.error}
          </p>
        ) : null}
        {q.submitting ? (
          <p className="lede screening__saving" role="status" aria-live="polite">
            Saving your answer…
          </p>
        ) : null}
        <QuestionnaireForm
          question={q.question}
          disabled={q.submitting}
          onAnswer={onAnswer}
        />
      </div>
    );
  }

  if (q.phase === "loading") {
    return (
      <p className="lede" role="status" aria-live="polite">
        Loading your check-in…
      </p>
    );
  }

  return (
    <section className="screening-start" aria-labelledby="start-title">
      <h1 id="start-title" className="display">
        Start a check-in
      </h1>
      <p className="lede">
        {isModuleB
          ? "For school-age children (5–12 years / 60–144 months) we start with a brief open-ended description, then ask follow-up questions about functioning at home and school."
          : "We'll ask a short adaptive set of questions. Progress is by domain coverage, not a fixed question count — the list can shorten as you go."}
      </p>
      {q.error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {q.error}
        </p>
      ) : null}
      <form className="screening-start__form" onSubmit={onStart}>
        <label className="field">
          <span>Child&apos;s corrected age (months)</span>
          <input
            type="number"
            min={1}
            max={144}
            step={0.5}
            required
            value={ageMonths}
            onChange={(e) => setAgeMonths(e.target.value)}
          />
          {Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 144 ? (
            <span className="field__hint" aria-live="polite">
              {formatYearsHint(ageNum)}
              {ageBracketLabel && !isModuleB
                ? ` · ASQ-3 bracket: ${ageBracketLabel}`
                : null}
              {isModuleB ? " · School-age pathway (Module B)" : null}
            </span>
          ) : null}
        </label>
        <label className="field">
          <span>Optional label for this session only</span>
          <input
            type="text"
            value={childRef}
            onChange={(e) => setChildRef(e.target.value)}
            placeholder="e.g. initials — not a lasting child profile"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={starting}
        >
          {starting ? "Starting…" : isModuleB ? "Begin school-age check-in" : "Begin"}
        </button>
      </form>
    </section>
  );
}

function ModuleBResultsBridge({
  result,
  sessionId,
  correctedAgeMonths,
  childRef,
  coveredDomainCount,
  onStartOver,
}: {
  result: ResultPayload;
  sessionId: string | null;
  correctedAgeMonths: number | null;
  childRef: string;
  coveredDomainCount: number;
  onStartOver: () => void;
}) {
  useEffect(() => {
    if (!sessionId || correctedAgeMonths == null) return;
    saveCheckIn({
      sessionId,
      result,
      correctedAgeMonths,
      childRef,
      coveredDomainCount,
      module: "B",
    });
  }, [sessionId, result, correctedAgeMonths, childRef, coveredDomainCount]);

  return (
    <div>
      <PageNav
        backLabel="Start another check-in"
        onBack={onStartOver}
        preferHistoryBack={false}
      />
      <ModuleBResultCard
        result={result}
        correctedAgeMonths={correctedAgeMonths}
        childRef={childRef}
        coveredDomainCount={coveredDomainCount}
        onStartOver={onStartOver}
      />
      <nav className="results__related" aria-label="Related tools">
        <p className="eyebrow">Explore from this result</p>
        <ul>
          <li>
            <Link to="/growth">Growth trends</Link> — timeline of check-ins on
            this device
          </li>
          <li>
            <Link to="/share">Family sharing</Link> — copy or print a summary
            for caregivers
          </li>
          <li>
            <Link to="/sandbox">Clinician tools</Link> — detail for a
            paediatrician or school visit
          </li>
        </ul>
      </nav>
    </div>
  );
}
