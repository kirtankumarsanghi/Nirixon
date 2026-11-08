import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CalendarClock, CalendarPlus, MapPinned, ScanLine, Search, Send } from "lucide-react";
import { ChildDrawer } from "../components/ChildDrawer";
import { Btn, Chip, CountUp, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { AGE_BANDS, SECTORS, STATUS_META, ageBand, childLabel, evaluate, type Child, type ChildStatus, type Sector } from "../lib/model";
import { ROLES } from "../lib/roles";
import { useT } from "../lib/useT";
import { downloadIcs, remindersIcs } from "../lib/ics";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Filter = "all" | ChildStatus;
const ORDER: ChildStatus[] = ["ontrack", "watch", "refer", "overdue", "unscreened"];

function statusFromScores(c: Child): ChildStatus {
  if (!c.scores) return "watch";
  const t = evaluate(c.scores, c.regression).tier;
  return t === "Typical" ? "ontrack" : t === "Monitor" ? "watch" : "refer";
}

export function Caseload() {
  const { role, children, referChild, contactChild, outcomeChild, setCheckInTarget, go, showToast } = useApp();
  const tr = useT();
  const user = ROLES[role].user;

  const [filter, setFilter] = useState<Filter>("all");
  const [sector, setSector] = useState<"all" | Sector>("all");
  const [age, setAge] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [visible, setVisible] = useState(10);

  const counts = useMemo(() => {
    const c: Record<ChildStatus, number> = { ontrack: 0, watch: 0, refer: 0, overdue: 0, unscreened: 0 };
    children.forEach((x) => c[x.status]++);
    return c;
  }, [children]);

  const total = children.length;
  const screened = total - counts.unscreened;
  const coverage = Math.round((screened / total) * 100);

  const matches = (c: Child) =>
    (filter === "all" || c.status === filter) &&
    (sector === "all" || c.sector === sector) &&
    (age === "all" || ageBand(c.ageMonths) === age) &&
    (q === "" || `${childLabel(c)} ${c.id}`.toLowerCase().includes(q.trim().toLowerCase()));

  const filtered = children.filter(matches);
  const selected = children.find((c) => c.id === sel) ?? null;
  const hovered = children.find((c) => c.id === hoverId) ?? null;

  const route = useMemo(
    () =>
      children
        .filter((c) => c.status === "overdue" || (c.status === "refer" && c.handoff === "none") || c.status === "unscreened")
        .sort((a, b) => (b.lastVisitDays ?? 999) - (a.lastVisitDays ?? 999))
        .slice(0, 6),
    [children]
  );
  const queued = children.filter((c) => c.handoff === "queued");

  const followUps = useMemo(
    () =>
      children
        .filter((c) => c.followUpDueAt)
        .map((c) => ({ child: c, due: new Date(c.followUpDueAt as string) }))
        .filter(({ due }) => !Number.isNaN(due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 5),
    [children],
  );

  const reminderFor = ({ child: c, due }: { child: Child; due: Date }) => ({
    uid: `${c.id}-followup`,
    title: `Nirixon follow-up · ${childLabel(c)}`,
    date: due,
    description: `${c.ageMonths} months · sector ${c.sector} · home-visit follow-up.`,
  });

  const addReminder = (entry: { child: Child; due: Date }) => {
    downloadIcs(`nirixon-followup-${entry.child.id.slice(0, 8)}`, remindersIcs([reminderFor(entry)]));
    showToast("Calendar reminder downloaded");
  };

  const exportReminders = () => {
    downloadIcs("nirixon-followups", remindersIcs(followUps.map(reminderFor)));
    showToast(`${followUps.length} reminders exported`);
  };

  /* ------------------------------ actions ------------------------------ */
  const screen = (c: Child) => {
    setCheckInTarget(c.id);
    setSel(null);
    go("checkin");
  };
  const refer = (c: Child) => {
    void referChild(c.id, { status: "refer", handoff: "queued" });
    showToast(`${childLabel(c)} referred · handoff queued`);
  };
  const contacted = (c: Child) => {
    void contactChild(c.id, {
      visits: c.visits + 1,
      lastVisitDays: 0,
      status: c.status === "overdue" ? statusFromScores(c) : c.status,
    });
    showToast(`${childLabel(c)} marked as contacted`);
  };
  const outcome = (c: Child, notes?: string) => {
    void outcomeChild(
      c.id,
      {
        handoff: c.handoff === "queued" ? "done" : c.handoff,
        status: c.status === "overdue" ? statusFromScores(c) : c.status,
      },
      notes,
    );
    showToast(`Outcome recorded for ${childLabel(c)}`);
  };

  return (
    <>
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">Community health network · Ward 12</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
            {tr("Your ward,")}
            <br />
            <span className="text-rust">{tr("at a glance.")}</span>
          </Display>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-line-2 bg-card py-2 pr-6 pl-2">
            <span className="grid size-12 place-items-center rounded-full bg-rust font-mono text-[12px] font-semibold text-white">{user.initials}</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold">{user.name}</span>
              <span className="block text-[12px] text-muted">{user.title}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ============================ stats band ============================ */}
      <section className="mt-10 overflow-hidden rounded-[44px] bg-night p-6 text-paper sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-6">
            <svg viewBox="0 0 120 120" className="size-[132px] shrink-0 -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,244,220,.12)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#ea8f63"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - coverage / 100)}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
              />
            </svg>
            <div>
              <p className="font-display text-[64px] leading-none text-peach">
                <CountUp value={coverage} suffix="%" />
              </p>
              <p className="mt-1 text-[13px] text-paper/70">
                {screened} of {total} children
                <br />
                screened in ward
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {ORDER.map((s) => {
              const m = STATUS_META[s];
              const on = filter === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(on ? "all" : s)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-[24px] border p-4 text-left transition-all duration-300 hover:-translate-y-1",
                    on ? "border-peach bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  )}
                >
                  <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-paper/70 uppercase">
                    <span className="size-2 rounded-full" style={{ background: m.hex }} />
                    {tr(m.label)}
                  </span>
                  <p className="mt-3 font-display text-[52px] leading-none" style={{ color: m.hex }}>
                    <CountUp value={counts[s]} />
                  </p>
                  <p className="mt-1 text-[11px] text-paper/50">{m.long}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* stacked distribution */}
        <div className="mt-8 flex h-3 gap-1 overflow-hidden rounded-full">
          {ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              aria-label={`${STATUS_META[s].label}: ${counts[s]}`}
              className="h-full rounded-full transition-all duration-700 hover:opacity-80"
              style={{ flexGrow: Math.max(counts[s], 0.01), background: STATUS_META[s].hex, opacity: filter === "all" || filter === s ? 1 : 0.25 }}
            />
          ))}
        </div>
      </section>

      {/* ============================ map + side ============================ */}
      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1fr_400px]">
        <Reveal className="h-full">
          <div className="flex h-full flex-col rounded-[44px] bg-night p-6 text-paper sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow tone="peach" index="02">{tr("Village map")}</Eyebrow>
                <h2 className="mt-3 font-display text-[clamp(32px,4vw,52px)] leading-none uppercase">
                  {filtered.length === total ? tr("Every child, one square.") : tr("{n} of {total} children", { n: filtered.length, total })}
                </h2>
              </div>
              <div className="relative w-full sm:w-[260px]">
                <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-paper/50" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tr("Search child ID…")}
                  aria-label="Search child ID"
                  className="w-full rounded-full border border-white/15 bg-white/[0.06] py-3 pr-4 pl-11 text-[13px] text-paper placeholder:text-paper/35 focus:border-peach focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <button
                onClick={() => setFilter("all")}
                className={cn("rounded-full px-3.5 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase transition-colors", filter === "all" ? "bg-paper text-ink" : "text-paper/60 hover:text-paper")}
              >
                All {total}
              </button>
              {ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(filter === s ? "all" : s)}
                  className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase transition-colors", filter === s ? "bg-white/15 text-paper" : "text-paper/60 hover:text-paper")}
                >
                  <span className="size-2.5 rounded-[3px]" style={{ background: STATUS_META[s].hex }} />
                  {tr(STATUS_META[s].label)}
                </button>
              ))}
            </div>

            <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {SECTORS.map((s) => (
                <div key={s.id} className={cn("transition-opacity duration-500", sector !== "all" && sector !== s.id && "opacity-25")}>
                  <button
                    onClick={() => setSector(sector === s.id ? "all" : s.id)}
                    className="mb-3 flex w-full items-center justify-between font-mono text-[10.5px] font-semibold tracking-[0.18em] text-paper/70 uppercase hover:text-paper"
                  >
                    <span>Sector {s.id} · {s.worker}</span>
                    <span className="text-paper/40">{children.filter((c) => c.sector === s.id).length}</span>
                  </button>
                  <div className="grid grid-cols-10 gap-1.5">
                    {children
                      .filter((c) => c.sector === s.id)
                      .map((c) => {
                        const m = matches(c);
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSel(c.id)}
                            onMouseEnter={() => setHoverId(c.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onFocus={() => setHoverId(c.id)}
                            aria-label={`${childLabel(c)}, ${STATUS_META[c.status].label}`}
                            className={cn(
                              "aspect-square rounded-[5px] transition-all duration-300 hover:z-10 hover:scale-[1.45]",
                              m ? "opacity-100" : "scale-75 opacity-[0.14]",
                              c.id === sel && "ring-2 ring-paper ring-offset-2 ring-offset-night"
                            )}
                            style={{ background: STATUS_META[c.status].hex }}
                          />
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-5 py-3.5 pt-3.5 text-[13px]">
              {hovered ? (
                <>
                  <span className="flex items-center gap-3">
                    <span className="size-3 rounded-[3px]" style={{ background: STATUS_META[hovered.status].hex }} />
                    <span className="font-mono font-semibold">{childLabel(hovered)}</span>
                    <span className="text-paper/70">{STATUS_META[hovered.status].label}</span>
                  </span>
                  <span className="hidden font-mono text-[11px] text-paper/55 sm:block">
                    {hovered.ageMonths} mo · last visit {hovered.lastVisitDays === null ? "never" : `${hovered.lastVisitDays}d ago`}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2.5 text-paper/60">
                  <MapPinned className="size-4" /> Hover a square for details · click to open the child record
                </span>
              )}
            </div>
          </div>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={80}>
            <div className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <Eyebrow index="03" tone="muted">{tr("Today's route")}</Eyebrow>
                <Chip tone="lilac">{tr("{n} stops", { n: route.length })}</Chip>
              </div>
              <ul className="mt-5 divide-y divide-line">
                {route.map((c, i) => {
                  const m = STATUS_META[c.status];
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-3.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper">{i + 1}</span>
                      <button onClick={() => setSel(c.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-mono text-[12.5px] font-semibold">{childLabel(c)}</span>
                        <span className={cn("block text-[11.5px] font-semibold", m.text)}>
                          {c.status === "overdue"
                            ? tr("Visit {n}d overdue", { n: c.lastVisitDays ?? 0 })
                            : c.status === "refer"
                              ? tr("Referral not yet sent")
                              : tr("First screening needed")}
                        </span>
                      </button>
                      <Btn size="xs" variant={c.status === "refer" ? "rust" : "dark"} onClick={() => (c.status === "refer" ? refer(c) : screen(c))}>
                        {c.status === "refer" ? <Send className="size-3" /> : <ScanLine className="size-3" />}
                        {c.status === "refer" ? tr("Refer") : tr("Screen")}
                      </Btn>
                    </li>
                  );
                })}
                {route.length === 0 && <li className="py-6 text-center text-[13px] text-muted">All caught up. Nothing due today.</li>}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow index="04" tone="muted">{tr("Facility handoffs")}</Eyebrow>
                <Chip tone={queued.length ? "brick" : "moss"}>{tr("{n} waiting", { n: queued.length })}</Chip>
              </div>
              {queued.length === 0 ? (
                <p className="mt-5 text-[13px] leading-relaxed text-ink-2">
                  No pending handoffs. Use <b>1-touch refer</b> on any child record and it will queue here for the clinician.
                </p>
              ) : (
                <ul className="mt-5 space-y-2.5">
                  {queued.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line-2 bg-card-2 p-3.5">
                      <span className="size-2.5 shrink-0 rounded-full bg-brick" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold">{childLabel(c)}</span>
                      <Btn size="xs" variant="light" onClick={() => outcome(c)}>{tr("Confirm")}</Btn>
                    </li>
                  ))}
                  {queued.length > 5 && <li className="text-center text-[12px] text-muted">+ {queued.length - 5} more in the clinician queue</li>}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Btn size="xs" variant="light" onClick={() => go("referrals")}>{tr("Open referral queue")}</Btn>
                <Btn size="xs" variant="soft" onClick={() => go("help")}>{tr("RBSK / DEIC directory")}</Btn>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="rounded-[36px] border border-line-2 bg-card p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow index="05" tone="muted">{tr("Follow-ups")}</Eyebrow>
                <Btn size="xs" variant="light" onClick={exportReminders} disabled={followUps.length === 0}>
                  <CalendarPlus className="size-3.5" /> {tr("Export .ics")}
                </Btn>
              </div>
              {followUps.length === 0 ? (
                <p className="mt-5 text-[13px] leading-relaxed text-ink-2">{tr("No follow-ups scheduled yet.")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {followUps.map((entry) => (
                    <li key={entry.child.id} className="flex items-center gap-3 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sand">
                        <CalendarClock className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12px] font-semibold">{childLabel(entry.child)}</span>
                        <span className="block text-[11.5px] text-muted">
                          {tr("due")} {entry.due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </span>
                      <Btn size="xs" variant="light" onClick={() => addReminder(entry)} aria-label={`Add calendar reminder for ${childLabel(entry.child)}`}>
                        {tr("Add")}
                      </Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Reveal>
        </div>
      </div>

      {/* ============================ list ============================ */}
      <Reveal className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow index="06">{tr("Child registry")}</Eyebrow>
            <h2 className="mt-3 font-display text-[clamp(36px,4.6vw,64px)] leading-none uppercase">
              {filtered.length} <span className="text-sea">{tr("matching")}</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value as "all" | Sector)}
              className="nrx-select rounded-full border border-line-2 bg-card py-3 pr-11 pl-5 text-[13px] font-semibold focus:outline-none"
              aria-label="Sector"
            >
              <option value="all">{tr("All sectors")}</option>
              {SECTORS.map((s) => (
                <option key={s.id} value={s.id}>Sector {s.id} · {s.worker}</option>
              ))}
            </select>
            <select
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="nrx-select rounded-full border border-line-2 bg-card py-3 pr-11 pl-5 text-[13px] font-semibold focus:outline-none"
              aria-label="Age band"
            >
              <option value="all">{tr("All ages")}</option>
              {AGE_BANDS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-[36px] border border-line-2 bg-card">
          {filtered.slice(0, visible).map((c) => {
            const m = STATUS_META[c.status];
            return (
              <button
                key={c.id}
                onClick={() => setSel(c.id)}
                className="group flex w-full items-center gap-4 border-b border-line px-5 py-4 text-left transition-colors last:border-0 hover:bg-card-2 sm:px-7"
              >
                <span className="size-3 shrink-0 rounded-[4px]" style={{ background: m.hex }} />
                <span className="w-[210px] shrink-0 truncate font-mono text-[13px] font-semibold sm:w-[250px]" title={c.id}>{childLabel(c)}</span>
                <span className={cn("hidden rounded-full px-3 py-1 text-[11.5px] font-bold sm:inline-block", m.soft, m.text)}>{tr(m.label)}</span>
                <span className="hidden flex-1 font-mono text-[11.5px] text-muted md:block">
                  {tr("{n} mo", { n: c.ageMonths })} · {tr("Sector")} {c.sector} ·{" "}
                  {c.lastVisitDays === null ? tr("never visited") : tr("visited {n}d ago", { n: c.lastVisitDays })}
                </span>
                {c.handoff === "queued" && <Chip tone="lilac" className="ml-auto md:ml-0">{tr("Queued")}</Chip>}
                <ChevronRight className="ml-auto size-5 text-muted transition-transform group-hover:translate-x-1" />
              </button>
            );
          })}
          {filtered.length === 0 && <p className="p-10 text-center text-[14px] text-muted">{tr("No children match these filters.")}</p>}
        </div>
        {filtered.length > visible && (
          <div className="mt-5 flex justify-center">
            <Btn variant="outline" size="lg" onClick={() => setVisible((v) => v + 15)}>
              <ChevronDown className="size-4" /> {tr("Show more ({n})", { n: filtered.length - visible })}
            </Btn>
          </div>
        )}
      </Reveal>
    </Page>

    <ChildDrawer child={selected} onClose={() => setSel(null)} onScreen={screen} onRefer={refer} onContacted={contacted} onOutcome={outcome} />
    </>
  );
}
