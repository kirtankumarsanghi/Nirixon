import { useState } from "react";
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
import { useToast } from "../toast/Toast";

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

export function GrowthPage() {
  const history = loadCheckInHistory();
  const { push } = useToast();

  return (
    <div className="feature-page">
      <PageNav current="/growth" backLabel="Back to screening" backTo="/screen" />

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

      <ComingSoonBelow
        title="Cloud growth & velocity tracking"
        description="Comparing check-ins across devices or visits with a lasting child identity is not available yet. It needs a past-sessions endpoint and careful consent decisions. The timeline above only uses results saved in this browser."
      />
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
      <PageNav current="/share" backLabel="Back to screening" backTo="/screen" />

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

  return (
    <div className="feature-page">
      <PageNav
        current="/sandbox"
        backLabel="Back to screening"
        backTo="/screen"
      />

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

          <div className="feature-page__actions">
            <Link className="btn btn--secondary" to="/screen">
              Back to screening
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

export function WhatIfSimulator() {
  return (
    <DeferredStub
      title="What-if simulator"
      description="Not available yet. Clinician detail for completed check-ins lives under Clinician tools."
      backTo="/sandbox"
      backLabel="Back to Clinician tools"
    />
  );
}

export function JointFamilyInvite() {
  return (
    <DeferredStub
      title="Joint family invite"
      description="Planned around short-lived share codes, not a lasting shared child profile. You can already copy a family summary under Family sharing."
      backTo="/share"
      backLabel="Back to Family sharing"
    />
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
  return (
    <DeferredStub
      title="Live elicitation"
      description="Camera / guided live activity item types are not in the API yet."
      backTo="/screen"
      backLabel="Back to screening"
    />
  );
}

export function TouchMicroTask() {
  return (
    <DeferredStub
      title="Touch micro-task"
      description="Touch-input item types are not in the API yet."
      backTo="/screen"
      backLabel="Back to screening"
    />
  );
}
