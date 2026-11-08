import { useMemo, useState } from "react";
import { CheckCheck, ChevronRight, Clock3, Filter, ScanLine, Search, Send, ShieldAlert, Stethoscope, UsersRound } from "lucide-react";
import { ChildDrawer } from "../components/ChildDrawer";
import { OversightHero } from "../components/OversightHero";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, SECTORS, STATUS_META, ageBand, childLabel, evaluate, type Child, type Sector } from "../lib/model";
import { ROLES } from "../lib/roles";
import type { ReferralRecord } from "../api/types";
import { referralApi } from "../api/client";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Stage = "all" | "ready" | "queued" | "done";

function statusKey(ref: ReferralRecord): string {
  return (ref.status ?? "").toLowerCase();
}

/** Prefer the real referral status; fall back to the child's handoff marker. */
function stageOf(child: Child, ref?: ReferralRecord): Exclude<Stage, "all"> {
  if (ref) {
    const s = statusKey(ref);
    if (s === "created") return "ready";
    if (s === "sent" || s === "seen") return "queued";
    if (s === "outcome recorded" || s === "closed") return "done";
  }
  if (child.handoff === "done") return "done";
  if (child.handoff === "queued") return "queued";
  return "ready";
}

const DAY = 86_400_000;
function ago(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const d = Math.max(0, Math.round((Date.now() - t) / DAY));
  return d === 0 ? "today" : `${d}d`;
}

