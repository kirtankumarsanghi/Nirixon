import { describe, expect, it } from "vitest";
import type { ReferralSummary } from "../api/types";
import { referralSmsText, referralWhatsAppText, smsLink, telLink, waLink } from "../lib/handoff";

const summary: ReferralSummary = {
  age_bracket: "18-24m",
  tier: "Tier 3: Direct Referral",
  domains_of_concern: ["gross_motor", "communication"],
  safety_rule_trigger: "Loss of motor milestones (SD <= -2.0)",
};

describe("referral handoff text", () => {
  it("builds a full WhatsApp handoff with the four fields", () => {
    const text = referralWhatsAppText(summary);
    expect(text).toContain("18-24m");
    expect(text).toContain("Tier 3: Direct Referral");
    expect(text).toContain("gross_motor");
    expect(text).toContain("Loss of motor milestones");
    expect(text).toContain("not a diagnosis");
  });

  it("keeps the SMS variant within one 160-char segment", () => {
    expect(referralSmsText(summary).length).toBeLessThanOrEqual(160);
    expect(referralSmsText(summary)).toContain("NIRIXON REF");
  });

  it("still fits when every field is long", () => {
    const long: ReferralSummary = {
      age_bracket: "36-48m",
      tier: "Tier 2: In-App Reflex Monitor",
      domains_of_concern: ["attention", "reading", "writing", "numbers", "motor", "social", "emotion_conduct", "listening_speaking"],
      safety_rule_trigger: "Severe developmental divergence flagged during community screening across several domains",
    };
    expect(referralSmsText(long).length).toBeLessThanOrEqual(160);
  });

  it("encodes share links and normalises phone numbers", () => {
    expect(waLink("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
    expect(smsLink("a b")).toBe("sms:?&body=a%20b");
    expect(telLink("14416")).toBe("tel:14416");
    expect(telLink("+91 14416")).toBe("tel:+9114416");
  });
});
