import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../utils/cn";

/* ------------------------------ hooks ------------------------------- */

export function useInView<T extends Element = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("reveal", seen && "in", className)} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1300,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.3);
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const start = from.current;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = start + (value - start) * e;
      from.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ------------------------------ type -------------------------------- */

export function Eyebrow({
  index,
  children,
  tone = "rust",
  className,
}: {
  index?: string;
  children: ReactNode;
  tone?: "rust" | "peach" | "muted" | "paper";
  className?: string;
}) {
  const toneCls = { rust: "text-rust", peach: "text-peach", muted: "text-muted", paper: "text-paper/70" }[tone];
  return (
    <div className={cn("flex items-center gap-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em]", toneCls, className)}>
      {index && <span>[{index}]</span>}
      {index && <span className="h-px w-10 bg-current opacity-50" />}
      <span>{children}</span>
    </div>
  );
}

export function Display({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "div" | "p";
}) {
  return <Tag className={cn("font-display uppercase leading-[0.93] text-ink", className)}>{children}</Tag>;
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("nrx-rise mx-auto w-full max-w-[1360px] px-5 pb-16 pt-6 sm:pt-8 lg:px-8", className)}>{children}</div>
  );
}

/* ----------------------------- buttons ------------------------------ */

type BtnVariant = "dark" | "light" | "outline" | "peach" | "rust" | "ghostDark" | "soft";
type BtnSize = "lg" | "md" | "sm" | "xs";

const BTN_V: Record<BtnVariant, string> = {
  dark: "bg-ink text-paper hover:bg-night-3 shadow-[0_10px_22px_-12px_rgba(31,20,9,0.85)]",
  light: "bg-card text-ink border border-line hover:bg-white",
  outline: "border border-ink/25 text-ink hover:bg-ink hover:text-paper",
  peach: "bg-peach text-night hover:bg-[#f3a07a]",
  rust: "bg-rust text-white hover:bg-[#a34419]",
  ghostDark: "border border-white/20 text-paper hover:bg-white/10",
  soft: "bg-sand/70 text-ink-2 hover:bg-sand",
};
const BTN_S: Record<BtnSize, string> = {
  lg: "px-7 py-3.5 text-[14px]",
  md: "px-5 py-2.5 text-[13px]",
  sm: "px-4 py-2 text-[12px]",
  xs: "px-3 py-1.5 text-[11px]",
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}

export function Btn({ variant = "dark", size = "md", className, type = "button", ...p }: BtnProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        BTN_V[variant],
        BTN_S[size],
        className
      )}
      {...p}
    />
  );
}

export function CtaPill({
  children,
  onClick,
  tone = "dark",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5 text-[13px] font-bold whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]",
        tone === "dark" ? "bg-ink text-paper shadow-[0_16px_30px_-14px_rgba(31,20,9,0.85)]" : "bg-paper text-ink",
        className
      )}
    >
      {children}
      <span className="grid size-9 place-items-center rounded-full bg-rust text-white transition-transform duration-300 group-hover:rotate-45">
        <ArrowUpRight className="size-4" />
      </span>
    </button>
  );
}

/* ------------------------------ chips ------------------------------- */

const CHIP: Record<string, string> = {
  moss: "bg-moss-bg text-moss",
  amber: "bg-amber-bg text-amber",
  brick: "bg-brick-bg text-brick",
  lilac: "bg-lilac-bg text-lilac",
  sea: "bg-sea-bg text-sea",
  sand: "bg-sand text-ink-2",
  night: "bg-white/10 text-paper",
  rust: "bg-[#f6dccb] text-rust",
};

export function Chip({
  tone = "sand",
  children,
  className,
}: {
  tone?: keyof typeof CHIP;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap",
        CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------- marquee ------------------------------ */

export function Marquee({ items, speed = 38, dark = false }: { items: string[]; speed?: number; dark?: boolean }) {
  const row = (
    <div className="flex shrink-0 items-center gap-8 pr-8 sm:gap-12 sm:pr-12" aria-hidden>
      {items.map((t, i) => (
        <span key={i} className="flex items-center gap-8 sm:gap-12">
          <span
            className={cn(
              "font-display text-[44px] uppercase leading-none whitespace-nowrap sm:text-[68px]",
              i % 2 === 0 ? (dark ? "text-paper" : "text-ink") : dark ? "text-outline-light" : "text-outline"
            )}
          >
            {t}
          </span>
          <span className="text-[26px] text-rust">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden" role="presentation">
      <div className="flex w-max" style={{ animation: `nrx-marquee ${speed}s linear infinite` }}>
        {row}
        {row}
      </div>
    </div>
  );
}

/* ----------------------------- tier dot ----------------------------- */

export function GlowDot({ hex, glow, size = 64 }: { hex: string; glow: string; size?: number }) {
  return (
    <span
      className="nrx-glow relative inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: hex, ["--glow" as string]: glow }}
    >
      <span className="absolute inset-0 rounded-full bg-white/20" style={{ clipPath: "ellipse(60% 40% at 35% 25%)" }} />
    </span>
  );
}
