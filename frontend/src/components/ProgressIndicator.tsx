interface Props {
  coveredCount: number;
  totalDomains: number;
  /** e.g. "domains covered" or "functioning areas covered" */
  label?: string;
}

export function ProgressIndicator({
  coveredCount,
  totalDomains,
  label = "domains covered",
}: Props) {
  const safeTotal = Math.max(totalDomains, 1);
  const pct = Math.min(100, Math.round((coveredCount / safeTotal) * 100));
  const text = `${coveredCount} of ${totalDomains} ${label}`;

  return (
    <div
      className="progress"
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <div className="progress__label">{text}</div>
      <div className="progress__track" aria-hidden="true">
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
