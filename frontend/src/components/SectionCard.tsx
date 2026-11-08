import type { ReactNode } from "react";
import { Eyebrow } from "./ui";
import { cn } from "../utils/cn";

/** Card with a consistent section header, used across oversight screens. */
export function SectionCard({
  eyebrow,
  index,
  title,
  action,
  children,
  className,
}: {
  eyebrow: string;
  index: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[36px] border border-line-2 bg-card", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-2 p-6 sm:px-8 sm:py-7">
        <div>
          <Eyebrow index={index} tone="muted">
            {eyebrow}
          </Eyebrow>
          <p className="mt-2 text-[13px] text-ink-2">{title}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
