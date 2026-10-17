import { useState } from "react";
import { Check, Clock, Copy, MessageCircle, Printer, Share2 } from "lucide-react";
import { LogoLockup } from "../landing/components/system";
import { Btn, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { DOMAINS, DOMAIN_KEYS, TIER_META, buildSummary, domainStatus, evaluate, fmtDate } from "../lib/model";
import { useApp } from "../store";
import { cn } from "../utils/cn";

export function Share() {
  const { checkIns, showToast } = useApp();
  const [id, setId] = useState(checkIns[0].id);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"card" | "text">("card");
  const ci = checkIns.find((c) => c.id === id) ?? checkIns[0];
  const ev = evaluate(ci.scores, ci.regression);
  const meta = TIER_META[ev.tier];
  const text = buildSummary(ci);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    showToast("Summary copied to clipboard");
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Nirixon check-in summary", text });
      } catch {
        /* dismissed */
      }
    } else {
      await copy();
    }
  };

  return (
    <Page>
      <Eyebrow index="01">Family sharing</Eyebrow>
      <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
          One page.
          <br />
          <span className="text-rust">Easy to share.</span>
        </Display>
        <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
          Pick a check-in, preview the summary, then send it your way. Nothing is uploaded — it only leaves this screen when you choose.
        </p>
      </div>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        {/* chooser */}
        <div className="space-y-3">
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-muted uppercase">Which check-in?</p>
          {checkIns.map((c, i) => {
            const e = evaluate(c.scores, c.regression);
            const m = TIER_META[e.tier];
            const sel = c.id === id;
            return (
              <Reveal key={c.id} delay={i * 60}>
                <button
                  onClick={() => setId(c.id)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-[26px] border p-5 text-left transition-all duration-300",
                    sel ? "border-ink bg-ink text-paper shadow-[0_24px_40px_-24px_rgba(31,20,9,0.9)]" : "border-line-2 bg-card hover:-translate-y-0.5 hover:bg-card-2"
                  )}
                >
                  <span className="size-4 shrink-0 rounded-full" style={{ background: m.hexLight }} />
                  <span className="flex-1">
                    <span className="block font-display text-[30px] leading-none uppercase">{e.tier}</span>
                    <span className={cn("mt-1 block font-mono text-[11px]", sel ? "text-paper/60" : "text-muted")}>
                      {fmtDate(c.date, true)} · {c.ageMonths} mo
                    </span>
                  </span>
                  <span className={cn("grid size-7 place-items-center rounded-full border", sel ? "border-peach bg-peach text-night" : "border-line-2")}>
                    {sel && <Check className="size-4" />}
                  </span>
                </button>
              </Reveal>
            );
          })}

          <div className="rounded-[26px] border border-dashed border-line-2 p-5">
            <p className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">
              <Clock className="size-3.5" /> Coming soon
            </p>
            <p className="mt-2 text-[13px] font-bold">Expiring share codes</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              A short-lived code a clinician can open without a persistent child profile. Not available in this demo — copy and print work today.
            </p>
          </div>
        </div>

        {/* preview */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex rounded-full border border-line-2 bg-card p-1">
              {(["card", "text"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-full px-5 py-2 text-[12.5px] font-bold capitalize transition-all", mode === m ? "bg-ink text-paper" : "text-ink-2")}
                >
                  {m === "card" ? "Report card" : "Plain text"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
              </Btn>
              <Btn
                variant="rust"
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")}
              >
                <MessageCircle className="size-4" /> WhatsApp
              </Btn>
              <Btn variant="light" onClick={share}>
                <Share2 className="size-4" /> Share
              </Btn>
              <Btn variant="light" onClick={() => window.print()}>
                <Printer className="size-4" /> Print
              </Btn>
            </div>
          </div>

          {mode === "card" ? (
            <article key={ci.id} className="nrx-rise relative overflow-hidden rounded-[36px] bg-card p-7 shadow-[0_40px_80px_-40px_rgba(70,45,10,0.6)] ring-1 ring-line-2 sm:p-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <LogoLockup markClassName="h-10 w-10" wordClassName="h-5 w-auto" subtitle="Check-in summary" />
                </div>
                <p className="text-right font-mono text-[11px] text-muted">
                  {fmtDate(ci.date, true)}
                  <br />
                  {ci.ageMonths} months
                </p>
              </div>

              <div className="mt-9 flex items-center gap-5">
                <GlowDot hex={meta.hex} glow={meta.glow} size={52} />
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">{ci.child} · overall</p>
                  <p className={cn("font-display text-[56px] leading-[0.9] uppercase", meta.text)}>
                    {ev.tier} <span className="text-[28px] text-ink-2">({meta.hint})</span>
                  </p>
                </div>
              </div>

              <ul className="mt-8 space-y-4">
                {DOMAIN_KEYS.map((k) => {
                  const s = domainStatus(ci.scores[k]);
                  const w = ((Math.max(-3, Math.min(1, ci.scores[k])) + 3) / 4) * 100;
                  return (
                    <li key={k}>
                      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                        <span className="font-bold">{DOMAINS[k].label}</span>
                        <span className={cn("font-semibold", s.text)}>{s.label}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-sand">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${w}%`, background: s.hex }} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-8 border-t border-line-2 pt-5 text-[13px] leading-relaxed text-ink-2">
                <b className="text-ink">Next step: </b>
                {meta.next}
              </p>
              <p className="mt-3 text-[11px] text-muted">A screening summary for discussion — not a medical diagnosis.</p>
            </article>
          ) : (
            <pre className="nrx-rise rounded-[32px] border border-line-2 bg-card p-7 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2 sm:p-9">
              {text}
            </pre>
          )}
        </div>
      </div>
    </Page>
  );
}
