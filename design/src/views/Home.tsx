import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FlaskConical, Lightbulb, MapPin, Share2, ShieldAlert } from "lucide-react";
import { Radar } from "../components/Radar";
import { Photo } from "../components/Photo";
import { Btn, Chip, CtaPill, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { DOMAINS, DOMAIN_KEYS, TIER_META, domainStatus, evaluate, fmtDate, type Domain } from "../lib/model";
import { PHOTO } from "../photos";
import { useApp } from "../store";
import { cn } from "../utils/cn";

export function Home() {
  const { checkIns, go } = useApp();
  const latest = checkIns[0];
  const previous = checkIns[1];
  const ev = evaluate(latest.scores, latest.regression);
  const meta = TIER_META[ev.tier];
  const [sel, setSel] = useState<Domain>(ev.lowest);
  const [showPrev, setShowPrev] = useState(true);

  const z = latest.scores[sel];
  const st = domainStatus(z);
  const delta = previous ? z - previous.scores[sel] : null;
  const ptier = previous ? evaluate(previous.scores, previous.regression).tier : null;

  return (
    <Page>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">Family workspace</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,120px)]">
            Namaste, <span className="text-rust">Priya.</span>
          </Display>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-6 pl-2">
          <span className="grid size-12 place-items-center rounded-full bg-sea font-display text-[22px] text-white">A</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">Aarav</span>
            <span className="block text-[12px] text-muted">{latest.ageMonths} months · {checkIns.length} check-ins</span>
          </span>
        </div>
      </div>

      {/* ============================ result hero ============================ */}
      <section className="relative overflow-hidden rounded-[44px] bg-night text-paper">
        <img
          src={PHOTO.motherChild}
          alt=""
          className="absolute inset-y-0 right-0 hidden h-full w-[46%] object-cover opacity-30 [mask-image:linear-gradient(90deg,transparent,black_70%)] lg:block"
        />
        <div className="relative grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_1fr] lg:p-14">
          <div>
            <Eyebrow tone="peach" index="02">
              Latest check-in · {fmtDate(latest.date, true)}
            </Eyebrow>
            <div className="mt-9 flex items-center gap-5">
              <GlowDot hex={meta.hexLight} glow={meta.glow} size={58} />
              <span className="font-mono text-[11px] tracking-[0.24em] text-paper/60 uppercase">Result tier</span>
            </div>
            <h2
              key={ev.tier + latest.id}
              className="nrx-rise mt-4 font-display text-[clamp(72px,10vw,150px)] leading-[0.86] uppercase"
              style={{ color: meta.hexLight }}
            >
              {ev.tier}
            </h2>
            <p className="mt-2 font-display text-[clamp(26px,3vw,44px)] leading-none text-peach uppercase">({meta.hint})</p>
            <p className="mt-6 max-w-[470px] text-[15px] leading-relaxed text-paper/75">{meta.summary}</p>
            <p className="mt-4 flex max-w-[470px] items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12.5px] leading-relaxed text-paper/80">
              {ev.safety && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" />}
              <span>
                <b className="text-paper">Why: </b>
                {ev.reason}
              </span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <CtaPill tone="light" onClick={() => go("checkin")}>
                Start next check-in
              </CtaPill>
              <Btn variant="ghostDark" size="lg" onClick={() => go("growth")}>
                See growth <ArrowRight className="size-4" />
              </Btn>
              <Btn variant="ghostDark" size="lg" onClick={() => go("whatif")}>
                <FlaskConical className="size-4" /> Parent what-if
              </Btn>
            </div>
          </div>

          <div>
            <Radar scores={latest.scores} prev={showPrev ? previous?.scores : undefined} selected={sel} onSelect={setSel} tone={meta.hexLight} />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-5 font-mono text-[10.5px] tracking-[0.16em] text-paper/60 uppercase">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-6 rounded-full" style={{ background: meta.hexLight }} /> This check-in
              </span>
              {previous && (
                <button onClick={() => setShowPrev((s) => !s)} className={cn("flex items-center gap-2 transition-opacity", !showPrev && "opacity-40")}>
                  <span className="h-0 w-6 border-t-2 border-dashed border-paper/60" /> Previous · {fmtDate(previous.date)}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ area tiles ============================ */}
      <Reveal className="mt-14">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <Eyebrow index="03">Six areas</Eyebrow>
            <Display as="h3" className="mt-4 text-[clamp(36px,4.6vw,64px)]">
              Tap an area to <span className="text-sea">look closer.</span>
            </Display>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {DOMAIN_KEYS.map((k) => {
            const s = domainStatus(latest.scores[k]);
            const on = sel === k;
            return (
              <button
                key={k}
                onClick={() => setSel(k)}
                className={cn(
                  "group relative overflow-hidden rounded-[26px] border p-5 text-left transition-all duration-300 hover:-translate-y-1",
                  on ? "border-ink bg-ink text-paper shadow-[0_24px_40px_-24px_rgba(31,20,9,0.9)]" : "border-line-2 bg-card hover:bg-card-2"
                )}
              >
                <span className="absolute top-0 left-0 h-1.5 w-full" style={{ background: s.hex }} />
                <p className={cn("font-mono text-[10px] tracking-[0.2em] uppercase", on ? "text-paper/60" : "text-muted")}>{DOMAINS[k].plain}</p>
                <p className="mt-2 font-display text-[26px] leading-none uppercase">{DOMAINS[k].label}</p>
                <p className="mt-5 flex items-center justify-between text-[12px] font-semibold">
                  <span style={{ color: on ? "#fff4dc" : s.ink }}>{s.label}</span>
                  <span className="font-mono">{latest.scores[k] > 0 ? "+" : ""}{latest.scores[k].toFixed(1)}</span>
                </p>
              </button>
            );
          })}
        </div>

        <div key={sel} className="nrx-rise mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <Chip tone={st.level === 0 ? "moss" : st.level === 1 ? "amber" : "brick"}>{st.label}</Chip>
              {delta !== null && (
                <span className={cn("inline-flex items-center gap-1 font-mono text-[12px] font-semibold", delta >= 0 ? "text-moss" : "text-brick")}>
                  {delta >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)} SD since {previous && fmtDate(previous.date)}
                </span>
              )}
            </div>
            <h4 className="mt-5 font-display text-[clamp(40px,5vw,72px)] leading-[0.92] uppercase">{DOMAINS[sel].label}</h4>
            <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-ink-2">{DOMAINS[sel].blurb}</p>
            {ptier && ptier !== ev.tier && (
              <p className="mt-5 text-[13px] font-semibold text-ink-2">
                Overall tier moved from <b className={TIER_META[ptier].text}>{ptier}</b> to <b className={meta.text}>{ev.tier}</b> across your last two check-ins.
              </p>
            )}
          </div>
          <div className="relative overflow-hidden rounded-[32px] bg-rust p-7 text-white sm:p-9">
            <Lightbulb className="size-7" />
            <p className="mt-5 font-mono text-[10.5px] font-semibold tracking-[0.22em] uppercase text-white/90">Try at home this week</p>
            <p className="mt-3 font-display text-[clamp(26px,2.8vw,38px)] leading-[1.05] uppercase">{DOMAINS[sel].activity}</p>
            <p className="mt-5 text-[12px] text-white/90">Five minutes is plenty. Follow your child’s lead.</p>
          </div>
        </div>
      </Reveal>

      {/* ============================ next steps ============================ */}
      <Reveal className="mt-14">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[32px] border border-line-2 bg-card p-7">
            <Eyebrow index="04" tone="muted">Check-in rhythm</Eyebrow>
            <div className="mt-8 flex items-start">
              {[...checkIns].reverse().map((c, i) => (
                <div key={c.id} className="flex flex-1 items-start">
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <span className="grid size-10 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper">{i + 1}</span>
                    <span className="font-mono text-[10px] whitespace-nowrap text-muted">{fmtDate(c.date)}</span>
                  </div>
                  <span className="mx-1.5 mt-5 h-px min-w-2 flex-1 bg-ink/50" />
                </div>
              ))}
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span className="grid size-10 place-items-center rounded-full border-2 border-dashed border-rust font-mono text-[11px] text-rust">+</span>
                <span className="font-mono text-[10px] text-rust">Next</span>
              </div>
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-ink-2">A check-in every ~3 months shows the trend, not just a snapshot.</p>
          </div>

          <button onClick={() => go("help")} className="group relative min-h-[260px] overflow-hidden rounded-[32px] text-left text-paper">
            <Photo src={PHOTO.doctor} alt="" wrapperClassName="absolute inset-0" className="transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-night/10" />
            <div className="relative flex h-full min-h-[260px] flex-col justify-between p-7">
              <MapPin className="size-6 text-peach" />
              <div>
                <p className="font-display text-[38px] leading-none uppercase">Find nearby support</p>
                <p className="mt-2 flex items-center gap-2 text-[13px] text-paper/75">
                  DEIC, RBSK teams and hospital rehab units <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </p>
              </div>
            </div>
          </button>

          <button onClick={() => go("share")} className="group flex min-h-[260px] flex-col justify-between rounded-[32px] bg-sea p-7 text-left text-white">
            <Share2 className="size-6" />
            <div>
              <p className="font-display text-[38px] leading-none uppercase">Share with family or your doctor</p>
              <p className="mt-2 flex items-center gap-2 text-[13px] text-white/80">
                Copy, WhatsApp or print a one-page summary <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </p>
            </div>
          </button>
        </div>
      </Reveal>
    </Page>
  );
}
