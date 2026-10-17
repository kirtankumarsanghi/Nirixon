import { LogoMark as SystemMark, LogoWordmark } from "../landing/components/system";
import { cn } from "../utils/cn";

export { LogoLockup } from "../landing/components/system";

/** Square tile mark. `size` sets width and height in px. */
export function LogoMark({ size = 44, className }: { size?: number; className?: string }) {
  return <SystemMark className={className ?? ""} style={{ width: size, height: size }} />;
}

/** Wordmark with the tracked subtitle beneath it (subtitle hidden on very small screens). */
export function Wordmark({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col items-start leading-none", className)} style={{ color: "var(--logo-text, #211709)" }}>
      <LogoWordmark className="h-[22px] w-auto" />
      {subtitle && (
        <span
          className="mt-1.5 hidden text-[8.5px] font-bold tracking-[0.3em] whitespace-nowrap uppercase sm:block"
          style={{ opacity: 0.72 }}
        >
          Developmental screening
        </span>
      )}
    </span>
  );
}
