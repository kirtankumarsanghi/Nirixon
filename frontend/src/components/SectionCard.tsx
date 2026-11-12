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
  tone = "light",
}: {
  eyebrow: string;
  index?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[36px] border",
        dark ? "border-white/10 bg-night text-paper" : "border-line-2 bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3 border-b p-6 sm:px-8 sm:py-7",
          dark ? "border-white/10" : "border-line-2",
        )}
      >
        <div>
          <Eyebrow index={index} tone={dark ? "peach" : "muted"}>
            {eyebrow}
          </Eyebrow>
          <p className={cn("mt-2 text-[13px]", dark ? "text-paper/60" : "text-ink-2")}>{title}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
