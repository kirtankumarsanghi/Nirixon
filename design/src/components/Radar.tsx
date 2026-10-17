import { DOMAIN_KEYS, DOMAINS, type Domain, type Scores } from "../lib/model";

const W = 480;
const H = 440;
const C = { x: 240, y: 220 };
const R = 132;

const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
const rad = (z: number) => ((Math.max(-3, Math.min(1, z)) + 3) / 4) * R;
const pt = (i: number, r: number) => [C.x + r * Math.cos(ang(i)), C.y + r * Math.sin(ang(i))] as const;
const poly = (r: (i: number) => number) =>
  DOMAIN_KEYS.map((_, i) => pt(i, r(i)).map((n) => n.toFixed(1)).join(",")).join(" ");

interface Props {
  scores: Scores;
  prev?: Scores;
  selected?: Domain;
  onSelect?: (d: Domain) => void;
  tone: string;
}

/** Hexagonal radar of the six areas with the −1 and −2 SD guide rings. Built for dark backgrounds. */
export function Radar({ scores, prev, selected, onSelect, tone }: Props) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Radar chart of the six developmental areas">
      {[
        { z: 1, c: "rgba(255,244,220,.10)", d: undefined },
        { z: 0, c: "rgba(255,244,220,.28)", d: undefined },
        { z: -1, c: "rgba(232,177,58,.7)", d: "4 5" },
        { z: -2, c: "rgba(238,106,79,.85)", d: "2 5" },
      ].map((g) => (
        <polygon key={g.z} points={poly(() => rad(g.z))} fill="none" stroke={g.c} strokeWidth={1.2} strokeDasharray={g.d} />
      ))}
      {DOMAIN_KEYS.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={C.x} y1={C.y} x2={x} y2={y} stroke="rgba(255,244,220,.12)" />;
      })}
      {[
        { z: 0, t: "0 SD", c: "rgba(255,244,220,.5)" },
        { z: -1, t: "−1", c: "#e8b13a" },
        { z: -2, t: "−2 SAFETY", c: "#ee6a4f" },
      ].map((g) => (
        <text key={g.t} x={C.x + 6} y={C.y - rad(g.z) - 5} fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="600" fill={g.c} letterSpacing="1">
          {g.t}
        </text>
      ))}

      {prev && (
        <polygon
          points={poly((i) => rad(prev[DOMAIN_KEYS[i]]))}
          fill="none"
          stroke="rgba(255,244,220,.55)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
      )}
      <polygon
        key={DOMAIN_KEYS.map((k) => scores[k]).join("|")}
        className="nrx-pop"
        style={{ transformOrigin: `${C.x}px ${C.y}px` }}
        points={poly((i) => rad(scores[DOMAIN_KEYS[i]]))}
        fill={tone}
        fillOpacity={0.26}
        stroke={tone}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />

      {DOMAIN_KEYS.map((k, i) => {
        const [x, y] = pt(i, rad(scores[k]));
        const sel = selected === k;
        return (
          <g key={k}>
            {sel && <circle cx={x} cy={y} r={15} fill={tone} opacity={0.25} className="nrx-ping" style={{ transformOrigin: `${x}px ${y}px` }} />}
            <circle cx={x} cy={y} r={sel ? 8 : 5.5} fill={sel ? "#fff4dc" : tone} stroke={tone} strokeWidth={3} />
            {onSelect && (
              <circle
                cx={x}
                cy={y}
                r={20}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={DOMAINS[k].label}
                className="cursor-pointer outline-none"
                onMouseEnter={() => onSelect(k)}
                onFocus={() => onSelect(k)}
                onClick={() => onSelect(k)}
              />
            )}
          </g>
        );
      })}

      {DOMAIN_KEYS.map((k, i) => {
        const [x, y] = pt(i, R + 30);
        const c = Math.cos(ang(i));
        const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
        const sel = selected === k;
        return (
          <text
            key={k}
            x={x + (anchor === "start" ? 6 : anchor === "end" ? -6 : 0)}
            y={y + 4}
            textAnchor={anchor}
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight={sel ? 700 : 500}
            letterSpacing="1.4"
            fill={sel ? "#ea8f63" : "rgba(255,244,220,.78)"}
            className="cursor-pointer select-none"
            onClick={() => onSelect?.(k)}
          >
            {DOMAINS[k].label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
