import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Shield } from "lucide-react";
import { sandboxApi } from "../api/client";
import type { ResultPayload, SandboxSimulateRequest } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageNav } from "../components/PageNav";
import {
  getLatestCheckIn,
  loadCheckInHistory,
} from "../lib/checkInHistory";

export interface DomainScoreMap {
  gross_motor: number;
  fine_motor: number;
  communication: number;
  problem_solving: number;
  personal_social: number;
  adaptive: number;
  [key: string]: number;
}

const DEFAULT_SCORES: DomainScoreMap = {
  gross_motor: 70,
  fine_motor: 70,
  communication: 70,
  problem_solving: 70,
  personal_social: 70,
  adaptive: 70,
};

const DOMAIN_CONFIG: Array<{
  key: keyof DomainScoreMap;
  label: string;
  description: string;
}> = [
  {
    key: "gross_motor",
    label: "Gross Motor",
    description: "Balance, walking, kicking, stair climbing",
  },
  {
    key: "fine_motor",
    label: "Fine Motor",
    description: "Grasping, block stacking, crayon marks",
  },
  {
    key: "communication",
    label: "Communication",
    description: "Speaking words, listening, naming objects",
  },
  {
    key: "problem_solving",
    label: "Problem Solving",
    description: "Puzzles, search games, imitation",
  },
  {
    key: "personal_social",
    label: "Personal-Social",
    description: "Peer play, self-comforting, sharing gestures",
  },
  {
    key: "adaptive",
    label: "Adaptive / Self-Help",
    description: "Feeding self, dressing, hygiene routines",
  },
];

function formatTier(tierOrClassification: string | null | undefined): string {
  if (!tierOrClassification) return "Typical";
  if (tierOrClassification.includes("Tier 1") || tierOrClassification === "Typical") {
    return "Typical";
  }
  if (tierOrClassification.includes("Tier 2") || tierOrClassification === "Monitor") {
    return "Monitor";
  }
  if (tierOrClassification.includes("Tier 3") || tierOrClassification === "Refer") {
    return "Refer";
  }
  return tierOrClassification;
}

function tierBadgeClass(tier: string): string {
  const norm = formatTier(tier).toLowerCase();
  if (norm === "typical") return "whatif-tier-badge--typical";
  if (norm === "monitor") return "whatif-tier-badge--monitor";
  if (norm === "refer") return "whatif-tier-badge--refer";
  return "";
}

export function generatePlainLanguageLine(
  originalTier: string,
  simulatedTier: string,
  initialScores: DomainScoreMap,
  currentScores: DomainScoreMap,
  safetyOverrideTriggered: boolean,
): string {
  if (safetyOverrideTriggered) {
    return "Referral rule applies: When skill regression is reported, the child is referred directly regardless of model output.";
  }

  let maxDelta = 0;
  let primaryKey: keyof DomainScoreMap = "gross_motor";
  let isHigher = false;

  for (const config of DOMAIN_CONFIG) {
    const orig = initialScores[config.key] ?? 70;
    const curr = currentScores[config.key] ?? 70;
    const delta = curr - orig;
    if (Math.abs(delta) > Math.abs(maxDelta)) {
      maxDelta = delta;
      primaryKey = config.key;
      isHigher = delta > 0;
    }
  }

  const primaryLabel =
    DOMAIN_CONFIG.find((d) => d.key === primaryKey)?.label ?? "Gross Motor";
  const direction = isHigher ? "higher" : "lower";
  const normOrig = formatTier(originalTier);
  const normSim = formatTier(simulatedTier);

  if (normSim !== normOrig && Math.abs(maxDelta) > 5) {
    return `If ${primaryLabel} were ${direction}, the result would change from ${normOrig} to ${normSim}.`;
  }

  if (normSim === normOrig && Math.abs(maxDelta) > 5) {
    return `Even if ${primaryLabel} were ${direction}, the result remains ${normOrig}.`;
  }

  return "Adjust domain score sliders below to explore how shifts in skill areas would alter screening tiers.";
}

