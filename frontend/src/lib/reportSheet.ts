import { escapeHtml } from "./printSheet";

export interface WardReportData {
  generated: string;
  wardLabel: string;
  total: number;
  screened: number;
  coverage: number;
  closure: number;
  toSent: string;
  toSeen: string;
  overdue: number;
  stuck: number;
  tiers: { label: string; color: string; n: number; pct: number }[];
  funnel: { label: string; n: number; pct: number }[];
  workers: { sector: string; worker: string; title: string; total: number; screened: number; cov: number; overdue: number; refer: number }[];
  domains: { label: string; n: number }[];
}

const bar = (pct: number, color = "#21160b") =>
  `<div class="bar"><span style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></span></div>`;

/** Printable ward report: aggregate figures only, no child identifiers. */
export function wardReportBody(d: WardReportData): string {
  const kpi = (label: string, value: string, note: string) =>
    `<div class="kpi"><div class="label">${escapeHtml(label)}</div><div class="kv">${escapeHtml(value)}</div><div class="muted">${escapeHtml(note)}</div></div>`;

  const tierRows = d.tiers
    .map(
      (t) =>
        `<tr><td><span class="dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</td><td class="num">${t.n}</td><td class="num">${t.pct}%</td><td class="w">${bar(t.pct, t.color)}</td></tr>`,
    )
    .join("");
  const funnelRows = d.funnel
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td class="num">${f.n}</td><td class="num">${f.pct}%</td><td class="w">${bar(f.pct)}</td></tr>`)
    .join("");
  const workerRows = d.workers
    .map(
      (w) =>
        `<tr><td><b>${escapeHtml(w.worker)}</b><br/><span class="muted">Sector ${escapeHtml(w.sector)} · ${escapeHtml(w.title)}</span></td><td class="num">${w.screened}/${w.total}</td><td class="num">${w.cov}%</td><td class="num">${w.overdue}</td><td class="num">${w.refer}</td></tr>`,
    )
    .join("");
  const max = Math.max(1, ...d.domains.map((x) => x.n));
  const domainRows = d.domains.length
    ? d.domains
        .map((x) => `<tr><td>${escapeHtml(x.label)}</td><td class="num">${x.n}</td><td class="w">${bar((x.n / max) * 100, "#c8452f")}</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="muted">No Watch or Refer children with scores yet.</td></tr>`;

  return `
  <style>
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
    .kpi { border: 1px solid #e6d5b5; border-radius: 14px; padding: 12px 14px; background: #fffaf0; }
    .kv { font: 400 30px Anton, Impact, sans-serif; margin: 6px 0 2px; }
    h2 { font: 400 17px Anton, Impact, sans-serif; text-transform: uppercase; letter-spacing: .04em; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { text-align: left; font: 600 9px "JetBrains Mono", monospace; letter-spacing: .14em; text-transform: uppercase; color: #8a7a63; border-bottom: 2px solid #21160b; padding: 6px 8px; }
    td { padding: 8px; border-bottom: 1px solid #e6d5b5; vertical-align: middle; }
    .num { text-align: right; font-family: "JetBrains Mono", monospace; white-space: nowrap; }
    th.num { text-align: right; }
    .w { width: 34%; }
    .bar { height: 8px; border-radius: 99px; background: #efe2c4; overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 99px; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 8px; }
    section, tr { break-inside: avoid; }
    footer { margin-top: 24px; border-top: 1px solid #e6d5b5; padding-top: 10px; }
  </style>
  <header class="brand">
    <div>
      <div class="label">Nirixon · field supervisor</div>
      <h1 style="font-size:36px;margin-top:4px">Ward report</h1>
    </div>
    <div style="text-align:right">
      <div class="mono" style="font-size:11px">${escapeHtml(d.wardLabel)}</div>
      <div class="muted">${escapeHtml(d.generated)}</div>
    </div>
  </header>

  <div class="kpis">
    ${kpi("Screening coverage", `${d.coverage}%`, `${d.screened} of ${d.total} children`)}
    ${kpi("Referral closure", `${d.closure}%`, "referrals closed")}
    ${kpi("Sent → seen", d.toSeen, "average time to be seen")}
    ${kpi("Overdue visits", String(d.overdue), `${d.stuck} referral${d.stuck === 1 ? "" : "s"} stuck over 7 days`)}
  </div>

  <section>
    <h2>Tier mix</h2>
    <table><thead><tr><th>Status</th><th class="num">Children</th><th class="num">Share</th><th></th></tr></thead><tbody>${tierRows}</tbody></table>
  </section>

  <section>
    <h2>Referral funnel</h2>
    <table><thead><tr><th>Stage</th><th class="num">Referrals</th><th class="num">Of created</th><th></th></tr></thead><tbody>${funnelRows}</tbody></table>
    <p class="muted" style="margin-top:8px">Average created → sent ${escapeHtml(d.toSent)} · sent → seen ${escapeHtml(d.toSeen)}</p>
  </section>

  <section>
    <h2>Coverage by worker</h2>
    <table><thead><tr><th>Worker</th><th class="num">Screened</th><th class="num">Coverage</th><th class="num">Overdue</th><th class="num">Refer</th></tr></thead><tbody>${workerRows}</tbody></table>
  </section>

  <section>
    <h2>Main domain of concern</h2>
    <p class="muted" style="margin:0 0 6px">Lowest-scoring area for children on Watch or Refer.</p>
    <table><thead><tr><th>Domain</th><th class="num">Children</th><th></th></tr></thead><tbody>${domainRows}</tbody></table>
  </section>

  <footer class="muted">Aggregate figures only. No child names or identifiers are included. Screening aid only, not a diagnosis. Generated from live caseload and referral records.</footer>`;
}
