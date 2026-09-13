/**
 * Next-step resource for Refer outcomes (Section 0.5 / Section 5).
 *
 * PLACEHOLDER: jurisdiction-correct early-intervention text/links need
 * clinical/content sign-off. Do not invent a specific URL here.
 */
export function EarlyInterventionResource() {
  return (
    <aside
      className="next-step-resource"
      aria-label="Suggested next step"
      data-testid="early-intervention-resource"
    >
      <h2 className="h-sm">A suggested next step</h2>
      <p>
        {/* PLACEHOLDER (Section 5): replace with reviewed IDEA Part C /
            jurisdiction-correct resource copy — do not invent a live URL */}
        In the U.S., families can contact their state’s{" "}
        <strong>early intervention program</strong> (IDEA Part C) for children
        under age 3, or ask their pediatrician how to get connected. Search for
        “find your state’s early intervention program” for the official locator
        for your area — we are not linking a specific URL until that content is
        reviewed.
      </p>
    </aside>
  );
}
