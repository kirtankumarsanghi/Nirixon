import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, LogOut, Moon, Sun, X } from "lucide-react";
import { LogoMark, Wordmark } from "./Brand";
import { Photo } from "./Photo";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/*  Floating pill navigation                                           */
/* ------------------------------------------------------------------ */

interface NavProps {
  tabs: { id: string; label: string }[];
  active?: string;
  onTab: (id: string) => void;
  onCta: () => void;
  ctaLabel?: string;
  onMenu: () => void;
  onHome: () => void;
  user?: { initials: string; name: string; title: string };
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Nav({ tabs, active, onTab, onCta, ctaLabel = "Start check-in", onMenu, onHome, user, theme, onToggleTheme }: NavProps) {
  return (
    <header className="no-print fixed inset-x-0 top-3 z-50 px-3 sm:px-5">
      <div className="nrx-nav-shell mx-auto flex max-w-[1360px] items-center justify-between gap-3 rounded-full border py-2 pr-2 pl-2.5 shadow-[0_20px_44px_-24px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:pl-3">
        <button type="button" onClick={onHome} className="flex items-center gap-3 rounded-full pr-2 transition-transform hover:scale-[1.015]" aria-label="Nirixon home">
          <LogoMark size={46} />
          <Wordmark />
        </button>

        <nav
          aria-label="Primary"
          className={cn(
            "nrx-nav-tabs hidden items-center gap-1 rounded-full border border-line/70 p-1.5",
            tabs.length <= 3 ? "lg:flex" : tabs.length <= 5 ? "xl:flex" : "2xl:flex"
          )}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              className={cn(
                "rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-all duration-200",
                active === t.id ? "bg-ink text-paper shadow-[0_8px_16px_-8px_rgba(31,20,9,0.8)]" : "text-ink-2 hover:bg-white/80 hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="nrx-theme-toggle relative flex h-11 w-[64px] shrink-0 items-center rounded-full border border-line-2 p-1 transition-colors sm:h-12 sm:w-[78px]"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            aria-pressed={theme === "dark"}
            title={`${theme === "light" ? "Dark" : "Light"} mode`}
          >
            <Sun className="absolute left-2 size-3 text-amber sm:left-2.5 sm:size-3.5" />
            <Moon className="absolute right-2 size-3 text-sea sm:right-2.5 sm:size-3.5" />
            <span className={cn("relative z-10 grid size-8 place-items-center rounded-full bg-ink text-paper shadow transition-transform duration-300 sm:size-9", theme === "dark" ? "translate-x-[20px] sm:translate-x-[32px]" : "translate-x-0")}>
              {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </span>
          </button>
          {user && (
            <div className="hidden items-center gap-2.5 rounded-full border border-line/70 bg-white/55 py-1 pr-4 pl-1 2xl:flex">
              <span className="grid size-9 place-items-center rounded-full bg-rust font-mono text-[11px] font-semibold text-white">{user.initials}</span>
              <span className="flex flex-col leading-tight">
                <span className="text-[12px] font-bold">{user.name}</span>
                <span className="text-[10px] text-muted">{user.title}</span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onCta}
            className="group hidden items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-5 text-[13.5px] font-bold text-paper shadow-[0_14px_26px_-12px_rgba(31,20,9,0.9)] transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97] sm:inline-flex"
          >
            {ctaLabel}
            <span className="grid size-9 place-items-center rounded-full bg-rust transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight className="size-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="nrx-menu-button flex items-center gap-3 rounded-full border border-line/80 py-3 pr-5 pl-4 text-[13.5px] font-bold transition-all active:scale-[0.97]"
          >
            <span className="flex flex-col gap-[5px]" aria-hidden>
              <span className="h-[1.8px] w-[18px] rounded-full bg-ink" />
              <span className="h-[1.8px] w-[18px] rounded-full bg-ink" />
              <span className="h-[1.8px] w-[12px] rounded-full bg-ink" />
            </span>
            Menu
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Full-screen menu                                                   */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}

interface MenuProps {
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  photo: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  footer?: ReactNode;
  onSignOut?: () => void;
}

export function MenuOverlay({ open, onClose, items, photo, eyebrow, title, subtitle, footer, onSignOut }: MenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // keep the latest close handler in a ref so parent re-renders don't re-run the focus effect
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), [href], input, select, textarea') ?? []
      ).filter((el) => el.getClientRects().length > 0);

    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCloseRef.current();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (!rootRef.current?.contains(a)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && a === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", k);
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      aria-hidden={!open}
      className={cn(
        "no-print fixed inset-0 z-[60] overflow-y-auto bg-night text-paper transition-[clip-path,visibility] duration-[800ms] ease-[cubic-bezier(0.7,0,0.2,1)]",
        open ? "visible" : "invisible"
      )}
      style={{ clipPath: open ? "circle(160% at calc(100% - 70px) 40px)" : "circle(0px at calc(100% - 70px) 40px)" }}
    >
      <div className="mx-auto grid min-h-full max-w-[1360px] gap-10 px-5 pt-28 pb-12 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="flex flex-col justify-between">
          <ul className="space-y-1 sm:space-y-2">
            {items.map((it, i) => (
              <li
                key={it.label}
                className="overflow-hidden"
                style={{
                  transition: "transform .8s cubic-bezier(.2,.8,.2,1), opacity .8s",
                  transitionDelay: open ? `${300 + i * 70}ms` : "0ms",
                  transform: open ? "none" : "translateY(60px)",
                  opacity: open ? 1 : 0,
                }}
              >
                <button
                  type="button"
                  onClick={it.onClick}
                  className="group flex w-full items-baseline gap-5 text-left"
                  tabIndex={open ? 0 : -1}
                >
                  <span className="w-8 font-mono text-[12px] text-peach">0{i + 1}</span>
                  <span
                    className={cn(
                      "font-display text-[clamp(44px,8vw,104px)] uppercase leading-[1.02] transition-all duration-300 group-hover:translate-x-3 group-hover:text-peach",
                      it.active ? "text-peach" : "text-paper"
                    )}
                  >
                    {it.label}
                  </span>
                  {it.hint && <span className="hidden font-mono text-[11px] tracking-wider text-paper/45 sm:inline">{it.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
          {footer && <div className="mt-10">{footer}</div>}
        </div>

        <aside
          className="relative hidden min-h-[480px] overflow-hidden rounded-[36px] lg:block"
          style={{ transition: "opacity .9s .45s, transform .9s .45s", opacity: open ? 1 : 0, transform: open ? "none" : "translateY(40px)" }}
        >
          <Photo src={photo} alt="" />
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-8">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-peach">{eyebrow}</p>
            <p className="mt-2 font-display text-4xl uppercase leading-none">{title}</p>
            <p className="mt-2 max-w-[340px] text-[13px] leading-relaxed text-paper/75">{subtitle}</p>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            )}
          </div>
        </aside>
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="fixed top-6 right-5 z-10 grid size-14 place-items-center rounded-full bg-paper text-ink transition-transform duration-300 hover:rotate-90 sm:right-8"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
