import { Link } from "react-router-dom";
import { ComingSoon } from "../components/ComingSoon";

export function GrowthPage() {
  return (
    <div>
      <ComingSoon
        title="Growth trends"
        description="Comparing check-ins over time is not available yet. It needs a past-sessions endpoint and careful decisions about how a child is identified across visits and who consents to that storage — none of that is built. This page will not track progress until those pieces exist."
      />
      <DeferredLinks />
    </div>
  );
}

export function SharePage() {
  return (
    <div>
      <ComingSoon
        title="Family sharing"
        description="Backend /api/share/* currently returns 501. When built, sharing is planned as a short-lived, expiring share code — not a persistent child profile or automatic clinician inbox."
      />
      <DeferredLinks />
    </div>
  );
}

export function SandboxPage() {
  return (
    <div>
      <ComingSoon
        title="Clinician tools"
        description="Backend /api/sandbox/* currently returns 501. ClinicianSandbox and WhatIfSimulator will connect here."
      />
      <DeferredLinks />
    </div>
  );
}

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

/** Deferred entry points — visible stubs, not hidden. */
export function ClinicianSandbox() {
  return <ComingSoon title="Clinician sandbox" />;
}

export function WhatIfSimulator() {
  return <ComingSoon title="What-if simulator" />;
}

export function JointFamilyInvite() {
  return (
    <ComingSoon
      title="Joint family invite"
      description="Planned around short-lived share codes, not a lasting shared child profile."
    />
  );
}

export function VelocityTracker() {
  return (
    <ComingSoon
      title="Velocity tracker"
      description="Cross-session growth tracking needs identity, consent, and privacy groundwork that is not in place yet."
    />
  );
}

export function LiveElicitationTask() {
  return (
    <ComingSoon
      title="Live elicitation"
      description="Camera / guided live activity item types are not in the API yet."
    />
  );
}

export function TouchMicroTask() {
  return (
    <ComingSoon
      title="Touch micro-task"
      description="Touch-input item types are not in the API yet."
    />
  );
}
