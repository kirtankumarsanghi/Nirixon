import { useId, type CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/*  Nirixon logo system                                                */
/*  LogoMark     → squircle tile with the broken "N" and synapse spark  */
/*  LogoWordmark → geometric lowercase "nirixon", both i-dots = spark   */
/*  LogoLockup   → mark + wordmark + tracked subtitle                   */
/*                                                                      */
/*  Colours come from CSS variables (see index.css), so light and dark  */
/*  themes restyle the logo without changing any markup.                */
/* ------------------------------------------------------------------ */

const SPARK = "var(--logo-spark, #dd5f24)";
const N_LEFT = "M24 92 L24 18 L38.96 36.42";
const N_RIGHT = "M61.04 63.58 L76 82 L76 -4";
const N_CLIP = "0,18 66,18 66,12.4 100,-1.2 100,82 0,82";

const uidOf = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/* ------------------------------ mark -------------------------------- */

export function LogoMark({ className = "w-10 h-10", style }: { className?: string; style?: CSSProperties }) {
  const uid = uidOf(useId());
  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
        borderRadius: "23%",
        overflow: "hidden",
        ...style,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id={`tile_${uid}`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--logo-tile-a, #fff6e3)" />
            <stop offset="1" stopColor="var(--logo-tile-b, #e9dbc0)" />
          </linearGradient>
          <clipPath id={`nclip_${uid}`}>
            <polygon points={N_CLIP} />
          </clipPath>
        </defs>

        <rect width="100" height="100" rx="23" fill={`url(#tile_${uid})`} />

        <g transform="translate(50 52) scale(.6) translate(-50 -50)" style={{ color: "var(--logo-glyph, #17120c)" }}>
          <g clipPath={`url(#nclip_${uid})`} fill="none" stroke="currentColor" strokeWidth="18" strokeLinejoin="miter">
            <path d={N_LEFT} />
            <path d={N_RIGHT} />
          </g>
          <circle cx="50" cy="50" r="10.5" fill={SPARK} />
        </g>
      </svg>
    </span>
  );
}

/* ---------------------------- wordmark ------------------------------ */

export function LogoWordmark({ className = "h-5 w-auto", title = "Nirixon" }: { className?: string; title?: string }) {
  const uid = uidOf(useId());
  return (
    <svg
      viewBox="-4 14 370 92"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      style={{ color: "var(--logo-text, #211709)", display: "block" }}
    >
      <defs>
        <clipPath id={`wb_${uid}`}>
          <rect x="-10" y="0" width="400" height="100" />
        </clipPath>
        <clipPath id={`wx_${uid}`}>
          <rect x="140" y="40" width="110" height="60" />
        </clipPath>
      </defs>

      <g stroke="currentColor" strokeWidth="11">
        <g clipPath={`url(#wb_${uid})`}>
          <path d="M5.5 106 V65 A21 21 0 0 1 47.5 65 V106" />
          <path d="M74.5 40 V106" />
          <path d="M101.5 106 V65 A21 21 0 0 1 122.5 44 H126" />
          <path d="M145.5 40 V106" />
          <path d="M314.5 106 V65 A21 21 0 0 1 356.5 65 V106" />
        </g>
        <g clipPath={`url(#wx_${uid})`}>
          <path d="M163.77 32 L222.03 108" />
          <path d="M222.03 32 L163.77 108" />
        </g>
        <circle cx="264.5" cy="70" r="26" />
      </g>

      {/* both i-dots are the spark */}
      <circle cx="74.5" cy="24" r="6.5" fill={SPARK} />
      <circle cx="145.5" cy="24" r="6.5" fill={SPARK} />
    </svg>
  );
}

/* ----------------------------- lockup ------------------------------- */

interface LockupProps {
  markClassName?: string;
  wordClassName?: string;
  subtitle?: string | null;
  className?: string;
}

export function LogoLockup({
  markClassName = "w-10 h-10",
  wordClassName = "h-5 w-auto",
  subtitle = "Developmental Screening",
  className = "",
}: LockupProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark className={markClassName} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, color: "var(--logo-text, #211709)" }}>
        <LogoWordmark className={wordClassName} />
        {subtitle && (
          <span
            style={{
              marginTop: 6,
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              opacity: 0.55,
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
