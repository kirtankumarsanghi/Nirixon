import { ROLES, ROLE_ORDER } from "../lib/roles";
import { t } from "../lib/i18n";
import { LangPicker } from "./LangPicker";
import { useT } from "../lib/useT";
import { Localize } from "../lib/localize";
import { useApp } from "../store";
import { cn } from "../utils/cn";

/** Floating "viewing as" pill — lets anyone jump between the four workspaces. */
export function RoleDock() {
  const { role, switchRole, lang } = useApp();
  const tr = useT();
  return (
    <Localize>
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="nrx-hide-scroll pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-night p-1.5 pl-1.5 shadow-[0_26px_50px_-18px_rgba(31,20,9,0.95)] sm:pl-6">
        <span className="hidden pr-3 font-mono text-[10px] font-semibold tracking-[0.3em] whitespace-nowrap text-paper/55 uppercase sm:block">
          {t(lang, "common.viewingAs")}
        </span>
        <LangPicker tone="dark" compact />
        <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
        {ROLE_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => r !== role && switchRole(r)}
            aria-pressed={role === r}
            className={cn(
              "rounded-full px-4 py-2.5 text-[13px] font-bold whitespace-nowrap transition-all duration-300 sm:px-5",
              role === r ? "bg-paper text-ink shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)]" : "text-paper/65 hover:text-paper"
            )}
          >
            {tr(ROLES[r].short)}
          </button>
        ))}
      </div>
    </div>
    </Localize>
  );
}
