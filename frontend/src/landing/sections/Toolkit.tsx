import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { PHOTOS } from "../data";
import { EASE, Kicker, MaskedHeadline, TextTabs } from "../components/editorial";
import { EvaluatorNote, SampleBadge, TIER_COLORS } from "../components/ViewContext";
import { cn } from "../utils/cn";

/* ------------------------------ Keeping pace ------------------------------ */

const CURVES = {
  steady: { label: "Steady progress", points: [[12, 12], [18, 17.5], [24, 23], [30, 28.5]] as [number, number][] },
  plateau: { label: "Plateau", points: [[12, 12], [18, 16.5], [24, 18.5], [30, 20]] as [number, number][] },
};
type CurveKey = keyof typeof CURVES;

function GrowthCurve() {
  const [key, setKey] = useState<CurveKey>("plateau");
  const pts = CURVES[key].points;
  const rates = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / (p[0] - pts[i][0]));
  const plateau = rates.slice(-2).every((r) => r < 0.5);
  const tone = plateau ? TIER_COLORS.amber : TIER_COLORS.green;

  const W = 640, H = 340, P = 40, min = 8, max = 34;
  const x = (v: number) => P + ((v - min) / (max - min)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / (max - min)) * (H - P * 2);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0])},${y(p[1])}`).join(" ");
  const gap = `${line} ${[...pts].reverse().map((p) => `L${x(p[0])},${y(p[0])}`).join(" ")} Z`;
  const lastPt = pts[pts.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <TextTabs label="Growth scenario" value={key} onChange={setKey} items={(Object.keys(CURVES) as CurveKey[]).map((k) => ({ id: k, label: CURVES[k].label }))} />
        <SampleBadge />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full overflow-visible" role="img" aria-label={`Growth curve: ${CURVES[key].label}`}>
        {[12, 18, 24, 30].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={P - 10} y2={H - P} style={{ stroke: "var(--grid-line)" }} />
            <text x={x(t)} y={H - 14} textAnchor="middle" style={{ fill: "var(--color-faint)", fontSize: 11, fontWeight: 700 }}>
              {t} mo
            </text>
            <text x={P - 12} y={y(t) + 4} textAnchor="end" style={{ fill: "var(--color-faint)", fontSize: 11, fontWeight: 700 }}>
              {t}
            </text>
          </g>
        ))}
        <line x1={x(min)} y1={y(min)} x2={x(max)} y2={y(max)} style={{ stroke: "var(--color-faint)" }} strokeDasharray="5 6" strokeWidth="1.5" />
        <text x={x(32.6)} y={y(33.4) - 8} textAnchor="end" style={{ fill: "var(--color-faint)", fontSize: 11, fontWeight: 700 }}>
          expected pace
        </text>

        <motion.path key={`gap-${key}`} d={gap} fill={tone} initial={{ opacity: 0 }} animate={{ opacity: 0.14 }} transition={{ duration: 0.8, delay: 0.4 }} />
        <motion.path key={`line-${key}`} d={line} fill="none" style={{ stroke: tone }} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE }} />
        {pts.map((p, i) => (
          <motion.g key={`${key}-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25 + i * 0.2 }} style={{ transformOrigin: `${x(p[0])}px ${y(p[1])}px` }}>
            <circle cx={x(p[0])} cy={y(p[1])} r="7" fill="#fff1d4" style={{ stroke: tone }} strokeWidth="3.5" />
            <text x={x(p[0])} y={y(p[1]) - 16} textAnchor="middle" fill="#211709" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em" }}>
              VISIT {i + 1}
            </text>
          </motion.g>
        ))}
        <AnimatePresence>
          {plateau && (
            <motion.g key="callout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 1 }}>
              <line x1={x(lastPt[0])} y1={y(lastPt[1]) + 12} x2={x(lastPt[0]) - 40} y2={y(lastPt[1]) + 62} stroke={tone} strokeWidth="1.5" />
              <text x={x(lastPt[0]) - 46} y={y(lastPt[1]) + 78} textAnchor="end" fill={tone} style={{ fontSize: 12.5, fontWeight: 800 }}>
                Plateau flagged
              </text>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-bone/15 pt-4 text-[13px]">
        {rates.map((r, i) => (
          <span key={i} className="text-fog">
            Visit {i + 1}→{i + 2}:{" "}
            <strong className="font-mono" style={{ color: r < 0.5 ? TIER_COLORS.amber : TIER_COLORS.green }}>
              {Math.round(r * 100)}% of expected pace
            </strong>
          </span>
        ))}
      </div>
      <p className="mt-3 text-[15px] font-semibold" style={{ color: tone }}>
        {plateau ? "Plateau: below half the expected rate over two visits." : "Keeping pace: no plateau."}
      </p>
    </div>
  );
}

/* ------------------------------ Touch activities ------------------------------ */

type GameState = "idle" | "waiting" | "go" | "early" | "done";

