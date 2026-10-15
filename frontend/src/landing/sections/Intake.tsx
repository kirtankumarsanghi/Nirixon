import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Check, LifeBuoy } from "lucide-react";
import { PHOTOS } from "../data";
import { EASE, Kicker, MaskedHeadline, TextTabs } from "../components/editorial";
import { EvaluatorNote, SampleBadge, TIER_COLORS } from "../components/ViewContext";
import { cn } from "../utils/cn";

/* ================================================================== */
/*  01 · Tell us in your own words — annotated, like a marked-up page  */
/* ================================================================== */

const EXAMPLES = [
  { lang: "English", text: "He has trouble concentrating on homework and gets upset when reading aloud." },
  { lang: "Hinglish", text: "Homework pe dhyaan nahi lagta, aur reading ke time ro deta hai." },
  { lang: "हिंदी", text: "पढ़ते समय उसका ध्यान नहीं लगता और वह जल्दी गुस्सा हो जाता है।" },
];

const RULES: { area: string; color: string; cues: string[]; question: string }[] = [
  { area: "Attention & focus", color: "var(--color-lagoon)", cues: ["concentrat", "focus", "attention", "distract", "dhyaan", "dhyan", "ध्यान", "fidget", "sit still"], question: "How often does your child lose focus during homework?" },
  { area: "Reading & phonics", color: "var(--color-apricot)", cues: ["read", "padh", "पढ़", "letters", "spell", "phonics"], question: "How often does reading aloud tire or upset your child?" },
  { area: "Writing & motor", color: "#a8741a", cues: ["writ", "likh", "लिख", "pencil", "handwriting"], question: "How often is writing slow or hard to read?" },
  { area: "Math & numbers", color: "var(--color-leaf)", cues: ["math", "numbers", "ganit", "गणित", "hisab"], question: "How often does your child struggle with numbers?" },
  { area: "Listening & speech", color: "#7a5c8e", cues: ["speak", "speech", "talk", "bolta", "bolti", "बोल", "stammer", "listen", "sunta", "sunti", "सुन"], question: "How often is your child hard to understand?" },
  { area: "Social skills", color: "#2f6f6a", cues: ["friend", "dost", "alone", "akela", "दोस्त"], question: "How often does your child play alone when others are around?" },
  { area: "Emotion & behaviour", color: "var(--tier-red)", cues: ["upset", "angry", "cry", "ro deta", "rota", "gussa", "गुस्सा", "tantrum", "scared"], question: "How often does your child get upset over small things?" },
  { area: "Vision & hearing", color: "var(--color-faint)", cues: ["eyes", "squint", "dekh", "देख", "hear", "kaan", "कान", "close to"], question: "How often does your child hold books very close, or ask you to repeat things?" },
];

const CRISIS = ["hurt himself", "hurt herself", "self-harm", "self harm", "suicide", "kill himself", "kill herself", "khud ko", "marna chahta", "मरना", "जान दे"];
const SCALE = ["Never", "Rarely", "Sometimes", "Often", "Very often"];
const WORD = /[\p{L}\p{M}\p{N}]/u;

type Seg = { text: string; area?: number };

function annotate(text: string): { segs: Seg[]; found: { area: number; cue: string }[] } {
  const lower = text.toLowerCase();
  const ranges: { s: number; e: number; area: number }[] = [];
  RULES.forEach((r, ai) =>
    r.cues.forEach((cue) => {
      let from = 0;
      for (;;) {
        const idx = lower.indexOf(cue, from);
        if (idx === -1) break;
        let s = idx;
        let e = idx + cue.length;
        while (s > 0 && WORD.test(text[s - 1])) s--;
        while (e < text.length && WORD.test(text[e])) e++;
        ranges.push({ s, e, area: ai });
        from = idx + cue.length;
      }
    }),
  );
  ranges.sort((a, b) => a.s - b.s || b.e - a.e);
  const kept: typeof ranges = [];
  let last = -1;
  for (const r of ranges) {
    if (r.s >= last) {
      kept.push(r);
      last = r.e;
    }
  }
  const segs: Seg[] = [];
  let i = 0;
  for (const r of kept) {
    if (r.s > i) segs.push({ text: text.slice(i, r.s) });
    segs.push({ text: text.slice(r.s, r.e), area: r.area });
    i = r.e;
  }
  if (i < text.length) segs.push({ text: text.slice(i) });
  const found = [...new Map(kept.map((r) => [r.area, { area: r.area, cue: text.slice(r.s, r.e) }])).values()];
  return { segs, found };
}

