import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCheck, Clock3, Stethoscope, UsersRound } from "lucide-react";
import { ChildDrawer } from "../components/ChildDrawer";
import { OversightHero } from "../components/OversightHero";
import { SectionCard } from "../components/SectionCard";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { childLabel, type Child } from "../lib/model";
import { ROLES } from "../lib/roles";
import type { ReferralRecord } from "../api/types";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const DAY = 86_400_000;
const STUCK_MS = 3 * DAY;
const OPEN = new Set(["created", "sent", "seen"]);
const DONE = new Set(["outcome recorded", "closed"]);
const FUNNEL: [string, string][] = [
  ["created", "#cdb98c"],
  ["sent", "#e8b13a"],
  ["seen", "#5aa6c4"],
  ["outcome recorded", "#8fbf5a"],
  ["closed", "#6e9a3a"],
];

function statusTone(status: string): "brick" | "amber" | "sea" | "moss" | "sand" {
  if (status === "created") return "brick";
  if (status === "sent") return "amber";
  if (status === "seen") return "sea";
  if (DONE.has(status)) return "moss";
  return "sand";
}

function statusLabel(status: string): string {
  return status === "outcome recorded" ? "Outcome" : status.charAt(0).toUpperCase() + status.slice(1);
}

function daysSince(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / DAY)) : null;
}

interface LoadRow {
  key: string;
  name: string;
  area: string;
  total: number;
  open: number;
  stuck: number;
  done: number;
}

