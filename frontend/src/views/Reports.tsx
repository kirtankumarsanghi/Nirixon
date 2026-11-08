import { useMemo } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { Btn, Chip, CountUp, Display, Eyebrow, Page, Reveal } from "../components/ui";
import { DOMAINS, SECTORS, STATUS_META, evaluate, type ChildStatus } from "../lib/model";
import { printSheet } from "../lib/printSheet";
import { wardReportBody } from "../lib/reportSheet";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const ORDER: ChildStatus[] = ["ontrack", "watch", "refer", "overdue", "unscreened"];
const DAY = 86_400_000;

const time = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function avgDays(pairs: [string | null | undefined, string | null | undefined][]): number | null {
  const gaps = pairs
    .map(([a, b]) => {
      const from = time(a);
      const to = time(b);
      return from !== null && to !== null && to >= from ? (to - from) / DAY : null;
    })
    .filter((g): g is number => g !== null);
  return gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;
}

export function Reports() {
  const { children, referralRecords, go, showToast } = useApp();
  const tr = useT();
  const total = children.length;

  const data = useMemo(() => {
    const counts: Record<ChildStatus, number> = { ontrack: 0, watch: 0, refer: 0, overdue: 0, unscreened: 0 };
    children.forEach((c) => counts[c.status]++);
    const screened = total - counts.unscreened;

    const sectors = SECTORS.map((s) => {
      const list = children.filter((c) => c.sector === s.id);
      const unscreened = list.filter((c) => c.status === "unscreened").length;
      const overdue = list.filter((c) => c.status === "overdue").length;
      const refer = list.filter((c) => c.status === "refer").length;
      return { ...s, total: list.length, screened: list.length - unscreened, overdue, refer };
    });

    const funnel = [
      { key: "created", label: "Created", n: referralRecords.length },
      { key: "sent", label: "Sent", n: referralRecords.filter((r) => time(r.sent_at) !== null).length },
      { key: "seen", label: "Seen", n: referralRecords.filter((r) => time(r.seen_at) !== null).length },
      { key: "outcome", label: "Outcome recorded", n: referralRecords.filter((r) => time(r.outcome_recorded_at) !== null).length },
      { key: "closed", label: "Closed", n: referralRecords.filter((r) => time(r.closed_at) !== null).length },
    ];

    const now = Date.now();
    const stuck = referralRecords.filter((r) => {
      const sent = time(r.sent_at);
      return sent !== null && time(r.seen_at) === null && now - sent > 7 * DAY;
    }).length;

    const domainCounts = new Map<string, number>();
    children
      .filter((c) => c.scores && (c.status === "watch" || c.status === "refer"))
      .forEach((c) => {
        const key = evaluate(c.scores!, c.regression).lowest;
        domainCounts.set(key, (domainCounts.get(key) ?? 0) + 1);
      });
    const domains = [...domainCounts.entries()]
      .map(([key, n]) => ({ key, label: DOMAINS[key]?.label ?? key, color: DOMAINS[key]?.color ?? "#999", n }))
      .sort((a, b) => b.n - a.n);

    return {
      counts,
      screened,
      sectors,
      funnel,
      stuck,
      domains,
      toSent: avgDays(referralRecords.map((r) => [r.created_at, r.sent_at])),
      toSeen: avgDays(referralRecords.map((r) => [r.sent_at, r.seen_at])),
    };
  }, [children, referralRecords, total]);

  const closure = pct(data.funnel[4].n, data.funnel[0].n);
  const coverage = pct(data.screened, total);
  const maxDomain = Math.max(1, ...data.domains.map((d) => d.n));
  const fmt = (v: number | null) => (v === null ? "–" : `${v.toFixed(1)}d`);

  const exportReport = () => {
    const wardLabel = (children.find((c) => c.ward)?.ward ?? "Ward").split(" - ")[0];
    const tierLabel = (s: ChildStatus) => STATUS_META[s].label;
    printSheet(
      "Nirixon ward report",
      wardReportBody({
        generated: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
        wardLabel,
        total,
        screened: data.screened,
        coverage,
        closure,
        toSent: fmt(data.toSent),
        toSeen: fmt(data.toSeen),
        overdue: data.counts.overdue,
        stuck: data.stuck,
        tiers: ORDER.map((s) => ({ label: tierLabel(s), color: STATUS_META[s].hex, n: data.counts[s], pct: pct(data.counts[s], total) })),
        funnel: data.funnel.map((f) => ({ label: f.label, n: f.n, pct: pct(f.n, data.funnel[0].n) })),
        workers: data.sectors.map((s) => ({ sector: s.id, worker: s.worker, title: s.title, total: s.total, screened: s.screened, cov: pct(s.screened, s.total), overdue: s.overdue, refer: s.refer })),
        domains: data.domains.map((d) => ({ label: d.label, n: d.n })),
      }),
    );
    showToast(tr("Report opened — choose Save as PDF to keep a copy"));
  };
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">{tr("Field supervisor · ward report")}</Eyebrow>
          <Display as="h1" className="mt-5 text-[clamp(52px,8vw,124px)]">
            {tr("The ward,")}
            <br />
            <span className="text-rust">{tr("in numbers.")}</span>
          </Display>
        </div>
        <div className="no-print flex flex-wrap gap-2.5">
          <Btn variant="light" onClick={exportReport}>
            <FileText className="size-4" /> {tr("Download report (PDF)")}
          </Btn>

        </div>
      </div>
      <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-ink-2">
        Aggregate figures only, calculated live from the caseload and referral records. No child names are included, so this is safe to bring to a district meeting.
      </p>

      {/* KPI band */}
      <section className="mt-10 grid gap-3 rounded-[44px] bg-night p-6 text-paper sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
        {[
          { label: tr("Screening coverage"), value: <CountUp value={coverage} suffix="%" />, note: `${data.screened} / ${total}`, color: "#ea8f63" },
          { label: tr("Referral closure"), value: <CountUp value={closure} suffix="%" />, note: `${data.funnel[4].n} / ${data.funnel[0].n}`, color: "#9fc46a" },
          { label: tr("Sent → seen"), value: fmt(data.toSeen), note: tr("average time to be seen"), color: "#e0a526" },
          { label: tr("Overdue visits"), value: <CountUp value={data.counts.overdue} />, note: tr("{n} stuck", { n: data.stuck }), color: "#c79ad0" },
        ].map((k) => (
          <div key={k.label} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <p className="font-mono text-[10px] tracking-[0.16em] text-paper/70 uppercase">{k.label}</p>
            <p className="mt-3 font-display text-[clamp(44px,5vw,64px)] leading-none" style={{ color: k.color }}>{k.value}</p>
            <p className="mt-2 text-[11.5px] text-paper/55">{k.note}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        {/* tier mix */}
        <Reveal className="h-full">
          <div className="h-full rounded-[40px] border border-line-2 bg-card p-6 sm:p-8">
            <Eyebrow index="02" tone="muted">{tr("Tier mix")}</Eyebrow>
            <div className="mt-6 flex h-4 gap-1 overflow-hidden rounded-full" role="img" aria-label="Distribution of children by status">
              {ORDER.map((s) => (
                <span key={s} className="h-full rounded-full" style={{ flexGrow: Math.max(data.counts[s], 0.01), background: STATUS_META[s].hex }} />
              ))}
            </div>
            <ul className="mt-6 space-y-3">
              {ORDER.map((s) => {
                const m = STATUS_META[s];
                return (
                  <li key={s} className="flex items-center gap-3 text-[13px]">
                    <span className="size-3 shrink-0 rounded-[4px]" style={{ background: m.hex }} />
                    <span className="flex-1 font-semibold">{m.label}</span>
                    <span className="font-mono text-[12px] text-muted">{pct(data.counts[s], total)}%</span>
                    <span className="w-10 text-right font-mono text-[13px] font-semibold">{data.counts[s]}</span>
                  </li>
                );
              })}
            </ul>
            <Btn className="no-print mt-6" variant="light" size="sm" onClick={() => go("caseload")}>
              {tr("Open team & caseload")} <ArrowRight className="size-3.5" />
            </Btn>
          </div>
        </Reveal>

        {/* referral funnel */}
        <Reveal delay={80} className="h-full">
          <div className="h-full rounded-[40px] border border-line-2 bg-card p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow index="03" tone="muted">{tr("Referral funnel")}</Eyebrow>
              <Chip tone={data.stuck ? "brick" : "moss"}>{tr("{n} stuck", { n: data.stuck })}</Chip>
            </div>
            {data.funnel[0].n === 0 ? (
              <p className="mt-6 text-[13px] leading-relaxed text-ink-2">{tr("No referrals have been created yet.")}</p>
            ) : (
              <ul className="mt-6 space-y-3.5">
                {data.funnel.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="font-semibold">{f.label}</span>
                      <span className="font-mono text-muted">{f.n} · {pct(f.n, data.funnel[0].n)}%</span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-sand">
                      <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${Math.max(f.n ? 3 : 0, pct(f.n, data.funnel[0].n))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-5 text-[12px] text-ink-2">Average created → sent {fmt(data.toSent)} · sent → seen {fmt(data.toSeen)}</p>
            <div className="no-print mt-5 flex flex-wrap gap-2">
              <Btn variant="light" size="sm" onClick={() => go("referrals")}>
                {tr("Open referrals")} <ArrowRight className="size-3.5" />
              </Btn>
              <Btn variant="soft" size="sm" onClick={() => go("help")}>
                {tr("Catchment audit")}
              </Btn>
            </div>
          </div>
        </Reveal>
      </div>

      {/* coverage by worker */}
      <Reveal className="mt-4">
        <section className="rounded-[40px] border border-line-2 bg-card p-6 sm:p-8">
          <Eyebrow index="04" tone="muted">{tr("Coverage by worker")}</Eyebrow>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.sectors.map((s) => {
              const cov = pct(s.screened, s.total);
              return (
                <div key={s.id} className="rounded-[28px] border border-line-2 bg-card-2 p-5">
                  <p className="font-mono text-[10px] font-semibold tracking-[0.15em] text-muted uppercase">Sector {s.id} · {s.title}</p>
                  <p className="mt-2 font-display text-[26px] leading-none uppercase">{s.worker}</p>
                  <p className={cn("mt-4 font-display text-[44px] leading-none", cov >= 80 ? "text-moss" : cov >= 50 ? "text-amber" : "text-brick")}>{cov}%</p>
                  <div className="mt-3 h-2 rounded-full bg-sand">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${cov}%` }} />
                  </div>
                  <p className="mt-3 text-[11.5px] text-ink-2">
                    {s.screened}/{s.total} screened · <b className="text-lilac">{s.overdue} overdue</b> · <b className="text-brick">{s.refer} refer</b>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* domains of concern */}
      <Reveal className="mt-4">
        <section className="rounded-[40px] bg-night p-6 text-paper sm:p-8">
          <Eyebrow index="05" tone="peach">{tr("Main domain of concern")}</Eyebrow>
          <p className="mt-2 text-[12.5px] text-paper/60">{tr("Lowest-scoring area for children on Watch or Refer.")}</p>
          {data.domains.length === 0 ? (
            <p className="mt-6 text-[13px] text-paper/70">{tr("No Watch or Refer children with scores yet.")}</p>
          ) : (
            <ul className="mt-6 space-y-3.5">
              {data.domains.map((d) => (
                <li key={d.key} className="grid grid-cols-[130px_1fr_32px] items-center gap-3 text-[12.5px] sm:grid-cols-[170px_1fr_40px]">
                  <span className="font-semibold">{d.label}</span>
                  <span className="h-2.5 rounded-full bg-white/10">
                    <span className="block h-full rounded-full" style={{ width: `${(d.n / maxDomain) * 100}%`, background: d.color }} />
                  </span>
                  <span className="text-right font-mono">{d.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>
    </Page>
  );
}
