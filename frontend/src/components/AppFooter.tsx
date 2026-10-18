import { ArrowUp, LogOut } from "lucide-react";
import { LogoMark, Wordmark } from "./Brand";
import { ROLES, ROLE_ORDER, viewLabel, type View } from "../lib/roles";
import { useApp } from "../store";
import { cn } from "../utils/cn";

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-rust uppercase">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

const linkCls = "text-[14px] font-semibold transition-colors hover:text-rust";

/** Site map for the signed-in workspace: your pages, other roles, account. */
export function AppFooter() {
  const { role, view, go, switchRole, logout } = useApp();
  const cfg = ROLES[role];
  const pages: View[] = [...cfg.tabs.map((t) => t.view)];
  if (!pages.includes("checkin")) pages.push("checkin");

  return (
    <footer className="no-print border-t border-line-2/70 bg-paper/50 pt-14 pb-32">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-5 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <button type="button" onClick={() => go(cfg.home)} className="flex items-center gap-3" aria-label="Go to workspace home">
            <LogoMark size={44} />
            <Wordmark />
          </button>
          <p className="mt-5 max-w-[300px] text-[13px] leading-relaxed text-ink-2">
            One child, four connected workspaces. Records are stored by the Nirixon API — a screening aid, not a diagnosis.
          </p>
        </div>

        <Col title={`${cfg.short} workspace`}>
          {pages.map((v) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => go(v)}
                aria-current={view === v ? "page" : undefined}
                className={cn(linkCls, view === v ? "text-rust" : "text-ink")}
              >
                {viewLabel(role, v)}
              </button>
            </li>
          ))}
        </Col>

        <Col title="Switch role">
          {ROLE_ORDER.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => r !== role && switchRole(r)}
                aria-current={r === role ? "true" : undefined}
                className={cn(linkCls, r === role ? "text-rust" : "text-ink")}
              >
                {ROLES[r].label}
                {r === role && <span className="ml-2 font-mono text-[10px] tracking-widest text-muted uppercase">current</span>}
              </button>
            </li>
          ))}
        </Col>

        <Col title="Account">
          <li className="text-[13px] text-ink-2">
            <b className="text-ink">{cfg.user.name}</b>
            <br />
            {cfg.user.title}
          </li>
          <li>
            <button type="button" onClick={logout} className={cn(linkCls, "inline-flex items-center gap-2 text-ink")}>
              <LogOut className="size-4" /> Sign out
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className={cn(linkCls, "inline-flex items-center gap-2 text-ink")}
            >
              <ArrowUp className="size-4" /> Back to top
            </button>
          </li>
        </Col>
      </div>

      <div className="mx-auto mt-12 flex max-w-[1360px] flex-wrap items-center justify-between gap-3 border-t border-line-2/70 px-5 pt-6 lg:px-8">
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Evaluated on synthetic data · Clinical validation pending</p>
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">Screening aid, not a diagnosis</p>
      </div>
    </footer>
  );
}
