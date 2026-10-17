import { useMemo, useState } from "react";
import { CheckCheck, FlaskConical, ShieldAlert } from "lucide-react";
import { Btn, Chip, CountUp, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { DOMAINS, domainKeys, SECTORS, TIER_META, ageBand, domainStatus, evaluate } from "../lib/model";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const pos = (z: number) => `${((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100}%`;

export function Cases() {
  const { children, caseId, setCaseId, patchChild, setWhatIfSeed, go, showToast } = useApp();
  const [tab, setTab] = useState<"all" | "queued">("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const referred = useMemo(
    () =>
      children
        .filter((c) => c.status === "refer")
        .sort((a, b) => Number(b.handoff === "queued") - Number(a.handoff === "queued")),
    [children]
  );
  const queued = referred.filter((c) => c.handoff === "queued").length;
  const overrides = referred.filter((c) => c.scores && evaluate(c.scores, c.regression).safety).length;
  const list = tab === "queued" ? referred.filter((c) => c.handoff === "queued") : referred;
  const sel = children.find((c) => c.id === caseId && c.status === "refer") ?? list[0] ?? referred[0];

  const ev = sel?.scores ? evaluate(sel.scores, sel.regression) : null;
  const meta = ev ? TIER_META[ev.tier] : null;
  const worker = sel ? SECTORS.find((s) => s.id === sel.sector) : null;

  return (
    <Page>
      <div className="grid items-end gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div>
          <Eyebrow index="01">Clinician tools · referral review</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
            Children who
            <br />
            <span className="text-rust">need you next.</span>
          </Display>
        </div>
        <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-2">
          Referrals sent from the village workspace land here. Review the scores, test a scenario, then acknowledge the handoff.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-3">
        {[
          { k: "Referred", v: referred.length, s: "in Ward 12" },
          { k: "Awaiting pickup", v: queued, s: "handoff queued" },
          { k: "Safety overrides", v: overrides, s: "model skipped" },
        ].map((t, i) => (
          <Reveal key={t.k} delay={i * 70}>
            <div className="rounded-[28px] border border-line-2 bg-card p-5 sm:p-6">
              <p className="font-mono text-[9px] tracking-[0.08em] text-muted uppercase sm:text-[10px] sm:tracking-[0.2em]">{t.k}</p>
              <p className="mt-3 font-display text-[clamp(44px,5vw,72px)] leading-none">
                <CountUp value={t.v} />
              </p>
              <p className="mt-1 text-[12px] text-ink-2">{t.s}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[400px_1fr]">
        {/* queue */}
        <div className="rounded-[36px] border border-line-2 bg-card p-4 sm:p-5">
          <div className="mb-3 flex rounded-full bg-sand/70 p-1">
            {(["all", "queued"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("flex-1 rounded-full py-2.5 text-[12.5px] font-bold transition-all", tab === t ? "bg-ink text-paper" : "text-ink-2")}
              >
                {t === "all" ? `All referred (${referred.length})` : `Awaiting pickup (${queued})`}
              </button>
            ))}
          </div>
          <ul className="nrx-scroll max-h-[640px] space-y-2 overflow-y-auto pr-1">
            {list.map((c) => {
              const e = c.scores ? evaluate(c.scores, c.regression) : null;
              const on = sel?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setCaseId(c.id)}
                    className={cn(
                      "w-full rounded-[22px] border p-4 text-left transition-all duration-200",
                      on ? "border-ink bg-ink text-paper" : "border-transparent bg-card-2/70 hover:border-line-2 hover:bg-card-2"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold">{c.id.replace("child-seed-", "")}</span>
                      {c.handoff === "queued" ? <Chip tone={on ? "night" : "lilac"}>Queued</Chip> : c.handoff === "done" ? <Chip tone={on ? "night" : "moss"}>Reviewed</Chip> : <Chip tone={on ? "night" : "sand"}>New</Chip>}
                    </div>
                    <p className={cn("mt-1.5 flex items-center gap-2 text-[12px]", on ? "text-paper/65" : "text-muted")}>
                      {c.ageMonths} mo · sector {c.sector}
                      {e?.safety && (
                        <span className={cn("inline-flex items-center gap-1 font-semibold", on ? "text-peach" : "text-brick")}>
                          <ShieldAlert className="size-3.5" /> override
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-8 text-center text-[13px] text-muted">Nothing waiting. 🎉</li>}
          </ul>
        </div>

        {/* detail */}
        {sel && ev && meta && sel.scores && (
          <div key={sel.id} className="nrx-rise overflow-hidden rounded-[44px] bg-night p-7 text-paper sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow tone="peach" index="02">Case review</Eyebrow>
                <p className="mt-3 font-mono text-[15px] font-semibold break-all">{sel.id}</p>
                <p className="mt-1 text-[12.5px] text-paper/60">
                  {sel.ageMonths} months ({ageBand(sel.ageMonths)}) · sector {sel.sector} · referred by {worker?.worker}
                </p>
              </div>
              <Chip tone="night">Synthetic record</Chip>
            </div>

            <div className="mt-8 grid items-center gap-8 xl:grid-cols-[1fr_1fr]">
              <div>
                <div className="flex items-center gap-5">
                  <GlowDot hex={meta.hexLight} glow={meta.glow} size={52} />
                  <div>
                    <p className="font-mono text-[10.5px] tracking-[0.22em] text-paper/55 uppercase">Parent-facing tier</p>
                    <p className="font-display text-[clamp(56px,6vw,92px)] leading-[0.88] uppercase" style={{ color: meta.hexLight }}>
                      {ev.tier}
                    </p>
                  </div>
                </div>
                <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-white/[0.06] p-4 text-[12.5px] leading-relaxed text-paper/80">
                  {ev.safety ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#ee6a4f]" /> : <FlaskConical className="mt-0.5 size-4 shrink-0 text-peach" />}
                  <span>
                    <b className="text-paper">{ev.safety ? "Safety override · " : "Model · "}</b>
                    {ev.reason}
                  </span>
                </p>

                <p className="mt-6 mb-3 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">Class probabilities (illustrative)</p>
                <div className="space-y-2.5">
                  {(["typical", "monitor", "refer"] as const).map((k) => (
                    <div key={k} className="flex items-center gap-3">
                      <span className="w-16 text-[12px] capitalize text-paper/80">{k}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.round(ev.probs[k] * 100)}%`, background: k === "typical" ? "#8fbf5a" : k === "monitor" ? "#e8b13a" : "#ee6a4f" }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-[11.5px]">{Math.round(ev.probs[k] * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-4 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">Area scores (SD from expected)</p>
                <div className="space-y-4">
                  {domainKeys(sel.scores ?? {}).map((k) => {
                    const z = sel.scores![k];
                    const s = domainStatus(z);
                    return (
                      <div key={k}>
                        <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                          <span className="font-semibold">{DOMAINS[k].label}</span>
                          <span className="font-mono text-[12px] font-semibold" style={{ color: s.level === 0 ? "#8fbf5a" : s.level === 1 ? "#e8b13a" : "#ee6a4f" }}>
                            {z > 0 ? "+" : ""}{z.toFixed(1)}
                          </span>
                        </div>
                        <div className="relative h-2.5 rounded-full bg-white/10">
                          <span className="absolute -top-1 -bottom-1 w-px bg-[#ee6a4f]" style={{ left: "25%" }} />
                          <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-night" style={{ left: pos(z), background: s.level === 0 ? "#8fbf5a" : s.hex }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 flex justify-between font-mono text-[9.5px] tracking-wider text-paper/40">
                  <span>−3</span>
                  <span className="text-[#ee6a4f]">−2 SAFETY</span>
                  <span>−1</span>
                  <span>0</span>
                  <span>+1</span>
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <label className="block">
                <span className="mb-2 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">Clinical note (stays in this browser)</span>
                <textarea
                  value={notes[sel.id] ?? ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [sel.id]: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Book developmental assessment; recheck hearing…"
                  className="w-full resize-none rounded-2xl border border-white/12 bg-white/[0.06] p-4 text-[14px] text-paper placeholder:text-paper/30 focus:border-peach focus:outline-none"
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                <Btn
                  variant="peach"
                  size="lg"
                  onClick={() => {
                    setWhatIfSeed({ scores: sel.scores!, regression: sel.regression, label: sel.id });
                    go("whatif");
                  }}
                >
                  <FlaskConical className="size-4" /> Open in what-if
                </Btn>
                <Btn
                  variant="ghostDark"
                  size="lg"
                  disabled={sel.handoff === "done"}
                  onClick={() => {
                    patchChild(sel.id, { handoff: "done" });
                    showToast(`${sel.id.replace("child-seed-", "")} acknowledged`);
                  }}
                >
                  <CheckCheck className="size-4" /> {sel.handoff === "done" ? "Acknowledged" : "Acknowledge handoff"}
                </Btn>
              </div>
            </div>
          </div>
        )}
        {!sel && (
          <div className="rounded-[44px] border border-dashed border-line-2 p-16 text-center">
            <p className="font-display text-[48px] leading-none text-ink/25 uppercase">No referrals yet</p>
            <p className="mt-3 text-[13px] text-muted">Switch to the Health Worker view and send a 1-touch referral.</p>
          </div>
        )}
      </div>
    </Page>
  );
}
