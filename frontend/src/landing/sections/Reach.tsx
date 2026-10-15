import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Wifi, WifiOff } from "lucide-react";
import { PHOTOS } from "../data";
import { EASE, Kicker, MaskedHeadline, StrikeText } from "../components/editorial";
import { useView } from "../components/ViewContext";
import { cn } from "../utils/cn";

/* ================================================================== */
/*  [10] Paper checklist vs Nirixon — a ledger, struck through         */
/* ================================================================== */

const ROWS: { label: string; paper: string; nirixon: string }[] = [
  { label: "Questions", paper: "30–36", nirixon: "12–18" },
  { label: "Time", paper: "10+ minutes", nirixon: "Under 5 minutes" },
  { label: "Healthy children wrongly flagged (per 100)", paper: "12", nirixon: "1" },
  { label: "“See a doctor” flags that are correct", paper: "Under 4 in 10", nirixon: "About 9 in 10" },
  { label: "Overall ability to separate children who need help", paper: "About 78 out of 100", nirixon: "97.8 out of 100" },
  { label: "Borderline cases needing a clinic", paper: "100%", nirixon: "About 15% in testing" },
  { label: "Over-optimistic answers", paper: "Undetected", nirixon: "Detected" },
  { label: "Contradictory answers", paper: "Undetected", nirixon: "Detected" },
  { label: "Red-flag override", paper: "Clinician judgement only", nirixon: "Built-in rule" },
  { label: "Speed of scoring", paper: "Manual", nirixon: "Instant" },
];