function Ruler({ value, onChange, color }: { value: number | undefined; onChange: (v: number) => void; color: string }) {
  return (
    <div className="relative mt-4" role="radiogroup">
      <span className="absolute left-[10%] right-[10%] top-[7px] h-px bg-bone/25" aria-hidden="true" />
      <div className="relative grid grid-cols-5">
        {SCALE.map((s, i) => {
          const on = value === i;
          return (
            <button key={s} type="button" role="radio" aria-checked={on} onClick={() => onChange(i)} className="flex flex-col items-center gap-2" data-cursor={s}>
              <motion.span
                className="h-[15px] w-[15px] rounded-full border-2"
                animate={{ scale: on ? 1.35 : 1, backgroundColor: on ? color : "#fff1d4", borderColor: on ? color : "var(--ring-line)" }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              />
              <span className={cn("text-[11px] font-semibold transition-colors", on ? "text-bone" : "text-faint")}>{s}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OwnWords() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [replies, setReplies] = useState<Record<string, number>>({});
  const { segs, found } = useMemo(() => annotate(text), [text]);
  const crisis = useMemo(() => CRISIS.some((c) => text.toLowerCase().includes(c)), [text]);

  return (
    <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr]">
      <div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">Try a sample</span>
          {EXAMPLES.map((e) => (
            <button
              key={e.lang}
              type="button"
              onClick={() => {
                setText(e.text);
                setReplies({});
              }}
              className={cn("relative pb-1 text-[14px] font-bold transition-colors", text === e.text ? "text-bone" : "text-bone/40 hover:text-bone/70")}
            >
              {e.lang}
              {text === e.text && <motion.span layoutId="sample-line" className="absolute inset-x-0 bottom-0 h-[2px] bg-apricot" />}
            </button>
          ))}
        </div>

        <label className="mt-6 block">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">What are you noticing? Type or speak.</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="mt-2 w-full resize-none border-0 border-b-2 border-bone/50 bg-transparent pb-3 text-[17px] leading-relaxed text-bone outline-none transition-colors focus:border-apricot"
            placeholder="Tell us in your own words…"
          />
        </label>

        <p className="mt-10 text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">What we heard</p>
        <p className="mt-3 text-[clamp(1.5rem,2.9vw,2.4rem)] font-semibold leading-[1.35] tracking-tight text-bone" aria-live="polite">
          {segs.map((s, i) =>
            s.area === undefined ? (
              <span key={i}>{s.text}</span>
            ) : (
              <motion.mark
                key={`${i}-${s.text}`}
                className="rounded-[3px] bg-transparent px-0.5 text-bone"
                style={{
                  backgroundImage: `linear-gradient(transparent 58%, color-mix(in srgb, ${RULES[s.area].color} 34%, transparent) 58%)`,
                  backgroundRepeat: "no-repeat",
                }}
                initial={{ backgroundSize: "0% 100%" }}
                animate={{ backgroundSize: "100% 100%" }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: EASE }}
              >
                {s.text}
              </motion.mark>
            ),
          )}
        </p>

        {crisis && (
          <div className="mt-6 border-l-[3px] pl-4" style={{ borderColor: "var(--tier-red)" }}>
            <p className="flex items-center gap-2 text-[14px] font-bold" style={{ color: TIER_COLORS.red }}>
              <LifeBuoy className="h-4 w-4" /> This sounds urgent. Please reach out now.
            </p>
            <p className="mt-1 text-[14px] text-bone">
              <a href="tel:14416" className="font-bold underline underline-offset-4">Tele-MANAS 14416</a> ·{" "}
              <a href="tel:18005990019" className="font-bold underline underline-offset-4">KIRAN 1800-599-0019</a> ·{" "}
              <a href="tel:1098" className="font-bold underline underline-offset-4">Childline 1098</a>
            </p>
          </div>
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-faint">This preview runs a simple keyword match in your browser. The app uses the trained model below.</p>
        <EvaluatorNote>
          TF-IDF with One-vs-Rest logistic regression plus a rule-based safety scanner. 72.4% of notes with true clinical domains
          flagged on first pass, 100% recall on self-harm and crisis flags in testing.
        </EvaluatorNote>
      </div>

      <div>
        <div className="relative mx-auto mb-8 hidden aspect-square w-40 overflow-hidden rounded-full lg:block">
          <img src={PHOTOS.motherInfant} alt="An Indian mother holding her infant" className="h-full w-full object-cover" loading="lazy" />
        </div>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">Matched to</p>
        {found.length === 0 ? (
          <p className="mt-3 text-[14.5px] leading-relaxed text-fog">No clear area yet. Add a little more — what happens, and where?</p>
        ) : (
          <ul className="mt-3 border-t border-bone/15">
            <AnimatePresence initial={false}>
              {found.map((f) => {
                const r = RULES[f.area];
                return (
                  <motion.li key={r.area} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="border-b border-bone/15 py-4">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-[15px] font-bold text-bone">
                        <span className="h-3 w-[3px] rounded-full" style={{ background: r.color }} />
                        {r.area}
                      </span>
                      <span className="truncate text-[12px] italic text-faint">“{f.cue}”</span>
                    </p>
                    <p className="mt-3 text-[13.5px] font-semibold text-bone/85">{r.question}</p>
                    <Ruler value={replies[r.area]} onChange={(v) => setReplies((p) => ({ ...p, [r.area]: v }))} color={r.color} />
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  02 · Home and school together — a live Venn diagram                */
/* ================================================================== */

type Seen = { home: boolean; school: boolean };
const CONCERN_COLORS = ["var(--color-lagoon)", "var(--color-apricot)", "var(--tier-red)"];

function verdict(s: Seen) {
  if (s.home && s.school) return { text: "Strong signal — seen in 2 settings", tone: TIER_COLORS.red };
  if (s.school) return { text: "School only — may point to the classroom setting", tone: TIER_COLORS.amber };
  if (s.home) return { text: "Home only — we’ll ask the teacher too", tone: TIER_COLORS.amber };
  return { text: "Not noticed in either setting", tone: TIER_COLORS.green };
}

function HomeSchool() {
  const [rows, setRows] = useState<Record<string, Seen>>({
    "Attention & focus": { home: true, school: true },
    "Reading & phonics": { home: false, school: true },
    "Emotion & behaviour": { home: true, school: false },
  });
  const entries = Object.entries(rows);
  const noticed = entries.filter(([, s]) => s.home || s.school);
  const both = noticed.filter(([, s]) => s.home && s.school).length;
  const toggle = (area: string, key: keyof Seen) => setRows((r) => ({ ...r, [area]: { ...r[area], [key]: !r[area][key] } }));

  return (
    <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div>
        <div className="relative mx-auto aspect-[400/290] w-full max-w-[580px]">
          <svg viewBox="0 0 400 290" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <motion.circle cx="150" cy="140" r="110" fill="rgba(201,96,47,0.09)" style={{ stroke: "var(--color-apricot)" }} strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
            <motion.circle cx="250" cy="140" r="110" fill="rgba(59,127,147,0.09)" style={{ stroke: "var(--color-lagoon)" }} strokeWidth="1.5" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.2, ease: EASE }} />
            <text x="62" y="18" style={{ fill: "var(--color-apricot)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em" }}>HOME · PARENT</text>
            <text x="338" y="18" textAnchor="end" style={{ fill: "var(--color-lagoon)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em" }}>SCHOOL · TEACHER</text>
            <text x="200" y="22" textAnchor="middle" style={{ fill: "var(--color-faint)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em" }}>BOTH</text>
          </svg>
          {entries.map(([area, s], i) => {
            const inAny = s.home || s.school;
            const left = s.home && s.school ? 50 : s.home ? 23 : s.school ? 77 : 30 + i * 20;
            const top = inAny ? 33 + i * 17 : 96;
            return (
              <motion.div
                key={area}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                initial={false}
                animate={{ left: `${left}%`, top: `${top}%`, opacity: inAny ? 1 : 0.55 }}
                transition={{ type: "spring", stiffness: 120, damping: 17 }}
              >
                <span className="h-3.5 w-3.5 rounded-full ring-4 ring-paper" style={{ background: CONCERN_COLORS[i] }} />
                <span className="mt-1 whitespace-nowrap text-[11.5px] font-bold text-bone">{area}</span>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[13px] text-faint">Concerns that fall outside both circles were not noticed by either.</p>
      </div>

      <div>
        <p className="text-[15px] leading-relaxed text-fog">
          We compare what parents and teachers see. Attention difficulties seen at both home and school are a strong signal.
          Difficulties seen only at school may point to the classroom setting.
        </p>
        <ul className="mt-6 border-t border-bone/15">
          {entries.map(([area, s], i) => {
            const v = verdict(s);
            return (
              <li key={area} className="border-b border-bone/15 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-[15px] font-bold text-bone">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CONCERN_COLORS[i] }} />
                    {area}
                  </span>
                  <span className="flex gap-4">
                    {(["home", "school"] as (keyof Seen)[]).map((k) => (
                      <button key={k} type="button" role="checkbox" aria-checked={s[k]} onClick={() => toggle(area, k)} className="inline-flex items-center gap-2 text-[13px] font-bold text-bone" data-cursor="Toggle">
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded-[4px] border-2 transition-colors", s[k] ? "border-bone bg-bone" : "border-bone/35")}>
                          {s[k] && <Check className="h-3 w-3 text-paper" strokeWidth={3.5} />}
                        </span>
                        {k === "home" ? "Parent" : "Teacher"}
                      </button>
                    ))}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p key={v.text} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="mt-1.5 pl-5 text-[13px] font-semibold" style={{ color: v.tone }}>
                    {v.text}
                  </motion.p>
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-[14px] text-bone">
          Seen in both settings: <strong className="font-display text-[22px] tracking-wide text-lagoon">{noticed.length ? Math.round((both / noticed.length) * 100) : 0}%</strong>{" "}
          of noticed concerns
        </p>
        <div className="mt-2 flex items-center gap-4">
          <SampleBadge />
        </div>
        <EvaluatorNote>Cross-context consistency score, matching the DSM-5 rule that symptoms appear in two or more settings. Sample data shown.</EvaluatorNote>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  03 · Can the answers be trusted? — the milestone staircase         */
/* ================================================================== */

const LADDER = ["Sits without support", "Walks holding furniture", "Stacks 2 blocks", "Runs without falling", "Uses two-word phrases", "Builds a tower of 6 blocks"];
type Ans = "yes" | "no";
type ScenarioKey = "typical" | "tooGood" | "contradictory";

const SCENARIOS: Record<ScenarioKey, { label: string; age: string; answers: Ans[]; ahead: boolean[] }> = {
  typical: { label: "Typical answers", age: "Sample child · 14 months", answers: ["yes", "yes", "yes", "no", "no", "no"], ahead: [false, false, false, true, true, true] },
  tooGood: { label: "Too good to be true", age: "Sample child · 14 months", answers: ["yes", "yes", "yes", "yes", "yes", "yes"], ahead: [false, false, false, true, true, true] },
  contradictory: { label: "Contradictory", age: "Sample child · 24 months", answers: ["no", "yes", "no", "yes", "no", "yes"], ahead: [false, false, false, false, false, false] },
};

/** Prerequisite → harder skill. "Not yet" on the first with "Yes" on the second is impossible. */
const PAIRS: [number, number][] = [
  [0, 3],
  [2, 5],
  [1, 3],
];

function TrustChecks() {
  const [key, setKey] = useState<ScenarioKey>("typical");
  const sc = SCENARIOS[key];
  const aheadIdx = sc.ahead.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  const endorsed = aheadIdx.filter((i) => sc.answers[i] === "yes").length;
  const acq = aheadIdx.length > 0 && endorsed / aheadIdx.length >= 0.6;
  const inversions = PAIRS.filter(([a, b]) => sc.answers[a] === "no" && sc.answers[b] === "yes");
  const guttman = inversions.length >= 2;

  const step = (i: number) => ({ x: 75 + i * 90, y: 290 - i * 44 });

  const checks = [
    {
      title: "Honest-answer check",
      ok: "We notice if answers are too good to be true.",
      bad: `Flagged: ${endorsed} of ${aheadIdx.length} skills 6+ months ahead were marked “yes”. A short video check is suggested.`,
      flag: acq,
      eval: "Acquiescence guard: flags when 60% or more of items 6+ months ahead are endorsed, and suggests a video check.",
    },
    {
      title: "Consistency check",
      ok: "We notice if answers contradict each other.",
      bad: `Flagged: ${inversions.length} impossible sequences, such as “can’t sit” but “runs”.`,
      flag: guttman,
      eval: "Guttman inversion guard: flags 2 or more impossible sequences, such as “can’t sit” but “runs unassisted”.",
    },
    { title: "Safety rule", ok: "Always running.", bad: "", flag: false, eval: "Deterministic override: any domain below −2.0 SD, or reported regression, triggers a Tier 3 referral." },
    { title: "Fair across languages", ok: "Works equally well for Hindi, English and Hinglish speakers.", bad: "", flag: false, eval: "Max disparity 0.005 across Hindi, English and Hinglish speaker groups." },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <TextTabs
          label="Answer pattern"
          value={key}
          onChange={setKey}
          items={(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => ({ id: k, label: SCENARIOS[k].label }))}
        />
        <SampleBadge>{sc.age}</SampleBadge>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
        {/* Staircase */}
        <div className="relative aspect-[600/330] w-full">
          <svg viewBox="0 0 600 330" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path d="M30,290 H120 V246 H210 V202 H300 V158 H390 V114 H480 V70 H570" fill="none" style={{ stroke: "var(--ring-line)" }} strokeWidth="1.5" />
            <text x="30" y="318" style={{ fill: "var(--color-faint)", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>EASIER</text>
            <text x="570" y="318" textAnchor="end" style={{ fill: "var(--color-faint)", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>HARDER →</text>
            <AnimatePresence>
              {inversions.map(([a, b]) => {
                const p = step(a);
                const q = step(b);
                return (
                  <motion.path
                    key={`${key}-${a}-${b}`}
                    d={`M${p.x},${p.y} Q${(p.x + q.x) / 2},${Math.min(p.y, q.y) - 110} ${q.x},${q.y}`}
                    fill="none"
                    stroke={TIER_COLORS.red}
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: EASE }}
                  />
                );
              })}
            </AnimatePresence>
            {LADDER.map((_, i) => {
              const { x, y } = step(i);
              const yes = sc.answers[i] === "yes";
              const glow = sc.ahead[i] && yes && acq;
              return (
                <g key={i}>
                  {glow && (
                    <motion.circle cx={x} cy={y} fill="rgba(168,116,26,0.25)" initial={{ r: 0 }} animate={{ r: [14, 20, 14] }} transition={{ duration: 2, repeat: Infinity }} />
                  )}
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={9}
                    strokeWidth={2.5}
                    initial={false}
                    animate={{ fill: yes ? TIER_COLORS.green : "#fff1d4", stroke: yes ? TIER_COLORS.green : "var(--ring-line)" }}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                  />
                </g>
              );
            })}
          </svg>
          {LADDER.map((label, i) => {
            const { x, y } = step(i);
            const yes = sc.answers[i] === "yes";
            return (
              <div key={label} className="absolute w-[15.5%] -translate-x-1/2 text-center" style={{ left: `${(x / 600) * 100}%`, top: `${((y - 58) / 330) * 100}%` }}>
                <p className="text-[10.5px] font-bold leading-tight text-bone sm:text-[11.5px]">{label}</p>
                <AnimatePresence mode="wait">
                  <motion.p key={`${key}-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em]", yes ? "text-leaf" : "text-faint")}>
                    {yes ? "Yes" : "Not yet"}
                    {sc.ahead[i] && <span className="text-gold"> · 6+ mo ahead</span>}
                  </motion.p>
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Checks */}
        <ul className="border-t border-bone/15">
          {checks.map((c) => (
            <li key={c.title} className="grid grid-cols-[24px_1fr] gap-3 border-b border-bone/15 py-4">
              <span className="pt-0.5">
                {c.flag ? <AlertTriangle className="h-[18px] w-[18px]" style={{ color: TIER_COLORS.amber }} /> : <CheckCircle2 className="h-[18px] w-[18px] text-leaf" />}
              </span>
              <div>
                <p className="text-[15px] font-bold text-bone">{c.title}</p>
                <AnimatePresence mode="wait">
                  <motion.p key={String(c.flag) + key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 text-[13.5px] leading-relaxed" style={{ color: c.flag ? TIER_COLORS.amber : "#5b4a38" }}>
                    {c.flag ? c.bad : c.ok}
                  </motion.p>
                </AnimatePresence>
                <EvaluatorNote className="mt-2">{c.eval}</EvaluatorNote>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  [08] Listening & checking                                           */
/* ================================================================== */

type TabId = "words" | "settings" | "trust";

export function Intake() {
  const [tab, setTab] = useState<TabId>("words");
  return (
    <section id="intake" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="intake-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Kicker index="08">Ages 6–12 · listening and checking</Kicker>
        <MaskedHeadline
          id="intake-title"
          lines={[{ text: "We listen first," }, { text: "then we check.", className: "text-apricot" }]}
          className="mt-6 text-[clamp(2.4rem,5.4vw,4.8rem)]"
        />

        <TextTabs
          className="mt-12 border-b border-bone/15"
          label="Listening and checking"
          value={tab}
          onChange={setTab}
          items={[
            { id: "words", meta: "01", label: "Tell us in your own words" },
            { id: "settings", meta: "02", label: "Home and school together" },
            { id: "trust", meta: "03", label: "Can the answers be trusted?" },
          ]}
        />

        <div className="mt-12">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4, ease: EASE }}>
              {tab === "words" && <OwnWords />}
              {tab === "settings" && <HomeSchool />}
              {tab === "trust" && <TrustChecks />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
