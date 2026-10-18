import { useMemo, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, Loader2, Search, Tent } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { facilitiesApi } from "../api/client";
import type { Facility, FacilityType, FacilitiesResponse } from "../api/types";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const TYPE_COL: Record<FacilityType, { hex: string; short: string; chip: "sea" | "moss" | "amber" | "lilac" | "rust" | "brick" | "sand" }> = {
  DEIC: { hex: "#5aa6c4", short: "DEIC", chip: "sea" },
  RBSK: { hex: "#8fbf5a", short: "RBSK", chip: "moss" },
  "District Hospital": { hex: "#e8b13a", short: "DH", chip: "amber" },
  CHC: { hex: "#9a6aa6", short: "CHC", chip: "lilac" },
  PHC: { hex: "#d27a24", short: "PHC", chip: "rust" },
  Hospital: { hex: "#c8452f", short: "HOSP", chip: "brick" },
  Clinic: { hex: "#6e9a3a", short: "CLIN", chip: "sand" },
};

const FALLBACK_COL = { hex: "#8a7a63", short: "FAC", chip: "sand" as const };
const colOf = (t: FacilityType) => TYPE_COL[t] ?? FALLBACK_COL;

const SAMPLE_PINS = [
  { pin: "110029", label: "South Delhi" },
  { pin: "110001", label: "New Delhi" },
  { pin: "110054", label: "North Delhi" },
  { pin: "400012", label: "Mumbai" },
  { pin: "560029", label: "Bengaluru" },
  { pin: "999999", label: "Unserved PIN" },
];

const C = 220;
const R = 190;

/** "2026-01-05" → "Jan 2026"; keeps the card line short. */
const shortDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

type LabelBox = { x: number; y: number; w: number; h: number };
type Placed = {
  f: Facility;
  i: number;
  x: number;
  y: number;
  col: ReturnType<typeof colOf>;
  text: string;
  bx: number;
  by: number;
  w: number;
  h: number;
  anchor: "middle" | "start" | "end";
  tx: number;
  ty: number;
};

/** Labels are rendered in JetBrains Mono, whose advance width is ~0.6em; the
 *  collision box width derives from the font size + tracking rather than a
 *  standalone magic number, so it cannot drift from the rendered text. */
const LABEL_SIZE = 10;
const LABEL_TRACKING = 1; // SVG letter-spacing, px
const CHAR_W = LABEL_SIZE * 0.6 + LABEL_TRACKING;
const LABEL_PAD = 5;
const LABEL_H = 14;
const LABEL_GAP = 12;

/** Lays out one non-overlapping label per marker, nearest-to-centre first, with a leader line. */
function placeLabels(list: Facility[], maxKm: number): Placed[] {
  const pts = list
    .map((f, i) => {
      const a = ((-90 + i * (360 / list.length) + 28) * Math.PI) / 180;
      const r = (Math.max(0, Math.min(f.km, maxKm)) / maxKm) * R;
      return { f, i, x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
    })
    .sort((p, q) => Math.hypot(p.x - C, p.y - C) - Math.hypot(q.x - C, q.y - C));

  const taken: LabelBox[] = [{ x: C - 34, y: C + 18, w: 68, h: 16 }];
  for (const p of pts) taken.push({ x: p.x - 12, y: p.y - 12, w: 24, h: 24 });
  const hit = (b: LabelBox) => taken.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);

  type Cand = { bx: number; by: number; anchor: "middle" | "start" | "end"; tx: number; ty: number };
  return pts.map((p) => {
    const text = `${colOf(p.f.type).short} · ${p.f.km} km`;
    const w = text.length * CHAR_W + LABEL_PAD * 2;
    const cands: Cand[] = [
      { bx: p.x - w / 2, by: p.y - LABEL_GAP - LABEL_H, anchor: "middle", tx: p.x, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x - w / 2, by: p.y + LABEL_GAP, anchor: "middle", tx: p.x, ty: p.y + LABEL_GAP + LABEL_H - 4 },
      { bx: p.x + LABEL_GAP, by: p.y - LABEL_H / 2, anchor: "start", tx: p.x + LABEL_GAP + LABEL_PAD, ty: p.y + 4 },
      { bx: p.x - LABEL_GAP - w, by: p.y - LABEL_H / 2, anchor: "end", tx: p.x - LABEL_GAP - LABEL_PAD, ty: p.y + 4 },
      { bx: p.x + 8, by: p.y - LABEL_GAP - LABEL_H, anchor: "start", tx: p.x + 8 + LABEL_PAD, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x - 8 - w, by: p.y - LABEL_GAP - LABEL_H, anchor: "end", tx: p.x - 8 - LABEL_PAD, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x + 8, by: p.y + LABEL_GAP, anchor: "start", tx: p.x + 8 + LABEL_PAD, ty: p.y + LABEL_GAP + LABEL_H - 4 },
      { bx: p.x - 8 - w, by: p.y + LABEL_GAP, anchor: "end", tx: p.x - 8 - LABEL_PAD, ty: p.y + LABEL_GAP + LABEL_H - 4 },
    ];

    let pick: Cand | undefined = cands.find((c) => !hit({ x: c.bx, y: c.by, w, h: LABEL_H }));
    if (!pick) {
      const dx = p.x - C || 0.01;
      const dy = p.y - C || 0.01;
      const len = Math.hypot(dx, dy) || 1;
      const cx = p.x + (dx / len) * 42;
      const cy = p.y + (dy / len) * 42;
      pick = { bx: cx - w / 2, by: cy - LABEL_H / 2, anchor: "middle", tx: cx, ty: cy + 4 };
    }
    taken.push({ x: pick.bx, y: pick.by, w, h: LABEL_H });
    return { ...p, ...pick, w, h: LABEL_H, col: colOf(p.f.type), text };
  });
}

