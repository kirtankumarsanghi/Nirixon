import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PHOTOS, SHOWCASE } from "../data";
import { EASE, Kicker, MaskedHeadline, StrikeText, TextTabs } from "../components/editorial";
import { cn } from "../utils/cn";
import claimsRegister from "../claims_register.json";

const claims = claimsRegister.claims;

/* ================================================================== */
/*  Frameworks — outlined display type, not pills                      */
/* ================================================================== */

const FRAMEWORKS = ["CDC milestones", "WHO motor standards", "17 age brackets", "DSM-5 two-setting rule", "DPDPA 2023 principles", "ICMR guidance", "Screening, not diagnosis"];

export function TrustMarquee() {
  return (
    <section aria-label="Frameworks and standards" className="relative overflow-hidden border-y border-bone/15 py-7">
      <div className="marquee-track items-center" style={{ animationDuration: "60s" }}>
        {[...FRAMEWORKS, ...FRAMEWORKS].map((f, i) => (
          <span key={i} className="flex items-center">
            <span className={cn("whitespace-nowrap px-7 font-display text-[clamp(2rem,4.6vw,3.8rem)] uppercase leading-none tracking-wide", i % 2 ? "outline-text" : "text-bone")}>
              {f}
            </span>
            <span className="text-[clamp(1.4rem,2.6vw,2.2rem)] leading-none text-apricot" aria-hidden="true">
              ✦
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ================================================================== */
/*  [06] The broken route — a road you can travel along                */
/* ================================================================== */

const ROUTE = "M20,90 C65,90 65,100 110,100 C245,100 245,46 380,46 C510,46 510,112 640,112 C770,112 770,52 900,52 C940,52 940,72 980,72";

const STOPS = [
  {
    x: 110,
    y: 100,
    stage: "Stop 01",
    label: "The form",
    photo: PHOTOS.early,
    alt: "An Indian mother sharing a joyful moment with her young daughter",
    old: "30–36 fixed questions for every child, 10+ minutes, scored by hand.",
    fix: `${claims.module_a_questions_range.display} in under 5 minutes, scored the moment an answer changes.`,
    oldStat: "30–36",
    newStat: `${claims.module_a_questions_range.min}–${claims.module_a_questions_range.max}`,
    unit: "questions",
  },
  {
    x: 380,
    y: 46,
    stage: "Stop 02",
    label: "The classroom",
    photo: PHOTOS.schoolGroup,
    alt: "Happy Indian schoolchildren sitting together in class",
    old: "One person’s answers decide. A difficulty seen in one place counts the same as one seen everywhere.",
    fix: "We compare parent and teacher. Seen at home and at school is a strong signal; seen only at school may point to the classroom.",
    oldStat: "1",
    newStat: "2+",
    unit: "settings compared",
  },
  {
    x: 640,
    y: 112,
    stage: "Stop 03",
    label: "The language",
    photo: PHOTOS.grandma,
    alt: "A grandmother sitting with her grandchild at the entrance of their home",
    old: "“Dhyaan nahi lagta” gets squeezed into an English-only checkbox.",
    fix: "Type or speak in English, Hindi or Hinglish. We match your words to the right areas and ask a few focused questions.",
    oldStat: "1",
    newStat: "3",
    unit: "languages",
  },
  {
    x: 900,
    y: 52,
    stage: "Stop 04",
    label: "The senses",
    photo: PHOTOS.scholar,
    alt: "Indian schoolgirls in uniform listening in a classroom",
    old: "Vision and hearing strain can look like inattention in a busy classroom.",
    fix: "Vision & hearing is one of the 8 areas we check for ages 5–12, so it is looked at alongside attention.",
    oldStat: "—",
    newStat: "8",
    unit: "areas, incl. vision & hearing",
  },
];

export function GapCards() {
  const [active, setActive] = useState(0);
  const pathRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGGElement>(null);
  const lengths = useRef<number[]>([]);
  const total = useRef(0);
  const progress = useMotionValue(0);
  const stop = STOPS[active];

  const place = useCallback((l: number) => {
    const p = pathRef.current;
    if (!p) return;
    const pt = p.getPointAtLength(l);
    dotRef.current?.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
    trailRef.current?.setAttribute("stroke-dashoffset", String(total.current - l));
  }, []);

  useLayoutEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    total.current = len;
    trailRef.current?.setAttribute("stroke-dasharray", String(len));
    lengths.current = STOPS.map((s) => {
      let best = 0;
      let bestD = Infinity;
      for (let l = 0; l <= len; l += 1.5) {
        const pt = p.getPointAtLength(l);
        const d = (pt.x - s.x) ** 2 + (pt.y - s.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      return best;
    });
    progress.set(lengths.current[0]);
    place(lengths.current[0]);
  }, [place, progress]);

  useEffect(() => {
    const target = lengths.current[active];
    if (target === undefined) return;
    const controls = animate(progress, target, { duration: 1.2, ease: [0.65, 0, 0.35, 1], onUpdate: place });
    return () => controls.stop();
  }, [active, place, progress]);

  return (
    <section id="gap" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="gap-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <Kicker index="06">The broken route</Kicker>
            <MaskedHeadline
              id="gap-title"
              lines={[{ text: "The child is lost" }, { text: "on the way to care.", className: "text-apricot" }]}
              className="mt-6 text-[clamp(2.4rem,5.4vw,4.8rem)]"
            />
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-fog lg:ml-auto">
            Most missed children don’t fail at the specialist’s desk. The route breaks earlier. Pick a stop and travel the road.
          </p>
        </div>

        {/* The road */}
        <div className="mt-14 pb-14">
          <div className="relative">
          <svg viewBox="0 0 1000 160" className="h-auto w-full overflow-visible" aria-hidden="true">
            <path ref={pathRef} d={ROUTE} fill="none" style={{ stroke: "var(--grid-line)" }} strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
            <path ref={trailRef} d={ROUTE} fill="none" style={{ stroke: "var(--color-apricot)" }} strokeWidth="3.5" strokeLinecap="round" />
            {STOPS.map((s, i) => (
              <motion.circle
                key={s.label}
                cx={s.x}
                cy={s.y}
                initial={false}
                animate={{ r: i === active ? 11 : 7, fill: i <= active ? "var(--color-apricot)" : "#fff1d4", stroke: i <= active ? "var(--color-apricot)" : "var(--ring-line)" }}
                strokeWidth={2}
                transition={{ duration: 0.5 }}
              />
            ))}
            <g ref={dotRef}>
              <circle r="16" fill="rgba(201,96,47,0.2)">
                <animate attributeName="r" values="12;22;12" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <circle r="6" style={{ fill: "var(--road-dot)" }} />
            </g>
          </svg>
          {STOPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={active === i}
              data-cursor="Travel"
              className="absolute w-20 -translate-x-1/2 text-center sm:w-auto"
              style={{ left: `${s.x / 10}%`, top: `${((s.y + 24) / 160) * 100}%` }}
            >
              <span className={cn("block font-mono text-[10.5px] font-bold transition-colors", active === i ? "text-apricot" : "text-faint")}>{s.stage}</span>
              <span className={cn("mt-0.5 block text-[12.5px] font-bold transition-colors sm:whitespace-nowrap sm:text-[15px]", active === i ? "text-bone" : "text-bone/40 hover:text-bone/70")}>
                {s.label}
              </span>
            </button>
          ))}
          </div>
        </div>

        {/* The stop */}
        <div className="mt-6 grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="relative mx-auto aspect-square w-full max-w-[460px]">
            <AnimatePresence initial={false}>
              <motion.img
                key={stop.photo}
                src={stop.photo}
                alt={stop.alt}
                initial={{ clipPath: "circle(0% at 50% 50%)", zIndex: 2 }}
                animate={{ clipPath: "circle(50% at 50% 50%)", zIndex: 2 }}
                exit={{ zIndex: 1, opacity: 0, transition: { duration: 0.6, delay: 0.5 } }}
                transition={{ duration: 1, ease: EASE }}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            </AnimatePresence>
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[5%] z-[3] h-[110%] w-[110%] -rotate-90" aria-hidden="true">
              <motion.circle key={active} cx="50" cy="50" r="48.5" fill="none" style={{ stroke: "var(--color-apricot)" }} strokeWidth="0.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE }} />
            </svg>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
                className="absolute -bottom-4 right-0 z-[4] text-right"
              >
                <p className="font-display text-[clamp(4rem,9vw,7rem)] leading-[0.85] text-apricot">{stop.newStat}</p>
                <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-bone">
                  {stop.unit}
                  {stop.oldStat !== "—" && <span className="ml-2 text-faint line-through">{stop.oldStat}</span>}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.45, ease: EASE }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-faint">
                  {stop.stage} · {stop.label} · today
                </p>
                <p className="mt-4 text-[clamp(1.25rem,2.1vw,1.7rem)] font-medium leading-snug text-fog">
                  <StrikeText replayKey={active} delay={0.45}>
                    {stop.old}
                  </StrikeText>
                </p>
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.6, ease: EASE }} className="mt-9">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-apricot">
                    <ArrowRight className="h-4 w-4" /> With Nirixon
                  </p>
                  <p className="mt-3 text-[clamp(1.35rem,2.4vw,2.05rem)] font-bold leading-snug tracking-tight text-bone">{stop.fix}</p>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex items-center gap-8 border-t border-bone/15 pt-5">
              <button
                type="button"
                onClick={() => setActive((a) => Math.max(0, a - 1))}
                disabled={active === 0}
                className="inline-flex items-center gap-2 text-[13px] font-bold text-bone transition-opacity disabled:opacity-25"
                data-cursor="Back"
              >
                <ArrowLeft className="h-4 w-4" /> Previous stop
              </button>
              <button
                type="button"
                onClick={() => setActive((a) => Math.min(STOPS.length - 1, a + 1))}
                disabled={active === STOPS.length - 1}
                className="inline-flex items-center gap-2 text-[13px] font-bold text-bone transition-opacity disabled:opacity-25"
                data-cursor="Next"
              >
                Next stop <ArrowRight className="h-4 w-4" />
              </button>
              <span className="ml-auto font-mono text-[12px] text-faint">
                {String(active + 1).padStart(2, "0")} / {String(STOPS.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  [07] Age groups — a constellation of areas around the child        */
/* ================================================================== */

type ModuleData = (typeof SHOWCASE)[number];

function Orbit({ m, photo }: { m: ModuleData; photo: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const N = m.areas.length;
  const nodes = m.areas.map(([area, ex], i) => {
    const a = ((-90 + (360 / N) * i) * Math.PI) / 180;
    return { area, ex, x: 50 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 40 };
  });
  const focus = hover === null ? null : m.areas[hover];

  return (
    <div>
      {/* Desktop constellation */}
      <div className="relative mx-auto hidden aspect-[16/10] w-full max-w-[1040px] md:block">
        <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <ellipse cx="80" cy="50" rx="65.6" ry="40" fill="none" style={{ stroke: "var(--grid-line)" }} strokeWidth="0.25" strokeDasharray="0.8 1.6" />
          {nodes.map((n, i) => (
            <motion.line
              key={`${m.id}-${i}`}
              x1="80"
              y1="50"
              x2={n.x * 1.6}
              y2={n.y}
              stroke={hover === i ? m.accent : "rgba(33,23,9,0.2)"}
              strokeWidth={hover === i ? 0.45 : 0.22}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.07, ease: EASE }}
            />
          ))}
        </svg>

        <motion.div
          key={photo}
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="absolute left-1/2 top-1/2 aspect-square h-[54%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-[0_30px_80px_-30px_rgba(29,20,9,0.55)]"
        >
          <img src={photo} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
        </motion.div>

        {nodes.map((n, i) => {
          const centered = Math.abs(n.x - 50) < 1;
          const right = n.x > 50;
          const on = hover === i;
          return (
            <motion.button
              key={`${m.id}-${n.area}`}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              data-cursor="Area"
              className="absolute h-0 w-0"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.07, duration: 0.5, ease: EASE }}
            >
              <span
                className="absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-shadow duration-300"
                style={{ background: m.accent, boxShadow: on ? `0 0 0 8px ${m.accent}33` : `0 0 0 4px #fff1d4` }}
              />
              <span
                className={cn(
                  "absolute whitespace-nowrap text-[15px] font-bold tracking-tight transition-colors duration-300",
                  centered ? (n.y < 50 ? "bottom-4 left-0 -translate-x-1/2 text-center" : "left-0 top-4 -translate-x-1/2 text-center") : right ? "left-5 top-0 -translate-y-1/2 text-left" : "right-5 top-0 -translate-y-1/2 text-right",
                  on ? "text-bone" : "text-bone/70",
                )}
              >
                {n.area}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mx-auto mt-2 hidden min-h-[52px] max-w-2xl text-center md:block" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p key={hover ?? -1} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="text-[15px] leading-relaxed">
            {focus ? (
              <>
                <strong className="text-bone">{focus[0]}</strong>
                <span className="text-fog"> — {focus[1] || "one of the 8 areas checked for ages 5–12."}</span>
              </>
            ) : (
              <span className="text-faint">Hover an area to see what we look at.</span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Mobile list */}
      <div className="md:hidden">
        <div className="relative mx-auto aspect-square w-[78%] overflow-hidden rounded-full">
          <img src={photo} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
        </div>
        <ul className="mt-8 border-t border-bone/15">
          {m.areas.map(([area, ex]) => (
            <li key={area} className="border-b border-bone/15 py-3">
              <p className="flex items-center gap-2.5 text-[15px] font-bold text-bone">
                <span className="h-2 w-2 rounded-full" style={{ background: m.accent }} />
                {area}
              </p>
              {ex && <p className="mt-0.5 pl-[18px] text-[12.5px] text-fog">{ex}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Modules() {
  const [id, setId] = useState<"early" | "scholar">("early");
  const m = SHOWCASE.find((x) => x.id === id) ?? SHOWCASE[0];
  const photo = id === "early" ? PHOTOS.motherBaby : PHOTOS.ctaSchool;

  return (
    <section id="modules" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="modules-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Kicker index="07">Two age groups · one safety rule</Kicker>
            <MaskedHeadline
              id="modules-title"
              lines={[{ text: "From first steps" }, { text: "to first grades.", className: "text-lagoon" }]}
              className="mt-6 text-[clamp(2.4rem,5.4vw,4.8rem)]"
            />
          </div>
          <TextTabs
            label="Choose an age group"
            size="lg"
            value={id}
            onChange={setId}
            items={[
              { id: "early", label: "0–60 months (0–5 yrs)", meta: "6 areas of development" },
              { id: "scholar", label: "5–12 years (60–144 mo)", meta: "8 areas of functioning" },
            ]}
          />
        </div>

        <div className="mt-12">
          <AnimatePresence mode="wait">
            <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <Orbit m={m} photo={photo} />
              <p className="mx-auto mt-4 max-w-2xl text-center text-[14.5px] leading-relaxed text-fog">{m.blurbs[0]}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-y-6 border-t border-bone/15 pt-7 md:grid-cols-4">
          {m.facts.map(([k, v], i) => (
            <div key={k} className={cn("px-2 text-center", i > 0 && "md:border-l md:border-bone/15")}>
              <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-faint">{k}</dt>
              <AnimatePresence mode="wait">
                <motion.dd key={v} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="mt-1.5 font-display text-[clamp(1.2rem,2vw,1.7rem)] uppercase tracking-wide text-bone">
                  {v}
                </motion.dd>
              </AnimatePresence>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
