import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/*  NIRIXON identity — "the impulse"                                    */
/*                                                                     */
/*  A geometric N whose diagonal is broken. Through the break the      */
/*  background flows on the opposite slope — negative space that       */
/*  rises while the letter descends (continuous growth). A spark sits  */
/*  in the gap like an impulse crossing a synapse (intelligence,       */
/*  discovery). The halves are point-symmetric, the right one reading  */
/*  as a check mark (on track, trust) — and its stem finishes higher   */
/*  than the left begins: the journey ends above where it started.     */
/* ------------------------------------------------------------------ */

const SPARK = "var(--logo-spark, #dd5f24)";
const N_LEFT = "M24 92 L24 18 L38.96 36.42";
const N_RIGHT = "M61.04 63.58 L76 82 L76 -4";
const N_CLIP = "0,18 66,18 66,12.4 100,-1.2 100,82 0,82";

/** Bare symbol — glyph takes currentColor, spark takes --logo-spark. 100×100 box. */
function SymbolArt({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <clipPath id={`nxc${uid}`}>
          <polygon points={N_CLIP} />
        </clipPath>
      </defs>
      <g clipPath={`url(#nxc${uid})`} fill="none" stroke="currentColor" strokeWidth="18" strokeLinejoin="miter" strokeMiterlimit="10">
        <path d={N_LEFT} />
        <path d={N_RIGHT} />
      </g>
      <circle cx="50" cy="50" r="10.5" fill={SPARK} />
    </>
  );
}

export function LogoSymbol({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Nirixon">
      <SymbolArt uid={uid} />
    </svg>
  );
}

/** Custom geometric wordmark — lowercase "nirixon"; both i-dots are the spark. */
export function LogoWordmark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="-4 14 370 92" className={className} role="img" aria-label="Nirixon" fill="none">
      <defs>
        <clipPath id={`wb${uid}`}>
          <rect x="-10" y="0" width="400" height="100" />
        </clipPath>
        <clipPath id={`wx${uid}`}>
          <rect x="140" y="40" width="110" height="60" />
        </clipPath>
      </defs>
      <g stroke="currentColor" strokeWidth="11">
        <g clipPath={`url(#wb${uid})`}>
          <path d="M5.5 106 V65 A21 21 0 0 1 47.5 65 V106" />
          <path d="M74.5 40 V106" />
          <path d="M101.5 106 V65 A21 21 0 0 1 122.5 44 H126" />
          <path d="M145.5 40 V106" />
          <path d="M314.5 106 V65 A21 21 0 0 1 356.5 65 V106" />
        </g>
        <g clipPath={`url(#wx${uid})`}>
          <path d="M163.77 32 L222.03 108" />
          <path d="M222.03 32 L163.77 108" />
        </g>
        <circle cx="264.5" cy="70" r="26" />
      </g>
      <circle cx="74.5" cy="24" r="6.5" fill={SPARK} />
      <circle cx="145.5" cy="24" r="6.5" fill={SPARK} />
    </svg>
  );
}

/** App icon — the symbol on a tile. Tile + glyph invert with the theme via CSS variables. */
export function LogoMark({ className, style }: { className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <span className={cn("logo-mark relative inline-flex flex-none overflow-hidden rounded-[23%]", className)} style={style} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`nxt${uid}`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--logo-tile-a, #2b2116)" />
            <stop offset="1" stopColor="var(--logo-tile-b, #110d08)" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="23" fill={`url(#nxt${uid})`} />
        <g transform="translate(50 52) scale(.6) translate(-50 -50)" style={{ color: "var(--logo-glyph, #f7efe0)" }}>
          <SymbolArt uid={`t${uid}`} />
        </g>
      </svg>
    </span>
  );
}

export function LogoLockup({
  className,
  markClassName = "h-10 w-10",
  wordClassName = "h-[20px]",
  subtitle = "Developmental screening",
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark className={cn("transition-transform duration-500", markClassName)} />
      <span className="flex flex-col leading-none">
        <LogoWordmark className={cn("w-auto text-bone", wordClassName)} />
        <span className="logo-tagline mt-[6px] text-[8.5px] font-bold uppercase tracking-[0.3em] text-bone/45">{subtitle}</span>
      </span>
    </span>
  );
}
/* ------------------------------------------------------------------ */
/* Scroll reveal                                                       */
/* ------------------------------------------------------------------ */

export function Reveal({
  children,
  className,
  delay = 0,
  y = 30,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Eyebrow + section heading (dark)                                    */
/* ------------------------------------------------------------------ */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-bone/20 bg-bone/[0.06] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-bone/85 backdrop-blur",
        className,
      )}
    >
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-apricot" />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", align === "center" ? "items-center text-center" : "items-start text-left", className)}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="max-w-3xl font-display text-[clamp(2.4rem,5.2vw,4.2rem)] uppercase leading-[0.95] tracking-[0.01em] text-bone">
          {title}
        </h2>
      </Reveal>
      {description && (
        <Reveal delay={0.16}>
          <p className="max-w-2xl text-[15.5px] leading-relaxed text-fog md:text-[17px]">{description}</p>
        </Reveal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Count-up                                                            */
/* ------------------------------------------------------------------ */

export function CountUp({
  value,
  decimals = 0,
  duration = 1.6,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay((value * eased).toFixed(decimals));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, decimals, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

