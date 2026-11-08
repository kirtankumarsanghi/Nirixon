import { useEffect, useState } from "react";
import { CheckCheck, ClipboardCheck, PhoneCall, ScanLine, Send, ShieldAlert, X } from "lucide-react";
import {
  DOMAINS,
  SECTORS,
  STATUS_META,
  TIER_META,
  ageBand,
  domainKeys,
  domainStatus,
  evaluate,
  childLabel,
  type Child,
} from "../lib/model";
import { Btn, Chip } from "./ui";
import { HandoffActions } from "./HandoffActions";
import { Localize } from "../lib/localize";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

interface Props {
  child: Child | null;
  onClose: () => void;
  onScreen: (c: Child) => void;
  onRefer: (c: Child) => void;
  onContacted: (c: Child) => void;
  onOutcome: (c: Child, notes?: string) => void;
  /** Hide the frontline "Screen now" action (e.g. in the supervisor workspace). */
  canScreen?: boolean;
}

const pos = (z: number) => `${((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100}%`;

export function ChildDrawer({ child, onClose, onScreen, onRefer, onContacted, onOutcome, canScreen = true }: Props) {
  const { workerName } = useApp();
  const tr = useT();
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!child) return;
    setOutcomeOpen(false);
    setNotes("");
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [child, onClose]);

  const open = !!child;
  const ev = child?.scores ? evaluate(child.scores, child.regression) : null;
  const sector = child ? SECTORS.find((s) => s.id === child.sector) : null;
  const st = child ? STATUS_META[child.status] : null;

  return (
    <Localize>
    <>
      <div
        onClick={onClose}
        className={cn("no-print fixed inset-0 z-[55] bg-night/55 backdrop-blur-[3px] transition-opacity duration-500", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        aria-hidden={!open}
        className={cn(
          "no-print nrx-scroll fixed top-0 right-0 z-[56] h-full w-full max-w-[460px] overflow-y-auto bg-card shadow-[-30px_0_80px_-30px_rgba(31,20,9,0.7)] transition-transform duration-[650ms] ease-[cubic-bezier(0.7,0,0.2,1)]",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {child && st && (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-rust uppercase">{tr("Child record")}</p>
                <p className="mt-2 font-mono text-[15px] font-semibold">{childLabel(child)}</p>
                <p className="mt-1 font-mono text-[10.5px] text-muted">ref {child.id.slice(0, 8)}</p>
              </div>
              <button onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-sand transition-transform hover:rotate-90" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold", st.soft, st.text)}>
                <span className="size-2 rounded-full" style={{ background: st.hex }} />
                {tr(st.label)}
              </span>
              <Chip>{ageBand(child.ageMonths)} · {tr("{n} mo", { n: child.ageMonths })}</Chip>
              <Chip>{tr("Sector")} {child.sector}</Chip>
              {child.handoff === "queued" && <Chip tone="lilac">{tr("Handoff queued")}</Chip>}
              {child.handoff === "done" && <Chip tone="moss">{tr("Handed off")}</Chip>}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                ["Visits", String(child.visits)],
                ["Last visit", child.lastVisitDays === null ? tr("Never") : tr("{n}d ago", { n: child.lastVisitDays })],
                ["Worker", (workerName || sector?.worker)?.split(" ")[0] ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-sand/60 p-3.5">
                  <p className="font-mono text-[9.5px] tracking-[0.16em] text-muted uppercase">{tr(k)}</p>
                  <p className="mt-1 font-display text-[22px] uppercase leading-none">{v}</p>
                </div>
              ))}
            </div>

            {ev && child.scores && domainKeys(child.scores).length ? (
              <div className="mt-7">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">{tr("Area scores (SD)")}</p>
                  <span className={cn("rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider", TIER_META[ev.tier].soft, TIER_META[ev.tier].text)}>
                    {ev.tier} · {TIER_META[ev.tier].hint}
                  </span>
                </div>
                <div className="mt-4 space-y-3.5">
                  {domainKeys(child.scores).map((k) => {
                    const z = child.scores![k] as number;
                    const s = domainStatus(z);
                    return (
                      <div key={k}>
                        <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                          <span className="font-semibold">{DOMAINS[k].label}</span>
                          <span className={cn("font-mono text-[11px] font-semibold", s.text)}>{z > 0 ? "+" : ""}{z.toFixed(1)}</span>
                        </div>
                        <div className="relative h-2 rounded-full bg-sand">
                          <span className="absolute inset-y-0 w-px bg-brick/70" style={{ left: "25%" }} />
                          <span className="absolute inset-y-0 w-px bg-amber/60" style={{ left: "50%" }} />
                          <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow" style={{ left: pos(z), background: s.hex }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-sand/60 p-3.5 text-[12px] leading-relaxed text-ink-2">
                  {ev.safety && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brick" />}
                  {ev.reason}
                </p>
              </div>
            ) : (
              <p className="mt-7 rounded-2xl border border-dashed border-line-2 p-5 text-center text-[13px] text-ink-2">
                {tr("No domain data yet. A first check-in takes about five minutes.")}
              </p>
            )}

            <div className="mt-8 grid grid-cols-2 gap-2.5">
              {canScreen && (
                <Btn onClick={() => onScreen(child)} className="col-span-2" size="lg">
                  <ScanLine className="size-4" /> {tr("Screen now")}
                </Btn>
              )}
              <Btn variant="outline" onClick={() => onRefer(child)} disabled={child.handoff === "queued"}>
                <Send className="size-4" /> {tr("1-touch refer")}
              </Btn>
              <Btn variant="light" onClick={() => onContacted(child)}>
                <PhoneCall className="size-4" /> {tr("Contacted")}
              </Btn>
              <Btn variant="light" onClick={() => setOutcomeOpen((v) => !v)} className="col-span-2">
                <CheckCheck className="size-4" /> {tr("Record outcome")}
              </Btn>
            </div>

            {outcomeOpen && (
              <div className="mt-2.5 rounded-2xl border border-line-2 p-3.5">
                <label htmlFor="outcome-notes" className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
                  {tr("Outcome notes")}
                </label>
                <textarea
                  id="outcome-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="What happened? e.g. Attended DEIC, plan shared with caregiver"
                  className="mt-2 w-full resize-none rounded-xl border border-line-2 bg-card p-3 text-[13px] text-ink placeholder:text-muted focus:border-rust focus:outline-none"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Btn
                    size="sm"
                    variant="light"
                    onClick={() => {
                      setOutcomeOpen(false);
                      setNotes("");
                    }}
                  >
                    {tr("Cancel")}
                  </Btn>
                  <Btn
                    size="sm"
                    onClick={() => {
                      onOutcome(child, notes.trim() || undefined);
                      setOutcomeOpen(false);
                      setNotes("");
                    }}
                  >
                    <CheckCheck className="size-3.5" /> {tr("Save outcome")}
                  </Btn>
                </div>
              </div>
            )}
            <HandoffActions child={child} />
            <p className="mt-4 flex items-center gap-2 text-[11px] text-muted">
              <ClipboardCheck className="size-3.5" /> {tr("Actions update the shared workspace.")}
            </p>
          </div>
        )}
      </aside>
    </>
    </Localize>
  );
}
