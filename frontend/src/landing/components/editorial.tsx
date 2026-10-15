import { useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { cn } from "../utils/cn";

/* ================================================================== */
/*  Editorial primitives — content sits on the page, not in boxes.     */
/* ================================================================== */

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Section index marker. Echoes the hero's [01] / [02] numbering. */
export function Kicker({ index, children, tone = "ink", className }: { index: string; children: ReactNode; tone?: "ink" | "paper"; className?: string }) {
  const paper = tone === "paper";
  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.7, ease: EASE }}
      className={cn("flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em]", paper ? "text-paper/70" : "text-faint", className)}
    >
      <span className={cn("font-mono tracking-normal", paper ? "text-[#f0a77c]" : "text-apricot")}>[{index}]</span>
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
        className={cn("h-px w-12 origin-left", paper ? "bg-paper/40" : "bg-bone/30")}
      />
      <span>{children}</span>
    </motion.div>
  );
}

type Line = { text: string; className?: string };

/** Headline whose words slide up out of masks, one after another. */
export function MaskedHeadline({ lines, className, id, tone = "ink" }: { lines: Line[]; className?: string; id?: string; tone?: "ink" | "paper" }) {
  let n = 0;
  return (
    <motion.h2
      id={id}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-10% 0px" }}
      aria-label={lines.map((l) => l.text).join(" ")}
      className={cn("font-display uppercase leading-[0.92] tracking-[0.005em]", tone === "paper" ? "text-paper" : "text-bone", className)}
    >
      {lines.map((line, li) => (
        <span key={li} aria-hidden="true" className={cn("block", line.className)}>
          {line.text.split(" ").map((word, wi) => {
            const i = n++;
            return (
              <span key={wi} className="mr-[0.22em] inline-block overflow-hidden pb-[0.07em] align-bottom last:mr-0">
                <motion.span
                  className="inline-block will-change-transform"
                  variants={{ hidden: { y: "112%" }, show: { y: "0%", transition: { duration: 0.95, delay: i * 0.055, ease: EASE } } }}
                >
                  {word}
                </motion.span>
              </span>
            );
          })}
        </span>
      ))}
    </motion.h2>
  );
}

/** Photo revealed by a clip-path wipe, then drifting with scroll parallax. */
export function RevealImage({
  src,
  alt = "",
  className,
  imgClassName,
  direction = "up",
  parallax = 30,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  direction?: "up" | "left" | "circle";
  parallax?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-parallax, parallax]);
  const from = direction === "left" ? "inset(0% 100% 0% 0%)" : direction === "circle" ? "circle(0% at 50% 50%)" : "inset(100% 0% 0% 0%)";
  const to = direction === "circle" ? "circle(75% at 50% 50%)" : "inset(0% 0% 0% 0%)";
  return (
    <motion.div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      initial={{ clipPath: from }}
      whileInView={{ clipPath: to }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 1.3, ease: EASE }}
    >
      <motion.img
        src={src}
        alt={alt}
        style={{ y }}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("absolute left-0 top-[-10%] h-[120%] w-full max-w-none object-cover", imgClassName)}
      />
    </motion.div>
  );
}

/** Odometer-style roll: each character slides when the value changes. */
export function RollingText({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn("relative -my-[0.12em] inline-flex overflow-hidden py-[0.12em] align-bottom", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} className="inline-flex" initial="enter" animate="center" exit="exit">
          {Array.from(value).map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block whitespace-pre"
              variants={{
                enter: { y: "110%", opacity: 0 },
                center: { y: "0%", opacity: 1, transition: { duration: 0.6, delay: i * 0.04, ease: EASE } },
                exit: { y: "-110%", opacity: 0, transition: { duration: 0.35, delay: i * 0.025, ease: EASE } },
              }}
            >
              {ch}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type TabItem<T extends string> = { id: T; label: ReactNode; meta?: ReactNode };

/** Typographic tabs with a sliding underline — no pills, no boxes. */
export function TextTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  size = "md",
  tone = "ink",
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "lg";
  tone?: "ink" | "paper";
  className?: string;
}) {
  const uid = useId();
  const paper = tone === "paper";
  return (
    <div role="tablist" aria-label={label} className={cn("flex flex-wrap items-end gap-x-8 gap-y-4", className)}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            data-cursor="Open"
            className={cn(
              "relative pb-2.5 text-left transition-colors duration-300",
              size === "lg" ? "font-display text-[clamp(1.6rem,3.2vw,2.6rem)] uppercase leading-none tracking-wide" : "text-[14.5px] font-bold tracking-tight",
              paper ? (on ? "text-paper" : "text-paper/40 hover:text-paper/75") : on ? "text-bone" : "text-bone/35 hover:text-bone/70",
            )}
          >
            {it.meta && (
              <span className={cn("mb-1.5 block font-sans text-[10.5px] font-bold uppercase tracking-[0.18em]", on ? (paper ? "text-[#f0a77c]" : "text-apricot") : "opacity-70")}>
                {it.meta}
              </span>
            )}
            {it.label}
            {on && (
              <motion.span
                layoutId={`tabline-${uid}`}
                className={cn("absolute inset-x-0 bottom-0 h-[2px]", paper ? "bg-paper" : "bg-apricot")}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Slowly rotating ring of text — set around circular photos. */
export function RingText({ text, className, duration = 30 }: { text: string; className?: string; duration?: number }) {
  const raw = useId();
  const id = `ring${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <motion.svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={className}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    >
      <defs>
        <path id={id} d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0" />
      </defs>
      <text fill="currentColor" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.3em", textTransform: "uppercase" }}>
        <textPath href={`#${id}`} textLength={548} lengthAdjust="spacing">
          {text}
        </textPath>
      </text>
    </motion.svg>
  );
}

/** A strike-through line that draws itself across (possibly multi-line) text. */
export function StrikeText({ children, delay = 0, color = "var(--color-apricot)", replayKey, className }: { children: ReactNode; delay?: number; color?: string; replayKey?: string | number; className?: string }) {
  return (
    <motion.span
      key={replayKey}
      className={cn("box-decoration-clone", className)}
      style={{ backgroundImage: `linear-gradient(${color}, ${color})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 58%" }}
      initial={{ backgroundSize: "0% 2px" }}
      whileInView={{ backgroundSize: "100% 2px" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.span>
  );
}