function TouchGame() {
  const [state, setState] = useState<GameState>("idle");
  const [times, setTimes] = useState<number[]>([]);
  const start = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const arm = () => {
    setState("waiting");
    timer.current = window.setTimeout(() => {
      start.current = performance.now();
      setState("go");
    }, 1100 + Math.random() * 1800);
  };

  const tap = () => {
    if (state === "idle" || state === "early" || state === "done") {
      if (state === "done") setTimes([]);
      arm();
    } else if (state === "waiting") {
      window.clearTimeout(timer.current);
      setState("early");
    } else {
      const t = Math.round(performance.now() - start.current);
      const next = [...times, t];
      setTimes(next);
      if (next.length >= 3) setState("done");
      else arm();
    }
  };

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const face: Record<GameState, { bg: string; text: string; sub: string }> = {
    idle: { bg: "#211709", text: "Tap to start", sub: "Tap the moment it turns green · 3 tries" },
    waiting: { bg: "#8a5f10", text: "Wait…", sub: `Try ${times.length + 1} of 3` },
    go: { bg: "#3d6b2d", text: "Tap!", sub: "" },
    early: { bg: "#9e3a21", text: "Too soon", sub: "Tap to try again" },
    done: { bg: "#2c6a7e", text: `${avg} ms`, sub: "Average reaction · tap to replay" },
  };
  const f = face[state];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr]">
      <div className="relative mx-auto">
        {(state === "waiting" || state === "go") && (
          <motion.span aria-hidden="true" className="absolute inset-0 rounded-full" style={{ background: f.bg }} initial={{ scale: 1, opacity: 0.35 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity }} />
        )}
        <button
          type="button"
          onPointerDown={tap}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              tap();
            }
          }}
          className="relative flex aspect-square w-[min(300px,78vw)] select-none flex-col items-center justify-center rounded-full text-paper shadow-[0_40px_80px_-30px_rgba(29,20,9,0.6)] transition-colors duration-150"
          style={{ background: f.bg }}
          aria-live="polite"
          data-cursor="Tap"
        >
          <motion.span key={f.text} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[clamp(2.2rem,5vw,3.4rem)] uppercase leading-none">
            {f.text}
          </motion.span>
          {f.sub && <span className="mt-3 max-w-[70%] text-center text-[13px] font-semibold text-paper/80">{f.sub}</span>}
        </button>
      </div>

      <div>
        <p className="max-w-md text-[15.5px] leading-relaxed text-fog">
          Short tap-and-trace games measure reaction time, path accuracy and hand steadiness. The reaction game runs live in
          your browser.
        </p>
        <dl className="mt-8 border-t border-bone/15">
          {[
            ["Reaction time", avg ? `${avg} ms` : times.length ? times.map((t) => `${t}`).join(" · ") + " ms" : "Play →", "Measured now", true],
            ["Path accuracy", "92%", "Sample value", false],
            ["Hand steadiness", "Steady", "Sample value", false],
          ].map(([k, v, src, live]) => (
            <div key={String(k)} className="flex items-baseline justify-between gap-4 border-b border-bone/15 py-4">
              <dt className="text-[14px] font-bold text-bone">{k}</dt>
              <dd className="text-right">
                <span className="font-display text-[clamp(1.4rem,2.4vw,2rem)] uppercase tracking-wide text-bone">{v}</span>
                <span className={cn("ml-3 text-[9.5px] font-bold uppercase tracking-[0.16em]", live ? "text-leaf" : "text-gold")}>{src}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/* ------------------------------ Joint-family mode ------------------------------ */

const FAMILY = [
  { who: "Mother", photo: PHOTOS.early, answer: "“Hesitates on the stairs.”", level: 1 },
  { who: "Father", photo: PHOTOS.father, answer: "“Climbs holding the rail.”", level: 2 },
  { who: "Grandparent", photo: PHOTOS.grandma, answer: "“Climbs confidently with hand support.”", level: 2 },
];

function JointFamily() {
  const [included, setIncluded] = useState<string[]>(FAMILY.map((f) => f.who));
  const active = FAMILY.filter((f) => included.includes(f.who));
  const counts = active.reduce<Record<number, number>>((acc, f) => ({ ...acc, [f.level]: (acc[f.level] ?? 0) + 1 }), {});
  const majority = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2);
  const agree = new Set(active.map((f) => f.level)).size <= 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[15.5px] leading-relaxed text-fog">
          Mother, father and grandparents answer separately and we compare. Tap a person to include or leave them out.
        </p>
        <SampleBadge />
      </div>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-faint">Question · How does your child climb stairs?</p>

      <div className="mt-6 grid grid-cols-3 gap-4 sm:gap-8">
        {FAMILY.map((f) => {
          const on = included.includes(f.who);
          return (
            <button
              key={f.who}
              type="button"
              aria-pressed={on}
              onClick={() => setIncluded((cur) => (on ? cur.filter((w) => w !== f.who) : [...cur, f.who]))}
              className="group flex flex-col items-center text-center"
              data-cursor={on ? "Leave out" : "Include"}
            >
              <span className={cn("relative block aspect-square w-full max-w-[150px] overflow-hidden rounded-full ring-offset-4 ring-offset-paper transition-all duration-500", on ? "ring-2 ring-bone" : "opacity-40 grayscale")}>
                <img src={f.photo} alt={f.who} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
              </span>
              <span className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-apricot">{f.who}</span>
              <span className={cn("mt-1.5 text-[clamp(0.9rem,1.5vw,1.15rem)] font-semibold italic leading-snug transition-colors", on ? "text-bone" : "text-faint line-through")}>{f.answer}</span>
            </button>
          );
        })}
      </div>

      <svg viewBox="0 0 300 70" className="mt-2 h-16 w-full" preserveAspectRatio="none" aria-hidden="true">
        {FAMILY.map((f, i) => {
          const on = included.includes(f.who);
          const differs = on && f.level !== majority;
          return (
            <motion.path
              key={f.who}
              d={`M${50 + i * 100},0 C${50 + i * 100},40 150,30 150,70`}
              fill="none"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              animate={{ opacity: on ? 1 : 0.15, stroke: differs ? TIER_COLORS.amber : TIER_COLORS.green }}
              strokeDasharray={differs ? "4 4" : "0"}
            />
          );
        })}
      </svg>

      <div className="mx-auto max-w-xl text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={String(agree) + active.length} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
            <p className="font-display text-[clamp(1.8rem,3.4vw,2.8rem)] uppercase leading-none" style={{ color: agree ? TIER_COLORS.green : TIER_COLORS.amber }}>
              {active.length === 0 ? "No answers yet" : agree ? "Answers agree" : "Answers differ"}
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-fog">
              {active.length === 0
                ? "Include at least one family member."
                : agree
                  ? "Everyone included describes the same level, so the answer is used as given."
                  : "The mother notes hesitation; others report climbing with support. We suggest a 30-second live activity to settle it."}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  [09] Beyond one visit — an index, not a stack of cards              */
/* ------------------------------------------------------------------ */

const TOOLS = [
  { id: "pace", n: "01", title: "Is the child keeping pace?", desc: "A growth curve plots developmental age against actual age across visits. If progress falls below half the expected rate over two visits, we flag a plateau." },
  { id: "touch", n: "02", title: "Touch activities", desc: "Short tap-and-trace games measure reaction time, path accuracy and hand steadiness." },
  { id: "family", n: "03", title: "Joint-family mode", desc: "Mother, father and grandparents answer separately and we compare." },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];

export function Toolkit() {
  const [tool, setTool] = useState<ToolId>("pace");
  return (
    <section id="toolkit" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="toolkit-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Kicker index="09">Beyond one visit</Kicker>
        <MaskedHeadline
          id="toolkit-title"
          lines={[{ text: "Tools that keep watching." }, { text: "Try every one.", className: "text-lagoon" }]}
          className="mt-6 text-[clamp(2.4rem,5.4vw,4.8rem)]"
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_92px]">
          <div className="grid gap-12 lg:grid-cols-[360px_1fr] lg:gap-16">
          <ul className="border-t border-bone/15 lg:self-start" role="tablist" aria-label="Tools">
            {TOOLS.map((t) => {
              const on = t.id === tool;
              return (
                <li key={t.id} className="border-b border-bone/15">
                  <button type="button" role="tab" aria-selected={on} onClick={() => setTool(t.id)} className="group flex w-full items-start gap-4 py-5 text-left" data-cursor="Open">
                    <span className={cn("pt-1 font-mono text-[12px] font-bold transition-colors", on ? "text-apricot" : "text-faint")}>{t.n}</span>
                    <span className="flex-1">
                      <span className={cn("block font-display text-[clamp(1.35rem,2.2vw,1.85rem)] uppercase leading-none tracking-wide transition-colors duration-300", on ? "text-bone" : "text-bone/35 group-hover:text-bone/70")}>
                        {t.title}
                      </span>
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.span initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="block overflow-hidden">
                            <span className="block pt-3 text-[13.5px] leading-relaxed text-fog">{t.desc}</span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <ArrowUpRight className={cn("mt-0.5 h-5 w-5 shrink-0 transition-all duration-300", on ? "rotate-45 text-apricot" : "text-bone/25 group-hover:text-bone/60")} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div data-overlay-protect className="min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={tool} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.45, ease: EASE }}>
                {tool === "pace" && <GrowthCurve />}
                {tool === "touch" && <TouchGame />}
                {tool === "family" && <JointFamily />}
              </motion.div>
            </AnimatePresence>
            <EvaluatorNote className="mt-8">
              Growth-curve, touch and joint-family values on this page are sample data for demonstration. The reaction-time game
              measures your own taps live.
            </EvaluatorNote>
          </div>
          </div>
          {/* Reserved outside edge of the analytics lane keeps chart pixels untouched. */}
          <aside data-portrait-lane="toolkit" aria-hidden="true" className="toolkit-portrait-lane relative hidden lg:block" />
        </div>
      </div>
    </section>
  );
}
