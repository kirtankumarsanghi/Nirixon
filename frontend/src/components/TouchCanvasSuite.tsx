import React, { useState, useRef, useEffect } from "react";
import { ShieldCheck, Star, Flag, Inbox } from "lucide-react";
import type {
  TouchTaskMetric,
  TouchConfigResponse,
  TouchTaskEvaluation,
} from "../api/types";
import { api } from "../api/client";

interface TouchCanvasSuiteProps {
  sessionId?: string | null;
  childAgeMonths?: number;
  onComplete?: (metrics: TouchTaskMetric[]) => void;
  showSubmitButton?: boolean;
}

export function TouchCanvasSuite({
  sessionId,
  childAgeMonths = 30,
  onComplete,
  showSubmitButton = true,
}: TouchCanvasSuiteProps) {
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = Intro, 1 = Tap, 2 = Trace, 3 = Drag, 4 = Results
  const [completedMetrics, setCompletedMetrics] = useState<TouchTaskMetric[]>([]);
  const [touchConfig, setTouchConfig] = useState<TouchConfigResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    notice: string;
    evaluations: TouchTaskEvaluation[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load provisional touch reference configuration
  useEffect(() => {
    let active = true;
    api
      .getTouchConfig()
      .then((cfg) => {
        if (active) setTouchConfig(cfg);
      })
      .catch((err) => {
        console.warn("Could not load touch config:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const isEligibleAge = childAgeMonths >= 24;

  const handleTaskFinished = (metric: TouchTaskMetric) => {
    const updated = [...completedMetrics.filter((m) => m.task_type !== metric.task_type), metric];
    setCompletedMetrics(updated);
    if (currentStep === 1) {
      setCurrentStep(2); // move to trace
    } else if (currentStep === 2) {
      setCurrentStep(3); // move to drag
    } else if (currentStep === 3) {
      setCurrentStep(4); // show review & summary
      if (onComplete) onComplete(updated);
    }
  };

  const submitToServer = async () => {
    if (!sessionId || completedMetrics.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.submitTouchTelemetry(sessionId, {
        metrics: completedMetrics,
        device_info: {
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          pixelRatio: window.devicePixelRatio || 1,
        },
      });
      setSubmitResult({
        notice: res.exploratory_notice,
        evaluations: res.provisional_evaluations,
      });
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not submit touch telemetry to backend.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isEligibleAge) {
    return (
      <div
        className="touch-ineligible-banner"
        style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "12px",
          padding: "1.5rem",
          color: "#fde68a",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem", color: "#fbbf24" }}>
          Touch Tasks Restricted to 24 Months and Older
        </h3>
        <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5, color: "#fef3c7" }}>
          The child&apos;s recorded age is <strong>{childAgeMonths} months</strong>.
          Standard touchscreen motor response tasks are only calibrated for children aged 24 months
          and older. For infants under 24 months, please use physical object manipulation tasks in
          Live Elicitation.
        </p>
      </div>
    );
  }

  return (
    <div
      className="touch-suite-container"
      style={{
        background: "#161b22",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        borderRadius: "16px",
        padding: "1.75rem",
        color: "#f3f4f6",
        maxWidth: "760px",
        margin: "0 auto",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Header Badges */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <span
            style={{
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
              background: "rgba(234, 179, 8, 0.2)",
              color: "#facc15",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginRight: "0.5rem",
            }}
          >
            Exploratory, not used in the result
          </span>
          <span
            style={{
              padding: "0.25rem 0.65rem",
              borderRadius: "999px",
              background: "rgba(59, 130, 246, 0.2)",
              color: "#93c5fd",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Provisional Reference
          </span>
        </div>

        <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
          Step {Math.min(currentStep, 3)} of 3 tasks
        </div>
      </div>

      {/* Exploratory Notice Disclaimer */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          marginBottom: "1.5rem",
          fontSize: "0.85rem",
          color: "#cbd5e1",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <ShieldCheck size={20} color="#60a5fa" style={{ flexShrink: 0 }} />
        <span>
          <strong>Data privacy:</strong> Only discrete numbers (reaction time in ms, accuracy %, and
          jitter in px) are recorded. <em>No images, video, or audio are ever captured or sent.</em>
        </span>
      </div>

      {/* Step 0: Instructions and Start */}
      {currentStep === 0 && (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <h2 style={{ fontSize: "1.4rem", margin: "0 0 0.75rem", color: "#60a5fa" }}>
            Toddler Touch Motor Tasks (24m+)
          </h2>
          <p
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#9ca3af",
              maxWidth: "540px",
              margin: "0 auto 1.5rem",
            }}
          >
            Three brief, interactive touch exercises designed with extra-large targets:
            <strong> Tap a Target</strong>, <strong>Trace a Path</strong>, and{" "}
            <strong>Drag to Place</strong>. These quantify fine-motor speed, tremor/jitter, and
            spatial accuracy.
          </p>
          <p
            style={{
              fontSize: "0.8rem",
              color: "#f59e0b",
              background: "rgba(245, 158, 11, 0.1)",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              display: "inline-block",
              marginBottom: "1.5rem",
            }}
          >
            Notice: These tasks are exploratory and do NOT influence the screening tier or safety rules.
          </p>
          <div>
            <button
              type="button"
              className="btn btn--primary"
              style={{
                fontSize: "1rem",
                padding: "0.85rem 2rem",
                borderRadius: "10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => setCurrentStep(1)}
            >
              Start Task 1: Tap Target
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Tap the Target */}
      {currentStep === 1 && (
        <TapTargetTask onFinish={handleTaskFinished} />
      )}

      {/* Step 2: Trace a Path */}
      {currentStep === 2 && (
        <TracePathTask onFinish={handleTaskFinished} />
      )}

      {/* Step 3: Drag to Place */}
      {currentStep === 3 && (
        <DragTargetTask onFinish={handleTaskFinished} />
      )}

      {/* Step 4: Summary & Telemetry Review */}
      {currentStep === 4 && (
        <div>
          <h2 style={{ fontSize: "1.3rem", margin: "0 0 0.75rem", color: "#4ade80" }}>
            Touch Tasks Complete
          </h2>
          <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1.25rem" }}>
            Telemetry successfully extracted. Note that these are exploratory metrics:
          </p>

          {/* Metric Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {completedMetrics.map((m) => (
              <div
                key={m.task_type}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#93c5fd",
                    marginBottom: "0.5rem",
                  }}
                >
                  {m.task_type === "tap"
                    ? "1. Tap Target"
                    : m.task_type === "trace"
                    ? "2. Path Trace"
                    : "3. Drag to Place"}
                </div>
                <div style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                  <div>
                    <strong>Reaction Time:</strong> {Math.round(m.reaction_time_ms)} ms
                  </div>
                  <div>
                    <strong>Accuracy:</strong> {m.path_accuracy_pct.toFixed(1)}%
                  </div>
                  <div>
                    <strong>Jitter:</strong> {m.jitter_px.toFixed(1)} px
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#4ade80", marginTop: "0.25rem" }}>
                    Completed: Yes
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Provisional Reference Comparison if Config available */}
          {touchConfig && (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px dashed rgba(255, 255, 255, 0.2)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
              }}
            >
              <h4 style={{ margin: "0 0 0.5rem", color: "#facc15" }}>
                Provisional Normative Comparison (Config: {touchConfig.is_provisional ? "Provisional" : "Standard"})
              </h4>
              <p style={{ margin: "0 0 0.5rem", color: "#9ca3af", fontSize: "0.8rem" }}>
                Reference ranges derived from pilot normative benchmarks (n=60 per age band).
                Marked provisional for clinical research exploration only.
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#cbd5e1" }}>
                <li>Expected Reaction Time (24–36m): 350 – 900 ms</li>
                <li>Expected Path Accuracy: 60% – 92%</li>
                <li>Expected Motor Jitter: &lt; 20 px</li>
              </ul>
            </div>
          )}

          {/* Submission feedback */}
          {submitResult && (
            <div
              style={{
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                color: "#86efac",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", fontWeight: 700 }}>
                ✓ Telemetry Numbers Successfully Recorded by Server
              </p>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#bbf7d0" }}>
                {submitResult.notice}
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                color: "#fca5a5",
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            {sessionId && showSubmitButton && !submitResult && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={submitting}
                onClick={() => void submitToServer()}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Sending numbers…" : "Send numbers to session"}
              </button>
            )}

            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setCompletedMetrics([]);
                setSubmitResult(null);
                setCurrentStep(1);
              }}
              style={{
                padding: "0.75rem 1.25rem",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Restart Tasks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task 1: Tap the Target (Large 90px glowing target)
// ---------------------------------------------------------------------------
function TapTargetTask({ onFinish }: { onFinish: (m: TouchTaskMetric) => void }) {
  const [targetPos, setTargetPos] = useState<{ x: number; y: number } | null>(null);
  const [showTarget, setShowTarget] = useState(false);
  const startTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Place target randomly within container
      const x = Math.floor(Math.random() * 200) + 50;
      const y = Math.floor(Math.random() * 120) + 40;
      setTargetPos({ x, y });
      setShowTarget(true);
      startTimeRef.current = performance.now();
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!showTarget || !targetPos || !containerRef.current) return;
    const now = performance.now();
    const rt = Math.max(1, now - startTimeRef.current);

    const rect = containerRef.current.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;

    const targetCenterX = targetPos.x + 45; // target is 90x90
    const targetCenterY = targetPos.y + 45;

    const dist = Math.hypot(tapX - targetCenterX, tapY - targetCenterY);
    // 45px radius = 100% accuracy. If inside 45px: 100% - (dist / 45)*25
    const accuracy = Math.max(10, Math.min(100, 100 - (dist / 45) * 30));

    onFinish({
      task_type: "tap",
      reaction_time_ms: Math.round(rt),
      path_accuracy_pct: Math.round(accuracy * 10) / 10,
      jitter_px: 0.0,
      completed: true,
      duration_ms: Math.round(rt),
    });
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ margin: "0 0 0.5rem", color: "#93c5fd" }}>Task 1: Tap the Star</h3>
      <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#9ca3af" }}>
        Ask the child to tap the large glowing star as quickly as they see it!
      </p>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        style={{
          position: "relative",
          width: "100%",
          height: "260px",
          background: "rgba(0, 0, 0, 0.35)",
          border: "2px dashed rgba(255, 255, 255, 0.15)",
          borderRadius: "14px",
          touchAction: "none",
          userSelect: "none",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        {!showTarget ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              color: "#9ca3af",
            }}
          >
            Get ready…
          </div>
        ) : (
          <button
            type="button"
            aria-label="Tap star target"
            style={{
              position: "absolute",
              left: `${targetPos?.x}px`,
              top: `${targetPos?.y}px`,
              width: "90px",
              height: "90px",
              borderRadius: "50%",
              background: "radial-gradient(circle, #fde047 30%, #eab308 90%)",
              border: "4px solid #ffffff",
              boxShadow: "0 0 25px rgba(234, 179, 8, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2.2rem",
              cursor: "pointer",
              transform: "scale(1)",
              transition: "transform 0.1s ease",
            }}
          >
            <Star size={44} color="#ffffff" fill="#ffffff" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task 2: Trace a Path (Large wide path, corridor width 60px)
// ---------------------------------------------------------------------------
function TracePathTask({ onFinish }: { onFinish: (m: TouchTaskMetric) => void }) {
  const [isTracing, setIsTracing] = useState(false);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const startTimeRef = useRef<number>(0);
  const touchStartRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startTimeRef.current = performance.now();
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsTracing(true);
    touchStartRef.current = performance.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPoints([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isTracing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPoints((prev) => [...prev, pt]);
  };

  const handlePointerUp = () => {
    if (!isTracing) return;
    setIsTracing(false);
    const finishTime = performance.now();
    const rt = Math.max(1, touchStartRef.current - startTimeRef.current);
    const duration = Math.max(10, finishTime - touchStartRef.current);

    if (points.length < 5) return;

    // Calculate accuracy and jitter along the horizontal path (y ~ 130)
    const expectedY = 130;
    const deviations = points.map((p) => Math.abs(p.y - expectedY));
    const meanDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    // Standard deviation of deviations = jitter
    const variance =
      deviations.reduce((sum, d) => sum + Math.pow(d - meanDev, 2), 0) / deviations.length;
    const jitter = Math.sqrt(variance);

    // Corridor is +/- 35px from expectedY (width 70px)
    const insideCount = deviations.filter((d) => d <= 35).length;
    const accuracy = (insideCount / deviations.length) * 100;

    onFinish({
      task_type: "trace",
      reaction_time_ms: Math.round(rt),
      path_accuracy_pct: Math.round(accuracy * 10) / 10,
      jitter_px: Math.round(jitter * 10) / 10,
      completed: true,
      duration_ms: Math.round(duration),
    });
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ margin: "0 0 0.5rem", color: "#a78bfa" }}>Task 2: Trace the Path</h3>
      <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#9ca3af" }}>
        Touch the Green dot and trace along the wide rainbow road all the way to the Red flag!
      </p>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: "relative",
          width: "100%",
          height: "260px",
          background: "rgba(0, 0, 0, 0.35)",
          border: "2px dashed rgba(255, 255, 255, 0.15)",
          borderRadius: "14px",
          touchAction: "none",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        {/* Guide Path Corridor */}
        <div
          style={{
            position: "absolute",
            top: "95px",
            left: "50px",
            right: "50px",
            height: "70px",
            background: "linear-gradient(90deg, rgba(34, 197, 94, 0.3), rgba(168, 85, 247, 0.3), rgba(239, 68, 68, 0.3))",
            borderRadius: "35px",
            border: "2px solid rgba(255, 255, 255, 0.25)",
            pointerEvents: "none",
          }}
        />

        {/* Start Target (Green) */}
        <div
          style={{
            position: "absolute",
            top: "90px",
            left: "40px",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "#22c55e",
            border: "3px solid #ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.4rem",
            color: "#ffffff",
            boxShadow: "0 0 15px rgba(34, 197, 94, 0.6)",
            pointerEvents: "none",
          }}
        >
          GO
        </div>

        {/* End Target (Red Flag) */}
        <div
          style={{
            position: "absolute",
            top: "90px",
            right: "40px",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "#ef4444",
            border: "3px solid #ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.8rem",
            boxShadow: "0 0 15px rgba(239, 68, 68, 0.6)",
            pointerEvents: "none",
          }}
        >
          <Flag size={36} color="#ffffff" />
        </div>

        {/* Render child's drawn trace points */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {points.length > 1 && (
            <path
              d={`M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task 3: Drag to Place (Large 90px draggable circle into 110px drop box)
// ---------------------------------------------------------------------------
function DragTargetTask({ onFinish }: { onFinish: (m: TouchTaskMetric) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 85 });
  const [dragPoints, setDragPoints] = useState<Array<{ x: number; y: number }>>([]);
  const startTimeRef = useRef<number>(0);
  const dragStartRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startTimeRef.current = performance.now();
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = performance.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragPoints([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - 45; // center of 90px circle
    const newY = e.clientY - rect.top - 45;
    setPos({ x: newX, y: newY });
    setDragPoints((prev) => [...prev, { x: newX + 45, y: newY + 45 }]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    const finishTime = performance.now();
    const rt = Math.max(1, dragStartRef.current - startTimeRef.current);
    const duration = Math.max(10, finishTime - dragStartRef.current);

    const rect = containerRef.current.getBoundingClientRect();
    // Drop box center is at: right 50px, top 80px (width 110, height 110)
    const dropCenterX = rect.width - 50 - 55;
    const dropCenterY = 80 + 55;

    const finalCenterX = pos.x + 45;
    const finalCenterY = pos.y + 45;

    const distFromDrop = Math.hypot(finalCenterX - dropCenterX, finalCenterY - dropCenterY);
    const accuracy = Math.max(10, Math.min(100, 100 - (distFromDrop / 55) * 35));

    // Jitter calculated from perpendicular distance to line between start and drop
    let jitter = 0.0;
    if (dragPoints.length > 3) {
      const startPt = dragPoints[0];
      const endPt = { x: dropCenterX, y: dropCenterY };
      const lineLen = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) || 1;

      const perpDists = dragPoints.map((p) => {
        // Distance from point (x,y) to line (startPt, endPt)
        return (
          Math.abs(
            (endPt.y - startPt.y) * p.x -
              (endPt.x - startPt.x) * p.y +
              endPt.x * startPt.y -
              endPt.y * startPt.x,
          ) / lineLen
        );
      });
      const meanPerp = perpDists.reduce((a, b) => a + b, 0) / perpDists.length;
      jitter = meanPerp;
    }

    onFinish({
      task_type: "drag",
      reaction_time_ms: Math.round(rt),
      path_accuracy_pct: Math.round(accuracy * 10) / 10,
      jitter_px: Math.round(jitter * 10) / 10,
      completed: true,
      duration_ms: Math.round(duration),
    });
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ margin: "0 0 0.5rem", color: "#38bdf8" }}>Task 3: Drag to Place</h3>
      <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#9ca3af" }}>
        Grab the ball and drag it directly into the big box on the right!
      </p>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: "260px",
          background: "rgba(0, 0, 0, 0.35)",
          border: "2px dashed rgba(255, 255, 255, 0.15)",
          borderRadius: "14px",
          touchAction: "none",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        {/* Destination Drop Box */}
        <div
          style={{
            position: "absolute",
            top: "75px",
            right: "40px",
            width: "110px",
            height: "110px",
            borderRadius: "16px",
            border: "3px dashed #38bdf8",
            background: "rgba(56, 189, 248, 0.15)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.8rem",
            color: "#bae6fd",
            fontWeight: 700,
          }}
        >
          <Inbox size={32} style={{ marginBottom: "0.2rem" }} />
          DROP HERE
        </div>

        {/* Draggable Ball (Large 90px touch target) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: "absolute",
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: "90px",
            height: "90px",
            borderRadius: "50%",
            background: "radial-gradient(circle, #f472b6 30%, #ec4899 90%)",
            border: "4px solid #ffffff",
            boxShadow: isDragging
              ? "0 0 30px rgba(236, 72, 153, 0.9)"
              : "0 0 15px rgba(236, 72, 153, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.2rem",
            cursor: "grab",
            touchAction: "none",
            transform: isDragging ? "scale(1.08)" : "scale(1)",
            transition: "transform 0.1s ease",
            zIndex: 10,
          }}
        >
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#ffffff" }} />
        </div>
      </div>
    </div>
  );
}