function RadarMap({ list, hover, onHover }: { list: Facility[]; hover: number | null; onHover: (i: number | null) => void }) {
  const maxKm = Math.max(10, Math.ceil(Math.max(0, ...list.map((f) => f.km)) / 5) * 5);
  const placed = useMemo(() => placeLabels(list, maxKm), [list, maxKm]);
  const wedge = (a0: number, a1: number) => {
    const p = (a: number) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`;
  };
  return (
    <svg viewBox="-70 -70 580 580" className="w-full" role="img" aria-label="Distance map of nearby facilities">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <circle cx={C} cy={C} r={R * f} fill="none" stroke="rgba(255,244,220,.16)" strokeDasharray={f === 1 ? undefined : "3 6"} />
          <text x={C + 6} y={C - R * f + 13} fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="rgba(255,244,220,.55)">
            {Math.round(maxKm * f)} km
          </text>
        </g>
      ))}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="rgba(255,244,220,.1)" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="rgba(255,244,220,.1)" />
      <g className="nrx-spin-slow" style={{ transformOrigin: `${C}px ${C}px`, animationDuration: "7s" }}>
        <path d={wedge(-50, -8)} fill="rgba(234,143,99,.2)" />
      </g>

      {placed.map((p) => {
        const on = hover === p.i;
        const cx = Math.max(p.bx, Math.min(p.x, p.bx + p.w));
        const cy = Math.max(p.by, Math.min(p.y, p.by + p.h));
        const leader = Math.hypot(cx - p.x, cy - p.y) > 6;
        return (
          <g key={p.f.id} className="nrx-pop" style={{ animationDelay: `${p.i * 140}ms` }} onMouseEnter={() => onHover(p.i)} onMouseLeave={() => onHover(null)}>
            <line x1={C} y1={C} x2={p.x} y2={p.y} stroke={p.col.hex} strokeOpacity={on ? 0.7 : 0.25} strokeDasharray="3 4" />
            {on && <circle cx={p.x} cy={p.y} r={20} fill={p.col.hex} opacity={0.3} className="nrx-ping" style={{ transformOrigin: `${p.x}px ${p.y}px` }} />}
            <circle cx={p.x} cy={p.y} r={on ? 12 : 9} fill={p.col.hex} stroke="#21160b" strokeWidth={3} style={{ transition: "r .2s" }} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#21160b">{p.i + 1}</text>
            <rect x={p.bx} y={p.by} width={p.w} height={p.h} rx={3} fill={on ? "rgba(234,143,99,.9)" : "rgba(16,11,6,.72)"} />
            {leader && <line x1={p.x} y1={p.y} x2={cx} y2={cy} stroke={p.col.hex} strokeOpacity={on ? 0.95 : 0.5} strokeWidth={1} />}
            <text
              x={p.tx}
              y={p.ty}
              textAnchor={p.anchor}
              fontSize={LABEL_SIZE}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fill={on ? "#21160b" : "#fff4dc"}
              letterSpacing={LABEL_TRACKING}
            >
              {p.text}
            </text>
          </g>
        );
      })}

      <circle cx={C} cy={C} r={20} fill="#ea8f63" opacity={0.25} className="nrx-ping" style={{ transformOrigin: `${C}px ${C}px` }} />
      <circle cx={C} cy={C} r={8} fill="#ea8f63" stroke="#fff4dc" strokeWidth={3} />
      <text x={C} y={C + 28} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="#ea8f63" letterSpacing="2">
        YOU
      </text>
    </svg>
  );
}

export function FindHelp() {
  const { showToast } = useApp();
  const [pin, setPin] = useState("");
  const [age, setAge] = useState("3");
  const [res, setRes] = useState<FacilitiesResponse | null>(null);
  const [asked, setAsked] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ageGroup = age === "" ? undefined : parseInt(age || "0", 10) >= 6 ? "6-12" : "0-5";

  const search = async (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 6);
    if (d.length < 6 || d[0] === "0") {
      showToast("Enter a 6-digit PIN code");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const r = await facilitiesApi.get(d, { ageGroup, limit: 12 });
      setRes(r);
      setAsked(d);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not reach the facility directory.");
    } finally {
      setBusy(false);
    }
  };

  const list = res?.facilities ?? [];
  const coverage = res?.coverage ?? null;
  const showSuggestions = res !== null && coverage !== "nearby" && res.suggestions.length > 0;
  const hasOsm = list.some((f) => /openstreetmap/i.test(f.source));

  const copy = async (f: Facility) => {
    const t = `${f.name}\n${f.address}\n${f.phone ? `Phone: ${f.phone}` : "No phone listed"}`;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
    setCopied(f.name);
    showToast("Details copied");
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <Page>
      <Eyebrow index="01">Public health & early intervention</Eyebrow>
      <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Display as="h1" className="text-[clamp(52px,8vw,124px)]">
          Find the
          <br />
          <span className="text-rust">nearest help.</span>
        </Display>
        <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
          Search hospitals, clinics, DEIC and RBSK services by PIN code. Directory listings are public reference data — confirm
          services before you travel.
        </p>
      </div>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
            <div className="grid gap-5 sm:grid-cols-[1.3fr_0.7fr]">
              <label className="block">
                <span className="mb-2.5 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Postal PIN code</span>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && void search(pin)}
                  inputMode="numeric"
                  placeholder="110029"
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 font-mono text-[22px] font-semibold tracking-[0.15em] placeholder:text-ink/20 focus:border-sea focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2.5 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">Age (years)</span>
                <input
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 font-mono text-[22px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-3 text-[12px] text-muted">Under 6 → DEIC & RBSK first · 6 and over → child guidance & referral services first</p>

            <Btn size="lg" className="mt-6 w-full" onClick={() => void search(pin)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {busy ? "Searching…" : "Find nearest help"}
            </Btn>

            <div className="mt-7 border-t border-line pt-6">
              <p className="mb-3 font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Try a sample PIN</p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PINS.map((s) => (
                  <button
                    key={s.pin}
                    aria-label={`Try sample PIN ${s.label} ${s.pin}`}
                    onClick={() => {
                      setPin(s.pin);
                      void search(s.pin);
                    }}
                    className="rounded-full border border-line-2 bg-card-2 px-4 py-2 text-[12.5px] font-semibold transition-all hover:-translate-y-0.5 hover:border-ink"
                  >
                    {s.label} <span className="font-mono text-[11px] text-muted">{s.pin}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[40px] bg-night p-4 text-paper sm:p-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 sm:px-0">
              <Eyebrow tone="peach" index="02">Distance map</Eyebrow>
              <div className="flex gap-3 font-mono text-[10px] tracking-wider text-paper/60 uppercase">
                {(["DEIC", "RBSK", "District Hospital"] as FacilityType[]).map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: TYPE_COL[t].hex }} />
                    {TYPE_COL[t].short}
                  </span>
                ))}
              </div>
            </div>
            <RadarMap list={list} hover={hover} onHover={setHover} />
            {!res && <p className="pb-2 text-center text-[12.5px] text-paper/55">Enter a PIN to plot nearby facilities around you.</p>}
          </div>
        </div>

        <div>
          {res && coverage === "none" && (
            <div className="nrx-rise rounded-[36px] bg-brick-bg p-8">
              <Tent className="size-7 text-brick" />
              <h3 className="mt-4 font-display text-[40px] leading-none uppercase">
                {res.resolved ? `No listed facility near ${asked}` : `No listing for ${asked}`}
              </h3>
              <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-ink-2">
                {res.state_deic
                  ? res.state_deic.operational > 0
                    ? `${res.state_deic.state} reports ${res.state_deic.operational} operational DEIC${res.state_deic.operational === 1 ? "" : "s"}. Contact your district health office or the district hospital for the one nearest you.`
                    : `No DEIC is reported as operational in ${res.state_deic.state}. Go to the district hospital instead.`
                  : "No facility directory data covers this area yet. Start with your district hospital or PHC."}
              </p>
              {res.resolved?.approximate && (
                <p className="mt-3 text-[12.5px] text-muted">Approximate location (exact coordinates unavailable for this PIN).</p>
              )}
            </div>
          )}

          {res && coverage !== "none" && (
            <div>
              <p className="mb-2 flex items-center gap-3 text-[13px] font-semibold text-ink-2">
                <span className="font-display text-[34px] leading-none text-ink">{list.length}</span> {coverage === "nearby" ? "facilities near" : "closest facilities to"}
                <b className="text-ink">
                  {res.resolved ? `${res.resolved.district}, ${res.resolved.state}` : asked} ({asked})
                </b>
              </p>
              {(coverage !== "nearby" || res.resolved?.approximate) && (
                <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
                  {coverage === "district" && `No listed facility within 25 km — showing the closest in your district. `}
                  {coverage === "state" && `No listed facility in your district — showing the closest in your state. `}
                  {res.resolved?.approximate && "Approximate location (exact coordinates unavailable for this PIN). "}
                  Distances are straight-line.
                </p>
              )}
              <div className="space-y-3">
                {list.map((f, i) => (
                  <Reveal key={f.id} delay={i * 80}>
                    <div
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "rounded-[30px] border bg-card p-6 transition-all duration-300",
                        hover === i ? "-translate-y-1 border-ink shadow-[0_26px_44px_-28px_rgba(31,20,9,0.7)]" : "border-line-2"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-full font-display text-[22px] text-night" style={{ background: colOf(f.type).hex }}>
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={colOf(f.type).chip}>{f.type}</Chip>
                            {ageGroup && f.relevance.tier === 0 && <Chip tone="rust">Best for age {age}</Chip>}
                            <Chip>{f.verified_at ? `Verified ${shortDate(f.verified_at)}` : "Not verified"}</Chip>
                          </div>
                          <h3 className="mt-3 font-display text-[28px] leading-[1.02] uppercase">{f.name}</h3>
                          <p className="mt-1 text-[13px] text-ink-2">{f.address || `${f.district}, ${f.state}`}</p>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="font-mono text-[13px] font-semibold">
                              about {f.km} km{f.phone ? <><span className="text-muted"> · </span>{f.phone}</> : null}
                            </p>
                            <div className="flex gap-2">
                              <Btn size="xs" variant="light" onClick={() => void copy(f)}>
                                {copied === f.name ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} Copy
                              </Btn>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.name + " " + (f.address || f.district + " " + f.state))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper transition-colors hover:bg-night-3"
                              >
                                <ExternalLink className="size-3.5" /> Map
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          )}

          {res && showSuggestions && (
            <div className={cn("rounded-[36px] border border-line-2 bg-card p-7 sm:p-8", coverage !== "none" && "mt-4")}>
              <Eyebrow index="03" tone="muted">Where to go next</Eyebrow>
              <ul className="mt-5 space-y-3.5">
                {res.suggestions.map((s) => (
                  <li key={s.id} className="border-b border-line pb-3.5 last:border-0 last:pb-0">
                    <p className="text-[14px] font-bold">{s.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.detail}</p>
                    {s.note && <p className="mt-1 text-[12px] leading-relaxed text-muted">{s.note}</p>}
                    {s.maps_url && (
                      <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-sea">
                        <ExternalLink className="size-3.5" /> Open in Maps
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {res && res.helplines.length > 0 && (
            <div className={cn("rounded-[36px] border border-line-2 bg-card-2 p-7 sm:p-8", (coverage !== "none" || showSuggestions) && "mt-4")}>
              <Eyebrow index="04" tone="muted">Helplines</Eyebrow>
              <ul className="mt-4 space-y-2.5">
                {res.helplines.map((h) => (
                  <li key={h.number} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">
                      {h.name}
                      {h.note ? <span className="ml-2 text-[11.5px] font-normal text-muted">{h.note}</span> : null}
                    </span>
                    <a href={`tel:${h.number}`} className="rounded-full bg-ink px-4 py-1.5 font-mono text-[12px] font-bold text-paper">
                      {h.number}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasOsm && (
            <p className="mt-4 text-[11.5px] text-muted">Facility data © OpenStreetMap contributors (ODbL). Crowd-sourced — verify before travelling.</p>
          )}

          {!res && (
            <div className="rounded-[36px] border border-dashed border-line-2 p-10 text-center">
              <p className="font-display text-[44px] leading-none text-muted uppercase">Results appear here</p>
              <p className="mx-auto mt-3 max-w-[320px] text-[13px] text-muted">Type any 6-digit PIN — the map on the left plots every facility by distance and type.</p>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