export function Compare() {
  return (
    <section id="compare" className="relative py-20 md:py-28" aria-labelledby="compare-title">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Kicker index="10">Side by side</Kicker>
        <MaskedHeadline
          id="compare-title"
          lines={[{ text: "Paper checklist" }, { text: "vs Nirixon.", className: "text-apricot" }]}
          className="mt-6 text-[clamp(2.6rem,6vw,5.2rem)]"
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-[88px_minmax(0,1fr)] lg:items-stretch">
          <aside data-portrait-lane="compare" aria-hidden="true" className="compare-portrait-lane relative hidden lg:block" />
          <div data-overlay-protect className="min-w-0">
          <div className="grid grid-cols-2 gap-4 border-b-2 border-bone pb-3 text-[11px] font-bold uppercase tracking-[0.2em] sm:grid-cols-[1.35fr_1fr_1fr]">
            <span className="hidden text-bone/60 sm:block">Measure</span>
            <span className="text-bone/70">Paper checklist</span>
            <span className="text-apricot font-extrabold">Nirixon</span>
          </div>
          {ROWS.map((r, i) => (
            <div key={r.label} className="group relative grid grid-cols-2 items-baseline gap-x-4 gap-y-1 border-b border-bone/15 py-5 sm:grid-cols-[1.35fr_1fr_1fr]">
              <span className="absolute -left-4 top-0 hidden h-full w-[3px] origin-top scale-y-0 bg-apricot transition-transform duration-300 group-hover:scale-y-100 sm:block" aria-hidden="true" />
              <span className="col-span-2 text-[15px] font-bold text-bone sm:col-span-1">{r.label}</span>
              <span className="text-[15px] font-semibold text-bone/85">
                <StrikeText delay={0.15 + (i % 4) * 0.06} color="var(--color-apricot)">
                  {r.paper}
                </StrikeText>
              </span>
              <motion.span
                initial={{ opacity: 0, x: 14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-8% 0px" }}
                transition={{ duration: 0.6, delay: 0.45 + (i % 4) * 0.06, ease: EASE }}
                className="font-display text-[clamp(1.15rem,1.9vw,1.6rem)] uppercase leading-tight tracking-wide text-bone font-bold"
              >
                {r.nirixon}
              </motion.span>
            </div>
          ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  [11] Built for everyone — four arched doorways that open           */
/* ================================================================== */

type AudienceId = "parent" | "worker" | "clinician" | "whatsapp";

const AUDIENCES: { id: AudienceId; n: string; label: string; photo: string; alt: string; title: string; points: string[] }[] = [
  {
    id: "parent",
    n: "01",
    label: "Parents",
    photo: PHOTOS.motherInfant,
    alt: "An Indian mother holding her infant",
    title: "A 5-minute check, a plain result",
    points: ["A 5-minute check, a plain result", "Home activities while you wait for an appointment", "Audio in local languages at 0.8× or 1.0× speed"],
  },
  {
    id: "worker",
    n: "02",
    label: "ASHA & Anganwadi",
    photo: PHOTOS.ashaTall,
    alt: "A smiling Indian woman in traditional attire",
    title: "A whole village or ward, in one batch",
    points: ["Check a whole village or ward in a batch", "One-touch referral", "Works offline", "Battery-saving dark mode"],
  },
  {
    id: "clinician",
    n: "03",
    label: "Clinicians",
    photo: PHOTOS.doctorTall,
    alt: "An Indian doctor in traditional attire with a stethoscope",
    title: "Only the children who need seeing",
    points: ["Raw responses and the reasons behind each result", "What-If slider", "Home-vs-school comparison", "Only the children who need seeing"],
  },
  {
    id: "whatsapp",
    n: "04",
    label: "WhatsApp",
    photo: PHOTOS.ruralMom,
    alt: "A woman in traditional attire in a rural field in Kanpur, India",
    title: "No app store needed",
    points: ["Check in through WhatsApp", "Under 50 KB per session", "Same questions, same safety rule"],
  },
];

function Extra({ id }: { id: AudienceId }) {
  const [speed, setSpeed] = useState<"0.8" | "1.0">("1.0");
  const [offline, setOffline] = useState(true);

  if (id === "parent") {
    return (
      <div className="mt-5 space-y-2 text-[13.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        <p className="flex items-center gap-3">
          <span className="text-paper font-semibold">Audio speed</span>
          {(["0.8", "1.0"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSpeed(s);
              }}
              className={cn("font-bold underline-offset-4 transition-colors", speed === s ? "text-paper underline" : "text-paper/70 hover:text-paper")}
            >
              {s}×
            </button>
          ))}
        </p>
        <p className="text-paper/90">
          <span className="font-bold text-paper">While you wait:</span> 3-beat clap game for attention · finger-tracking reading
        </p>
      </div>
    );
  }
  if (id === "worker") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOffline((o) => !o);
        }}
        className="mt-5 inline-flex items-center gap-2.5 text-[13px] font-bold text-paper"
      >
        {offline ? <WifiOff className="h-4 w-4 text-[#f0a77c]" /> : <Wifi className="h-4 w-4 text-[#9fd08f]" />}
        {offline ? "Offline — answers saved on the phone" : "Back online — synced"}
        <span className="text-[11px] font-semibold text-paper/50">(tap)</span>
      </button>
    );
  }
  if (id === "clinician") {
    return (
      <a href="#toolkit" onClick={(e) => e.stopPropagation()} className="mt-5 inline-flex items-center gap-2 text-[13.5px] font-bold text-paper underline underline-offset-4">
        Open the toolkit <ArrowUpRight className="h-4 w-4" />
      </a>
    );
  }
  return (
    <div className="mt-5 max-w-[320px] space-y-1.5 text-[12.5px]">
      <p className="w-fit rounded-2xl rounded-bl-sm px-3.5 py-2 font-semibold" style={{ background: "#fff1d4", color: "#211709" }}>Can your child pick up a toy from the floor without holding on? 1 Yes · 2 Tried · 3 Not yet</p>
      <p className="ml-auto w-fit rounded-2xl rounded-br-sm px-3.5 py-2 font-semibold" style={{ background: "var(--wa-bg)", color: "var(--wa-text)" }}>1</p>
    </div>
  );
}

export function Audience() {
  const { view } = useView();
  const [active, setActive] = useState<AudienceId>("parent");
  useEffect(() => setActive(view === "worker" ? "worker" : view === "clinician" ? "clinician" : "parent"), [view]);

  return (
    <section id="audience" className="relative overflow-hidden py-20 md:py-28" aria-labelledby="audience-title">
      <div data-audience-foreground className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Kicker index="11">Built for everyone who cares for a child</Kicker>
            <MaskedHeadline
              id="audience-title"
              lines={[{ text: "One check." }, { text: "Every hand that helps.", className: "text-leaf" }]}
              className="mt-6 text-[clamp(2.4rem,5.4vw,4.8rem)]"
            />
          </div>
          <p className="max-w-sm text-[15px] leading-relaxed text-fog">Hover or tap a doorway. Switching the view above opens the right one for you.</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_100px]">
        <div className="flex flex-col gap-3 lg:h-[620px] lg:flex-row" role="tablist" aria-label="Who Nirixon is for">
          {AUDIENCES.map((a) => {
            const on = a.id === active;
            return (
              <div
                key={a.id}
                role="tab"
                tabIndex={0}
                aria-selected={on}
                onMouseEnter={() => setActive(a.id)}
                onClick={() => setActive(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(a.id);
                  }
                }}
                data-cursor={a.label}
                className={cn(
                  "arch relative cursor-pointer overflow-hidden text-paper outline-none transition-[flex-grow,height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-apricot lg:h-full lg:basis-0",
                  on ? "h-[540px]" : "h-[130px]",
                )}
                style={{ flexGrow: on ? 3.3 : 1 }}
              >
                <motion.img src={a.photo} alt={a.alt} className="absolute inset-0 h-full w-full object-cover" animate={{ scale: on ? 1 : 1.12 }} transition={{ duration: 1.1, ease: EASE }} loading="lazy" draggable={false} />
                <div className={cn("absolute inset-0 transition-opacity duration-700", on ? "bg-gradient-to-t from-night via-night/45 to-transparent" : "bg-night/45")} />

                {/* Collapsed label */}
                <div className={cn("absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 lg:bottom-8", on ? "opacity-0" : "opacity-100")}>
                  <span className="hidden whitespace-nowrap font-display text-[26px] uppercase tracking-wide [writing-mode:vertical-rl] rotate-180 lg:block">{a.label}</span>
                  <span className="whitespace-nowrap font-display text-[22px] uppercase tracking-wide lg:hidden">{a.label}</span>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {on && (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.3, duration: 0.6, ease: EASE } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      className="absolute inset-x-6 bottom-7 sm:inset-x-8 lg:min-w-[400px]"
                    >
                      <p className="font-mono text-[11px] font-bold text-[#f0a77c]">
                        {a.n} · {a.label}
                      </p>
                      <h3 className="mt-2 font-display text-[clamp(1.8rem,3vw,2.6rem)] uppercase leading-[0.95]">{a.title}</h3>
                      <ul className="mt-4 space-y-1.5">
                        {a.points.map((p) => (
                          <li key={p} className="flex items-start gap-2.5 text-[14px] text-paper/90">
                            <span className="mt-[9px] h-[2px] w-3 shrink-0 bg-[#f0a77c]" />
                            {p}
                          </li>
                        ))}
                      </ul>
                      <Extra id={a.id} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
          <aside data-portrait-lane="audience" aria-hidden="true" className="audience-portrait-lane relative hidden lg:block" />
        </div>
      </div>
    </section>
  );
}
