import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock3, FlaskConical, Save, ShieldAlert, Stethoscope } from "lucide-react";
import { OversightHero } from "../components/OversightHero";
import { Btn, Chip, Display, Eyebrow, GlowDot, Page } from "../components/ui";
import { DOMAINS, TIER_META, ageBand, childLabel, domainKeys, domainStatus, evaluate, type Child } from "../lib/model";
import { ROLES } from "../lib/roles";
import type { ReferralRecord } from "../api/types";
import { referralApi } from "../api/client";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const DAY = 86_400_000;
const AWAITING = new Set(["created", "sent"]);

const pos = (z: number) => `${((Math.max(-3, Math.min(1, z)) + 3) / 4) * 100}%`;
const statusOf = (ref: ReferralRecord) => (ref.status ?? "").toLowerCase();

function statusTone(status: string): "brick" | "amber" | "sea" | "moss" | "sand" {
  if (status === "created") return "brick";
  if (status === "sent") return "amber";
  if (status === "seen") return "sea";
  if (status === "outcome recorded" || status === "closed") return "moss";
  return "sand";
}

function statusLabel(status: string): string {
  if (status === "created") return "Awaiting send";
  if (status === "sent") return "Awaiting review";
  if (status === "seen") return "Reviewed";
  if (status === "outcome recorded") return "Outcome recorded";
  if (status === "closed") return "Closed";
  return status;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / DAY)) : null;
}

