import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, MapPinned, ShieldAlert, UsersRound } from "lucide-react";
import { ChildDrawer } from "../components/ChildDrawer";
import { SectionCard } from "../components/SectionCard";
import { Initials, OversightHero } from "../components/OversightHero";
import { Btn, Chip, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { STATUS_META, childLabel, type Child } from "../lib/model";
import { ROLES } from "../lib/roles";
import type { CHWAnalytics } from "../api/types";
import { referralApi } from "../api/client";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const DAY = 86_400_000;
const STUCK_MS = 3 * DAY;
const OPEN = new Set(["created", "sent", "seen"]);

const FUNNEL: [string, string][] = [
  ["created", "#cdb98c"],
  ["sent", "#e8b13a"],
  ["seen", "#5aa6c4"],
  ["outcome recorded", "#8fbf5a"],
  ["closed", "#6e9a3a"],
];

interface AreaRow {
  area: string;
  workers: string[];
  children: number;
  screened: number;
  overdue: number;
  openReferrals: number;
}

export function SupervisorCaseload() {
  const {
    role,
    children,
    workers,
    referralRecords,
    referChild,
    contactChild,
    outcomeChild,
    setCheckInTarget,
    go,
    showToast,
  } = useApp();
  const tr = useT();
  const user = ROLES[role].user;
  const [analytics, setAnalytics] = useState<CHWAnalytics | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    referralApi
      .getAnalytics()
      .then((a) => {
        if (!cancelled) setAnalytics(a);
      })
      .catch(() => {
        /* analytics are supplementary — keep the team view usable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    const total = children.length;
    const screened = children.filter((c) => c.status !== "unscreened").length;
    const overdue = children.filter((c) => c.status === "overdue").length;
    const openReferrals = referralRecords.filter((r) => OPEN.has((r.status ?? "").toLowerCase())).length;
    return { total, screened, overdue, openReferrals, coverage: total ? Math.round((screened / total) * 100) : 0 };
  }, [children, referralRecords]);

  const areaRows = useMemo<AreaRow[]>(() => {
    const areaFor = (c: Child) => {
      const ward = (c.ward ?? "").toLowerCase().trim();
      if (ward) {
        const match = workers.find((x) => {
          const area = (x.area ?? "").toLowerCase().trim();
          return area !== "" && area !== "all" && (ward === area || ward.startsWith(`${area} -`) || ward.includes(area));
        });
        if (match) return match.area;
      }
      return c.ward?.split(" - ")[0]?.trim() || "Unassigned";
    };

    const rows = new Map<string, AreaRow>();
    const ensure = (area: string): AreaRow => {
      let row = rows.get(area);
      if (!row) {
        row = { area, workers: [], children: 0, screened: 0, overdue: 0, openReferrals: 0 };
        rows.set(area, row);
      }
      return row;
    };

    for (const c of children) {
      const row = ensure(areaFor(c));
      row.children += 1;
      if (c.status !== "unscreened") row.screened += 1;
      if (c.status === "overdue") row.overdue += 1;
    }

    const childById = new Map(children.map((c) => [c.id, c]));
    for (const ref of referralRecords) {
      if (!OPEN.has((ref.status ?? "").toLowerCase())) continue;
      const c = childById.get(ref.child_id);
      if (c) ensure(areaFor(c)).openReferrals += 1;
    }

    for (const w of workers) {
      const area = (w.area ?? "").trim();
      if (!area || area.toLowerCase() === "all") continue;
      const row = ensure(area);
      if (!row.workers.includes(w.name)) row.workers.push(w.name);
    }

    return [...rows.values()]
      .filter((r) => r.children > 0 || r.openReferrals > 0)
      .sort((a, b) => b.children - a.children || a.area.localeCompare(b.area));
  }, [children, workers, referralRecords]);

  const stuckReferrals = useMemo(() => {
    const now = Date.now();
    return referralRecords
      .filter((r) => {
        const status = (r.status ?? "").toLowerCase();
        if (status !== "created" && status !== "sent") return false;
        const created = new Date(r.created_at).getTime();
        return Number.isFinite(created) && now - created > STUCK_MS;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [referralRecords]);

  const overdueChildren = useMemo(
    () =>
      children
        .filter((c) => c.status === "overdue")
        .sort((a, b) => (b.lastVisitDays ?? 0) - (a.lastVisitDays ?? 0))
        .slice(0, 4),
    [children],
  );

  const childById = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const selected = children.find((c) => c.id === selectedId) ?? null;

  const screen = (c: Child) => {
    setCheckInTarget(c.id);
    setSelectedId(null);
    go("checkin");
  };
  const refer = (c: Child) => {
    void referChild(c.id, { status: "refer", handoff: "queued" });
    showToast(`${childLabel(c)} referred · handoff queued`);
  };
  const contacted = (c: Child) => {
    void contactChild(c.id, { visits: c.visits + 1, lastVisitDays: 0 });
    showToast(`${childLabel(c)} marked as contacted`);
  };
  const outcome = (c: Child, notes?: string) => {
    void outcomeChild(c.id, { handoff: "done" }, notes);
    showToast(`Outcome recorded for ${childLabel(c)}`);
  };

  const funnel = analytics?.funnel;
  const medians = analytics?.time_to_intervention;
  const funnelTotal = funnel?.total_referrals ?? 0;
  const funnelValue = (status: string): number => {
    if (!funnel) return 0;
    const key = status === "outcome recorded" ? "outcome_recorded" : status;
    return (funnel as unknown as Record<string, number>)[key] ?? 0;
  };

  return (
    <>
      <Page>
        {/* ============================ header ============================ */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>{tr("Oversight · ward team")}</Eyebrow>
            <Display as="h1" className="mt-5 text-[clamp(44px,6.4vw,92px)]">
              {tr("The whole team.")}
              <br />
              <span className="text-rust">{tr("Every gap visible.")}</span>
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
          {tr("Coverage and referral follow-through across your workers — spot the ward falling behind, the referral stuck in the queue, and the family that needs a call today.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn size="sm" onClick={() => go("referrals")}>
            <Clock3 className="size-3.5" /> {tr("Referral desk")}
          </Btn>
          <Btn size="sm" variant="light" onClick={() => go("help")}>
            <MapPinned className="size-3.5" /> {tr("Catchment audit")}
          </Btn>
          <Btn size="sm" variant="light" onClick={() => go("reports")}>
            {tr("Ward reports")} <ArrowRight className="size-3.5" />
          </Btn>
        </div>

        {/* ============================ summary band ============================ */}
        <OversightHero
          className="mt-10"
          pct={totals.coverage}
          ringLabel={tr("Screened coverage")}
          ringSub={
            <>
              {tr("{n} of {total} children", { n: totals.screened, total: totals.total })}
              <br />
              {tr("screened across the ward")}
            </>
          }
          tiles={[
            { label: "Overdue follow-ups", value: String(totals.overdue), helper: "home visits past due", color: "#ee6a4f", icon: <ShieldAlert className="size-4" /> },
            { label: "Open referrals", value: String(totals.openReferrals), helper: "created, sent or seen", color: "#e0a526", icon: <Clock3 className="size-4" /> },
            { label: "Stuck > 3 days", value: String(stuckReferrals.length), helper: "need a chase call", color: "#c79ad0", icon: <AlertTriangle className="size-4" /> },
            {
              label: "Referral → seen",
              value: medians?.median_referral_to_seen_days != null ? `${medians.median_referral_to_seen_days}d` : "—",
              helper: "median facility lag",
              color: "#7cc1dc",
              icon: <MapPinned className="size-4" />,
            },
          ]}
          segments={(["ontrack", "watch", "refer", "overdue", "unscreened"] as const).map((s) => ({
            label: STATUS_META[s].label,
            hex: STATUS_META[s].hex,
            n: children.filter((c) => c.status === s).length,
          }))}
        />
        {/* ============================ team coverage ============================ */}
        <Reveal className="mt-4">
          <SectionCard
            eyebrow="Team coverage"
            title="Caseload and referral load by assigned area."
            action={<Chip tone="lilac">{areaRows.length} areas</Chip>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-sand/40 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                    <th className="px-6 py-3 font-semibold sm:px-8">Worker · area</th>
                    <th className="px-4 py-3 text-right font-semibold">Children</th>
                    <th className="px-4 py-3 font-semibold">Screened</th>
                    <th className="px-4 py-3 text-right font-semibold">Overdue</th>
                    <th className="px-6 py-3 text-right font-semibold sm:px-8">Open refs</th>
                  </tr>
                </thead>
                <tbody>
                  {areaRows.map((row) => {
                    const pct = row.children ? Math.round((row.screened / row.children) * 100) : 0;
                    return (
                      <tr key={row.area} className="border-b border-line transition-colors last:border-0 hover:bg-card-2/60">
                        <td className="px-6 py-4 sm:px-8">
                          <div className="flex items-center gap-3">
                            <Initials name={row.workers[0] ?? row.area} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-bold">{row.workers.length ? row.workers.join(", ") : "Unassigned"}</p>
                              <p className="font-mono text-[10.5px] tracking-[0.1em] text-muted uppercase">{row.area}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-display text-[22px] leading-none">{row.children}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-sand">
                              <span className={cn("block h-full rounded-full", pct >= 80 ? "bg-moss" : pct >= 50 ? "bg-amber" : "bg-brick")} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={cn("font-mono text-[11px]", pct >= 80 ? "text-moss" : pct >= 50 ? "text-amber" : "text-brick")}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td className={cn("px-4 py-4 text-right font-mono text-[13px] font-semibold", row.overdue ? "text-brick" : "text-muted")}>
                          {row.overdue}
                        </td>
                        <td className={cn("px-6 py-4 text-right font-mono text-[13px] font-semibold sm:px-8", row.openReferrals ? "text-amber" : "text-muted")}>
                          {row.openReferrals}
                        </td>
                      </tr>
                    );
                  })}
                  {areaRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-[13px] text-muted">
                        No children or referrals in this supervisor's scope yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </Reveal>

        {/* ============================ coverage + escalations ============================ */}
        <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
          <Reveal className="h-full">
            <section className="flex h-full flex-col rounded-[36px] bg-night p-6 text-paper sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Eyebrow tone="peach">
                    Coverage by ward
                  </Eyebrow>
                  <p className="mt-3 font-display text-[clamp(28px,3.2vw,40px)] leading-none uppercase">
                    {analytics ? `${funnel?.screened ?? 0} screened` : "Loading…"}
                  </p>
                </div>
                {medians && (
                  <span className="font-mono text-[10px] tracking-[0.14em] text-paper/60 uppercase">
                    screen → referral {medians.median_screened_to_referral_days ?? "—"}d
                  </span>
                )}
              </div>

              {analytics ? (
                <>
                  <div className="mt-6 flex h-2.5 gap-1 overflow-hidden rounded-full">
                    {FUNNEL.map(([status, hex]) => {
                      const n = funnelValue(status);
                      return <span key={status} title={`${status}: ${n}`} className="h-full rounded-full" style={{ flexGrow: Math.max(n, 0.01), background: hex }} />;
                    })}
                  </div>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[10.5px] tracking-[0.1em] text-paper/70 uppercase">
                    {FUNNEL.map(([status, hex]) => (
                      <li key={status} className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: hex }} />
                        {status === "outcome recorded" ? "outcome" : status} {funnelValue(status)}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 grid flex-1 gap-2 sm:grid-cols-2">
                    {analytics.coverage_by_ward.map((w) => (
                      <div key={w.village_ward} className="rounded-2xl bg-white/[0.06] p-4">
                        <p className="truncate font-mono text-[10px] tracking-[0.14em] text-paper/60 uppercase">{w.village_ward}</p>
                        <p className="mt-2 font-display text-[26px] leading-none uppercase">
                          {w.coverage_pct}% <span className="text-[12px] text-paper/55 normal-case">screened</span>
                        </p>
                        <p className="mt-1 text-[11.5px] text-paper/65">
                          {w.screened}/{w.children} children · {w.referrals} referrals
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 font-mono text-[10px] tracking-[0.14em] text-paper/45 uppercase">
                    {funnelTotal} referral{funnelTotal === 1 ? "" : "s"} raised · {funnel?.overdue ?? 0} overdue visits
                  </p>
                </>
              ) : (
                <p className="mt-6 text-[13px] text-paper/60">Programme data unavailable right now.</p>
              )}
            </section>
          </Reveal>

          <div className="flex flex-col gap-4">
            <Reveal className="flex-1">
              <SectionCard
                eyebrow="Referral follow-through"
                title={
                  stuckReferrals.length
                    ? "Created or sent over three days ago without the child being seen."
                    : "Every open referral is moving."
                }
                action={<Chip tone={stuckReferrals.length ? "brick" : "moss"}>{stuckReferrals.length} stuck</Chip>}
                className="flex h-full flex-col"
              >
                <ul className="flex-1 divide-y divide-line">
                  {stuckReferrals.slice(0, 4).map((ref) => {
                    const c = childById.get(ref.child_id);
                    if (!c) return null;
                    return (
                      <li key={ref.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-card-2 sm:px-8"
                        >
                          <AlertTriangle className="size-4 shrink-0 text-brick" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[12.5px] font-semibold">{childLabel(c)}</span>
                            <span className="block truncate text-[11px] text-muted">{ref.to_facility} · {ref.status}</span>
                          </span>
                          <ArrowRight className="size-4 shrink-0 text-muted" />
                        </button>
                      </li>
                    );
                  })}
                  {stuckReferrals.length === 0 && (
                    <li className="flex flex-col items-center gap-2 px-6 py-10 text-center text-[13px] text-muted sm:px-8">
                      <CheckCircle2 className="size-5 text-moss" />
                      Nothing needs chasing. Keep confirming outcomes to close the loop.
                    </li>
                  )}
                </ul>
                <div className="border-t border-line p-4 sm:px-8">
                  <Btn size="sm" variant="light" className="w-full" onClick={() => go("referrals")}>
                    <Clock3 className="size-3.5" /> Open referral desk
                  </Btn>
                </div>
              </SectionCard>
            </Reveal>

            <Reveal className="flex-1">
              <SectionCard
                eyebrow="Overdue visits"
                title="Families past their home-visit date."
                action={<Chip tone={overdueChildren.length ? "brick" : "moss"}>{totals.overdue} overdue</Chip>}
                className="flex h-full flex-col"
              >
                {overdueChildren.length === 0 ? (
                  <p className="flex-1 px-6 py-8 text-center text-[13px] text-muted sm:px-8">No overdue home visits in scope.</p>
                ) : (
                  <ul className="flex-1 divide-y divide-line">
                    {overdueChildren.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-card-2 sm:px-8"
                        >
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_META[c.status].hex }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[12.5px] font-semibold">{childLabel(c)}</span>
                            <span className="block text-[11px] text-muted">
                              {c.lastVisitDays == null ? "never visited" : `${c.lastVisitDays}d since last visit`}
                            </span>
                          </span>
                          <ShieldAlert className="size-4 shrink-0 text-brick" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-line p-4 sm:px-8">
                  <Btn size="sm" variant="light" className="w-full" onClick={() => go("referrals")}>
                    <MapPinned className="size-3.5" /> Review the team's referrals
                  </Btn>
                </div>
              </SectionCard>
            </Reveal>
          </div>
        </div>

        <p className="mt-8 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">
          <UsersRound className="size-3.5" /> {workers.filter((w) => (w.area ?? "").toLowerCase() !== "all").length} workers in scope
        </p>
      </Page>

      <ChildDrawer
        child={selected}
        onClose={() => setSelectedId(null)}
        onScreen={screen}
        onRefer={refer}
        onContacted={contacted}
        onOutcome={outcome}
        canScreen={false}
      />
    </>
  );
}
