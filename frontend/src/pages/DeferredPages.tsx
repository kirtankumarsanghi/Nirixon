import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ComingSoon } from "../components/ComingSoon";
import { PageNav } from "../components/PageNav";
import {
  clearCheckInHistory,
  formatFamilyShareText,
  getLatestCheckIn,
  loadCheckInHistory,
  type CheckInSnapshot,
} from "../lib/checkInHistory";
import {
  concernLevelLabel,
  DOMAIN_GUIDES,
  getDomainGuide,
} from "../lib/domainConcern";
import {
  isGrowthSyncOptedIn,
  setGrowthSyncOptIn,
  getPseudonymousChildId,
  clearGrowthSyncOptIn,
  getGrowthAnalysis,
  syncLocalHistoryToServer,
  deleteChildGrowthData,
  exportChildGrowthData,
  type GrowthAnalysis,
  type PlateauInterval,
} from "../lib/growthSync";
import { useToast } from "../toast/Toast";
import { api, shareApi } from "../api/client";
import type {
  LiveTaskDefinition,
  JointInvitesListResponse,
  JointMergeResponse,
  JointDisagreementPayload,
  SessionStateResponse,
} from "../api/types";
import { LiveTaskCard } from "../components/LiveTaskCard";
import { TouchCanvasSuite } from "../components/TouchCanvasSuite";
import { loadSessionId } from "../lib/sessionStorage";

function DeferredLinks() {
  return (
    <nav className="deferred-links" aria-label="Deferred features">
      <p className="eyebrow">Also planned</p>
      <ul>
        <li>
          <Link to="/deferred/clinician-sandbox">ClinicianSandbox</Link>
        </li>
        <li>
          <Link to="/deferred/what-if">WhatIfSimulator</Link>
        </li>
        <li>
          <Link to="/deferred/joint-family">JointFamilyInvite</Link>
        </li>
        <li>
          <Link to="/deferred/velocity">VelocityTracker</Link>
        </li>
        <li>
          <Link to="/deferred/live-elicitation">LiveElicitationTask</Link>
        </li>
        <li>
          <Link to="/deferred/touch-micro">TouchMicroTask</Link>
        </li>
      </ul>
    </nav>
  );
}

function ComingSoonBelow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="feature-page__soon">
      <ComingSoon embedded title={title} description={description} />
      <DeferredLinks />
    </div>
  );
}

function GrowthConsentModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="modal-backdrop"
    >
      <div className="modal-panel">
        <p className="eyebrow">Opt-in privacy consent</p>
        <h2 id="consent-title" className="display" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)" }}>
          Enable synced growth tracking
        </h2>
        <p className="lede">
          By default, all your child’s check-ins stay entirely on this device.
          You can optionally enable cross-visit velocity tracking to detect developmental
          plateaus over time.
        </p>

        <div className="modal-panel__body">
          <p className="modal-panel__ok">
            What IS stored on the server:
          </p>
          <ul>
            <li>A randomly generated pseudonymous Child ID (e.g. <code>child-98f2...</code>)</li>
            <li>Age bracket or birth cohort year/month (no exact birthdate)</li>
            <li>Check-in visit dates</li>
            <li>Domain scores and recommendation tier (Typical / Monitor / Refer)</li>
            <li>Computed developmental age vs chronological age</li>
          </ul>

          <p className="modal-panel__no">
            What is NEVER stored on the server:
          </p>
          <ul>
            <li>NO child name or parent name</li>
            <li>NO phone numbers, emails, or account credentials</li>
            <li>NO address, city, or pincode</li>
            <li>NO free-text notes or parental observations</li>
          </ul>
        </div>

        <p className="joint-muted" style={{ marginBottom: "1.5rem" }}>
          <strong>Your rights:</strong> You can export the complete data file at any time,
          or permanently delete all server data with one click to revert back to local-only mode.
        </p>

        <div className="modal-panel__actions">
          <button
            type="button"
            id="growth-consent-cancel"
            data-testid="growth-consent-cancel"
            className="btn btn--ghost"
            onClick={onCancel}
          >
            Cancel (Keep on-device)
          </button>
          <button
            type="button"
            id="growth-consent-confirm"
            data-testid="growth-consent-confirm"
            className="btn btn--primary"
            onClick={onConfirm}
          >
            I consent — Enable Synced Tracking
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncedGrowthCurve({
  trajectory,
  plateauDetected,
}: {
  trajectory: Array<{
    chronological_age: number;
    developmental_age: number;
    visit_date: string;
    tier: string;
  }>;
  plateauDetected: boolean;
}) {
  if (trajectory.length === 0) return null;

  const pts = trajectory.map((t) => [t.chronological_age, t.developmental_age] as [number, number]);
  const minAge = Math.max(0, Math.min(...pts.map((p) => p[0])) - 2);
  const maxAge = Math.max(36, Math.max(...pts.map((p) => p[0])) + 4);

  const W = 620, H = 280, P = 40;
  const x = (v: number) => P + ((v - minAge) / Math.max(1, maxAge - minAge)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - minAge) / Math.max(1, maxAge - minAge)) * (H - P * 2);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0])},${y(p[1])}`).join(" ");
  const tone = plateauDetected ? "#b04f1f" : "#2f7a5c";

  return (
    <div className="intake-section" style={{ margin: "1.5rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>Developmental Age vs Chronological Age (months)</p>
        <span className="badge" style={{ color: tone, background: plateauDetected ? "rgba(176,79,31,0.12)" : "rgba(47,122,92,0.12)" }}>
          {plateauDetected ? "Plateau flagged (< 0.5x velocity)" : "Keeping pace (>= 0.5x velocity)"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", overflow: "visible" }} aria-label="Developmental growth velocity curve">
        {/* Reference expected pace diagonal line (y = x) */}
        <line x1={x(minAge)} y1={y(minAge)} x2={x(maxAge)} y2={y(maxAge)} stroke="#777" strokeDasharray="4 4" strokeWidth="1.5" />
        <text x={x(maxAge)} y={y(maxAge) - 6} textAnchor="end" fill="#888" fontSize="10">Expected Pace (1.0x)</text>

        {/* Real trajectory line */}
        {pts.length > 1 && (
          <path d={line} fill="none" stroke={tone} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Visit points */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(p[0])} cy={y(p[1])} r="6" fill="#fff" stroke={tone} strokeWidth="3" />
            <text x={x(p[0])} y={y(p[1]) - 10} textAnchor="middle" fill="#ddd" fontSize="10" fontWeight="bold">
              V{i + 1} ({p[0]}m / {p[1]}m)
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function GrowthPage() {
  const history = loadCheckInHistory();
  const { push } = useToast();

  const [optedIn, setOptedIn] = useState(() => isGrowthSyncOptedIn());
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [childId] = useState(() => getPseudonymousChildId());
  const [analysis, setAnalysis] = useState<GrowthAnalysis | null>(null);
  const [, setLoading] = useState(false);

  useEffect(() => {
    if (optedIn) {
      loadAnalysis();
    }
  }, [optedIn, childId]);

  async function loadAnalysis() {
    setLoading(true);
    try {
      const res = await getGrowthAnalysis(childId);
      setAnalysis(res);
    } catch {
      // Degrade gracefully if server sync is disabled or child has no server records yet
    } finally {
      setLoading(false);
    }
  }

  async function handleOptInConsent() {
    setGrowthSyncOptIn(true);
    setOptedIn(true);
    setShowConsentModal(false);
    push("Opt-in consent confirmed. Uploading pseudonymous visits...", "info");
    try {
      const syncRes = await syncLocalHistoryToServer(childId);
      push(`Synced ${syncRes.synced_count} visits under pseudonymous ID ${childId.slice(0, 12)}...`, "success");
      await loadAnalysis();
    } catch (err) {
      push(err instanceof Error ? err.message : "Sync failed", "error");
    }
  }

  async function handleSyncNow() {
    push("Syncing check-ins...", "info");
    try {
      const syncRes = await syncLocalHistoryToServer(childId);
      push(`Synced ${syncRes.synced_count} check-ins.`, "success");
      await loadAnalysis();
    } catch (err) {
      push(err instanceof Error ? err.message : "Sync failed", "error");
    }
  }

  async function handleExport() {
    try {
      const data = await exportChildGrowthData(childId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nirixon-growth-export-${childId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      push("Export downloaded successfully.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Export failed", "error");
    }
  }

  async function handleDeleteServerData() {
    if (!window.confirm("Are you sure? This permanently deletes all visit and velocity data for this child from the server. Local device history will remain.")) {
      return;
    }
    try {
      const res = await deleteChildGrowthData(childId);
      clearGrowthSyncOptIn();
      setOptedIn(false);
      setAnalysis(null);
      push(res.message, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Deletion failed", "error");
    }
  }

  return (
    <div className="feature-page">
      <PageNav current="/growth" />

      {/* Sync Status & Opt-in Banner */}
      <div
        style={{
          margin: "0 0 1.5rem",
          padding: "1rem 1.25rem",
          borderRadius: "12px",
          background: optedIn ? "rgba(74, 222, 128, 0.1)" : "rgba(217, 119, 6, 0.1)",
          border: `1px solid ${optedIn ? "rgba(74, 222, 128, 0.3)" : "rgba(217, 119, 6, 0.3)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem" }}>
            {optedIn ? "Cloud Sync Active (Opt-In)" : "Mode: On-Device Only (Local Storage)"}
          </p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", opacity: 0.85 }}>
            {optedIn
              ? `Pseudonymous ID: ${childId} · Zero names or free text stored.`
              : "Check-ins remain on this browser only. Cloud sync with plateau detection is optional."}
          </p>
        </div>
        <div>
          {optedIn ? (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                id="sync-now-btn"
                data-testid="sync-now-btn"
                className="btn btn--secondary"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
                onClick={handleSyncNow}
              >
                Sync now
              </button>
              <button
                type="button"
                id="export-growth-btn"
                data-testid="export-growth-btn"
                className="btn btn--ghost"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
                onClick={handleExport}
              >
                Export data (JSON)
              </button>
              <button
                type="button"
                id="delete-growth-btn"
                data-testid="delete-growth-btn"
                className="btn btn--ghost"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", color: "#b04f1f" }}
                onClick={handleDeleteServerData}
              >
                Delete server data
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="enable-sync-btn"
              data-testid="enable-sync-btn"
              className="btn btn--primary"
              style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
              onClick={() => setShowConsentModal(true)}
            >
              Enable optional cloud sync
            </button>
          )}
        </div>
      </div>

      {showConsentModal && (
        <GrowthConsentModal
          onConfirm={handleOptInConsent}
          onCancel={() => setShowConsentModal(false)}
        />
      )}

      {/* Plateau Rule Alert Banner (when opted in & plateau detected) */}
      {optedIn && analysis?.is_plateau_detected && (
        <aside
          role="alert"
          style={{
            margin: "0 0 1.5rem",
            padding: "1rem 1.25rem",
            background: "rgba(224, 108, 117, 0.15)",
            border: "2px solid #e06c75",
            borderRadius: "12px",
          }}
        >
          <p style={{ margin: "0 0 0.4rem", fontWeight: 800, color: "#b04f1f", fontSize: "1rem" }}>
            Developmental Plateau Flagged
          </p>
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
            {analysis.plateau_summary}
          </p>
          {analysis.intervals.filter((i: PlateauInterval) => i.is_plateau).map((i: PlateauInterval) => (
            <p key={i.visit_index} style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", opacity: 0.9 }}>
              • {i.message}
            </p>
          ))}
        </aside>
      )}

      {/* Growth Curve Chart */}
      {optedIn && analysis && analysis.trajectory.length > 0 && (
        <SyncedGrowthCurve
          trajectory={analysis.trajectory}
          plateauDetected={analysis.is_plateau_detected}
        />
      )}

      {history.length === 0 ? (
        <section aria-labelledby="growth-title">
          <p className="eyebrow">Growth trends</p>
          <h1 id="growth-title" className="display">
            No check-ins saved on this device yet
          </h1>
          <p className="lede">
            After you finish a screening, this page shows how overall
            recommendations and developmental areas change across visits — using
            real results stored only in this browser (not a cloud child profile).
          </p>
          <Link className="btn btn--primary" to="/screen">
            Start a check-in
          </Link>
        </section>
      ) : (
        <section aria-labelledby="growth-title">
          <p className="eyebrow">Growth trends</p>
          <h1 id="growth-title" className="display">
            Your check-ins over time
          </h1>
          <p className="lede">
            {history.length} completed check-in
            {history.length === 1 ? "" : "s"} saved on this device. These come
            from your real screening results — not sample data.
          </p>

          <ol className="growth-timeline" aria-label="Check-in timeline">
            {[...history].reverse().map((entry) => (
              <li key={entry.id} className="growth-timeline__item">
                <div className="growth-timeline__when">
                  {new Date(entry.savedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="growth-timeline__body">
                  <p className="growth-timeline__class">
                    <strong>{entry.final_classification}</strong>
                    {entry.childRef ? ` · ${entry.childRef}` : ""}
                    {` · ${entry.correctedAgeMonths} mo`}
                    {entry.module === "B" ? " · school-age" : ""}
                  </p>
                  {entry.safety_override_triggered ? (
                    <p className="growth-timeline__flag">
                      Protective referral rule applied
                    </p>
                  ) : null}
                  <ul className="growth-timeline__domains">
                    {entry.domains.slice(0, 6).map((d) => (
                      <li
                        key={d.domain}
                        className={`growth-chip growth-chip--${d.level}`}
                      >
                        {(getDomainGuide(d.domain)?.everydayName ?? d.label) +
                          ": " +
                          concernLevelLabel(d.level)}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          {history.length >= 2 ? (
            <DomainShiftSummary newer={history[0]!} older={history[1]!} />
          ) : (
            <p className="feature-page__note">
              Complete another check-in later to compare how areas change between
              visits.
            </p>
          )}

          <div className="feature-page__actions">
            <Link className="btn btn--secondary" to="/screen">
              New check-in
            </Link>
            <Link className="btn btn--ghost" to="/share">
              Family sharing
            </Link>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                clearCheckInHistory();
                push("Cleared check-in history on this device.", "info");
                window.location.reload();
              }}
            >
              Clear device history
            </button>
          </div>
        </section>
      )}

      {/* Privacy Architecture Summary */}
      <section
        style={{
          marginTop: "3rem",
          padding: "1.5rem",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          fontSize: "0.85rem",
          lineHeight: 1.6,
          opacity: 0.85,
        }}
      >
        <p style={{ fontWeight: 700, margin: "0 0 0.35rem" }}>Privacy Architecture</p>
        <p style={{ margin: "0 0 0.5rem" }}>
          Default stays 100% on-device. Synced tracking is strictly opt-in and stores only a random pseudonymous
          child ID, coarse birth month/year, visit date, domain scores, and triage recommendation. Zero names, zero contact info,
          and zero free-text clinical notes are stored. Parents can export or permanently delete all server data with one click.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Community Health Worker (ASHA / Anganwadi / ANM) Referral System:</strong> 100% opt-in with explicit caregiver consent recorded.
          Child records use pseudonymous identifiers and are strictly partitioned by village/ward—a worker can only view children in their own area.
          Referral summaries (printable PDF or shareable text) contain strictly the minimum necessary indicators (age bracket, tier, domains of concern, safety rule trigger)
          with zero personal identifiers. All records and referrals are permanently removable at any time.
        </p>
        <p style={{ margin: "0.5rem 0 0" }}>
          <strong>Offline Browser Storage & Device Data Lifecycle:</strong> For frontline workers operating in remote villages with intermittent or no connectivity,
          Nirixon utilizes Progressive Web App (PWA) client-side storage (IndexedDB `nirixon_chw_offline_db` and Service Worker cache) to record offline field screenings,
          door-to-door visits, and clinical referrals with client-generated UUID idempotency keys. All offline records remain strictly pseudonymous.
          When network connectivity is restored, records synchronize idempotently with automated conflict handling. To protect child privacy on shared Anganwadi/ASHA mobile tablets,
          all local browser storage and cached sync queues are automatically and permanently purged upon logout or manual device reset.
        </p>
      </section>
    </div>
  );
}

function DomainShiftSummary({
  newer,
  older,
}: {
  newer: CheckInSnapshot;
  older: CheckInSnapshot;
}) {
  const shifts = newer.domains.flatMap((n) => {
    const prev = older.domains.find((o) => o.domain === n.domain);
    if (!prev || prev.level === n.level) return [];
    return [
      {
        domain: n.domain,
        label: n.label,
        from: prev.level,
        to: n.level,
      },
    ];
  });

  return (
    <aside className="growth-shift" aria-labelledby="shift-title">
      <h2 id="shift-title" className="h-sm">
        Changes since the previous check-in
      </h2>
      {shifts.length === 0 ? (
        <p>
          Area highlights look similar to your previous check-in on this device.
        </p>
      ) : (
        <ul>
          {shifts.map((s) => (
            <li key={s.domain}>
              <strong>
                {DOMAIN_GUIDES[s.domain]?.everydayName ?? s.label}
              </strong>
              : {concernLevelLabel(s.from)} → {concernLevelLabel(s.to)}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function SharePage() {
  const history = loadCheckInHistory();
  const [selectedId, setSelectedId] = useState(() => history[0]?.id ?? "");
  const selected =
    history.find((h) => h.id === selectedId) ?? getLatestCheckIn();
  const { push } = useToast();
  const text = selected ? formatFamilyShareText(selected) : "";
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(text);
      push("Summary copied — paste it into a message or email.", "success");
    } catch {
      push(
        "Could not copy automatically. Select the text below and copy it.",
        "error",
      );
    }
  }

  async function nativeShare() {
    if (!canNativeShare) {
      await copySummary();
      return;
    }
    try {
      await navigator.share({
        title: "Nirixon check-in summary",
        text,
      });
    } catch {
      // cancelled
    }
  }

  return (
    <div className="feature-page">
      <PageNav current="/share" />

      {!selected ? (
        <section aria-labelledby="share-title">
          <p className="eyebrow">Family sharing</p>
          <h1 id="share-title" className="display">
            Nothing to share yet
          </h1>
          <p className="lede">
            Finish a check-in first. You can then copy a plain-language summary
            for a co-parent, grandparent, or caregiver — built from that real
            result, with no automatic clinician inbox.
          </p>
          <Link className="btn btn--primary" to="/screen">
            Start a check-in
          </Link>
        </section>
      ) : (
        <section aria-labelledby="share-title">
          <p className="eyebrow">Family sharing</p>
          <h1 id="share-title" className="display">
            Share this check-in with family
          </h1>
          <p className="lede">
            Create a short, parent-friendly summary from a completed result on
            this device. Nothing is uploaded or emailed automatically.
          </p>

          {history.length > 1 ? (
            <label className="field">
              <span>Which check-in?</span>
              <select
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {new Date(h.savedAt).toLocaleDateString()} ·{" "}
                    {h.final_classification}
                    {h.childRef ? ` · ${h.childRef}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <pre className="share-preview" aria-label="Shareable summary text">
            {text}
          </pre>

          <div className="feature-page__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void copySummary()}
            >
              Copy summary
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void nativeShare()}
            >
              {canNativeShare ? "Share…" : "Copy again"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => window.print()}
            >
              Print
            </button>
            <Link className="btn btn--ghost" to="/growth">
              Growth trends
            </Link>
          </div>
        </section>
      )}

      <ComingSoonBelow
        title="Expiring share codes & joint family invite"
        description="Backend share codes and automatic clinician inbox are not available yet. When built, sharing is planned as a short-lived, expiring code — not a persistent child profile. Copy/share above works from results already on this device."
      />
    </div>
  );
}

export function SandboxPage() {
  const latest = getLatestCheckIn();
  const [concordance, setConcordance] = useState<JointMergeResponse | null>(null);

  useEffect(() => {
    const sid = loadSessionId();
    if (sid) {
      shareApi.getConcordance(sid).then(setConcordance).catch(() => {});
    }
  }, []);

  return (
    <div className="feature-page">
      <PageNav current="/sandbox" />

      {!latest ? (
        <section aria-labelledby="clinician-title">
          <p className="eyebrow">Clinician tools</p>
          <h1 id="clinician-title" className="display">
            No result available yet
          </h1>
          <p className="lede">
            After a check-in completes, this page shows technical detail from
            that real result for discussion with a clinician — probabilities,
            model name, and top contributing features.
          </p>
          <Link className="btn btn--primary" to="/screen">
            Start a check-in
          </Link>
        </section>
      ) : (
        <section aria-labelledby="clinician-title">
          <p className="eyebrow">Clinician tools</p>
          <h1 id="clinician-title" className="display">
            Last check-in — clinician view
          </h1>
          <p className="lede">
            Drawn from the most recent completed screening on this device (
            {new Date(latest.savedAt).toLocaleString()}). Intended for a visit
            with a paediatrician — not a substitute for clinical judgment.
          </p>

          <dl className="clinician-meta">
            <div>
              <dt>Parent-facing recommendation</dt>
              <dd>{latest.final_classification}</dd>
            </div>
            <div>
              <dt>Model classification</dt>
              <dd>{latest.clinician.ml_classification}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{latest.clinician.model_name ?? "—"}</dd>
            </div>
            <div>
              <dt>ML score</dt>
              <dd>{latest.clinician.ml_score.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{latest.correctedAgeMonths} months</dd>
            </div>
            <div>
              <dt>Safety override</dt>
              <dd>
                {latest.safety_override_triggered
                  ? `Yes${latest.override_rule ? ` (${latest.override_rule})` : ""}`
                  : "No"}
              </dd>
            </div>
          </dl>

          <h2 className="h-sm">Class probabilities</h2>
          <ul className="clinician-probs">
            {Object.entries(latest.clinician.probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([label, value]) => (
                <li key={label}>
                  <span>{label}</span>
                  <span className="clinician-probs__bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(value * 100)}%` }} />
                  </span>
                  <span>{Math.round(value * 100)}%</span>
                </li>
              ))}
          </ul>

          {latest.clinician.shap_top_features.length > 0 ? (
            <>
              <h2 className="h-sm">Top contributing features</h2>
              <p className="feature-page__note">
                Relative attribution from this session’s answers. Not per-domain
                diagnoses.
              </p>
              <ClinicianShapList features={latest.clinician.shap_top_features} />
            </>
          ) : (
            <p className="feature-page__note">
              No feature attributions were returned for this check-in.
            </p>
          )}

          <h2 className="h-sm">Parent area highlights</h2>
          <ul className="clinician-domains">
            {latest.domains.map((d) => (
              <li key={d.domain}>
                {d.label}: {concernLevelLabel(d.level)}
              </li>
            ))}
          </ul>

          {/* Direct Observation confirmation if any items were observed */}
          {latest.answer_sources &&
            Object.values(latest.answer_sources).some((s) => s === "observed") && (
              <div
                style={{
                  margin: "1.25rem 0",
                  padding: "0.85rem 1rem",
                  background: "rgba(34, 197, 94, 0.12)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  color: "#86efac",
                }}
              >
                <strong>Direct Observation Verified:</strong> One or more developmental
                milestones in this session were verified via standardized direct observation (
                <code>source=&quot;observed&quot;</code>) rather than parent recall alone.
              </div>
            )}

          {/* Quantitative Exploratory Touch Telemetry (Module A, 24m+) */}
          {latest.touch_telemetry && latest.touch_telemetry.length > 0 && (
            <div
              style={{
                margin: "1.5rem 0",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <h2 className="h-sm" style={{ margin: 0, fontSize: "1.1rem" }}>
                  Quantitative Touch Motor Telemetry
                </h2>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    background: "rgba(234, 179, 8, 0.2)",
                    color: "#8a5f10",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                  }}
                >
                  Exploratory, not used in the result
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#9ca3af", margin: "0 0 1rem" }}>
                Provisional motor telemetry (reaction time, path accuracy, jitter).
                As required by clinical protocol, these metrics are <strong>NOT</strong> fed into
                the AI model or safety rules. Reference ranges are provisional.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {latest.touch_telemetry.map((m) => (
                  <div
                    key={m.task_type}
                    style={{
                      background: "rgba(33, 23, 9, 0.04)",
                      borderRadius: "8px",
                      padding: "0.85rem",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 0.4rem",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        color: "#60a5fa",
                        textTransform: "capitalize",
                      }}
                    >
                      {m.task_type} Task
                    </p>
                    <div style={{ fontSize: "0.8rem", lineHeight: 1.6, color: "#e5e7eb" }}>
                      <div>Reaction Time: <strong>{Math.round(m.reaction_time_ms)} ms</strong></div>
                      <div>Path Accuracy: <strong>{m.path_accuracy_pct.toFixed(1)}%</strong></div>
                      <div>Motor Jitter: <strong>{m.jitter_px.toFixed(1)} px</strong></div>
                    </div>
                    <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#9ca3af" }}>
                      Provisional Reference (24–36m)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Joint Family Concordance & Caregiver Disagreements */}
          {concordance && concordance.respondent_count > 0 && (
            <div
              style={{
                margin: "1.5rem 0",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "12px",
                padding: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <h2 className="h-sm" style={{ margin: 0, fontSize: "1.1rem" }}>
                  Multi-Caregiver Concordance & Disagreements
                </h2>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    background:
                      concordance.overall_concordance >= 0.75
                        ? "rgba(34, 197, 94, 0.2)"
                        : "rgba(245, 158, 11, 0.2)",
                    color:
                      concordance.overall_concordance >= 0.75
                        ? "#86efac"
                        : "#fbbf24",
                    border:
                      concordance.overall_concordance >= 0.75
                        ? "1px solid rgba(34, 197, 94, 0.3)"
                        : "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  {concordance.concordance_level} ({Math.round(concordance.overall_concordance * 100)}%)
                </span>
              </div>

              <p style={{ fontSize: "0.85rem", color: "#9ca3af", margin: "0 0 1rem" }}>
                Combination Rule: Primary caregiver answers feed the statistical ML model (
                <strong>{concordance.ml_classification}</strong>). The most concerning answer across all respondents
                feeds the safety rule (
                <strong>{concordance.final_classification}</strong>).
              </p>

              {concordance.safety_override_triggered && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    borderRadius: "8px",
                    padding: "0.85rem 1rem",
                    marginBottom: "1rem",
                    fontSize: "0.85rem",
                    color: "#b04f1f",
                  }}
                >
                  <strong>Critical Safety Floor Triggered:</strong> A secondary respondent (
                  {concordance.safety_source}) reported safety concern:{" "}
                  <code>{concordance.override_rule}</code>. Triaged to Refer regardless of primary ML score.
                </div>
              )}

              <dl className="clinician-meta" style={{ marginBottom: "1rem" }}>
                <div>
                  <dt>Secondary Respondents</dt>
                  <dd>{concordance.roles.join(", ") || `${concordance.respondent_count} observer(s)`}</dd>
                </div>
                <div>
                  <dt>Exact Item Agreement</dt>
                  <dd>{concordance.exact_agreement_pct}%</dd>
                </div>
                <div>
                  <dt>Disagreements</dt>
                  <dd>{concordance.disagreements.length} item(s)</dd>
                </div>
                <div>
                  <dt>Evaluated Overlap</dt>
                  <dd>{concordance.total_overlapping_items} items</dd>
                </div>
              </dl>

              {concordance.disagreements.length > 0 ? (
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "1rem 0 0.5rem", color: "#211709" }}>
                    Divergent Items & Clinical Inquiries:
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {concordance.disagreements.map((d) => (
                      <div
                        key={d.item_id}
                        style={{
                          background: "rgba(33, 23, 9, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "8px",
                          padding: "0.85rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", flexWrap: "wrap", gap: "0.25rem" }}>
                          <span style={{ fontWeight: 600, color: "#60a5fa" }}>{d.item_id} ({d.domain})</span>
                          <span style={{ color: "#b04f1f", fontSize: "0.75rem" }}>
                            Most concerning: {d.most_concerning_role} (score {d.most_concerning_answer})
                          </span>
                        </div>
                        <p style={{ margin: "0 0 0.5rem", color: "#e5e7eb" }}>{d.question_text}</p>
                        <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
                          Primary answer: <strong>{d.primary_answer}</strong> | Secondary answers:{" "}
                          <strong>
                            {d.respondent_answers.map((r) => `${r.role_label}: ${r.answer}`).join(", ")}
                          </strong>
                        </div>
                        <div
                          style={{
                            background: "rgba(245, 158, 11, 0.1)",
                            borderLeft: "3px solid #f59e0b",
                            padding: "0.5rem 0.75rem",
                            borderRadius: "4px",
                            color: "#8a5f10",
                            fontSize: "0.8rem",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Clinician Follow-up:</strong> {d.follow_up_prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#86efac", margin: 0 }}>
                  ✓ Perfect agreement across all caregivers on overlapping items.
                </p>
              )}
            </div>
          )}

          <div className="feature-page__actions">
            <Link className="btn btn--primary" to="/deferred/what-if">
              What-If simulator
            </Link>
            <Link className="btn btn--secondary" to="/sandbox">
              Clinician tools
            </Link>
            <Link className="btn btn--ghost" to="/share">
              Family sharing
            </Link>
            <Link className="btn btn--ghost" to="/growth">
              Growth trends
            </Link>
          </div>
        </section>
      )}

      <ComingSoonBelow
        title="What-if simulator & clinician sandbox"
        description="Interactive answer simulation and internal sandbox APIs are not wired for parents yet. The clinician view above uses the latest real check-in on this device only."
      />
    </div>
  );
}

function ClinicianShapList({
  features,
}: {
  features: CheckInSnapshot["clinician"]["shap_top_features"];
}) {
  const maxAbs =
    Math.max(...features.map((f) => Math.abs(f.shap_value)), 0.0001) || 0.0001;
  return (
    <ul className="clinician-shap">
      {features.slice(0, 8).map((f) => (
        <li key={f.feature}>
          <code>{f.feature}</code>
          <span className="clinician-shap__bar" aria-hidden="true">
            <span
              style={{
                width: `${Math.round((Math.abs(f.shap_value) / maxAbs) * 100)}%`,
              }}
            />
          </span>
          <span>{f.shap_value.toFixed(3)}</span>
        </li>
      ))}
    </ul>
  );
}

function DeferredStub({
  title,
  description,
  backTo,
  backLabel,
}: {
  title: string;
  description?: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="feature-page">
      <PageNav backTo={backTo} backLabel={backLabel} preferHistoryBack />
      <ComingSoon title={title} description={description} />
      <div className="feature-page__actions">
        <Link className="btn btn--secondary" to={backTo}>
          {backLabel}
        </Link>
        <Link className="btn btn--ghost" to="/screen">
          Screening
        </Link>
      </div>
    </div>
  );
}

export function ClinicianSandbox() {
  return (
    <DeferredStub
      title="Clinician sandbox"
      description="Interactive sandbox simulation is not available yet. See Clinician tools for the latest real result detail."
      backTo="/sandbox"
      backLabel="Back to Clinician tools"
    />
  );
}

export { WhatIfSimulator } from "./WhatIfSimulator";

export function JointFamilyInvite() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionStateResponse | null>(null);
  const [invitesData, setInvitesData] = useState<JointInvitesListResponse | null>(null);
  const [concordance, setConcordance] = useState<JointMergeResponse | null>(null);
  const [rolePreset, setRolePreset] = useState<string>("Father / Co-Parent");
  const [customRole, setCustomRole] = useState<string>("");
  const [expiresHours, setExpiresHours] = useState<number>(48);
  const [creating, setCreating] = useState<boolean>(false);
  const [merging, setMerging] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    const sid = loadSessionId();
    if (sid) {
      setSessionId(sid);
      api.getSession(sid).then(setSessionInfo).catch(() => {});
      refreshInvites(sid);
      shareApi.getConcordance(sid).then(setConcordance).catch(() => {});
    }
  }, []);

  const refreshInvites = async (sid: string) => {
    try {
      const data = await shareApi.listInvites(sid);
      setInvitesData(data);
    } catch {
      // Ignored if session is fresh / not in DB yet
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      push("No active check-in session found. Please start a check-in first.", "error");
      return;
    }
    const finalRole = rolePreset === "Other Role" ? customRole.trim() : rolePreset;
    if (!finalRole) {
      push("Please specify a caregiver role label.", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await shareApi.createInvite(sessionId, {
        role_label: finalRole,
        expires_in_hours: expiresHours,
      });
      const fullUrl = `${window.location.origin}${res.invite_url}`;
      setNewInviteUrl(fullUrl);
      push(`Generated single-use invite link for: ${finalRole}`, "info");
      await refreshInvites(sessionId);
      if (rolePreset === "Other Role") setCustomRole("");
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to generate invite", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    push("Copied invite link to clipboard!", "info");
  };

  const handleRunMerge = async () => {
    if (!sessionId) return;
    setMerging(true);
    try {
      const data = await shareApi.merge(sessionId);
      setConcordance(data);
      if (data.safety_override_triggered) {
        push(
          `Concordance computed. Safety rule triggered by ${data.safety_source || "secondary respondent"} → Triaged to Refer.`,
          "error"
        );
      } else {
        push(`Concordance computed: ${Math.round(data.overall_concordance * 100)}% overall agreement.`, "info");
      }
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to compute concordance", "error");
    } finally {
      setMerging(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionId) return;
    if (
      !window.confirm(
        "Permanently delete this screening and all associated respondent answers? This will wipe all data for this check-in from the server."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await shareApi.deleteSession(sessionId);
      push("Screening session and all respondent answers were permanently deleted.", "info");
      setInvitesData(null);
      setConcordance(null);
      setNewInviteUrl(null);
      setSessionId(null);
      setSessionInfo(null);
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to delete screening data", "error");
    } finally {
      setDeleting(false);
    }
  };

  const activeInvitesCount = invitesData
    ? invitesData.invites.filter((i) => !i.is_used && !i.is_expired).length
    : 0;
  const completedCount = invitesData?.completed_respondents.length || 0;
  const totalSlotsUsed = activeInvitesCount + completedCount;
  const isLimitReached = totalSlotsUsed >= 3;

  return (
    <div className="feature-page">
      <PageNav backTo="/share" backLabel="Back to Family sharing" preferHistoryBack />
      <section aria-labelledby="joint-title">
        <p className="eyebrow">Triangulated Developmental Screening</p>
        <h1 id="joint-title" className="display">
          Joint Family & Multi-Caregiver Screening
        </h1>
        <p className="lede">
          Children behave differently with grandparents, fathers, mothers, and teachers.
          Invite up to 3 observers using private, single-use, expiring links. Each respondent
          answers independently without needing an account.
        </p>

        {/* Privacy & Combination Rule Explainer Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1.75rem",
            lineHeight: 1.6,
            fontSize: "0.88rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div>
              <p style={{ margin: "0 0 0.35rem", fontWeight: 700, color: "#38bdf8" }}>
                Zero Personal Data Exposed
              </p>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                The invite link gives the respondent access ONLY to questionnaire items.
                The child’s name, birthdate, medical history, and other answers are never exposed.
                Answers are stored under role labels (e.g. &quot;Grandmother&quot;) with NO personal names.
              </p>
            </div>
            <div>
              <p style={{ margin: "0 0 0.35rem", fontWeight: 700, color: "#8a5f10" }}>
                Safety-First Combination Rule
              </p>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                The primary caregiver’s answers feed the statistical AI model. But if <strong>any</strong> caregiver
                observes a critical safety flag (such as skill regression), the safety rule triggers a clinical
                referral recommendation automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Active Session Status Card */}
        {sessionId ? (
          <div
            style={{
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: "10px",
              padding: "0.9rem 1.2rem",
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <span style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700, color: "#60a5fa" }}>
                Active Check-in Session
              </span>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#211709" }}>
                Session <code>{sessionId.slice(0, 10)}…</code> • {sessionInfo?.age_bracket || "Active"} bracket • {totalSlotsUsed} of 3 respondent slots used
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => refreshInvites(sessionId)}
                className="btn btn--ghost"
                style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
              >
                ↻ Refresh Status
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1.5rem",
              color: "#8a5f10",
              fontSize: "0.9rem",
            }}
          >
            No active check-in found in browser storage. Please{" "}
            <Link to="/screen" style={{ color: "#60a5fa", textDecoration: "underline", fontWeight: 600 }}>
              start or resume a check-in
            </Link>{" "}
            first to generate invite links.
          </div>
        )}

        {/* Invite Creation Section */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "14px",
            padding: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <h2 className="h-sm" style={{ margin: 0, fontSize: "1.15rem" }}>
              Invite an Observer (Max 3)
            </h2>
            <span
              style={{
                fontSize: "0.8rem",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                background: isLimitReached ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.15)",
                color: isLimitReached ? "#f87171" : "#86efac",
                fontWeight: 600,
              }}
            >
              {totalSlotsUsed} / 3 slots active
            </span>
          </div>

          {isLimitReached ? (
            <p style={{ color: "#b04f1f", fontSize: "0.9rem", margin: 0 }}>
              The maximum limit of 3 secondary caregiver respondents has been reached for this screening.
              To invite a new respondent, wait for pending links to expire or review existing responses below.
            </p>
          ) : (
            <form onSubmit={handleCreateInvite}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                <div>
                  <label htmlFor="joint-role-preset" style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.4rem", fontWeight: 600 }}>
                    Caregiver Role:
                  </label>
                  <select
                    id="joint-role-preset"
                    value={rolePreset}
                    onChange={(e) => setRolePreset(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.8rem",
                      background: "rgba(255, 248, 232, 0.9)",
                      color: "#211709",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "8px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value="Father / Co-Parent">Father / Co-Parent</option>
                    <option value="Grandmother">Grandmother</option>
                    <option value="Grandfather">Grandfather</option>
                    <option value="Preschool / Daycare Teacher">Preschool / Daycare Teacher</option>
                    <option value="Babysitter / Nanny">Babysitter / Nanny</option>
                    <option value="Other Role">Other Role (Specify custom label)</option>
                  </select>
                </div>

                {rolePreset === "Other Role" && (
                  <div>
                    <label htmlFor="joint-custom-role" style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.4rem", fontWeight: 600 }}>
                      Custom Role Label:
                    </label>
                    <input
                      id="joint-custom-role"
                      type="text"
                      placeholder="e.g. Aunt, Speech Aide (no names)"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.8rem",
                        background: "rgba(255, 248, 232, 0.9)",
                        color: "#211709",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "8px",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="joint-expiry-select" style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.4rem", fontWeight: 600 }}>
                    Link Expiration:
                  </label>
                  <select
                    id="joint-expiry-select"
                    value={expiresHours}
                    onChange={(e) => setExpiresHours(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.8rem",
                      background: "rgba(255, 248, 232, 0.9)",
                      color: "#211709",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      borderRadius: "8px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value={24}>24 hours</option>
                    <option value={48}>48 hours (Recommended)</option>
                    <option value={168}>7 days</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={creating || !sessionId}
                className="btn btn--primary"
                style={{ fontSize: "0.9rem", padding: "0.6rem 1.4rem" }}
              >
                {creating ? "Generating Secure Link…" : "Generate Single-Use Invite Link"}
              </button>
            </form>
          )}

          {/* Newly Generated Invite Link Card */}
          {newInviteUrl && (
            <div
              style={{
                marginTop: "1.25rem",
                padding: "1rem 1.25rem",
                background: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.35)",
                borderRadius: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, color: "#86efac", fontSize: "0.9rem" }}>
                  ✓ One-Time Invite Link Ready
                </span>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Single-use • Expiring</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  readOnly
                  value={newInviteUrl}
                  style={{
                    flex: "1 1 280px",
                    padding: "0.5rem 0.75rem",
                    background: "rgba(255, 248, 232, 0.95)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "6px",
                    color: "#211709",
                    fontSize: "0.85rem",
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleCopy(newInviteUrl)}
                  className="btn btn--secondary"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                >
                  Copy Link
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Hello, please help share your independent developmental observations for our child via this secure one-time link: ${newInviteUrl}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--ghost"
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem", color: "#4ade80" }}
                >
                  Share on WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Existing Invites & Completed Responses Dashboard */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "14px",
            padding: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <h2 className="h-sm" style={{ margin: "0 0 1rem", fontSize: "1.15rem" }}>
            Observer Responses & Invite Status
          </h2>

          {!invitesData || (invitesData.invites.length === 0 && invitesData.completed_respondents.length === 0) ? (
            <p style={{ color: "#9ca3af", fontSize: "0.9rem", margin: 0 }}>
              No observer links generated yet. Generate an invite link above to collect observations from other caregivers.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {/* Completed Respondents */}
              {invitesData.completed_respondents.map((resp) => (
                <div
                  key={resp.id}
                  style={{
                    background: "rgba(34, 197, 94, 0.08)",
                    border: "1px solid rgba(34, 197, 94, 0.25)",
                    borderRadius: "8px",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: "#86efac", fontSize: "0.95rem" }}>
                      {resp.role_label}
                    </span>
                    <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "0.2rem" }}>
                      Answered {resp.answers_count} items • Submitted {new Date(resp.submitted_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.65rem",
                      borderRadius: "999px",
                      background: "rgba(34, 197, 94, 0.2)",
                      color: "#4ade80",
                    }}
                  >
                    ✓ Response Received
                  </span>
                </div>
              ))}

              {/* Pending or Expired Invites */}
              {invitesData.invites.map((inv) => {
                const fullUrl = `${window.location.origin}/joint-respond/${inv.token}`;
                return (
                  <div
                    key={inv.id}
                    style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "#211709", fontSize: "0.95rem" }}>
                        {inv.role_label}
                      </span>
                      <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "0.2rem" }}>
                        {inv.is_used
                          ? `Used on ${inv.used_at ? new Date(inv.used_at).toLocaleDateString() : "recently"}`
                          : inv.is_expired
                          ? `Expired on ${new Date(inv.expires_at).toLocaleDateString()}`
                          : `Expires on ${new Date(inv.expires_at).toLocaleString()}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {inv.is_used ? (
                        <span style={{ fontSize: "0.75rem", color: "#86efac" }}>Completed</span>
                      ) : inv.is_expired ? (
                        <span style={{ fontSize: "0.75rem", color: "#b04f1f" }}>Expired</span>
                      ) : (
                        <>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "999px",
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#8a5f10",
                            }}
                          >
                            Pending
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(fullUrl)}
                            className="btn btn--ghost"
                            style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
                          >
                            Copy Link
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Merge Concordance Trigger */}
          <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1.25rem" }}>
            <button
              type="button"
              disabled={merging || !sessionId}
              onClick={handleRunMerge}
              className="btn btn--primary"
              style={{ fontSize: "0.95rem", padding: "0.65rem 1.6rem" }}
            >
              {merging ? "Computing Concordance…" : "Compute Joint Concordance & Merge"}
            </button>
            <span style={{ fontSize: "0.8rem", color: "#9ca3af", marginLeft: "1rem" }}>
              Applies safety floor override and analyzes item-by-item agreement.
            </span>
          </div>
        </div>

        {/* Concordance Results & Disagreements Section */}
        {concordance && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              borderRadius: "14px",
              padding: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              <h2 className="h-sm" style={{ margin: 0, fontSize: "1.2rem" }}>
                Concordance Analysis & Clinical Triage
              </h2>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  padding: "0.3rem 0.85rem",
                  borderRadius: "999px",
                  background:
                    concordance.overall_concordance >= 0.75
                      ? "rgba(34, 197, 94, 0.2)"
                      : "rgba(245, 158, 11, 0.2)",
                  color:
                    concordance.overall_concordance >= 0.75 ? "#86efac" : "#fbbf24",
                  border:
                    concordance.overall_concordance >= 0.75
                      ? "1px solid rgba(34, 197, 94, 0.3)"
                      : "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                {concordance.concordance_level} ({Math.round(concordance.overall_concordance * 100)}%)
              </span>
            </div>

            {/* Combination Rule Notice */}
            <div
              style={{
                background: "rgba(33, 23, 9, 0.05)",
                borderRadius: "10px",
                padding: "1rem",
                marginBottom: "1.25rem",
                fontSize: "0.85rem",
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <span style={{ color: "#9ca3af" }}>Primary Model Score:</span>{" "}
                  <strong style={{ color: "#60a5fa" }}>{concordance.ml_classification}</strong>
                </div>
                <div>
                  <span style={{ color: "#9ca3af" }}>Final Clinical Triage:</span>{" "}
                  <strong style={{ color: concordance.final_classification === "Refer" ? "#f87171" : "#4ade80" }}>
                    {concordance.final_classification}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "#9ca3af" }}>Exact Agreement:</span>{" "}
                  <strong>{concordance.exact_agreement_pct}%</strong>
                </div>
              </div>

              {concordance.safety_override_triggered && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.6rem 0.85rem",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#b04f1f",
                    fontSize: "0.82rem",
                  }}
                >
                  <strong>Safety Floor Triggered:</strong> {concordance.safety_source} reported safety concern (
                  <code>{concordance.override_rule}</code>). The combination rule escalates the final triage to Refer.
                </div>
              )}
            </div>

            {/* Disagreements List */}
            {concordance.disagreements.length > 0 ? (
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.75rem", color: "#211709" }}>
                  Discrepant Observations ({concordance.disagreements.length})
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {concordance.disagreements.map((d: JointDisagreementPayload) => (
                    <div
                      key={d.item_id}
                      style={{
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "10px",
                        padding: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.3rem" }}>
                        <span style={{ fontWeight: 700, color: "#60a5fa", fontSize: "0.9rem" }}>
                          {d.item_id} ({d.domain})
                        </span>
                        <span style={{ color: "#b04f1f", fontSize: "0.78rem" }}>
                          Most concerning: {d.most_concerning_role} (rated {d.most_concerning_answer})
                        </span>
                      </div>
                      <p style={{ margin: "0 0 0.5rem", color: "#e2e8f0", fontSize: "0.9rem" }}>
                        {d.question_text}
                      </p>
                      <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "0.6rem" }}>
                        Primary caregiver rating: <strong>{d.primary_answer}</strong> | Secondary ratings:{" "}
                        <strong>
                          {d.respondent_answers.map((r) => `${r.role_label}: ${r.answer}`).join(", ")}
                        </strong>
                      </div>
                      <div
                        style={{
                          background: "rgba(245, 158, 11, 0.08)",
                          borderLeft: "3px solid #f59e0b",
                          padding: "0.6rem 0.8rem",
                          borderRadius: "4px",
                          color: "#8a5f10",
                          fontSize: "0.82rem",
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Clinical Follow-up Inquiry:</strong> {d.follow_up_prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ color: "#86efac", fontSize: "0.9rem", margin: 0 }}>
                ✓ Perfect alignment across all caregivers on overlapping items. No discrepancies detected.
              </p>
            )}
          </div>
        )}

        {/* Data Deletion & Privacy Controls */}
        <div
          style={{
            background: "rgba(239, 68, 68, 0.04)",
            border: "1px solid rgba(239, 68, 68, 0.18)",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem", color: "#b04f1f" }}>
              Permanent Screening & Respondent Data Deletion
            </h3>
            <p style={{ fontSize: "0.8rem", color: "#9ca3af", margin: 0 }}>
              Permanently purge this screening session, all invite tokens, and all secondary respondent answers.
            </p>
          </div>
          <button
            type="button"
            disabled={deleting || !sessionId}
            onClick={handleDeleteSession}
            style={{
              padding: "0.5rem 1rem",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#b04f1f",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: sessionId ? "pointer" : "not-allowed",
              opacity: sessionId ? 1 : 0.5,
            }}
          >
            {deleting ? "Deleting…" : "Delete Session & All Respondent Answers"}
          </button>
        </div>

        <div className="feature-page__actions">
          <Link className="btn btn--secondary" to="/share">
            Back to Family sharing
          </Link>
          <Link className="btn btn--ghost" to="/sandbox">
            View clinician tools
          </Link>
          <Link className="btn btn--ghost" to="/screen">
            Screening home
          </Link>
        </div>
      </section>
    </div>
  );
}

export function VelocityTracker() {
  return (
    <DeferredStub
      title="Velocity tracker"
      description="Cross-session growth tracking needs identity, consent, and privacy groundwork that is not in place yet. Device-local comparison is on Growth trends."
      backTo="/growth"
      backLabel="Back to Growth trends"
    />
  );
}

export function LiveElicitationTask() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionAge, setSessionAge] = useState<number | null>(null);
  const [selectedBracket, setSelectedBracket] = useState<string>("24m");
  const [tasks, setTasks] = useState<LiveTaskDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [answeredObserved, setAnsweredObserved] = useState<Record<string, number>>({});
  const { push } = useToast();

  const allBrackets = [
    "2m", "4m", "6m", "9m", "12m", "15m", "18m", "21m", "24m", "27m", "30m", "33m", "36m", "42m", "48m", "54m", "60m"
  ];

  // Check active session on mount
  useEffect(() => {
    const sid = loadSessionId();
    if (sid) {
      setActiveSessionId(sid);
      api.getSession(sid).then((s) => {
        if (s.corrected_age_months) {
          setSessionAge(s.corrected_age_months);
        }
        if (s.age_bracket) {
          setSelectedBracket(s.age_bracket);
        }
        if (s.answers) {
          setAnsweredObserved(s.answers);
        }
      }).catch((e) => {
        console.warn("Could not load session for live elicitation:", e);
      });
    }
  }, []);

  // Fetch tasks for the selected bracket or active session
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getLiveTasks(selectedBracket)
      .then((taskList) => {
        if (active) {
          setTasks(taskList);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Could not load live tasks:", err);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedBracket]);

  const handleAnswerTask = async (task: LiveTaskDefinition, val: number) => {
    if (activeSessionId) {
      try {
        await api.submitAnswer(activeSessionId, {
          item_id: task.milestone_item_id,
          answer: val,
          source: "observed",
        });
        setAnsweredObserved((prev) => ({ ...prev, [task.milestone_item_id]: val }));
        push(`Recorded direct observation for ${task.milestone_item_id} (source="observed")`, "info");
      } catch (err: unknown) {
        push(err instanceof Error ? err.message : "Failed to record observation", "error");
      }
    } else {
      setAnsweredObserved((prev) => ({ ...prev, [task.milestone_item_id]: val }));
      push(`Observed option [${val}] selected for ${task.milestone_item_id} (Preview mode)`, "info");
    }
  };

  return (
    <div className="feature-page">
      <PageNav />
      <section aria-labelledby="live-elicit-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <p className="eyebrow">Module A • Direct Clinical Observation</p>
            <h1 id="live-elicit-title" className="display">
              Live Elicitation Tasks
            </h1>
          </div>
          {activeSessionId && (
            <span
              style={{
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                background: "rgba(34, 197, 94, 0.18)",
                color: "#4ade80",
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "1px solid rgba(34, 197, 94, 0.3)",
              }}
            >
              ● Connected to Screening Session
            </span>
          )}
        </div>

        <p className="lede">
          Structured direct observation tasks per age bracket. Answering a task feeds the exact same
          milestone item the adaptive engine would otherwise ask by parent recall, stored with{" "}
          <code>source=&quot;observed&quot;</code>.
        </p>

        {activeSessionId ? (
          <div
            style={{
              background: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "10px",
              padding: "1rem",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
              color: "#bfdbfe",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <strong>Active Session:</strong> {activeSessionId.slice(0, 8)}… &nbsp;|&nbsp;
              <strong> Child Age:</strong> {sessionAge ?? 24} months &nbsp;|&nbsp;
              <strong> Bracket:</strong> {selectedBracket}
            </div>
            <Link className="btn btn--primary" to="/screen" style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}>
              Continue Screening →
            </Link>
          </div>
        ) : (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              padding: "0.85rem 1rem",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
              color: "#9ca3af",
            }}
          >
            No active check-in in progress. Viewing task definitions in preview mode. To feed real session items,{" "}
            <Link to="/screen" style={{ color: "#60a5fa" }}>start a check-in</Link>.
          </div>
        )}

        {/* Age Bracket Selector Tabs */}
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
            Select Age Bracket:
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {allBrackets.map((br) => {
              const isSelected = selectedBracket === br;
              return (
                <button
                  key={br}
                  type="button"
                  onClick={() => setSelectedBracket(br)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: isSelected ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.12)",
                    background: isSelected ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.04)",
                    color: isSelected ? "#93c5fd" : "#cbd5e1",
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {br}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks List */}
        {loading ? (
          <p className="lede">Loading direct observation tasks for {selectedBracket}…</p>
        ) : tasks.length === 0 ? (
          <p className="feature-page__note">
            No specific direct observation tasks recorded for bracket {selectedBracket}.
          </p>
        ) : (
          <div>
            <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#9ca3af" }}>
              Showing {tasks.length} standardized observation task{tasks.length > 1 ? "s" : ""} for the {selectedBracket} bracket:
            </div>
            {tasks.map((task) => (
              <LiveTaskCard
                key={task.task_id}
                task={task}
                currentValue={answeredObserved[task.milestone_item_id]}
                source={answeredObserved[task.milestone_item_id] !== undefined ? "observed" : undefined}
                onAnswer={(val) => handleAnswerTask(task, val)}
              />
            ))}
          </div>
        )}

        <div className="feature-page__actions" style={{ marginTop: "2rem" }}>
          <Link className="btn btn--secondary" to="/screen">
            Back to screening
          </Link>
          <Link className="btn btn--ghost" to="/deferred/touch-micro">
            Touch micro-tasks
          </Link>
          <Link className="btn btn--ghost" to="/sandbox">
            Clinician tools
          </Link>
        </div>
      </section>
    </div>
  );
}

export function TouchMicroTask() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [childAge, setChildAge] = useState<number>(30);
  const { push } = useToast();

  useEffect(() => {
    const sid = loadSessionId();
    if (sid) {
      setSessionId(sid);
      api.getSession(sid)
        .then((s) => {
          if (s.corrected_age_months) {
            setChildAge(s.corrected_age_months);
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="feature-page">
      <PageNav />
      <section aria-labelledby="touch-title">
        <p className="eyebrow">Module A • Exploratory Motor Telemetry</p>
        <h1 id="touch-title" className="display">
          Toddler Touch Tasks (24m+)
        </h1>
        <p className="lede">
          Child-friendly touchscreen exercises measuring motor reaction time, path tracing accuracy,
          and motor jitter with extra-large touch targets.
        </p>

        {/* Age Selector */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            background: "rgba(255, 255, 255, 0.04)",
            padding: "0.75rem 1rem",
            borderRadius: "10px",
          }}
        >
          <label htmlFor="touch-age-select" style={{ fontSize: "0.9rem", color: "#cbd5e1" }}>
            <strong>Child Age:</strong>
          </label>
          <select
            id="touch-age-select"
            value={childAge}
            onChange={(e) => setChildAge(Number(e.target.value))}
            style={{
              padding: "0.4rem 0.8rem",
              background: "rgba(255, 248, 232, 0.95)",
              color: "#211709",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "6px",
              fontSize: "0.9rem",
            }}
          >
            <option value={18}>18 months (Under 24m limit - test warning)</option>
            <option value={24}>24 months</option>
            <option value={30}>30 months</option>
            <option value={36}>36 months</option>
            <option value={48}>48 months</option>
            <option value={60}>60 months</option>
          </select>
          {sessionId && (
            <span style={{ fontSize: "0.8rem", color: "#93c5fd" }}>
              (Active check-in session: <code>{sessionId.slice(0, 8)}…</code>)
            </span>
          )}
        </div>

        <TouchCanvasSuite
          sessionId={sessionId}
          childAgeMonths={childAge}
          onComplete={(metrics) => {
            push(`Completed all 3 touch tasks (${metrics.length} metrics recorded)`, "info");
          }}
          showSubmitButton={true}
        />

        <div className="feature-page__actions" style={{ marginTop: "2rem" }}>
          <Link className="btn btn--secondary" to="/screen">
            Back to screening
          </Link>
          <Link className="btn btn--ghost" to="/sandbox">
            View clinician tools
          </Link>
          <Link className="btn btn--ghost" to="/deferred/live-elicitation">
            Live elicitation
          </Link>
        </div>
      </section>
    </div>
  );
}
