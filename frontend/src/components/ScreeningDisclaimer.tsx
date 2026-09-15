/**
 * Fixed parent-facing screening disclaimer — required on every result path.
 * Not clinical placeholder content: this is a product/legal requirement from
 * Stage 5 v2 Section 0.5 / 3.3. Wording may still get clinical UX polish,
 * but the presence of this block is non-negotiable.
 */
export function ScreeningDisclaimer() {
  return (
    <aside className="screening-disclaimer" role="note" aria-label="Important disclaimer">
      <p>
        <strong>This is a screening check-in, not a medical diagnosis.</strong>{" "}
        Nirixon cannot diagnose developmental conditions. Please discuss any
        concerns — including this result — with your child’s paediatrician or
        another qualified clinician.
      </p>
    </aside>
  );
}