/** Real timestamp trail, e.g. "Created 6d · Sent 3d · Seen 1d". */
function timeline(ref: ReferralRecord): string {
  const parts = [
    ["Created", ago(ref.created_at)],
    ["Sent", ago(ref.sent_at)],
    ["Seen", ago(ref.seen_at)],
    ["Outcome", ago(ref.outcome_recorded_at)],
    ["Closed", ago(ref.closed_at)],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`);
  return parts.join(" · ");
}

function statusLabel(ref: ReferralRecord): string {
  const s = statusKey(ref);
  if (s === "created") return "Ready to send";
  if (s === "sent") return "Sent to facility";
  if (s === "seen") return "Seen · awaiting outcome";
  if (s === "outcome recorded") return "Outcome recorded";
  if (s === "closed") return "Closed";
  return ref.status;
}

type Roster = { id: string; name: string; role: string; area: string };

/** Match a child's ward label ("Ward 12 - Sector B") to a real worker area. */
function workerForWard(ward: string | undefined, roster: Roster[]): Roster | null {
  const w = (ward ?? "").toLowerCase().trim();
  if (!w) return null;
  return (
    roster.find((x) => {
      const area = (x.area ?? "").toLowerCase().trim();
      return area !== "" && area !== "all" && (w === area || w.startsWith(`${area} -`) || w.includes(area));
    }) ?? null
  );
}

function wardMatches(ward: string | undefined, area: string): boolean {
  const w = (ward ?? "").toLowerCase();
  const a = area.toLowerCase();
  return w === a || w.startsWith(`${a} -`) || w.includes(a);
}

export function Referrals() {
  const { role, children, workers, workerName, referralRecords, contactChild, outcomeChild, setCheckInTarget, go, showToast, reload } =
    useApp();
  const tr = useT();
  const isSupervisor = role === "supervisor";
  const user = ROLES[role].user;
  const [stage, setStage] = useState<Stage>("all");
  const [sector, setSector] = useState<"all" | Sector>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Newest real referral per child, from /api/referrals. */
  const latestRefByChild = useMemo(() => {
    const map = new Map<string, ReferralRecord>();
    for (const ref of referralRecords) {
      const prev = map.get(ref.child_id);
      if (!prev || new Date(ref.created_at).getTime() >= new Date(prev.created_at).getTime()) {
        map.set(ref.child_id, ref);
      }
    }
    return map;
  }, [referralRecords]);

  const items = useMemo(
    () =>
      children
        .filter((c) => c.status === "refer" || c.handoff !== "none")
        .map((child) => ({ child, ref: latestRefByChild.get(child.id) }))
        .sort((a, b) => {
          const order = { ready: 0, queued: 1, done: 2 };
          return (
            order[stageOf(a.child, a.ref)] - order[stageOf(b.child, b.ref)] ||
            (b.child.lastVisitDays ?? 0) - (a.child.lastVisitDays ?? 0)
          );
        }),
    [children, latestRefByChild]
  );

  const counts = {
    all: items.length,
    ready: items.filter((i) => stageOf(i.child, i.ref) === "ready").length,
    queued: items.filter((i) => stageOf(i.child, i.ref) === "queued").length,
    done: items.filter((i) => stageOf(i.child, i.ref) === "done").length,
  };

  const filtered = items.filter(
    ({ child, ref }) =>
      (stage === "all" || stageOf(child, ref) === stage) &&
      (sector === "all" || child.sector === sector) &&
      (areaFilter === "all" || wardMatches(child.ward, areaFilter)) &&
      (query === "" || `${childLabel(child)} ${child.id}`.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const selected = children.find((c) => c.id === selectedId) ?? null;

  const screen = (child: Child) => {
    setCheckInTarget(child.id);
    setSelectedId(null);
    go("checkin");
  };

  /** Create (if needed), mark sent, and dispatch the handoff to the facility. */
  const send = async (child: Child, ref?: ReferralRecord) => {
    try {
      // Reuse an open referral's id, or open one now.
      const current = ref && statusKey(ref) !== "closed" ? ref : (await referralApi.oneTouchReferral(child.id)).referral;
      const res = await referralApi.dispatchReferral(current.id, { channel: "whatsapp" });
      showToast(`${childLabel(child)} · ${res.detail}`);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send the referral");
    }
  };

  /** Record that the child was actually seen, advancing sent → seen. */
  const markSeen = async (child: Child, ref: ReferralRecord) => {
    try {
      await referralApi.updateReferral(ref.id, { status: "seen" });
      showToast(`${childLabel(child)} marked as seen`);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not mark the referral seen");
    }
  };

  const confirm = (child: Child, notes?: string) => {
    void outcomeChild(child.id, { handoff: "done" }, notes);
    showToast(`${childLabel(child)} handoff confirmed`);
  };
  const contacted = (child: Child) => {
    void contactChild(child.id, { visits: child.visits + 1, lastVisitDays: 0 });
    showToast(`${childLabel(child)} caregiver contacted`);
  };

  const workerRows = useMemo(() => {
    const rows = new Map<string, Roster & { ready: number; queued: number; done: number }>();
    for (const w of workers) {
      const area = (w.area ?? "").trim();
      if (!area || area.toLowerCase() === "all") continue;
      rows.set(area.toLowerCase(), { id: w.id, name: w.name, role: w.role, area, ready: 0, queued: 0, done: 0 });
    }
    for (const { child, ref } of items) {
      const match = workerForWard(child.ward, workers);
      const area = (match?.area ?? child.ward ?? "Unassigned").trim();
      const key = area.toLowerCase();
      if (!rows.has(key)) {
        rows.set(key, {
          id: key,
          name: match?.name ?? "Unassigned",
          role: match?.role ?? "chw",
          area,
          ready: 0,
          queued: 0,
          done: 0,
        });
      }
      rows.get(key)![stageOf(child, ref)] += 1;
    }
    return [...rows.values()];
  }, [workers, items]);

  return (
    <>
      <Page>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow index="01">{isSupervisor ? tr("Field supervisor · referral oversight") : tr("Frontline · referral desk")}</Eyebrow>
            <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
              {tr("Every referral.")}
              <br />
              <span className="text-rust">{tr("A visible next step.")}</span>
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
          {isSupervisor
            ? tr("See which worker raised each referral, what is waiting for pickup, and whether the facility handoff was completed.")
            : tr("Prepare the handoff, send it to the clinical queue, and keep the caregiver informed without losing the child’s screening context.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn size="sm" onClick={() => go("checkin")}>
            <ScanLine className="size-3.5" /> {tr("Screen a child")}
          </Btn>
          <Btn size="sm" variant="light" onClick={() => go("help")}>
            {tr("RBSK / DEIC directory")}
          </Btn>
        </div>

        <OversightHero
          className="mt-10"
          pct={counts.all ? Math.round((counts.done / counts.all) * 100) : 0}
          ringLabel={tr("Referral closure")}
          ringSub={<>{tr("{n} of {total} referrals confirmed", { n: counts.done, total: counts.all })}</>}
          tiles={[
            {
              label: tr("All referrals"),
              value: String(counts.all),
              helper: tr("All children requiring a clinical next step"),
              color: "#7cc1dc",
              icon: <Stethoscope className="size-4" />,
              onClick: () => setStage("all"),
              active: stage === "all",
            },
            {
              label: tr("Ready to send"),
              value: String(counts.ready),
              helper: tr("Screened, but the referral has not been sent"),
              color: "#ee6a4f",
              icon: <Send className="size-4" />,
              onClick: () => setStage("ready"),
              active: stage === "ready",
            },
            {
              label: tr("With clinician"),
              value: String(counts.queued),
              helper: tr("Sent, or seen by the facility"),
              color: "#e8b13a",
              icon: <Clock3 className="size-4" />,
              onClick: () => setStage("queued"),
              active: stage === "queued",
            },
            {
              label: tr("Confirmed"),
              value: String(counts.done),
              helper: tr("Outcome recorded and referral closed"),
              color: "#8fbf5a",
              icon: <CheckCheck className="size-4" />,
              onClick: () => setStage("done"),
              active: stage === "done",
            },
          ]}
          segments={[
            { label: tr("Ready to send"), hex: "#ee6a4f", n: counts.ready },
            { label: tr("With clinician"), hex: "#e8b13a", n: counts.queued },
            { label: tr("Confirmed"), hex: "#8fbf5a", n: counts.done },
          ]}
        />

        {isSupervisor && (
          <Reveal className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {workerRows.map((worker) => {
                const active = areaFilter === worker.area;
                return (
                  <button
                    key={worker.id}
                    onClick={() => setAreaFilter(active ? "all" : worker.area)}
                    className={cn(
                      "rounded-[26px] border p-5 text-left transition-all hover:-translate-y-0.5",
                      active ? "border-sea bg-sea-bg" : "border-line-2 bg-card hover:bg-card-2"
                    )}
                  >
                    <p className="flex items-center justify-between font-mono text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">
                      {worker.area} · {worker.role} <UsersRound className="size-4" />
                    </p>
                    <p className="mt-3 font-display text-[27px] leading-none uppercase">{worker.name}</p>
                    <p className="mt-4 text-[11.5px] text-ink-2">
                      <b className="text-brick">{worker.ready} ready</b> · <b className="text-amber">{worker.queued} queued</b> · <b className="text-moss">{worker.done} done</b>
                    </p>
                  </button>
                );
              })}
            </div>
          </Reveal>
        )}

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_360px]">
          <Reveal>
            <section className="overflow-hidden rounded-[36px] border border-line-2 bg-card">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-2 p-5 sm:p-7">
                <div>
                  <Eyebrow index="02" tone="muted">Referral register</Eyebrow>
                  <p className="mt-2 text-[13px] text-ink-2">{filtered.length} matching records</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <div className="relative min-w-[220px] flex-1 sm:flex-none">
                    <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={tr("Search child ID…")}
                      aria-label="Search child ID"
                      className="w-full rounded-full border border-line-2 bg-card-2 py-3 pr-4 pl-11 text-[13px] focus:border-sea focus:outline-none"
                    />
                  </div>
                  {!isSupervisor && (
                    <select value={sector} onChange={(e) => setSector(e.target.value as "all" | Sector)} className="nrx-select rounded-full border border-line-2 bg-card-2 py-3 pr-10 pl-4 text-[12px] font-semibold">
                      <option value="all">All sectors</option>
                      {SECTORS.map((s) => <option key={s.id} value={s.id}>Sector {s.id}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <ul>
                {filtered.map(({ child, ref }) => {
                  const ev = child.scores ? evaluate(child.scores, child.regression) : null;
                  const childStage = stageOf(child, ref);
                  const worker = workerForWard(child.ward, workers);
                  const lowest = ev ? DOMAINS[ev.lowest].label : "Clinical concern";
                  const refState = ref ? statusKey(ref) : "";
                  return (
                    <li key={child.id} className="border-b border-line transition-colors last:border-0 hover:bg-card-2/60">
                      <div className="grid items-center gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                        <button onClick={() => setSelectedId(child.id)} className="group min-w-0 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12.5px] font-semibold" title={child.id}>{childLabel(child)}</span>
                            <Chip tone={childStage === "ready" ? "brick" : childStage === "queued" ? "amber" : "moss"}>
                              {ref
                                ? tr(statusLabel(ref))
                                : childStage === "ready"
                                  ? tr("Ready to send")
                                  : childStage === "queued"
                                    ? tr("With clinician")
                                    : tr("Confirmed")}
                            </Chip>
                          </div>
                          <p className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
                            {child.ageMonths} mo · {ageBand(child.ageMonths)} · sector {child.sector}
                            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                          </p>
                        </button>
                        <div>
                          <p className="text-[12px] font-bold">{ref ? ref.to_facility : ev?.safety ? "Safety override" : lowest}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                            {ev?.safety && <ShieldAlert className="size-3.5 text-brick" />}
                            {ref
                              ? timeline(ref) || "No status timestamps yet"
                              : ev
                                ? `${ev.min.toFixed(1)} SD · ${STATUS_META.refer.long}`
                                : "Referral note pending"}
                          </p>
                          {ref?.reason && <p className="mt-1 line-clamp-2 text-[11px] text-muted">{ref.reason}</p>}
                        </div>
                        <div>
                          <p className="text-[12px] font-bold">{worker?.name ?? workerName ?? "Unassigned"}</p>
                          <p className="mt-1 text-[11px] text-muted">{worker?.area ?? "Field"} · {child.visits} visits</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {childStage === "ready" && (
                            <Btn size="sm" variant="rust" onClick={() => void send(child, ref)}>
                              <Send className="size-3.5" /> Send
                            </Btn>
                          )}
                          {childStage === "queued" && refState === "sent" && ref && (
                            <Btn size="sm" onClick={() => void markSeen(child, ref)}>
                              <CheckCheck className="size-3.5" /> {tr("Mark seen")}
                            </Btn>
                          )}
                          {childStage === "queued" && refState !== "sent" && (
                            <Btn size="sm" onClick={() => setSelectedId(child.id)}>
                              <CheckCheck className="size-3.5" /> {tr("Record outcome")}
                            </Btn>
                          )}
                          {childStage === "done" && <Btn size="sm" variant="light" onClick={() => setSelectedId(child.id)}>{tr("Review")}</Btn>}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="p-12 text-center">
                    <Filter className="mx-auto size-7 text-muted" />
                    <p className="mt-3 text-[14px] font-bold">No referrals match these filters</p>
                  </li>
                )}
              </ul>
            </section>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={80}>
              <aside className="rounded-[36px] bg-night p-7 text-paper">
                <Eyebrow index="03" tone="peach">{tr("Handoff pathway")}</Eyebrow>
                <ol className="mt-6 space-y-5">
                  {[
                    [ScanLine, "Screen", "A result reaches Refer or a safety rule fires."],
                    [Send, "Send", "Marks the referral sent and stamps sent-at; the minimal summary is shareable."],
                    [Stethoscope, "Seen", "The child's visit is recorded, stamping seen-at against the referral."],
                    [CheckCheck, "Outcome", "Outcome notes close the referral with a full timestamp trail."],
                  ].map(([Icon, title, text], index) => {
                    const StepIcon = Icon as typeof ScanLine;
                    return (
                      <li key={String(title)} className="flex gap-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-peach"><StepIcon className="size-4" /></span>
                        <div>
                          <p className="font-display text-[24px] leading-none uppercase">0{index + 1} · {tr(String(title))}</p>
                          <p className="mt-1.5 text-[11.5px] leading-relaxed text-paper/60">{String(text)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            </Reveal>

            <Reveal delay={130}>
              <aside className="rounded-[36px] border border-line-2 bg-card p-7">
                <p className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase"><Clock3 className="size-4" /> {tr("Follow-up rule")}</p>
                <p className="mt-4 font-display text-[31px] leading-[1.02] uppercase">{tr("No referral disappears after “send”.")}</p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
                  Every status change — sent, seen, outcome, closed — is stored with its timestamp and stays visible to the worker and supervisor.
                </p>
                <Btn className="mt-5 w-full" onClick={() => go("checkin")}><ScanLine className="size-4" /> {tr("Screen another child")}</Btn>
              </aside>
            </Reveal>
          </div>
        </div>
      </Page>

      <ChildDrawer
        child={selected}
        onClose={() => setSelectedId(null)}
        onScreen={screen}
        onRefer={send}
        onContacted={contacted}
        onOutcome={confirm}
      />
    </>
  );
}