export function WhatIfSimulator() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const history = useMemo(() => loadCheckInHistory(), []);
  const latestCheckIn = useMemo(() => getLatestCheckIn(), []);

  const paramSessionId = searchParams.get("session_id") || searchParams.get("id");
  const fallbackSessionId =
    paramSessionId || latestCheckIn?.id || (history[0]?.id ?? "demo-session");

  const [sessionId] = useState<string>(fallbackSessionId);
  const [viewMode, setViewMode] = useState<"clinician" | "parent">("clinician");

  // Determine initial baseline domain scores from snapshot if available
  const initialScores: DomainScoreMap = useMemo(() => {
    const snap = history.find((h) => h.id === sessionId) ?? latestCheckIn;
    if (!snap) return DEFAULT_SCORES;
    const map: DomainScoreMap = { ...DEFAULT_SCORES };
    for (const d of snap.domains) {
      const key = d.domain as keyof DomainScoreMap;
      if (key in map) {
        if (d.level === "typical") map[key] = 85;
        else if (d.level === "keep_an_eye") map[key] = 50;
        else if (d.level === "worth_discussing") map[key] = 20;
      }
    }
    return map;
  }, [history, sessionId, latestCheckIn]);

  const [domainScores, setDomainScores] = useState<DomainScoreMap>(initialScores);
  const [regressionFlag, setRegressionFlag] = useState(false);

  const [originalResult, setOriginalResult] = useState<ResultPayload | null>(() => {
    const snap = history.find((h) => h.id === sessionId) ?? latestCheckIn;
    if (!snap) return null;
    return {
      final_classification: snap.final_classification,
      ml_classification: snap.clinician.ml_classification,
      model_name: snap.clinician.model_name,
      ml_score: snap.clinician.ml_score,
      probabilities: snap.clinician.probabilities,
      safety_override_triggered: snap.safety_override_triggered,
      override_rule: snap.override_rule,
      shap_top_features: snap.clinician.shap_top_features,
      shap_values: {},
      stopping_reason: snap.stopping_reason,
      caveats: snap.caveats,
      triage_tier:
        snap.final_classification === "Refer"
          ? "Tier 3: Direct Referral"
          : snap.final_classification === "Monitor"
            ? "Tier 2: Reflex Monitor"
            : "Tier 1: Routine Typical",
    };
  });

  const [simulatedResult, setSimulatedResult] = useState<ResultPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Debounced API invocation (300ms)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const executeSimulation = useCallback(
    async (
      scores: DomainScoreMap,
      triggerRegression: boolean,
      activeSessionId: string,
    ) => {
      if (!activeSessionId) return;

      setIsLoading(true);
      setError(null);

      try {
        const payload: SandboxSimulateRequest = {
          domain_scores: scores,
          answer_overrides: triggerRegression
            ? { regression_flag: 1 }
            : { regression_flag: 0 },
        };

        const result = await sandboxApi.simulate(activeSessionId, payload);
        setSimulatedResult(result);

        // If originalResult wasn't set yet (no local snapshot), store base result
        setOriginalResult((prev) => {
          if (prev) return prev;
          return result;
        });
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unable to complete what-if simulation.";

        if (
          errorMessage.includes("403") ||
          errorMessage.includes("Forbidden") ||
          errorMessage.includes("role")
        ) {
          setAuthNotice(
            "The /api/sandbox endpoint requires clinician authorization. You can switch to clinician credentials below.",
          );
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Trigger simulation on input changes with 300ms debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSimulation(domainScores, regressionFlag, sessionId);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [domainScores, regressionFlag, sessionId, executeSimulation]);

  const handleSliderChange = (key: keyof DomainScoreMap, rawValue: number) => {
    // Validate out-of-range values
    if (isNaN(rawValue) || rawValue < 0 || rawValue > 100) {
      setError(`Domain score for ${key} must be between 0 and 100.`);
      return;
    }
    setError(null);
    setDomainScores((prev) => ({
      ...prev,
      [key]: rawValue,
    }));
  };

  const handleReset = () => {
    setDomainScores(initialScores);
    setRegressionFlag(false);
    setError(null);
  };

  const handleQuickAuthorize = async () => {
    try {
      await login("clinician@example.com", "changeme");
      setAuthNotice(null);
      executeSimulation(domainScores, regressionFlag, sessionId);
    } catch (err) {
      setError(
        "Could not authorize clinician demo credentials. Please log in directly.",
      );
    }
  };

  // Determine current active result (simulated takes precedence, falls back to original)
  const currentResult = simulatedResult || originalResult;

  const originalTier = originalResult?.triage_tier
    ? formatTier(originalResult.triage_tier)
    : formatTier(originalResult?.final_classification);

  const simulatedTier = simulatedResult?.triage_tier
    ? formatTier(simulatedResult.triage_tier)
    : formatTier(simulatedResult?.final_classification);

  const plainLineSentence = useMemo(() => {
    return generatePlainLanguageLine(
      originalTier,
      simulatedTier,
      initialScores,
      domainScores,
      Boolean(simulatedResult?.safety_override_triggered || regressionFlag),
    );
  }, [
    originalTier,
    simulatedTier,
    initialScores,
    domainScores,
    simulatedResult?.safety_override_triggered,
    regressionFlag,
  ]);

  // TreeSHAP comparison list
  const shapComparison = useMemo(() => {
    if (!currentResult?.shap_top_features) return [];
    const origMap = new Map<string, number>();
    originalResult?.shap_top_features?.forEach((f) => origMap.set(f.feature, f.shap_value));

    return currentResult.shap_top_features.slice(0, 6).map((f) => {
      const origVal = origMap.get(f.feature) ?? f.shap_value;
      const simVal = f.shap_value;
      const delta = simVal - origVal;
      return {
        feature: f.feature,
        origVal,
        simVal,
        delta,
      };
    });
  }, [currentResult, originalResult]);

  return (
    <div className="feature-page whatif-page">
      <PageNav
        current="/deferred/what-if"
        backLabel="Back to clinician tools"
        backTo="/sandbox"
      />

      <div className="whatif-header">
        <div>
          <p className="eyebrow">Interactive Sandbox</p>
          <h1 className="display">What-If Simulator</h1>
          <p className="lede">
            Explore counterfactual screening outcomes by adjusting developmental domain
            scores in real-time.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="whatif-mode-tabs" role="tablist" aria-label="Audience View">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "clinician"}
            className={`btn btn--sm ${viewMode === "clinician" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setViewMode("clinician")}
          >
            Clinician view
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "parent"}
            className={`btn btn--sm ${viewMode === "parent" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setViewMode("parent")}
          >
            Parent view
          </button>
        </div>
      </div>

      {/* Parent View Disclaimer Badge */}
      {viewMode === "parent" && (
        <aside
          className="whatif-parent-banner"
          aria-label="Parent illustration notice"
        >
          <span className="whatif-badge-illustration">
            An illustration, not a prediction.
          </span>
          <p>
            This interactive view demonstrates how milestone progress in specific areas
            relates to screening tiers. It is a visual illustration for learning, not a
            clinical diagnosis.
          </p>
        </aside>
      )}

      {/* Auth Notice banner if 403 occurs */}
      {authNotice && (
        <div className="whatif-alert whatif-alert--warning" role="alert">
          <div>
            <strong>Clinician Authorization Required</strong>
            <p>{authNotice}</p>
          </div>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={handleQuickAuthorize}
          >
            Authorize as Clinician
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="whatif-alert whatif-alert--error" role="alert">
          <AlertTriangle className="whatif-alert__icon" size={18} />
          <div>
            <strong>Simulation error:</strong> {error}
          </div>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Safety Override Alert Banner */}
      {simulatedResult?.safety_override_triggered && (
        <div
          className="whatif-safety-banner"
          role="alert"
          aria-live="polite"
        >
          <div className="whatif-safety-banner__icon">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="whatif-safety-banner__title">Referral rule applies</h3>
            <p>
              When skill regression is reported (or critical developmental loss is
              detected), the deterministic clinical floor rule supersedes model
              predictions. The child is referred directly regardless of machine
              learning scores.
            </p>
          </div>
        </div>
      )}

      {/* Dynamic Plain Language Comparison Line */}
      <section
        className="whatif-plainline-box"
        aria-label="Plain language summary of simulation impact"
      >
        <p className="whatif-plainline-text">{plainLineSentence}</p>
        {isLoading && (
          <span className="whatif-loading-indicator" aria-live="polite">
            <span className="spinner-dot" /> Simulating...
          </span>
        )}
      </section>

      {/* Main Grid: Sliders & Side-by-Side Comparison */}
      <div className="whatif-grid">
        {/* Left Column: Domain Sliders */}
        <section
          className="whatif-controls-panel"
          aria-labelledby="sliders-heading"
        >
          <div className="whatif-panel-header">
            <h2 id="sliders-heading" className="h-sm">
              Domain score adjustments
            </h2>
            {viewMode === "clinician" && (
              <button
                type="button"
                className="btn btn--xs btn--ghost"
                onClick={handleReset}
              >
                Reset
              </button>
            )}
          </div>

          {viewMode === "parent" && (
            <p className="whatif-readonly-note">
              Sliders are read-only in parent view. Switch to Clinician view to test custom
              milestone scenarios.
            </p>
          )}

          <div className="whatif-sliders-list">
            {DOMAIN_CONFIG.map(({ key, label, description }) => {
              const val = domainScores[key];
              const origVal = initialScores[key] ?? 70;
              const delta = val - origVal;

              return (
                <div key={key} className="whatif-slider-group">
                  <div className="whatif-slider-header">
                    <div>
                      <label htmlFor={`slider-${key}`} className="whatif-slider-label">
                        {label}
                      </label>
                      <span className="whatif-slider-sub">{description}</span>
                    </div>
                    <div className="whatif-slider-values">
                      <span className="whatif-slider-val">{val}%</span>
                      {delta !== 0 && (
                        <span
                          className={`whatif-delta ${delta > 0 ? "whatif-delta--pos" : "whatif-delta--neg"}`}
                        >
                          {delta > 0 ? `+${delta}%` : `${delta}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  <input
                    id={`slider-${key}`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    disabled={viewMode === "parent"}
                    value={val}
                    onChange={(e) =>
                      handleSliderChange(key, parseInt(e.target.value, 10))
                    }
                    className="whatif-range-input"
                    aria-label={`${label} simulated score`}
                  />
                  <div className="whatif-slider-ticks">
                    <span>Delay (0%)</span>
                    <span>Monitor (50%)</span>
                    <span>Typical (100%)</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Safety Rule Trigger Toggle */}
          <div className="whatif-override-toggle">
            <label className="whatif-checkbox-label">
              <input
                type="checkbox"
                id="regression-toggle"
                disabled={viewMode === "parent"}
                checked={regressionFlag}
                onChange={(e) => setRegressionFlag(e.target.checked)}
              />
              <div>
                <strong>Simulate Skill Regression (`regression_flag`)</strong>
                <p>
                  Tests the deterministic safety floor rule that mandates direct referral
                  if a child loses previously mastered skills.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Right Column: Comparison & Details */}
        <section
          className="whatif-results-panel"
          aria-labelledby="comparison-heading"
        >
          <div className="whatif-panel-header">
            <h2 id="comparison-heading" className="h-sm">
              Screening Tier Comparison
            </h2>

            {/* Inference time badge: Show ONLY if API returns it */}
            {simulatedResult?.latency_ms != null && viewMode === "clinician" && (
              <span
                className="whatif-latency-badge"
                title="Model inference latency"
              >
                {simulatedResult.latency_ms} ms
              </span>
            )}
          </div>

          {/* Side-by-Side Original vs Simulated */}
          <div className="whatif-comparison-cards">
            {/* Original Card */}
            <div className="whatif-card whatif-card--original">
              <span className="whatif-card__tag">Original Result</span>
              <div className="whatif-card__tier">
                <span
                  className={`whatif-tier-badge ${tierBadgeClass(originalTier)}`}
                >
                  {originalTier}
                </span>
                <span className="whatif-card__sub">
                  {originalResult?.triage_tier ?? "Initial Screening"}
                </span>
              </div>

              {/* Probabilities */}
              <div className="whatif-card__probs">
                <div className="whatif-prob-row">
                  <span>Typical:</span>
                  <strong>
                    {Math.round(
                      (originalResult?.probabilities?.["Typical"] ?? 0.33) * 100,
                    )}
                    %
                  </strong>
                </div>
                <div className="whatif-prob-row">
                  <span>Monitor:</span>
                  <strong>
                    {Math.round(
                      (originalResult?.probabilities?.["Monitor"] ?? 0.33) * 100,
                    )}
                    %
                  </strong>
                </div>
                <div className="whatif-prob-row">
                  <span>Refer:</span>
                  <strong>
                    {Math.round(
                      (originalResult?.probabilities?.["Refer"] ?? 0.34) * 100,
                    )}
                    %
                  </strong>
                </div>
              </div>
            </div>

            {/* Simulated Card */}
            <div className="whatif-card whatif-card--simulated">
              <span className="whatif-card__tag">Simulated Outcome</span>
              <div className="whatif-card__tier">
                <span
                  className={`whatif-tier-badge ${tierBadgeClass(simulatedTier)}`}
                >
                  {simulatedTier}
                </span>
                <span className="whatif-card__sub">
                  {simulatedResult?.triage_tier ?? "What-If Projection"}
                </span>
              </div>

              {/* Probabilities */}
              <div className="whatif-card__probs">
                <div className="whatif-prob-row">
                  <span>Typical:</span>
                  <strong>
                    {Math.round(
                      (simulatedResult?.probabilities?.["Typical"] ??
                        originalResult?.probabilities?.["Typical"] ??
                        0.33) * 100,
                    )}
                    %
                  </strong>
                </div>
                <div className="whatif-prob-row">
                  <span>Monitor:</span>
                  <strong>
                    {Math.round(
                      (simulatedResult?.probabilities?.["Monitor"] ??
                        originalResult?.probabilities?.["Monitor"] ??
                        0.33) * 100,
                    )}
                    %
                  </strong>
                </div>
                <div className="whatif-prob-row">
                  <span>Refer:</span>
                  <strong>
                    {Math.round(
                      (simulatedResult?.probabilities?.["Refer"] ??
                        originalResult?.probabilities?.["Refer"] ??
                        0.34) * 100,
                    )}
                    %
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Clinician View: Calibrated Probabilities & TreeSHAP Changes */}
          {viewMode === "clinician" && (
            <div className="whatif-clinician-details">
              <h3 className="h-sm">Calibrated probability shift</h3>
              <div className="whatif-prob-bars">
                {["Typical", "Monitor", "Refer"].map((label) => {
                  const origVal = originalResult?.probabilities?.[label] ?? 0;
                  const simVal =
                    simulatedResult?.probabilities?.[label] ?? origVal;
                  const origPct = Math.round(origVal * 100);
                  const simPct = Math.round(simVal * 100);

                  return (
                    <div key={label} className="whatif-prob-bar-row">
                      <div className="whatif-prob-bar-label">
                        <span>{label}</span>
                        <span>
                          {origPct}% → <strong>{simPct}%</strong>
                        </span>
                      </div>
                      <div className="whatif-bar-track">
                        <div
                          className="whatif-bar-fill whatif-bar-fill--orig"
                          style={{ width: `${origPct}%` }}
                        />
                        <div
                          className="whatif-bar-fill whatif-bar-fill--sim"
                          style={{ width: `${simPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TreeSHAP Feature Attributions */}
              <h3 className="h-sm whatif-shap-title">
                TreeSHAP Feature Attributions (Δ changes)
              </h3>
              {shapComparison.length > 0 ? (
                <ul className="whatif-shap-list">
                  {shapComparison.map((item) => (
                    <li key={item.feature} className="whatif-shap-item">
                      <code className="whatif-shap-code">{item.feature}</code>
                      <span className="whatif-shap-orig">
                        {item.origVal.toFixed(3)}
                      </span>
                      <span className="whatif-shap-arrow">→</span>
                      <span className="whatif-shap-sim">
                        {item.simVal.toFixed(3)}
                      </span>
                      <span
                        className={`whatif-shap-delta ${item.delta > 0 ? "whatif-delta--risk-up" : "whatif-delta--risk-down"}`}
                      >
                        {item.delta > 0 ? `+${item.delta.toFixed(3)}` : item.delta.toFixed(3)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="feature-page__note">
                  TreeSHAP attribution weights will update when simulated answers diverge
                  from baseline.
                </p>
              )}
            </div>
          )}

          {/* Session Selector / Info */}
          <div className="whatif-session-info">
            <span className="whatif-session-label">Session ID:</span>
            <code className="whatif-session-id">{sessionId}</code>
          </div>
        </section>
      </div>

      <div className="feature-page__actions">
        <Link className="btn btn--secondary" to="/sandbox">
          Back to clinician tools
        </Link>
        <Link className="btn btn--ghost" to="/screen">
          Screening
        </Link>
        <Link className="btn btn--ghost" to="/growth">
          Growth trends
        </Link>
      </div>
    </div>
  );
}

export default WhatIfSimulator;
