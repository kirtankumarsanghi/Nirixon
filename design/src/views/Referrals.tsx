import { useMemo, useState } from "react";
import { CheckCheck, ChevronRight, Clock3, Filter, ScanLine, Search, Send, ShieldAlert, Stethoscope, UsersRound } from "lucide-react";
import { ChildDrawer } from "../components/ChildDrawer";
import { Btn, Chip, CountUp, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, SECTORS, STATUS_META, ageBand, evaluate, type Child, type Sector } from "../lib/model";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Stage = "all" | "ready" | "queued" | "done";

function stageOf(child: Child): Exclude<Stage, "all"> {
  if (child.handoff === "done") return "done";
  if (child.handoff === "queued") return "queued";
  return "ready";
}

export function Referrals() {
  const { role, children, patchChild, setCheckInTarget, go, showToast } = useApp();
  const isSupervisor = role === "supervisor";
  const [stage, setStage] = useState<Stage>("all");
  const [sector, setSector] = useState<"all" | Sector>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const referrals = useMemo(
    () =>
      children
        .filter((c) => c.status === "refer" || c.handoff !== "none")
        .sort((a, b) => {
          const order = { ready: 0, queued: 1, done: 2 };
          return order[stageOf(a)] - order[stageOf(b)] || (b.lastVisitDays ?? 0) - (a.lastVisitDays ?? 0);
        }),
    [children]
  );

  const counts = {
    all: referrals.length,
    ready: referrals.filter((c) => stageOf(c) === "ready").length,
    queued: referrals.filter((c) => stageOf(c) === "queued").length,
    done: referrals.filter((c) => stageOf(c) === "done").length,
  };

  const filtered = referrals.filter(
    (c) =>
      (stage === "all" || stageOf(c) === stage) &&
      (sector === "all" || c.sector === sector) &&
      (query === "" || c.id.includes(query.trim().toLowerCase()))
  );
  const selected = children.find((c) => c.id === selectedId) ?? null;

  const screen = (child: Child) => {
    setCheckInTarget(child.id);
    setSelectedId(null);
    go("checkin");
  };
  const send = (child: Child) => {
    patchChild(child.id, { status: "refer", handoff: "queued", visits: child.visits + 1, lastVisitDays: 0 });
    showToast(`${child.id.replace("child-seed-", "")} sent to the clinician queue`);
  };
  const confirm = (child: Child) => {
    patchChild(child.id, { handoff: "done", visits: child.visits + 1, lastVisitDays: 0 });
    showToast(`${child.id.replace("child-seed-", "")} handoff confirmed`);
  };
  const contacted = (child: Child) => {
    patchChild(child.id, { visits: child.visits + 1, lastVisitDays: 0 });
    showToast(`${child.id.replace("child-seed-", "")} caregiver contacted`);
  };

  const workerRows = SECTORS.map((s) => {
    const mine = referrals.filter((c) => c.sector === s.id);
    return {
      ...s,
      ready: mine.filter((c) => stageOf(c) === "ready").length,
      queued: mine.filter((c) => stageOf(c) === "queued").length,
      done: mine.filter((c) => stageOf(c) === "done").length,
    };
  });

  return (
    <>
      <Page>
        <div className="grid items-end gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div>
            <Eyebrow index="01">{isSupervisor ? "Field supervisor · referral oversight" : "Frontline · referral desk"}</Eyebrow>
            <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
              Every referral.
              <br />
              <span className="text-rust">A visible next step.</span>
            </Display>
          </div>
          <p className="max-w-[390px] text-[15px] leading-relaxed text-ink-2">
            {isSupervisor
              ? "See which worker raised each referral, what is waiting for pickup, and whether the facility handoff was completed."
              : "Prepare the handoff, send it to the clinical queue, and keep the caregiver informed without losing the child’s screening context."}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            ["all", "All referrals", "All children requiring a clinical next step", "var(--color-sea)"],
            ["ready", "Ready to send", "Screened, but handoff not sent", "var(--color-brick)"],
            ["queued", "With clinician", "Awaiting facility acknowledgement", "var(--color-amber)"],
            ["done", "Confirmed", "Handoff completed", "var(--color-moss)"],
          ] as const).map(([key, label, helper, color], i) => {
            const active = stage === key;
            return (
              <Reveal key={key} delay={i * 60}>
                <button
                  type="button"
                  onClick={() => setStage(key)}
                  aria-pressed={active}
                  className={cn(
                    "h-full w-full rounded-[28px] border p-5 text-left transition-all duration-300 hover:-translate-y-1 sm:p-6",
                    active ? "border-ink bg-ink text-paper shadow-[0_24px_42px_-28px_rgba(0,0,0,.9)]" : "border-line-2 bg-card hover:bg-card-2"
                  )}
                >
                  <p className={cn("font-mono text-[9px] font-semibold tracking-[0.16em] uppercase sm:text-[10px]", active ? "text-paper/60" : "text-muted")}>{label}</p>
                  <p className="mt-3 font-display text-[clamp(44px,5vw,72px)] leading-none" style={{ color }}>
                    <CountUp value={counts[key]} />
                  </p>
                  <p className={cn("mt-2 text-[11.5px] leading-relaxed", active ? "text-paper/60" : "text-ink-2")}>{helper}</p>
                </button>
              </Reveal>
            );
          })}
        </div>

        {isSupervisor && (
          <Reveal className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {workerRows.map((worker) => {
                const active = sector === worker.id;
                return (
                  <button
                    key={worker.id}
                    onClick={() => setSector(active ? "all" : worker.id)}
                    className={cn(
                      "rounded-[26px] border p-5 text-left transition-all hover:-translate-y-0.5",
                      active ? "border-sea bg-sea-bg" : "border-line-2 bg-card hover:bg-card-2"
                    )}
                  >
                    <p className="flex items-center justify-between font-mono text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">
                      Sector {worker.id} · {worker.title} <UsersRound className="size-4" />
                    </p>
                    <p className="mt-3 font-display text-[27px] leading-none uppercase">{worker.worker}</p>
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
            <section className="overflow-hidden rounded-[40px] border border-line-2 bg-card">
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
                      placeholder="Search child ID…"
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
                {filtered.map((child) => {
                  const ev = child.scores ? evaluate(child.scores, child.regression) : null;
                  const childStage = stageOf(child);
                  const worker = SECTORS.find((s) => s.id === child.sector);
                  const lowest = ev ? DOMAINS[ev.lowest].label : "Clinical concern";
                  return (
                    <li key={child.id} className="border-b border-line last:border-0">
                      <div className="grid items-center gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                        <button onClick={() => setSelectedId(child.id)} className="group min-w-0 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12.5px] font-semibold">{child.id.replace("child-seed-", "")}</span>
                            <Chip tone={childStage === "ready" ? "brick" : childStage === "queued" ? "amber" : "moss"}>
                              {childStage === "ready" ? "Ready to send" : childStage === "queued" ? "With clinician" : "Confirmed"}
                            </Chip>
                          </div>
                          <p className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
                            {child.ageMonths} mo · {ageBand(child.ageMonths)} · sector {child.sector}
                            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                          </p>
                        </button>
                        <div>
                          <p className="text-[12px] font-bold">{ev?.safety ? "Safety override" : lowest}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                            {ev?.safety && <ShieldAlert className="size-3.5 text-brick" />}
                            {ev ? `${ev.min.toFixed(1)} SD · ${STATUS_META.refer.long}` : "Referral note pending"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] font-bold">{worker?.worker}</p>
                          <p className="mt-1 text-[11px] text-muted">{worker?.title} · {child.visits} visits</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {childStage === "ready" && <Btn size="sm" variant="rust" onClick={() => send(child)}><Send className="size-3.5" /> Send</Btn>}
                          {childStage === "queued" && <Btn size="sm" onClick={() => confirm(child)}><CheckCheck className="size-3.5" /> Confirm</Btn>}
                          {childStage === "done" && <Btn size="sm" variant="light" onClick={() => setSelectedId(child.id)}>Review</Btn>}
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
              <aside className="rounded-[34px] bg-night p-7 text-paper">
                <Eyebrow index="03" tone="peach">Handoff pathway</Eyebrow>
                <ol className="mt-6 space-y-5">
                  {[
                    [ScanLine, "Screen", "A result reaches Refer or a safety rule fires."],
                    [Send, "Send", "The frontline worker shares a minimal clinical summary."],
                    [Stethoscope, "Review", "The clinician sees scores, reason and safety context."],
                    [CheckCheck, "Confirm", "The facility handoff is acknowledged and visible to the team."],
                  ].map(([Icon, title, text], index) => {
                    const StepIcon = Icon as typeof ScanLine;
                    return (
                      <li key={String(title)} className="flex gap-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-peach"><StepIcon className="size-4" /></span>
                        <div>
                          <p className="font-display text-[24px] leading-none uppercase">0{index + 1} · {String(title)}</p>
                          <p className="mt-1.5 text-[11.5px] leading-relaxed text-paper/60">{String(text)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            </Reveal>

            <Reveal delay={130}>
              <aside className="rounded-[34px] border border-line-2 bg-card p-7">
                <p className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase"><Clock3 className="size-4" /> Follow-up rule</p>
                <p className="mt-4 font-display text-[31px] leading-[1.02] uppercase">No referral disappears after “send”.</p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">Queued and confirmed states remain visible to the worker and supervisor until the next outcome is recorded.</p>
                <Btn className="mt-5 w-full" onClick={() => go("checkin")}><ScanLine className="size-4" /> Screen another child</Btn>
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