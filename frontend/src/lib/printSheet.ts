import type { ReferralSummary } from "../api/types";
import { DOMAINS, type Scores } from "./model";

export interface PlanItem {
  label: string;
  activity: string;
  detail?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Weakest areas → the static Module A home activity for each. */
export function planItemsFromScores(scores: Scores | undefined, limit = 3): PlanItem[] {
  if (!scores) return [];
  return Object.keys(scores)
    .sort((a, b) => scores[a] - scores[b])
    .slice(0, limit)
    .map((k) => ({ label: DOMAINS[k]?.label ?? k, activity: DOMAINS[k]?.activity ?? "" }))
    .filter((item) => item.activity.length > 0);
}

/** The printable referral slip body (4 fields + a QR of the compact summary). */
export function referralSlipBody(summary: ReferralSummary, qrDataUrl: string, childId: string): string {
  const areas = summary.domains_of_concern.length
    ? summary.domains_of_concern.map(escapeHtml).join(", ")
    : "None recorded";
  const safety = summary.safety_rule_trigger ? escapeHtml(summary.safety_rule_trigger) : "Not triggered";
  return `
  <header class="brand">
    <div>
      <div class="label">Nirixon · clinical handoff</div>
      <h1 style="font-size:34px;margin-top:4px">Referral summary</h1>
    </div>
    <div class="mono" style="font-size:11px">${escapeHtml(childId)}</div>
  </header>
  <div class="card" style="margin-top:14px">
    <div class="row"><span class="label">Age bracket</span><b>${escapeHtml(summary.age_bracket)}</b></div>
    <div class="row"><span class="label">Triage tier</span><b>${escapeHtml(summary.tier)}</b></div>
    <div class="row"><span class="label">Areas of concern</span><span>${areas}</span></div>
    <div class="row"><span class="label">Safety rule</span><span>${safety}</span></div>
  </div>
  <div style="display:flex;gap:16px;align-items:center;margin-top:16px">
    <img class="qr" src="${qrDataUrl}" alt="Referral summary QR code" />
    <p class="muted">Scan at the DEIC to read the same four fields. Screening aid only — not a diagnosis. Minimum essential data, no personal identifiers.</p>
  </div>`;
}

/** Printable caregiver plan. Hindi chrome, English activity content (pending review). */
export function caregiverPlanBody(items: PlanItem[], meta: { childId?: string; date: string }): string {
  const rows = items
    .map(
      (i) =>
        `<li><b>${escapeHtml(i.label)}</b><br/><span>${escapeHtml(i.activity)}</span>${
          i.detail ? `<br/><span class="muted">${escapeHtml(i.detail)}</span>` : ""
        }</li>`,
    )
    .join("");
  return `
  <header class="brand">
    <div>
      <div class="label">Nirixon · home activities</div>
      <h1 style="font-size:30px;margin-top:4px">घर पर गतिविधियाँ · Home activities</h1>
    </div>
    <div class="mono" style="font-size:11px">${escapeHtml(meta.childId ?? "")}</div>
  </header>
  <p class="muted" style="margin:10px 0 4px">इस हफ़्ते आज़माएँ · try these this week · 5–10 मिनट रोज़</p>
  <ul>${rows || "<li>No active areas — keep the routine going.</li>"}</ul>
  <p class="muted">${escapeHtml(meta.date)} · Activity text is in English pending clinical translation review. Screening aid only — not a diagnosis.</p>`;
}

/**
 * Open a self-contained, print-ready sheet in a new window. User-initiated, so
 * pop-up blockers allow it; the app's own print CSS is left untouched.
 */
export function printSheet(title: string, body: string): void {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  win.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: #fff4dc; color: #21160b; font-family: Inter, system-ui, sans-serif; }
  h1 { font-family: Anton, Impact, sans-serif; text-transform: uppercase; line-height: 1; margin: 0; }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
  .label { font: 600 9px "JetBrains Mono", monospace; letter-spacing: .18em; text-transform: uppercase; color: #8a7a63; }
  .sheet { max-width: 720px; margin: 0 auto; }
  .brand { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 2px solid #21160b; padding-bottom: 8px; }
  .card { border: 1px solid #e6d5b5; border-radius: 16px; padding: 14px 18px; background: #fffaf0; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px dashed #e6d5b5; font-size: 13px; }
  .row:last-child { border-bottom: 0; }
  .qr { width: 132px; height: 132px; }
  ul { margin: 8px 0 0; padding-left: 18px; }
  li { margin: 8px 0; font-size: 13px; line-height: 1.55; }
  .muted { color: #8a7a63; font-size: 11px; line-height: 1.5; }
</style></head>
<body><div class="sheet">${body}</div>
<script>
  function go() { window.focus(); window.print(); }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(go, 120); });
  } else {
    setTimeout(go, 500);
  }
</script>
</body></html>`);
  win.document.close();
}
