import { useState } from "react";
import { Check, ClipboardCopy, ExternalLink, Search, Tent } from "lucide-react";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { FACILITY_DB, SAMPLE_PINS, type Facility, type PinResult } from "../lib/facilities";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const TYPE_COL: Record<Facility["type"], { hex: string; short: string; chip: "sea" | "moss" | "amber" }> = {
  DEIC: { hex: "#5aa6c4", short: "DEIC", chip: "sea" },
  RBSK: { hex: "#8fbf5a", short: "RBSK", chip: "moss" },
  "District Hospital": { hex: "#e8b13a", short: "DH", chip: "amber" },
};

const C = 220;
const R = 190;

function RadarMap({ res, hover, onHover }: { res: PinResult | "none" | null; hover: number | null; onHover: (i: number | null) => void }) {
  const list = res && res !== "none" ? res.facilities : [];
  const maxKm = Math.max(10, Math.ceil(Math.max(0, ...list.map((f) => f.km)) / 5) * 5);
  const wedge = (a0: number, a1: number) => {
    const p = (a: number) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`;
  };
  return (
    <svg viewBox="0 0 440 440" className="w-full" role="img" aria-label="Distance map of nearby facilities">
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

      {list.map((f, i) => {
        const a = ((-90 + i * (360 / list.length) + 28) * Math.PI) / 180;
        const r = (f.km / maxKm) * R;
        const x = C + r * Math.cos(a);
        const y = C + r * Math.sin(a);
        const col = TYPE_COL[f.type];
        const on = hover === i;
        return (
          <g key={f.name} className="nrx-pop" style={{ animationDelay: `${i * 140}ms` }} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            <line x1={C} y1={C} x2={x} y2={y} stroke={col.hex} strokeOpacity={on ? 0.7 : 0.25} strokeDasharray="3 4" />
            {on && <circle cx={x} cy={y} r={20} fill={col.hex} opacity={0.3} className="nrx-ping" style={{ transformOrigin: `${x}px ${y}px` }} />}
            <circle cx={x} cy={y} r={on ? 12 : 9} fill={col.hex} stroke="#21160b" strokeWidth={3} style={{ transition: "r .2s" }} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#21160b">{i + 1}</text>
            <text x={x} y={y - 18} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="600" fill="#fff4dc" letterSpacing="1">
              {col.short} · {f.km} km
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
  const [res, setRes] = useState<PinResult | "none" | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const search = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 6);
    if (d.length < 6) {
      showToast("Enter a 6-digit PIN code");
      return;
    }
    setRes(FACILITY_DB[d] ?? "none");
  };

  const ageNum = parseInt(age || "0", 10);
  const route = age === "" ? "all" : ageNum >= 6 ? "school" : "early";
  const list =
    res && res !== "none"
      ? [...res.facilities].sort((a, b) => (route === "all" ? 0 : Number(b.bestFor === route) - Number(a.bestFor === route)))
      : [];

  const copy = async (f: Facility) => {
    const t = `${f.name}\n${f.address}\nExample contact: ${f.phone}`;
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
          Search DEIC, RBSK teams and district rehab units by PIN code. Listings here are fictional demo examples — verify real services before referring.
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
                  onKeyDown={(e) => e.key === "Enter" && search(pin)}
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
            <p className="mt-3 text-[12px] text-muted">Under 6 → DEIC & RBSK first · 6 and over → hospital rehab first</p>

            <Btn size="lg" className="mt-6 w-full" onClick={() => search(pin)}>
              <Search className="size-4" /> Find nearest help
            </Btn>

            <div className="mt-7 border-t border-line pt-6">
              <p className="mb-3 font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Try a sample PIN</p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PINS.map((s) => (
                  <button
                    key={s.pin}
                    onClick={() => {
                      setPin(s.pin);
                      search(s.pin);
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
                {Object.values(TYPE_COL).map((c) => (
                  <span key={c.short} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: c.hex }} />
                    {c.short}
                  </span>
                ))}
              </div>
            </div>
            <RadarMap res={res} hover={hover} onHover={setHover} />
            {!res && <p className="pb-2 text-center text-[12.5px] text-paper/55">Enter a PIN to plot nearby facilities around you.</p>}
          </div>
        </div>

        <div>
          {res === "none" && (
            <div className="nrx-rise rounded-[36px] bg-brick-bg p-8">
              <Tent className="size-7 text-brick" />
              <h3 className="mt-4 font-display text-[40px] leading-none uppercase">No sample listings for {pin}</h3>
              <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-ink-2">
                This PIN isn’t in the demo directory. In a live service the next step would be to confirm coverage with the district health team.
              </p>
            </div>
          )}

          {res && res !== "none" && (
            <div>
              <p className="mb-4 flex items-center gap-3 text-[13px] font-semibold text-ink-2">
                <span className="font-display text-[34px] leading-none text-ink">{list.length}</span> sample listings near
                <b className="text-ink">{res.city} ({res.pin})</b>
              </p>
              <div className="space-y-3">
                {list.map((f, i) => (
                  <Reveal key={f.name} delay={i * 80}>
                    <div
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "rounded-[30px] border bg-card p-6 transition-all duration-300",
                        hover === i ? "-translate-y-1 border-ink shadow-[0_26px_44px_-28px_rgba(31,20,9,0.7)]" : "border-line-2"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-full font-display text-[22px] text-night" style={{ background: TYPE_COL[f.type].hex }}>
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={TYPE_COL[f.type].chip}>{f.type}</Chip>
                            {f.bestFor === route && <Chip tone="rust">Best for age {age}</Chip>}
                            <Chip>Sample</Chip>
                          </div>
                          <h3 className="mt-3 font-display text-[28px] leading-[1.02] uppercase">{f.name}</h3>
                          <p className="mt-1 text-[13px] text-ink-2">{f.address}</p>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="font-mono text-[13px] font-semibold">
                              {f.km} km <span className="text-muted">·</span> {f.phone}
                            </p>
                            <div className="flex gap-2">
                              <Btn size="xs" variant="light" onClick={() => copy(f)}>
                                {copied === f.name ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} Copy
                              </Btn>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.name + " " + f.address)}`}
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

          {!res && (
            <div className="rounded-[36px] border border-dashed border-line-2 p-10 text-center">
              <p className="font-display text-[44px] leading-none text-muted uppercase">Results appear here</p>
              <p className="mx-auto mt-3 max-w-[320px] text-[13px] text-muted">Try “South Delhi” — the map on the left plots every facility by distance and type.</p>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
