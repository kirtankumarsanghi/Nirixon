import { useEffect, useRef } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ROLES, viewLabel } from "../lib/roles";
import { useApp } from "../store";
import { cn } from "../utils/cn";

/**
 * "Where am I" bar under the floating nav:
 * back button · breadcrumb · (on small screens) a scrollable strip of the role's sections.
 */
export function Crumbs() {
  const { role, view, go, back, canBack } = useApp();
  const cfg = ROLES[role];
  const here = viewLabel(role, view);
  const atHome = view === cfg.home;
  const stripRef = useRef<HTMLElement>(null);

  // keep the active pill visible in the scrollable strip
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [view, role]);

  return (
    <div className="no-print mx-auto w-full max-w-[1360px] px-5 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {!atHome && (
          <button
            type="button"
            onClick={back}
            className="group inline-flex items-center gap-2 rounded-full border border-line-2 bg-card py-2 pr-4 pl-3 text-[12.5px] font-bold transition-all hover:border-ink"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            {canBack ? "Back" : cfg.tabs[0].label}
          </button>
        )}

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.16em] uppercase">
            <li className="text-muted">{cfg.group}</li>
            <ChevronRight className="size-3.5 text-muted/60" aria-hidden />
            <li>
              {atHome ? (
                <span className="text-muted">{cfg.short}</span>
              ) : (
                <button type="button" onClick={() => go(cfg.home)} className="text-muted transition-colors hover:text-rust">
                  {cfg.short}
                </button>
              )}
            </li>
            <ChevronRight className="size-3.5 text-muted/60" aria-hidden />
            <li aria-current="location" className="truncate text-ink">
              {here}
            </li>
          </ol>
        </nav>
      </div>

      {/* tabs live in the top bar on wide screens — give everyone else a strip */}
      <nav
        ref={stripRef}
        aria-label="Workspace sections"
        className={cn(
          "nrx-hide-scroll -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0",
          cfg.tabs.length <= 3 ? "lg:hidden" : cfg.tabs.length <= 5 ? "xl:hidden" : "2xl:hidden"
        )}
      >
        {cfg.tabs.map((t) => {
          const on = view === t.view;
          return (
            <button
              key={t.view}
              type="button"
              onClick={() => go(t.view)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-5 py-2.5 text-[13px] font-bold whitespace-nowrap transition-all",
                on ? "border-ink bg-ink text-paper" : "border-line-2 bg-card text-ink-2 hover:border-ink hover:text-ink"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
