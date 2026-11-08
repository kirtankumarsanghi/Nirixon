import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export interface HeroTile {
  label: string;
  value: string;
  helper: string;
  /** Hex colour used for the value on the dark band. */
  color: string;
  icon?: ReactNode;
  /** Optional filter action — when set the tile renders as a button. */
  onClick?: () => void;
  active?: boolean;
  /** Override the large value typography (for longer words such as a tier). */
  valueClass?: string;
}

export interface HeroSegment {
  label: string;
  hex: string;
  n: number;
  /** Optional display override (e.g. "62%" instead of 62). */
  display?: string;
}

/**
 * Dark summary band shared by the supervisor screens: a progress ring, a row of KPI
 * tiles and an optional stacked distribution bar. Mirrors the health-worker caseload band.
 */
export function OversightHero({
  pct,
  ringLabel,
  ringSub,
  tiles,
  segments,
  className,
}: {
  pct: number;
  ringLabel: string;
  ringSub: ReactNode;
  tiles: HeroTile[];
  segments?: HeroSegment[];
  className?: string;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const safe = Math.max(0, Math.min(100, pct));
  const shown = Math.round(safe);
  return (
    <section className={cn("overflow-hidden rounded-[44px] bg-night p-6 text-paper sm:p-10", className)}>
      <div className="grid items-center gap-8 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <svg viewBox="0 0 120 120" className="size-[132px] -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,244,220,.12)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#ea8f63"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - safe / 100)}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
              />
            </svg>
          </div>
          <div>
            <p className="font-display text-[64px] leading-none text-peach">{shown}%</p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-paper/60 uppercase">{ringLabel}</p>
            <p className="mt-2 text-[13px] leading-snug text-paper/70">{ringSub}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {tiles.map((t) => {
            const content = (
              <>
                <div className="flex items-start justify-between gap-2 font-mono text-[10px] tracking-[0.16em] text-paper/70 uppercase">
                  <span>{t.label}</span>
                  {t.icon && <span className="text-paper/50">{t.icon}</span>}
                </div>
                <p className={cn("mt-3 font-display leading-none", t.valueClass ?? "text-[clamp(38px,4vw,52px)]")} style={{ color: t.color }}>{t.value}</p>
                <p className="mt-1 text-[11px] leading-snug text-paper/50">{t.helper}</p>
              </>
            );
            const cls = cn(
              "rounded-[24px] border p-4 text-left transition-all duration-300 hover:-translate-y-1",
              t.active ? "border-peach bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
            );
            return t.onClick ? (
              <button key={t.label} type="button" onClick={t.onClick} aria-pressed={Boolean(t.active)} className={cls}>
                {content}
              </button>
            ) : (
              <div key={t.label} className={cls}>
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {segments && segments.length > 0 && (
        <>
          <div className="mt-8 flex h-3 gap-1 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} ${s.n}`).join(", ")}>
            {segments.map((s) => (
              <span key={s.label} title={`${s.label}: ${s.n}`} className="h-full rounded-full transition-all duration-700" style={{ flexGrow: Math.max(s.n, 0.01), background: s.hex }} />
            ))}
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10.5px] tracking-[0.12em] text-paper/70 uppercase">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: s.hex }} />
                {s.label} <b className="text-paper">{s.display ?? s.n}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Round initials avatar used in oversight tables. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper", className)}>
      {letters || "—"}
    </span>
  );
}
