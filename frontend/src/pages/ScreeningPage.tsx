import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Users, Baby, GraduationCap } from "lucide-react";
import { ApiError } from "../api/client";
import type { ResultPayload, TeacherAnswerResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  defaultAuthenticatedPath,
  isParentRole,
  roleLabel,
} from "../auth/roles";
import { useAdaptiveQuestionnaire } from "../hooks/useAdaptiveQuestionnaire";
import { useToast } from "../toast/Toast";
import { QuestionnaireForm } from "../components/QuestionnaireForm";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { ResultsView } from "../components/ResultsView";
import { FreeTextIntake } from "../components/FreeTextIntake";
import { ModuleBResultCard } from "../components/ModuleBResultCard";
import { ModuleBQuestionForm } from "../components/ModuleBQuestionForm";
import { ModuleBResultView } from "../components/ModuleBResultView";
import { RecallHelpScreen } from "../components/RecallHelpScreen";
import {
  SafetyNoticeScreen,
  SafetyPersistentLink,
} from "../components/SafetyNoticeScreen";
import { TeacherForm } from "../components/TeacherForm";
import { PageNav } from "../components/PageNav";
import { saveCheckIn } from "../lib/checkInHistory";
import { t } from "../i18n";

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
  const [searchParams] = useSearchParams();
  const q = useAdaptiveQuestionnaire();
  const { push } = useToast();
  const { role } = useAuth();
  const staffAssist = !isParentRole(role);

  const [ageMonths, setAgeMonths] = useState(() => searchParams.get("age") || searchParams.get("age_months") || "24");
  const [childRef, setChildRef] = useState(() => searchParams.get("child_ref") || searchParams.get("child_id") || "");
  const [childName, setChildName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [relationship, setRelationship] = useState("Mother");
  const [locationPincode, setLocationPincode] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationState, setLocationState] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ruleOut, setRuleOut] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(true);
  const [teacherResult, setTeacherResult] =
    useState<TeacherAnswerResponse | null>(null);

  const ageNum = Number(ageMonths);
  const isModuleB = Number.isFinite(ageNum) && ageNum >= 60;
  const ageBracketLabel = isModuleB ? null : getAgeABracketLabel(ageNum);

  function handlePincodeChange(pin: string) {
    const cleaned = pin.replace(/\D/g, "").slice(0, 6);
    setLocationPincode(cleaned);
    if (cleaned.length >= 2) {
      const prefix = cleaned.slice(0, 2);
      const prefixMap: Record<string, { city: string; state: string }> = {
        "11": { city: "New Delhi", state: "Delhi" },
        "40": { city: "Mumbai", state: "Maharashtra" },
        "41": { city: "Pune", state: "Maharashtra" },
        "56": { city: "Bengaluru", state: "Karnataka" },
        "50": { city: "Hyderabad", state: "Telangana" },
        "60": { city: "Chennai", state: "Tamil Nadu" },
        "70": { city: "Kolkata", state: "West Bengal" },
        "30": { city: "Jaipur", state: "Rajasthan" },
        "22": { city: "Lucknow", state: "Uttar Pradesh" },
        "38": { city: "Ahmedabad", state: "Gujarat" },
        "83": { city: "Ranchi", state: "Jharkhand" },
        "80": { city: "Patna", state: "Bihar" },
        "16": { city: "Chandigarh", state: "Punjab / Haryana" },
        "46": { city: "Bhopal", state: "Madhya Pradesh" },
        "78": { city: "Guwahati", state: "Assam" },
        "68": { city: "Kochi", state: "Kerala" },
        "75": { city: "Bhubaneswar", state: "Odisha" },
      };
      if (prefixMap[prefix] && !locationCity) {
        setLocationCity(prefixMap[prefix].city);
        setLocationState(prefixMap[prefix].state);
      }
    }
  }

  function handleAutoDetectLocation() {
    if (!navigator.geolocation) {
      push("Geolocation is not supported by your browser.", "info");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setIsLocating(false);
        if (!locationCity) {
          setLocationCity("Nearby District Hub");
        }
        push("Location accessed. Please confirm your city & pincode.", "success");
      },
      () => {
        setIsLocating(false);
        push("Could not get GPS location. Please enter pincode.", "info");
      },
      { timeout: 8000 },
    );
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 144) {
      push(
        t("screen.age.error", "Please enter a corrected age between 1 and 144 months."),
        "error",
      );
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
        child_name: childName.trim() || undefined,
        parent_name: parentName.trim() || undefined,
        parent_phone: parentPhone.trim() || undefined,
        relationship_to_child: relationship,
        location_pincode: locationPincode.trim() || undefined,
        location_city: locationCity.trim() || undefined,
        location_state: locationState.trim() || undefined,
        location_address: locationAddress.trim() || undefined,
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

  async function onAnswer(
    value: number,
    source: "recall" | "observed" = "recall",
  ) {
    try {
      await q.submitAnswer(value, source);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 429
            ? t(
                "screen.ratelimit",
                "You're sending answers a bit quickly — please wait a moment and try again.",
              )
            : err.status === 422
              ? t(
                  "screen.badanswer",
                  "That answer could not be saved. Please try a different option.",
                )
              : err.status === 404
                ? t(
                    "screen.expired",
                    "Your session has expired. Please start a new check-in.",
                  )
                : err.detail
          : t(
              "screen.answerfail",
              "Could not save that answer after retries. Check your connection and try again — your earlier answers are still saved.",
            );
      push(msg, "error");
    }
  }

  // --- COMPLETE phase ---
  if (q.phase === "complete" && q.result) {
    // Module B enriched result view (new flow)
    if (q.module === "B" || q.result.module === "B") {
      // Check if the result has the enriched fields (domains, activities, etc.)
      const hasEnrichedResult =
        q.result.domains || q.result.activities || q.result.summary;

      if (hasEnrichedResult) {
        return (
          <div>
            <PageNav
              backLabel={t("screen.nav.startover", "Start another check-in")}
              onBack={() => {
                q.reset();
                setRuleOut(false);
                setShowTeacherForm(true);
                setTeacherResult(null);
              }}
              preferHistoryBack={false}
            />
            {q.showSafetyLink ? <SafetyPersistentLink /> : null}
            <ModuleBResultView
              result={q.result}
              correctedAgeMonths={q.correctedAgeMonths}
              childRef={q.childRef}
              onStartOver={() => {
                q.reset();
                setRuleOut(false);
                setShowTeacherForm(true);
                setTeacherResult(null);
              }}
            />
          </div>
        );
      }

      // Fallback to existing teacher form + ModuleBResultCard flow
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

  // --- SAFETY NOTICE phase ---
  if (q.phase === "safety_notice") {
    return (
      <SafetyNoticeScreen
        message={q.safetyMessage}
        onContinue={() => q.dismissSafety()}
      />
    );
  }

  // --- RECALL HELP phase ---
  if (q.phase === "recall_help" && q.recallOptions.length > 0) {
    return (
      <div>
        {q.showSafetyLink ? <SafetyPersistentLink /> : null}
        <RecallHelpScreen
          options={q.recallOptions}
          submitting={q.submitting}
          onSubmit={(domains) => {
            void q.submitRecall(domains);
          }}
        />
        {q.error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {q.error}
          </p>
        ) : null}
      </div>
    );
  }

  // --- RULE OUT ---
  if (ruleOut) {
    return (
      <section className="rule-out" aria-labelledby="rule-out-title">
        <h1 id="rule-out-title" className="display display--clay">
          {t(
            "screen.ruleout.title",
            "A specialist evaluation is recommended",
          )}
        </h1>
        <p className="lede">
          {t(
            "screen.ruleout.body",
            "Based on your description, this child may benefit from assessment by a hearing, vision, or developmental specialist before completing this screener. Please speak with your paediatrician, a developmental specialist, or your local Anganwadi / PHC.",
          )}
        </p>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setRuleOut(false);
            q.reset();
          }}
        >
          {t("screen.ruleout.back", "Back to the start")}
        </button>
      </section>
    );
  }

  // --- INTAKE phase ---
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

  // --- QUESTION phase ---
  if (q.phase === "question" && q.question) {
    const isModuleBQuestion = q.module === "B";

    return (
      <div className="screening">
        <PageNav
          backLabel={t("screen.nav.leave", "Leave check-in")}
          onBack={() => {
            if (
              window.confirm(
                t(
                  "screen.nav.confirm",
                  "Leave this check-in? Your progress is saved for this session if you return soon.",
                ),
              )
            ) {
              q.reset();
            }
          }}
          preferHistoryBack={false}
        />
        {q.showSafetyLink ? <SafetyPersistentLink /> : null}
        <ProgressIndicator
          coveredCount={q.coveredDomains.size}
          totalDomains={q.totalDomains}
          label={
            isModuleBQuestion
              ? t("screen.progress.moduleb", "functioning areas covered")
              : t("screen.progress.modulea", "domains covered")
          }
        />
        {q.error ? (
          <p className="form-error" role="alert" aria-live="assertive">
            {q.error}
          </p>
        ) : null}
        {q.submitting ? (
          <p className="lede screening__saving" role="status" aria-live="polite">
            {t("screen.saving", "Saving your answer…")}
          </p>
        ) : null}
        {isModuleBQuestion ? (
          <ModuleBQuestionForm
            question={q.question}
            disabled={q.submitting}
            onAnswer={onAnswer}
            progress={q.progress}
          />
        ) : (
          <QuestionnaireForm
            question={q.question}
            disabled={q.submitting}
            onAnswer={onAnswer}
            sessionId={q.sessionId}
          />
        )}
      </div>
    );
  }

  // --- LOADING phase ---
  if (q.phase === "loading") {
    return (
      <p className="lede" role="status" aria-live="polite">
        {t("screen.loading", "Loading your check-in…")}
      </p>
    );
  }

  // --- ERROR phase ---
  if (q.phase === "error") {
    return (
      <section className="screening-start" aria-labelledby="error-title">
        <h1 id="error-title" className="display display--clay">
          {t("screen.error.title", "Something went wrong")}
        </h1>
        {q.error ? (
          <p className="form-error" role="alert">
            {q.error}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => q.reset()}
        >
          {t("screen.error.retry", "Start again")}
        </button>
      </section>
    );
  }

  // --- IDLE phase (start form) ---
  return (
    <section className="screening-start" aria-labelledby="start-title">
      {staffAssist ? (
        <div className="role-banner" role="note">
          <div className="role-banner__icon" aria-hidden>
            <Users size={20} />
          </div>
          <div>
            <p className="eyebrow">Assisting as {roleLabel(role)}</p>
            <p className="role-banner__text">
              This is the family check-in form. Your usual workspace is{" "}
              <Link to={defaultAuthenticatedPath(role)}>
                {defaultAuthenticatedPath(role) === "/referrals"
                  ? "Referrals"
                  : "Clinician tools"}
              </Link>
              . Use this only when helping a caregiver complete a session.
            </p>
          </div>
        </div>
      ) : null}

      <div className="screening-start__hero">
        <p className="eyebrow">
          {isModuleB ? "School-age pathway · 5–12 years" : "Early years pathway · under 5"}
        </p>
        <h1 id="start-title" className="display">
          {staffAssist ? "Help a family check in" : "Start a check-in"}
        </h1>
        <p className="lede">
          {isModuleB
            ? "We begin with a short open description, then ask follow-ups about home and school."
            : "A short adaptive set of questions by developmental domain — the list can shorten as you go."}
        </p>
      </div>

      <div className="pathway-cards" role="group" aria-label="Age pathway">
        <button
          type="button"
          className={`pathway-card${!isModuleB ? " pathway-card--active" : ""}`}
          onClick={() => setAgeMonths("24")}
        >
          <span className="pathway-card__icon" aria-hidden>
            <Baby size={24} />
          </span>
          <strong>Early years</strong>
          <span>1–59 months · Module A</span>
        </button>
        <button
          type="button"
          className={`pathway-card${isModuleB ? " pathway-card--active" : ""}`}
          onClick={() => setAgeMonths("72")}
        >
          <span className="pathway-card__icon" aria-hidden>
            <GraduationCap size={24} />
          </span>
          <strong>School age</strong>
          <span>60–144 months · Module B</span>
        </button>
      </div>

      {q.error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {q.error}
        </p>
      ) : null}

      <form className="screening-start__form intake-profile-form" onSubmit={onStart}>
        <div className="intake-section">
          <div className="intake-section__head">
            <span className="intake-section__step" aria-hidden>
              1
            </span>
            <div>
              <h2 className="intake-section__title">
                About the child
              </h2>
              <p className="intake-section__sub">
                Age chooses the pathway. Name is optional for this session.
              </p>
            </div>
          </div>
          <div className="intake-section__grid">
            <label className="field">
              <span>Child&apos;s full name</span>
              <input
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span>{t("screen.field.age", "Corrected age (months)")}</span>
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
          </div>
        </div>

        <div className="intake-section">
          <div className="intake-section__head">
            <span className="intake-section__step" aria-hidden>
              2
            </span>
            <div>
              <h2 className="intake-section__title">
                Caregiver answering today
              </h2>
              <p className="intake-section__sub">
                Who is filling this check-in, and how we can reach them if needed.
              </p>
            </div>
          </div>
          <div className="intake-section__grid">
            <label className="field">
              <span>Caregiver name</span>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Pooja Sharma"
                autoComplete="name"
              />
            </label>

            <label className="field">
              <span>Relationship to child</span>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="select"
              >
                <option value="Mother">Mother</option>
                <option value="Father">Father</option>
                <option value="Guardian">Guardian</option>
                <option value="Grandparent">Grandparent</option>
                <option value="Anganwadi / Health Worker">
                  Anganwadi / Health Worker
                </option>
                <option value="Teacher">Teacher / Mentor</option>
              </select>
            </label>

            <label className="field intake-section__full">
              <span>Contact phone</span>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) =>
                  setParentPhone(e.target.value.replace(/[^\d+ ]/g, ""))
                }
                placeholder="e.g. 9876543210 (10 digits)"
                autoComplete="tel"
              />
              <span className="field__hint">
                Helps suggest nearby ASHA / Anganwadi / DEIC contacts after results.
              </span>
            </label>
          </div>
        </div>

        <div className="intake-section">
          <div className="intake-section__head">
            <span className="intake-section__step" aria-hidden>
              3
            </span>
            <div className="intake-section__head-main">
              <div>
                <h2 className="intake-section__title">
                  Location for local matching
                </h2>
                <p className="intake-section__sub">
                  Used only to suggest nearby public health resources.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm intake-gps-btn"
                onClick={handleAutoDetectLocation}
                disabled={isLocating}
              >
                {isLocating ? "Detecting…" : "Auto-detect"}
              </button>
            </div>
          </div>
          <div className="intake-section__grid">
            <label className="field">
              <span>6-digit pincode</span>
              <input
                type="text"
                maxLength={6}
                value={locationPincode}
                onChange={(e) => handlePincodeChange(e.target.value)}
                placeholder="e.g. 110016"
              />
              <span className="field__hint">Often auto-fills city & state</span>
            </label>

            <label className="field">
              <span>City / district</span>
              <input
                type="text"
                value={locationCity}
                onChange={(e) => setLocationCity(e.target.value)}
                placeholder="e.g. New Delhi"
              />
            </label>

            <label className="field">
              <span>State</span>
              <input
                type="text"
                value={locationState}
                onChange={(e) => setLocationState(e.target.value)}
                placeholder="e.g. Delhi"
              />
            </label>

            <label className="field">
              <span>Locality (optional)</span>
              <input
                type="text"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                placeholder="e.g. Green Park, Ward 14"
              />
            </label>
          </div>
        </div>

        <div className="intake-section intake-section--soft">
          <div className="intake-section__head">
            <span className="intake-section__step" aria-hidden>
              ·
            </span>
            <div>
              <h2 className="intake-section__title">
                Optional session label
              </h2>
              <p className="intake-section__sub">
                Initials or nickname for this device history only.
              </p>
            </div>
          </div>
          <label className="field field--optional">
            <span className="visually-hidden">Optional session label</span>
            <input
              type="text"
              value={childRef}
              onChange={(e) => setChildRef(e.target.value)}
              placeholder="e.g. A.S. · home visit"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="intake-consent-box">
          <p className="intake-consent-box__text">
            <strong>Privacy:</strong> Information stays under this signed-in
            account for triage and optional public-health matching (ASHA,
            Anganwadi, DEIC). It is not a diagnosis.
          </p>
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={starting}
        >
          {starting
            ? t("screen.start.starting", "Starting…")
            : isModuleB
              ? "Begin school-age check-in"
              : "Begin developmental check-in"}
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
        sessionId={sessionId}
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
