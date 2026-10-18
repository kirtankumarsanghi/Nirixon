import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import {
  DOMAINS,
  domainKeys,
  TIER_META,
  developmentalAge,
  domainStatus,
  evaluate,
  fmtDate,
} from "../lib/model";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const W = 900;
const H = 420;
const PAD = { l: 64, r: 28, t: 28, b: 54 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
const yz = (z: number) => PAD.t + (1 - (z + 3) / 4) * PH;

export function Growth() {
  const { checkIns, go } = useApp();
  const ordered = [...checkIns].reverse();
  const n = ordered.length;
  const xs = ordered.map((_, i) => (n === 1 ? PAD.l + PW / 2 : PAD.l + (i * PW) / (n - 1)));
  const slot = n === 1 ? PW : PW / (n - 1);
  // Thin the x-axis so the age/date ticks don't collide once there are many
  // check-ins — always keep the first and the latest.
  const labelStep = Math.max(1, Math.ceil(78 / Math.max(slot, 1)));
  const showLabel = (i: number) => i % labelStep === 0 || i === n - 1;

  const [on, setOn] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<number | null>(null);

  const latest = checkIns[0];
  const keys = domainKeys(latest?.scores ?? {});
  const prev = checkIns[1];
  // Only areas scored in both check-ins can be compared; modules A and B, and
  // partial check-ins, do not overlap completely.
  const shared = prev ? keys.filter((k) => typeof prev.scores[k] === "number") : [];
  const dev = developmentalAge(latest);
  const pace = prev ? (dev - developmentalAge(prev)) / (latest.ageMonths - prev.ageMonths || 1) : null;

  return (
    <Page>
      <Eyebrow index="01">Growth over time</Eyebrow>
      <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
          Aarav’s <span className="text-sea">path,</span>
          <br />
          not a snapshot.
        </Display>
        <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
          Each line is one developmental area, scored in standard deviations from the expected range. Hover the chart to compare check-ins.
        </p>
      </div>

      {/* stat tiles */}
      <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Check-ins", v: String(n), s: `since ${fmtDate(ordered[0].date, true)}` },
          { k: "Chronological age", v: `${latest.ageMonths} mo`, s: "at latest check-in" },
          { k: "Developmental age", v: `${dev.toFixed(0)} mo`, s: "estimated from area scores" },
          { k: "Pace", v: pace === null ? "—" : `${pace.toFixed(2)}×`, s: pace === null ? "needs two check-ins" : pace >= 1 ? "catching up" : "slower than expected" },
        ].map((t, i) => (
          <Reveal key={t.k} delay={i * 70}>
            <div className="h-full rounded-[28px] border border-line-2 bg-card p-6">
              <p className="font-mono text-[10px] tracking-[0.2em] text-muted uppercase">{t.k}</p>
              <p className="mt-3 font-display text-[clamp(40px,4.4vw,64px)] leading-none">{t.v}</p>
              <p className="mt-2 text-[12px] text-ink-2">{t.s}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* chart */}
      <Reveal className="mt-4">
        <div className="rounded-[36px] border border-line-2 bg-card p-5 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => setOn((p) => ({ ...p, [k]: p[k] === false }))}
                aria-pressed={on[k] !== false}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition-all",
                  on[k] !== false ? "border-ink/80 bg-card-2" : "border-line-2 text-muted opacity-60"
                )}
              >
                <span className="size-2.5 rounded-full" style={{ background: DOMAINS[k]?.color }} />
                {DOMAINS[k]?.label ?? k}
              </button>
            ))}
          </div>

          <div className="relative" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart of area scores over time">
              <rect x={PAD.l} y={yz(1)} width={PW} height={yz(-1) - yz(1)} fill="var(--chart-band-typical)" opacity={0.09} />
              <rect x={PAD.l} y={yz(-1)} width={PW} height={yz(-2) - yz(-1)} fill="var(--chart-band-monitor)" opacity={0.14} />
              <rect x={PAD.l} y={yz(-2)} width={PW} height={yz(-3) - yz(-2)} fill="var(--chart-band-refer)" opacity={0.13} />
              {[1, 0, -1, -2, -3].map((z) => (
                <g key={z}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={yz(z)} y2={yz(z)} stroke={z === -2 ? "var(--chart-band-refer)" : "var(--chart-grid)"} strokeDasharray={z === -2 ? "5 5" : "2 6"} />
                  <text x={PAD.l - 10} y={yz(z) + 4} textAnchor="end" fontSize="11" fontFamily="JetBrains Mono, monospace" fill={z === -2 ? "var(--chart-band-refer)" : "var(--chart-axis)"} fontWeight={z === -2 ? 700 : 500}>
                    {z > 0 ? "+" : z < 0 ? "−" : ""}
                    {Math.abs(z)}
                  </text>
                </g>
              ))}
              <text x={W - PAD.r - 6} y={yz(-2) - 7} textAnchor="end" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="var(--chart-band-refer)" letterSpacing="1.5">
                SAFETY LINE −2.0
              </text>

              {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={PAD.t} y2={H - PAD.b} stroke="var(--chart-ink)" strokeWidth={1.2} />}

              {keys.filter((k) => on[k] !== false).map((k) => {
                // A check-in only scores the areas it actually asked about, so a
                // series can have gaps — plot the points that exist and leave the rest out.
                const pts = ordered
                  .map((c, i) => ({ i, v: c.scores[k] }))
                  .filter((p): p is { i: number; v: number } => typeof p.v === "number");
                if (pts.length === 0) return null;
                return (
                  <g key={k}>
                    <polyline
                      pathLength={1}
                      className="nrx-draw"
                      style={{ ["--len" as string]: 1 }}
                      points={pts.map((p) => `${xs[p.i]},${yz(p.v)}`).join(" ")}
                      fill="none"
                      stroke={DOMAINS[k]?.color}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {pts.map((p) => (
                      <circle
                        key={ordered[p.i].id}
                        cx={xs[p.i]}
                        cy={yz(p.v)}
                        r={hover === p.i ? 7 : 5}
                        fill="#fffaf0"
                        stroke={DOMAINS[k]?.color}
                        strokeWidth={3}
                        style={{ transition: "r .2s" }}
                      />
                    ))}
                  </g>
                );
              })}

              {ordered.map((c, i) => (
                <g key={c.id}>
                  {showLabel(i) && (
                    <>
                      <text x={xs[i]} y={H - 26} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--chart-ink)">
                        {c.ageMonths} mo
                      </text>
                      <text x={xs[i]} y={H - 10} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--chart-axis)">
                        {fmtDate(c.date)}
                      </text>
                    </>
                  )}
                  <rect
                    x={Math.max(0, xs[i] - slot / 2)}
                    y={PAD.t}
                    width={Math.min(W - Math.max(0, xs[i] - slot / 2), slot)}
                    height={PH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(i)}
                  />
                </g>
              ))}
            </svg>

            {hover !== null && (
              <div
                className="pointer-events-none absolute top-2 z-10 w-[210px] rounded-2xl bg-night p-4 text-paper shadow-2xl"
                style={{ left: `clamp(110px, ${(xs[hover] / W) * 100}%, calc(100% - 110px))`, transform: "translateX(-50%)" }}
              >
                <p className="font-mono text-[10px] tracking-[0.18em] text-peach uppercase">
                  {fmtDate(ordered[hover].date, true)} · {ordered[hover].ageMonths} mo
                </p>
                <p className="mt-1 font-display text-[26px] leading-none uppercase" style={{ color: TIER_META[evaluate(ordered[hover].scores, ordered[hover].regression).tier].hexLight }}>
                  {evaluate(ordered[hover].scores, ordered[hover].regression).tier}
                </p>
                <ul className="mt-3 space-y-1">
                  {domainKeys(ordered[hover].scores)
                    .filter((k) => on[k] !== false)
                    .map((k) => {
                      const v = ordered[hover].scores[k] as number;
                      return (
                        <li key={k} className="flex items-center justify-between text-[11.5px]">
                          <span className="flex items-center gap-2 text-paper/80">
                            <span className="size-2 rounded-full" style={{ background: DOMAINS[k]?.color }} />
                            {DOMAINS[k]?.label ?? k}
                          </span>
                          <span className="font-mono font-semibold">
                            {v > 0 ? "+" : ""}
                            {v.toFixed(1)}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* changes + timeline */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-[32px] bg-night p-7 text-paper sm:p-9">
            <Eyebrow tone="peach" index="02">
              Since the previous check-in
            </Eyebrow>
            {prev && shared.length > 0 ? (
              <ul className="mt-6 divide-y divide-white/10">
                {shared.map((k) => {
                  const d = latest.scores[k] - prev.scores[k];
                  const a = domainStatus(prev.scores[k]).label;
                  const b = domainStatus(latest.scores[k]).label;
                  return (
                    <li key={k} className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <p className="text-[14px] font-bold">{DOMAINS[k]?.plain ?? k}</p>
                        <p className="text-[12px] text-paper/55">
                          {a === b ? b : `${a} → ${b}`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 font-mono text-[13px] font-semibold",
                          Math.abs(d) < 0.05 ? "text-paper/50" : d > 0 ? "text-[#8fbf5a]" : "text-[#ee6a4f]"
                        )}
                      >
                        {Math.abs(d) < 0.05 ? <Minus className="size-4" /> : d > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                        {d > 0 ? "+" : ""}
                        {d.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : prev ? (
              <p className="mt-6 text-paper/70">
                The last two check-ins cover different areas, so there is nothing to compare yet.
              </p>
            ) : (
              <p className="mt-6 text-paper/70">Complete one more check-in to see changes.</p>
            )}
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="h-full rounded-[32px] border border-line-2 bg-card p-7 sm:p-9">
            <Eyebrow index="03" tone="muted">
              Timeline
            </Eyebrow>
            <ol className="mt-6 space-y-0">
              {checkIns.map((c, i) => {
                const ev = evaluate(c.scores, c.regression);
                const m = TIER_META[ev.tier];
                return (
                  <li key={c.id} className="relative flex gap-5 pb-8 last:pb-0">
                    {i < checkIns.length - 1 && <span className="absolute top-5 bottom-0 left-[9px] w-px bg-line-2" />}
                    <span className="relative z-10 mt-1.5 size-[19px] shrink-0 rounded-full border-4 border-card" style={{ background: m.hex, boxShadow: `0 0 0 1px ${m.hex}` }} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-[28px] leading-none uppercase">{ev.tier}</p>
                        <Chip tone={ev.tier === "Typical" ? "moss" : ev.tier === "Monitor" ? "amber" : "brick"}>{m.hint}</Chip>
                        {c.source === "live" && <Chip tone="sea">New</Chip>}
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-muted">
                        {fmtDate(c.date, true)} · {c.ageMonths} months
                      </p>
                      {ev.safety && <p className="mt-1.5 text-[12px] font-semibold text-brick">Protective referral rule applied</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Btn size="lg" onClick={() => go("checkin")}>
          Start a new check-in <ArrowRight className="size-4" />
        </Btn>
        <Btn size="lg" variant="light" onClick={() => go("share")}>
          Share this progress
        </Btn>
      </div>
    </Page>
  );
}
