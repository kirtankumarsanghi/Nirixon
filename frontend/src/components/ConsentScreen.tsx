import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function ConsentScreen() {
  const { setConsentGiven, consentGiven } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(consentGiven);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checked) return;
    setConsentGiven(true);
    navigate("/screen", { replace: true });
  }

  return (
    <section className="consent" aria-labelledby="consent-title">
      <h1 id="consent-title" className="display">
        Before we begin
      </h1>
      <p className="lede">
        Nirixon is a developmental screening check-in. It is not a medical
        diagnosis. Results from this session can help you decide what to discuss
        with your child’s clinician.
      </p>
      <ul className="consent__list">
        {/* Conservative privacy claims only (Section 0.5) — do not imply
            cross-visit history, pediatrician auto-share, or persistent profiles. */}
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
      </ul>
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
        <button type="submit" className="btn btn--primary" disabled={!checked}>
          Continue to screening
        </button>
      </form>
    </section>
  );
}
