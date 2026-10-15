import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PHOTOS } from "../data";
import { LogoLockup } from "../components/system";
import { EASE, Kicker, MaskedHeadline, RevealImage, RingText } from "../components/editorial";
import { cn } from "../utils/cn";

/* ================================================================== */
/*  [12] Questions — editorial Q&A                                     */
/* ================================================================== */

const FAQS = [
  {
    q: "Does Nirixon diagnose my child?",
    a: "No. Nirixon supports screening and does not give a diagnosis. It tells you whether your child is on track, whether to look closer, or whether to see a doctor — and points you to the nearest early-intervention centre (DEIC) when needed.",
  },
  {
    q: "How can it ask only 12–18 questions?",
    a: "It skips what doesn’t apply to your child. Each answer decides which question is most useful next, with a minimum of 8 and a maximum of 18 across 6 areas. The paper checklist (ASQ-3) asks every child the same 30–36 questions.",
  },
  {
    q: "What if the AI gets it wrong for a child who really needs help?",
    a: "A safety rule watches every answer, and no AI score can override it. If your child has lost a skill, or is far behind in any area (more than 2 standard deviations), the AI is skipped and you are referred straight to a doctor.",
  },
  {
    q: "Which languages can I use?",
    a: "English, Hindi and Hinglish — typed or spoken. In testing it worked equally well across these language groups. Question audio can play at 0.8× or 1.0× speed.",
  },
  {
    q: "How was it tested?",
    a: "On a 250-case evaluation set, against the ASQ-3 paper-checklist rule: about 9 in 10 “see a doctor” flags were correct (vs fewer than 4 in 10), and about 1 in 100 healthy children was wrongly flagged (vs 12). Field validation is planned.",
  },
  {
    q: "What about my child’s data?",
    a: "Nirixon is designed with DPDPA 2023 principles and aligned with ICMR guidance. Health workers can use it offline, and a WhatsApp check-in uses under 50 KB per session.",
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative py-20 md:py-28" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Kicker index="12">Questions, answered</Kicker>
          <MaskedHeadline
            id="faq-title"
            lines={[{ text: "What families" }, { text: "and evaluators" }, { text: "ask first.", className: "text-lagoon" }]}
            className="mt-6 text-[clamp(2.3rem,4.6vw,4rem)]"
          />
          <div className="relative mt-12 hidden aspect-square w-[280px] lg:block">
            <RingText text="Supports screening · not a diagnosis · " className="absolute inset-0 h-full w-full text-bone/55" duration={40} />
            <div className="absolute inset-[13%] overflow-hidden rounded-full">
              <img src={PHOTOS.streetBoy} alt="A young Indian boy smiling on a busy street" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </div>
        </div>

        <div className="border-t-2 border-bone">
          {FAQS.map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q} className="border-b border-bone/15">
                <button type="button" onClick={() => setOpen(on ? -1 : i)} aria-expanded={on} className="group flex w-full items-start gap-5 py-6 text-left" data-cursor={on ? "Close" : "Read"}>
                  <span className={cn("pt-1.5 font-mono text-[12px] font-bold transition-colors", on ? "text-apricot" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={cn("flex-1 text-[clamp(1.1rem,1.9vw,1.5rem)] font-bold leading-snug tracking-tight transition-colors", on ? "text-bone" : "text-bone/70 group-hover:text-bone")}>{f.q}</span>
                  <span className="relative mt-2.5 h-4 w-4 shrink-0" aria-hidden="true">
                    <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-bone" />
                    <span className={cn("absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-bone transition-transform duration-300", on && "scale-y-0")} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
                      <p className="max-w-2xl pb-7 pl-10 text-[15.5px] leading-relaxed text-fog">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/*  [13] Close — full-bleed photo band, helplines, footer              */
/* ================================================================== */

const HELPLINES = [
  { name: "Tele-MANAS", number: "14416", tel: "14416" },
  { name: "KIRAN", number: "1800-599-0019", tel: "18005990019" },
  { name: "Childline", number: "1098", tel: "1098" },
];

const COLS = [
  { h: "Product", links: [["Key results", "#proof"], ["Safety rule", "#safety"], ["Try it", "#try"], ["Two age groups", "#modules"]] },
  { h: "For", links: [["Parents", "#audience"], ["ASHA & Anganwadi", "#audience"], ["Clinicians", "#audience"], ["WhatsApp", "#audience"]] },
  { h: "Trust", links: [["Answer checks", "#intake"], ["Paper vs Nirixon", "#compare"], ["FAQ", "#faq"], ["Book a demo", "#cta"]] },
];

export function CtaFooter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <footer className="relative" aria-label="Get a demo and site footer">
      <section id="cta" className="relative overflow-hidden text-paper" aria-labelledby="cta-title">
        <RevealImage src={PHOTOS.boysGroup} alt="" className="absolute inset-0" parallax={70} />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/25" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[86svh] max-w-7xl flex-col justify-end px-5 pb-16 pt-32 sm:px-8 md:pb-20">
          <Kicker index="13" tone="paper">
            Every child, checked in time
          </Kicker>
          <MaskedHeadline
            tone="paper"
            id="cta-title"
            lines={[{ text: "Five minutes now." }, { text: "A lifetime of difference.", className: "text-[#f0a77c]" }]}
            className="mt-6 text-[clamp(2.8rem,7.6vw,7rem)]"
          />
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-paper/80">
            See Nirixon run for ages 0–60 months and 6–12 years — in the parent, clinician and health-worker views.
          </p>

          <form
            className="mt-10 flex max-w-xl items-end gap-5 border-b-2 border-paper/60 pb-3 transition-colors focus-within:border-[#f0a77c]"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) setSent(true);
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSent(false);
                }}
                placeholder="Your email"
                className="w-full bg-transparent text-[clamp(1.1rem,2vw,1.4rem)] text-paper outline-none placeholder:text-paper/45"
              />
            </label>
            <button type="submit" className="group inline-flex shrink-0 items-center gap-2 text-[13px] font-bold uppercase tracking-[0.18em] text-paper" data-cursor="Send">
              {sent ? (
                <>
                  Requested <CheckCircle2 className="h-4 w-4 text-[#9fd08f]" />
                </>
              ) : (
                <>
                  Book a demo <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-paper/60">
            Safety rule, always on <span className="mx-2 text-paper/30">/</span> Designed with DPDPA 2023 principles <span className="mx-2 text-paper/30">/</span> Works offline
          </p>
        </div>
      </section>

      {/* Need help right now? */}
      <div className="border-b border-bone/15">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-8 gap-y-3 px-5 py-7 sm:px-8">
          <span className="flex items-center gap-2.5 text-[15px] font-bold text-bone">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#b8432f]" aria-hidden="true" />
            Need help right now?
          </span>
          {HELPLINES.map((h) => (
            <a key={h.name} href={`tel:${h.tel}`} className="group text-[15px] font-bold text-bone" data-cursor="Call">
              <span className="text-faint">{h.name}</span>{" "}
              <span className="font-mono underline decoration-bone/25 underline-offset-[6px] transition-colors group-hover:decoration-[#b8432f]">{h.number}</span>
            </a>
          ))}
          <span className="text-[13px] text-fog">Nearest early-intervention centre (DEIC): shown in the app</span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-14 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_2fr]">
          <div>
            <a href="#top" aria-label="Nirixon home">
              <LogoLockup markClassName="h-10 w-10" wordClassName="h-[24px]" />
            </a>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-fog">AI-assisted developmental screening for every child in India.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLS.map((c) => (
              <nav key={c.h} aria-label={c.h}>
                <h3 className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-faint">{c.h}</h3>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href} className="text-[14px] font-medium text-bone/75 transition-colors hover:text-bone">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <ul className="mt-12 grid gap-2 border-t border-bone/15 pt-6 text-[12.5px] text-fog sm:grid-cols-2">
          <li>Nirixon supports screening and does not give a diagnosis.</li>
          <li>Based on CDC and WHO developmental milestones.</li>
          <li>Designed with DPDPA 2023 principles and aligned with ICMR guidance.</li>
          <li>Tested on a 250-case evaluation set. Field validation is planned.</li>
        </ul>

        <motion.p
          aria-hidden="true"
          initial={{ opacity: 0, y: "30%" }}
          whileInView={{ opacity: 1, y: "0%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
          className="outline-text mt-10 select-none text-center font-display text-[22vw] uppercase leading-[0.78] tracking-tight"
        >
          Nirixon
        </motion.p>
        <p className="pb-24 pt-4 text-center text-[11.5px] text-faint">© 2026 Nirixon. All rights reserved.</p>
      </div>
    </footer>
  );
}
