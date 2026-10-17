import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  defaultAuthenticatedPath,
  homePathForRole,
  isParentRole,
} from "../auth/roles";
import { PageNav } from "./PageNav";

export function ConsentScreen() {
  const { setConsentGiven, consentGiven, logout, role } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(consentGiven);

  // Staff accounts skip the parent consent funnel.
  useEffect(() => {
    if (!isParentRole(role)) {
      setConsentGiven(true);
      navigate(homePathForRole(role), { replace: true });
    }
  }, [role, navigate, setConsentGiven]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checked) return;
    setConsentGiven(true);
    navigate(defaultAuthenticatedPath(role), { replace: true });
  }

  if (!isParentRole(role)) {
    return (
      <p className="lede" role="status">
        Taking you to your workspace…
      </p>
    );
  }

  return (
    <section className="consent" aria-labelledby="consent-title">
      <PageNav
        showBack
        backLabel="Sign out"
        preferHistoryBack={false}
        onBack={() => {
          logout();
          navigate("/login", { replace: true });
        }}
      />
      <p className="eyebrow">Before you begin</p>
      <h1 id="consent-title" className="display">
        A screening check-in
      </h1>
      <p className="lede">
        Nirixon is a developmental screening check-in for families. It is not a
        medical diagnosis. Results can help you decide what to discuss with your
        child’s clinician.
      </p>
      <div className="consent__panel">
        <ul className="consent__list">
          <li>
            Answers you give are saved for this screening session so progress is
            not lost mid-check-in.
          </li>
          <li>
            A clinical safety rule may recommend referral even when the model
            score is lower — that is intentional and protective.
          </li>
          <li>
            You can stop at any time. This tool does not create a lasting child
            profile or automatically share results with a clinician.
          </li>
          <li>
            Community health worker (ASHA / Anganwadi / ANM) referral assistance is
            100% opt-in with consent recorded. Child records use pseudonymous IDs
            restricted to your local village/ward health worker. Referral summaries
            contain only essential indicators with zero personal identifiers.
          </li>
        </ul>
      </div>
      <form onSubmit={onSubmit}>
        <label className="consent__check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            required
          />
          <span>
            I understand this is a screening tool, not a diagnosis, and I
            consent to start.
          </span>
        </label>
        <button type="submit" className="btn btn--primary btn--lg" disabled={!checked}>
          Continue to screening
        </button>
      </form>
      <p className="consent__nav-hint">
        After consent you can open{" "}
        <Link to="/growth">Growth trends</Link>,{" "}
        <Link to="/share">Family sharing</Link>, and{" "}
        <Link to="/help">Find help</Link> from the top bar.
      </p>
    </section>
  );
}
