import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/*  Global audience switch: Parent · Clinician · Health Worker          */
/* ------------------------------------------------------------------ */

export type Viewer = "parent" | "clinician" | "worker";

export const VIEWS: { id: Viewer; label: string; hint: string }[] = [
  { id: "parent", label: "Parent", hint: "Plain-language results" },
  { id: "clinician", label: "Clinician", hint: "Metrics & model detail" },
  { id: "worker", label: "Health Worker", hint: "Batch, offline, referral" },
];

type Ctx = { view: Viewer; setView: (v: Viewer) => void };
const ViewCtx = createContext<Ctx>({ view: "parent", setView: () => {} });

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<Viewer>("parent");
  return <ViewCtx.Provider value={{ view, setView }}>{children}</ViewCtx.Provider>;
}

export function useView() {
  return useContext(ViewCtx);
}

export function ViewSwitcher({ className, tone = "light", variant = "pill" }: { className?: string; tone?: "light" | "dark"; variant?: "pill" | "text" }) {
  const { view, setView } = useView();
  const id = useId();

  if (variant === "text") {
    return (
      <div role="radiogroup" aria-label="Switch view" className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
        {VIEWS.map((v) => {
          const on = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={v.hint}
              onClick={() => setView(v.id)}
              data-cursor={v.label}
              className={cn("relative pb-1.5 text-[16px] font-bold tracking-tight transition-colors duration-300", on ? "text-bone" : "text-bone/35 hover:text-bone/70")}
            >
              {v.label}
              {on && (
                <motion.span
                  layoutId={`view-line-${id}`}
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-apricot"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Switch view"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border p-1",
        tone === "dark" ? "border-paper/15 bg-transparent" : "border-bone/15 bg-white/60 backdrop-blur",
        className,
      )}
    >
      {VIEWS.map((v) => {
        const on = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={v.hint}
            onClick={() => setView(v.id)}
            data-cursor={v.label}
            className={cn(
              "relative whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors duration-300 sm:px-4",
              on ? (tone === "dark" ? "text-night" : "text-paper") : tone === "dark" ? "text-paper/70 hover:text-paper" : "text-fog hover:text-bone",
            )}
          >
            {on && (
              <motion.span
                layoutId={`view-pill-${id}`}
                className={cn("absolute inset-0 rounded-full", tone === "dark" ? "bg-paper" : "bg-bone")}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** True when any element marked data-overlay-protect intersects the pill's rect. */
function coversProtected() {
  if (document.querySelector<HTMLElement>(".persistent-stage")?.dataset.scrollImmersive === "true") return true;
  const pill = document.querySelector<HTMLElement>("[data-view-pill]");
  // Include its first visible frame too, so it cannot flash over an interactive control.
  const pr = pill?.getBoundingClientRect() ?? {
    left: Math.max(0, (window.innerWidth - 380) / 2),
    right: Math.min(window.innerWidth, (window.innerWidth + 380) / 2),
    top: window.innerHeight - 72,
    bottom: window.innerHeight - 8,
  };
  return Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-protect]")).some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left < pr.right && r.right > pr.left && r.top < pr.bottom && r.bottom > pr.top;
  });
}

/** Persistent perspective switch that follows the visitor down the page. */
export function FloatingViewSwitcher() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const nearEnd = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 260;
      // Hidden for the whole time a chapter is pinned or in viewport
      const story = document.getElementById("problem");
      const storyRect = story?.getBoundingClientRect();
      const pinned =
        !!storyRect &&
        storyRect.top < window.innerHeight &&
        storyRect.bottom > 40;
      setShow(window.scrollY > window.innerHeight * 0.9 && !nearEnd && !pinned && !coversProtected());
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-3">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-night/92 py-1.5 pl-4 pr-1.5 shadow-[0_20px_50px_-15px_rgba(29,20,9,0.6)] ring-1 ring-paper/10 backdrop-blur-xl"
            data-view-pill
          >
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-paper/55 sm:inline">Viewing as</span>
            <ViewSwitcher tone="dark" className="border-0 p-0" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Technical evidence as a margin note — collapsed for parents, open for clinicians. */
export function EvaluatorNote({ children, className, tone = "light" }: { children: ReactNode; className?: string; tone?: "light" | "dark" }) {
  const { view } = useView();
  const [open, setOpen] = useState(false);
  const shown = view === "clinician" || open;
  const dark = tone === "dark";
  return (
    <div className={cn("mt-4", className)}>
      {view !== "clinician" && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={shown}
          data-cursor="Evidence"
          className={cn("inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors", dark ? "text-paper/70 hover:text-paper" : "text-lagoon hover:text-bone")}
        >
          <span className="relative h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
            <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current transition-transform duration-300", shown && "scale-y-0")} />
          </span>
          {shown ? "Hide evaluator detail" : "For evaluators"}
        </button>
      )}
      <AnimatePresence initial={false}>
        {shown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className={cn("mt-2.5 border-l-2 pl-3.5 text-[12.5px] leading-relaxed", dark ? "border-paper/40 text-paper/80" : "border-lagoon/60 text-bone/75")}>
              <span className={cn("mr-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]", dark ? "text-paper" : "text-lagoon")}>Evaluator ·</span>
              {children}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Honesty label for illustrative (non-live) values. */
export function SampleBadge({ children = "Sample data", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-gold", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      {children}
    </span>
  );
}

export const TIER_COLORS = {
  green: "var(--tier-green)",
  amber: "var(--tier-amber)",
  red: "var(--tier-red)",
} as const;
export const TIER_RGBA = {
  green: "color-mix(in srgb, var(--tier-green) 16%, transparent)",
  amber: "color-mix(in srgb, var(--tier-amber) 16%, transparent)",
  red: "color-mix(in srgb, var(--tier-red) 16%, transparent)",
} as const;
