import type { ReactNode } from "react";
import { cn } from "../utils/cn";

/** Compact KPI card shared by the supervisor screens. */
export function StatCard({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-[28px] border border-line-2 bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[9.5px] font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
        {icon && <span className="text-muted/80">{icon}</span>}
      </div>
      <p className={cn("mt-3 font-display text-[clamp(38px,4vw,54px)] leading-none", tone)}>{value}</p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">{helper}</p>
    </div>
  );
}
