import type { ReactNode } from "react";
import { Display, Eyebrow } from "./ui";

/** Shared page header so every workspace tab has the same rhythm. */
export function PageHeader({
  index,
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  index?: string;
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid items-end gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div>
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,92px)]">
          {title}
        </Display>
      </div>
      <div className="lg:pb-3">
        <p className="max-w-[390px] text-[15px] leading-relaxed text-ink-2">{subtitle}</p>
        {actions && <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
