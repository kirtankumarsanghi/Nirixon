interface Props {
  override: boolean;
  classification: string;
}

/**
 * PLACEHOLDER copy (Section 5) — clinical / clinical-UX sign-off required
 * before shipping final stigma-reassurance language.
 */
export function StigmaReassurance({ override, classification }: Props) {
  if (override) {
    return (
      <aside className="stigma stigma--override" aria-label="Reassurance">
        <p>
          {/* PLACEHOLDER — override-path messaging pending clinical review */}
          A referral suggestion does not mean something is “wrong” with your
          child. It means a clinician conversation is the right next step —
          many children who are referred go on to thrive with the right support.
        </p>
      </aside>
    );
  }

  return (
    <aside className="stigma" aria-label="Reassurance">
      <p>
        {/* PLACEHOLDER — standard-path messaging pending clinical review */}
        This is a check-in, not a diagnosis. A “{classification}” result is a
        signal for conversation and observation, not a label for your child.
      </p>
    </aside>
  );
}