export function Cases() {
  const { role, children, workers, referralRecords, caseId, setCaseId, setWhatIfSeed, go, showToast, reload } = useApp();
  const tr = useT();
  const user = ROLES[role].user;
  const [tab, setTab] = useState<"all" | "awaiting">("all");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const childById = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  /** Newest referral per child — one case row per child. */
  const arrivals = useMemo(() => {
    const latest = new Map<string, ReferralRecord>();
    for (const ref of referralRecords) {
      if (!childById.has(ref.child_id)) continue;
      const prev = latest.get(ref.child_id);
      if (!prev || new Date(ref.created_at).getTime() >= new Date(prev.created_at).getTime()) {
        latest.set(ref.child_id, ref);
      }
    }
    return [...latest.values()].sort((a, b) => {
      const aAwait = AWAITING.has(statusOf(a)) ? 0 : 1;
      const bAwait = AWAITING.has(statusOf(b)) ? 0 : 1;
      return aAwait - bAwait || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [referralRecords, childById]);

  const filtered = tab === "awaiting" ? arrivals.filter((ref) => AWAITING.has(statusOf(ref))) : arrivals;
  const selRef = arrivals.find((ref) => ref.child_id === caseId) ?? filtered[0] ?? arrivals[0];
  const selChild = selRef ? childById.get(selRef.child_id) : undefined;
  const selWorker = selRef ? workerById.get(selRef.from_worker_id) : undefined;

  useEffect(() => {
    setNote(selRef?.clinical_notes ?? "");
  }, [selRef?.id, selRef?.clinical_notes]);

  const awaiting = arrivals.filter((ref) => AWAITING.has(statusOf(ref))).length;
  const overrides = arrivals.filter((ref) => {
    const c = childById.get(ref.child_id);
    return c?.scores ? evaluate(c.scores, c.regression).safety : false;
  }).length;
  const reviewed = arrivals.length - awaiting;

  const ev = selChild?.scores ? evaluate(selChild.scores, selChild.regression) : null;
  const meta = ev ? TIER_META[ev.tier] : null;

  const acknowledge = async () => {
    if (!selRef || !AWAITING.has(statusOf(selRef))) return;
    setBusy(true);
    try {
      await referralApi.acknowledgeReferral(selRef.id, { clinical_notes: note.trim() || null });
      showToast(`${selChild ? childLabel(selChild) : "Referral"} acknowledged`);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not acknowledge the referral");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!selRef) return;
    setBusy(true);
    try {
      await referralApi.updateReferral(selRef.id, { clinical_notes: note.trim() || null });
      showToast("Clinical note saved to the referral");
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save the note");
    } finally {
      setBusy(false);
    }
  };

  const openWhatIf = (child: Child) => {
    if (!child.scores) return;
    setWhatIfSeed({ scores: child.scores, regression: child.regression, label: childLabel(child) });
    go("whatif");
  };

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>{tr("Clinician tools · referral review")}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,92px)]">
            {tr("Children who")}
            <br />
            <span className="text-rust">{tr("need you next.")}</span>
          </Display>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-6 pl-2">
          <span className="grid size-12 place-items-center rounded-full bg-rust font-mono text-[12px] font-semibold text-white">{user.initials}</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">{user.name}</span>
            <span className="block text-[12px] text-muted">{user.title}</span>
          </span>
        </div>
      </div>
      <p className="mt-5 max-w-[680px] text-[15px] leading-relaxed text-ink-2">
        {tr("Real referrals raised by the frontline team — review the scores, record a clinical note, and acknowledge the handoff. Acknowledgements and notes are saved to the referral.")}
      </p>

      <OversightHero
        className="mt-10"
        pct={arrivals.length ? Math.round((awaiting / arrivals.length) * 100) : 0}
        ringLabel={tr("Awaiting review")}
        ringSub={<>{tr("{n} of {total} referrals need a clinical decision", { n: awaiting, total: arrivals.length })}</>}
        tiles={[
          {
            label: tr("Referrals"),
            value: String(arrivals.length),
            helper: tr("across all wards"),
            color: "#7cc1dc",
            icon: <Stethoscope className="size-4" />,
          },
          {
            label: tr("Awaiting review"),
            value: String(awaiting),
            helper: tr("created or sent"),
            color: "#e8b13a",
            icon: <Clock3 className="size-4" />,
          },
          {
            label: tr("Safety overrides"),
            value: String(overrides),
            helper: tr("model skipped"),
            color: "#ee6a4f",
            icon: <ShieldAlert className="size-4" />,
          },
          {
            label: tr("Reviewed"),
            value: String(reviewed),
            helper: tr("acknowledged or closed"),
            color: "#8fbf5a",
            icon: <CheckCheck className="size-4" />,
          },
        ]}
        segments={[
          ["created", "Awaiting send", "#cdb98c"],
          ["sent", "Awaiting review", "#e8b13a"],
          ["seen", "Reviewed", "#5aa6c4"],
          ["outcome recorded", "Outcome recorded", "#8fbf5a"],
          ["closed", "Closed", "#6e9a3a"],
        ].map(([status, label, hex]) => ({
          label: tr(label),
          hex,
          n: arrivals.filter((ref) => statusOf(ref) === status).length,
        }))}
      />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[400px_1fr]">
        {/* queue */}
        <div className="rounded-[36px] border border-line-2 bg-card p-4 sm:p-5">
          <div className="mb-3 flex rounded-full border border-line-2 bg-card-2 p-1">
            {(["all", "awaiting"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("flex-1 rounded-full py-2.5 text-[12.5px] font-bold transition-all", tab === t ? "bg-ink text-paper" : "text-ink-2")}
              >
                {t === "all" ? `All referrals (${arrivals.length})` : `Awaiting review (${awaiting})`}
              </button>
            ))}
          </div>
          <ul className="nrx-scroll max-h-[640px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((ref) => {
              const child = childById.get(ref.child_id);
              if (!child) return null;
              const on = selRef?.id === ref.id;
              const worker = workerById.get(ref.from_worker_id);
              return (
                <li key={ref.id}>
                  <button
                    onClick={() => setCaseId(child.id)}
                    className={cn(
                      "w-full rounded-[22px] border p-4 text-left transition-all duration-200",
                      on ? "border-ink bg-ink text-paper" : "border-transparent bg-card-2/70 hover:border-line-2 hover:bg-card-2",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold">{childLabel(child)}</span>
                      <Chip tone={on ? "night" : statusTone(statusOf(ref))}>{statusLabel(statusOf(ref))}</Chip>
                    </div>
                    <p className={cn("mt-1.5 truncate text-[12px]", on ? "text-paper/65" : "text-muted")}>{ref.to_facility}</p>
                    <p className={cn("mt-1 text-[11px]", on ? "text-paper/50" : "text-muted")}>
                      {child.ageMonths} mo · {worker?.name ?? "Unassigned"}
                    </p>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="p-8 text-center text-[13px] text-muted">
                {tab === "awaiting" ? "Nothing awaiting review." : "No referrals yet."}
              </li>
            )}
          </ul>
        </div>

        {/* detail */}
        {selRef && selChild && (
          <div key={selRef.id} className="nrx-rise overflow-hidden rounded-[44px] bg-night p-6 text-paper sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow tone="peach">Case review</Eyebrow>
                <p className="mt-3 font-mono text-[15px] font-semibold">{childLabel(selChild)}</p>
                <p className="mt-1 text-[12.5px] text-paper/60">
                  {selChild.ageMonths} months ({ageBand(selChild.ageMonths)}) · {selRef.to_facility} · referred by{" "}
                  {selWorker?.name ?? "Unassigned"}
                </p>
              </div>
              <Chip tone="night">{statusLabel(statusOf(selRef))}</Chip>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl bg-white/[0.05] p-4 text-[12px] sm:grid-cols-3">
              <div>
                <p className="font-mono text-[9.5px] tracking-[0.16em] text-paper/45 uppercase">Reason</p>
                <p className="mt-1 leading-relaxed text-paper/80">{selRef.reason}</p>
              </div>
              <div>
                <p className="font-mono text-[9.5px] tracking-[0.16em] text-paper/45 uppercase">Timeline</p>
                <p className="mt-1 text-paper/80">
                  created {daysSince(selRef.created_at) ?? "—"}d
                  {selRef.sent_at ? ` · sent ${daysSince(selRef.sent_at)}d` : ""}
                  {selRef.seen_at ? ` · seen ${daysSince(selRef.seen_at)}d` : ""}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9.5px] tracking-[0.16em] text-paper/45 uppercase">Domains</p>
                <p className="mt-1 uppercase text-paper/80">
                  {selRef.domains_of_concern.length ? selRef.domains_of_concern.join(", ") : "—"}
                </p>
              </div>
            </div>

            {ev && meta && selChild.scores ? (
              <div className="mt-8 grid items-start gap-8 xl:grid-cols-2">
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
                </div>

                <div>
                  <p className="mb-4 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">Area scores (SD from expected)</p>
                  <div className="space-y-4">
                    {domainKeys(selChild.scores).map((k) => {
                      const z = selChild.scores![k];
                      const s = domainStatus(z);
                      return (
                        <div key={k}>
                          <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                            <span className="font-semibold">{DOMAINS[k].label}</span>
                            <span className="font-mono text-[12px] font-semibold" style={{ color: s.level === 0 ? "#8fbf5a" : s.level === 1 ? "#e8b13a" : "#ee6a4f" }}>
                              {z > 0 ? "+" : ""}
                              {z.toFixed(1)}
                            </span>
                          </div>
                          <div className="relative h-2.5 rounded-full bg-white/10">
                            <span className="absolute -top-1 -bottom-1 w-px bg-[#ee6a4f]" style={{ left: "25%" }} />
                            <span
                              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-night"
                              style={{ left: pos(z), background: s.level === 0 ? "#8fbf5a" : s.hex }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-8 rounded-2xl border border-dashed border-white/20 p-5 text-center text-[13px] text-paper/60">
                No domain scores are attached to this screening.
              </p>
            )}

            <div className="mt-8 border-t border-white/10 pt-6">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">
                  Clinical note
                  <span className="font-normal normal-case tracking-normal text-paper/35">· saved to the referral</span>
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Book developmental assessment; recheck hearing…"
                  className="w-full resize-none rounded-2xl border border-white/12 bg-white/[0.06] p-4 text-[14px] text-paper placeholder:text-paper/30 focus:border-peach focus:outline-none"
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                {selChild.scores && (
                  <Btn variant="peach" size="lg" onClick={() => openWhatIf(selChild)}>
                    <FlaskConical className="size-4" /> Open in what-if
                  </Btn>
                )}
                <Btn variant="ghostDark" size="lg" onClick={() => void saveNote()} disabled={busy}>
                  <Save className="size-4" /> Save note
                </Btn>
                <Btn
                  variant="ghostDark"
                  size="lg"
                  disabled={busy || !AWAITING.has(statusOf(selRef))}
                  onClick={() => void acknowledge()}
                >
                  <CheckCheck className="size-4" /> {AWAITING.has(statusOf(selRef)) ? "Acknowledge handoff" : "Acknowledged"}
                </Btn>
                <Btn variant="ghostDark" size="lg" onClick={() => go("help")}>
                  Subspecialty directory →
                </Btn>
              </div>
            </div>
          </div>
        )}

        {!selRef && (
          <div className="rounded-[36px] border border-dashed border-line-2 p-16 text-center">
            <Stethoscope className="mx-auto size-8 text-ink/25" />
            <p className="mt-4 font-display text-[40px] leading-none text-ink/25 uppercase">No referrals yet</p>
            <p className="mt-3 text-[13px] text-muted">
              Referrals raised by the frontline team will appear here for clinical review.
            </p>
          </div>
        )}
      </div>

      <p className="mt-6 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">
        <Clock3 className="size-3.5" /> Every acknowledgement and note is stored on the referral record
      </p>
    </Page>
  );
}
