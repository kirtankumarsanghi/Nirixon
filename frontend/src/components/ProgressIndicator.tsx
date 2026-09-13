interface Props {
  coveredCount: number;
  totalDomains: number;
}

export function ProgressIndicator({ coveredCount, totalDomains }: Props) {
  const safeTotal = Math.max(totalDomains, 1);
  const pct = Math.min(100, Math.round((coveredCount / safeTotal) * 100));

  return (
    <div
      className="progress"
      role="status"
      aria-live="polite"
      aria-label={`${coveredCount} of ${totalDomains} domains covered`}
    >
      <div className="progress__label">
        {coveredCount} of {totalDomains} domains covered
      </div>
      <div
        className="progress__track"
        aria-hidden="true"
      >
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
