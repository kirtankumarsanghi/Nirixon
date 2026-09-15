/**
 * Next-step resource for Refer outcomes (Section 0.5 / Section 5).
 *
 * PLACEHOLDER: India-focused early-support text needs clinical/content
 * sign-off. Do not invent a specific URL here.
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
        {/* PLACEHOLDER (Section 5): India early-support copy pending review */}
        In India, talk with your child’s <strong>paediatrician</strong> or a
        developmental specialist, and ask about support through your nearest{" "}
        <strong>District Early Intervention Centre (DEIC)</strong> under the
        Rashtriya Bal Swasthya Karyakram (RBSK) programme, or through your local{" "}
        <strong>Anganwadi / ICDS</strong> centre. Your paediatrician or PHC can
        help you get connected — we are not linking a specific URL until that
        content is reviewed.
      </p>
    </aside>
  );
}