export function SupervisorReferrals() {
  const {
    role,
    children,
    workers,
    referralRecords,
    referChild,
    contactChild,
    outcomeChild,
    go,
    showToast,
  } = useApp();
  const tr = useT();
  const user = ROLES[role].user;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const childById = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  const stats = useMemo(() => {
    const now = Date.now();
    let open = 0;
    let stuck = 0;
    let done = 0;
    for (const ref of referralRecords) {
      const s = (ref.status ?? "").toLowerCase();
      if (OPEN.has(s)) open += 1;
      if (DONE.has(s)) done += 1;
      if (s === "created" || s === "sent") {
        const created = new Date(ref.created_at).getTime();
        if (Number.isFinite(created) && now - created > STUCK_MS) stuck += 1;
      }
    }
    return { total: referralRecords.length, open, stuck, done };
  }, [referralRecords]);

  const funnel = useMemo(() => {
    const counts = new Map(FUNNEL.map(([status]) => [status, 0]));
    for (const ref of referralRecords) {
      const s = (ref.status ?? "").toLowerCase();
      if (counts.has(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [referralRecords]);

  const medianSeen = useMemo(() => {
    const deltas = referralRecords
      .filter((r) => r.seen_at)
      .map((r) => (new Date(r.seen_at as string).getTime() - new Date(r.created_at).getTime()) / DAY)
      .filter((d) => Number.isFinite(d) && d >= 0)
      .sort((a, b) => a - b);
    if (!deltas.length) return null;
    const mid = Math.floor(deltas.length / 2);
    const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
    return Math.round(median * 10) / 10;
  }, [referralRecords]);

  const loadRows = useMemo<LoadRow[]>(() => {
    const rows = new Map<string, LoadRow>();
    const ensure = (key: string, name: string, area: string): LoadRow => {
      let row = rows.get(key);
      if (!row) {
        row = { key, name, area, total: 0, open: 0, stuck: 0, done: 0 };
        rows.set(key, row);
      }
      return row;
    };
    const now = Date.now();
    for (const ref of referralRecords) {
      const w = workerById.get(ref.from_worker_id);
      const row = ensure(w?.id ?? "unassigned", w?.name ?? "Unassigned", w?.area ?? "—");
      const s = (ref.status ?? "").toLowerCase();
      row.total += 1;
      if (OPEN.has(s)) row.open += 1;
      if (DONE.has(s)) row.done += 1;
      if (s === "created" || s === "sent") {
        const created = new Date(ref.created_at).getTime();
        if (Number.isFinite(created) && now - created > STUCK_MS) row.stuck += 1;
      }
    }
    return [...rows.values()].sort((a, b) => b.open - a.open || b.total - a.total);
  }, [referralRecords, workerById]);

  const stuck = useMemo(
    () =>
      referralRecords
        .filter((ref) => {
          const s = (ref.status ?? "").toLowerCase();
          if (s !== "created" && s !== "sent") return false;
          const created = new Date(ref.created_at).getTime();
          return Number.isFinite(created) && Date.now() - created > STUCK_MS;
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [referralRecords],
  );

  const recent = useMemo(
    () =>
      [...referralRecords]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12),
    [referralRecords],
  );

  const selected = children.find((c) => c.id === selectedId) ?? null;

  const contacted = (c: Child) => {
    void contactChild(c.id, { visits: c.visits + 1, lastVisitDays: 0 });
    showToast(`${childLabel(c)} marked as contacted`);
  };
  const refer = (c: Child) => {
    void referChild(c.id, { status: "refer", handoff: "queued" });
    showToast(`${childLabel(c)} referred · handoff queued`);
  };
  const outcome = (c: Child, notes?: string) => {
    void outcomeChild(c.id, { handoff: "done" }, notes);
    showToast(`Outcome recorded for ${childLabel(c)}`);
  };

  const openChild = (ref: ReferralRecord) => {
    if (childById.has(ref.child_id)) setSelectedId(ref.child_id);
  };

  return (
    <>
      <Page>
        {/* ============================ header ============================ */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>{tr("Oversight · referral desk")}</Eyebrow>
            <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,92px)]">
              {tr("Every referral.")}
              <br />
              <span className="text-rust">{tr("Nobody left waiting.")}</span>
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
          {tr("Track what the team has raised, where referrals are stuck, and which facility handoffs still need an outcome. Supervisors see the whole board — workers close their own loop.")}
        </p>
        <div className="mt-4">
          <Btn size="sm" variant="light" onClick={() => go("help")}>
            {tr("Audit block facility catchment")} →
          </Btn>
        </div>

        {/* ============================ KPI band ============================ */}
        <OversightHero
          className="mt-10"
          pct={stats.total ? Math.round((stats.done / stats.total) * 100) : 0}
          ringLabel={tr("Referral closure")}
          ringSub={<>{tr("{n} of {total} referrals confirmed", { n: stats.done, total: stats.total })}</>}
          tiles={[
            {
              label: tr("Total referrals"),
              value: String(stats.total),
              helper: tr("raised across the team"),
              color: "#7cc1dc",
              icon: <Stethoscope className="size-4" />,
            },
            {
              label: tr("Open"),
              value: String(stats.open),
              helper: tr("created, sent or seen"),
              color: "#e8b13a",
              icon: <Clock3 className="size-4" />,
            },
            {
              label: tr("Stuck > 3 days"),
              value: String(stats.stuck),
              helper: tr("not seen since being raised"),
              color: "#ee6a4f",
              icon: <AlertTriangle className="size-4" />,
            },
            {
              label: tr("Confirmed"),
              value: String(stats.done),
              helper: tr("outcome recorded or closed"),
              color: "#8fbf5a",
              icon: <CheckCheck className="size-4" />,
            },
          ]}
          segments={FUNNEL.map(([status, hex]) => ({
            label: tr(status === "outcome recorded" ? "Outcome" : status),
            hex,
            n: funnel.get(status) ?? 0,
          }))}
        />

        {/* ============================ team load ============================ */}
        <Reveal className="mt-4">
          <SectionCard
            eyebrow="Referral load by worker"
            title="Who is carrying open referrals, and who has stalled work."
            action={
              <Chip tone="lilac">
                <UsersRound className="size-3" /> {loadRows.length} workers
              </Chip>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-sand/40 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                    <th className="px-6 py-3 font-semibold sm:px-8">Worker</th>
                    <th className="px-4 py-3 font-semibold">Area</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Open</th>
                    <th className="px-4 py-3 text-right font-semibold">Stuck</th>
                    <th className="px-6 py-3 text-right font-semibold sm:px-8">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {loadRows.map((row) => (
                    <tr key={row.key} className="border-b border-line transition-colors last:border-0 hover:bg-card-2/60">
                      <td className="px-6 py-4 text-[12.5px] font-semibold sm:px-8">{row.name}</td>
                      <td className="px-4 py-4 text-[12px] text-ink-2">{row.area}</td>
                      <td className="px-4 py-4 text-right font-mono text-[13px]">{row.total}</td>
                      <td className={cn("px-4 py-4 text-right font-mono text-[13px] font-semibold", row.open ? "text-amber" : "text-muted")}>{row.open}</td>
                      <td className={cn("px-4 py-4 text-right font-mono text-[13px] font-semibold", row.stuck ? "text-brick" : "text-muted")}>{row.stuck}</td>
                      <td className={cn("px-6 py-4 text-right font-mono text-[13px] font-semibold sm:px-8", row.done ? "text-moss" : "text-muted")}>{row.done}</td>
                    </tr>
                  ))}
                  {loadRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-[13px] text-muted">
                        No referrals raised in this supervisor's scope yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Reveal>

        {/* ============================ funnel + stuck ============================ */}
        <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
          <Reveal className="h-full">
            <section className="flex h-full flex-col rounded-[36px] bg-night p-6 text-paper sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Eyebrow tone="peach">
                    {tr("Referral funnel")}
                  </Eyebrow>
                  <p className="mt-3 font-display text-[clamp(28px,3.2vw,40px)] leading-none uppercase">
                    {tr("{n} referrals", { n: stats.total })}
                  </p>
                </div>
              </div>
              <div className="mt-8">
                <p className="font-display text-[clamp(48px,5vw,72px)] leading-none text-peach">
                  {medianSeen != null ? `${medianSeen}d` : "—"}
                </p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-paper/60 uppercase">{tr("median → seen")}</p>
              </div>
              <p className="mt-auto pt-6 text-[12px] leading-relaxed text-paper/55">
                {tr("Every status is written to the referral record with its timestamp — sent, seen and closed dates stay available to the team.")}
              </p>
            </section>
          </Reveal>

          <Reveal className="h-full">
            <SectionCard
              eyebrow="Stuck referrals"
              title={
                stuck.length
                  ? "Created or sent over three days ago without the child being seen."
                  : "No referral has been waiting more than three days."
              }
              action={<Chip tone={stuck.length ? "brick" : "moss"}>{stuck.length} need chasing</Chip>}
              className="h-full"
            >
              <ul className="divide-y divide-line">
                {stuck.slice(0, 6).map((ref) => {
                  const child = childById.get(ref.child_id);
                  const age = daysSince(ref.created_at);
                  return (
                    <li key={ref.id}>
                      <button
                        type="button"
                        onClick={() => openChild(ref)}
                        className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-card-2 sm:px-8"
                      >
                        <AlertTriangle className="size-4 shrink-0 text-brick" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12.5px] font-semibold">
                            {child ? childLabel(child) : ref.child_id.slice(0, 8)}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {ref.to_facility} · {statusLabel((ref.status ?? "").toLowerCase())}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">{age != null ? `${age}d` : "—"}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted" />
                      </button>
                    </li>
                  );
                })}
                {stuck.length === 0 && (
                  <li className="flex flex-col items-center gap-2 px-6 py-10 text-center text-[13px] text-muted sm:px-8">
                    <CheckCheck className="size-5 text-moss" />
                    All clear. Keep recording outcomes to close referrals.
                  </li>
                )}
              </ul>
            </SectionCard>
          </Reveal>
        </div>

        {/* ============================ recent ============================ */}
        <Reveal className="mt-4">
          <SectionCard eyebrow="Recent referrals" title="The latest handoffs raised by the team.">
            <ul className="divide-y divide-line">
              {recent.map((ref) => {
                const child = childById.get(ref.child_id);
                const s = (ref.status ?? "").toLowerCase();
                const age = daysSince(ref.created_at);
                return (
                  <li key={ref.id}>
                    <button
                      type="button"
                      onClick={() => openChild(ref)}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-card-2 sm:px-8"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12.5px] font-semibold">{child ? childLabel(child) : ref.child_id.slice(0, 8)}</span>
                          <Chip tone={statusTone(s)}>{statusLabel(s)}</Chip>
                        </span>
                        <span className="mt-1 block truncate text-[11.5px] text-muted">
                          {ref.to_facility} · {workerById.get(ref.from_worker_id)?.name ?? "Unassigned"}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{age != null ? `${age}d` : "—"}</span>
                      <ArrowRight className="size-4 shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
              {recent.length === 0 && <li className="px-6 py-10 text-center text-[13px] text-muted sm:px-8">No referrals yet.</li>}
            </ul>
          </SectionCard>
        </Reveal>
      </Page>

      <ChildDrawer
        child={selected}
        onClose={() => setSelectedId(null)}
        onScreen={() => {}}
        onRefer={refer}
        onContacted={contacted}
        onOutcome={outcome}
        canScreen={false}
      />
    </>
  );
}
