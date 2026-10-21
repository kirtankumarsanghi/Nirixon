import type { ReferralSummary } from "../api/types";

const SMS_MAX = 160;

/** Full handoff text for WhatsApp — the same 4-field summary the PDF carries. */
export function referralWhatsAppText(s: ReferralSummary): string {
  return [
    "NIRIXON REFERRAL — developmental screening handoff",
    "",
    `Age bracket: ${s.age_bracket}`,
    `Triage tier: ${s.tier}`,
    `Areas of concern: ${s.domains_of_concern.length ? s.domains_of_concern.join(", ") : "none recorded"}`,
    `Safety rule: ${s.safety_rule_trigger ?? "not triggered"}`,
    "",
    "Screening aid only — not a diagnosis. Minimum essential data, no personal identifiers.",
  ].join("\n");
}

/** Compact single-segment SMS variant, guaranteed to fit one 160-char message. */
export function referralSmsText(s: ReferralSummary): string {
  const head = `NIRIXON REF | ${s.age_bracket} | ${s.tier}`;
  const safety = s.safety_rule_trigger ? ` | SAFETY: ${s.safety_rule_trigger}` : "";
  const areas = s.domains_of_concern.length ? ` | ${s.domains_of_concern.join(", ")}` : "";
  const candidates = [`${head}${areas}${safety}`, `${head}${safety}`, `${head}${areas}`, head];
  for (const candidate of candidates) {
    if (candidate.length <= SMS_MAX) return candidate;
  }
  return head.slice(0, SMS_MAX);
}

export const waLink = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const smsLink = (text: string): string => `sms:?&body=${encodeURIComponent(text)}`;
export const telLink = (number: string): string => `tel:${number.replace(/[^\d+]/g, "")}`;
