import { describe, expect, it } from "vitest";
import type { ReferralSummary } from "../api/types";
import { DOMAINS } from "../lib/model";
import { caregiverPlanBody, escapeHtml, planItemsFromScores, referralSlipBody } from "../lib/printSheet";

const summary: ReferralSummary = {
  age_bracket: "18-24m",
  tier: "Tier 3: Direct Referral",
  domains_of_concern: ["gross_motor", "communication"],
  safety_rule_trigger: "Loss of motor milestones (SD <= -2.0)",
};

describe("printable sheets", () => {
  it("escapes user-controlled text", () => {
    expect(escapeHtml(`<b>&"'</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });

  it("puts the four fields, the child id and the QR on the referral slip", () => {
    const html = referralSlipBody(summary, "data:image/png;base64,abc", "child-1");
    expect(html).toContain("18-24m");
    expect(html).toContain("Tier 3: Direct Referral");
    expect(html).toContain("gross_motor");
    expect(html).toContain("data:image/png;base64,abc");
    expect(html).toContain("child-1");
  });

  it("escapes summary values in the slip", () => {
    const html = referralSlipBody({ ...summary, tier: "<script>x</script>" }, "qr", "c");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("builds a bilingual-chrome plan and flags untranslated content", () => {
    const html = caregiverPlanBody([{ label: "Gross motor", activity: "Cushion trail", detail: "10 min" }], {
      childId: "c1",
      date: "18 October 2026",
    });
    expect(html).toContain("घर पर गतिविधियाँ");
    expect(html).toContain("Cushion trail");
    expect(html).toContain("10 min");
    expect(html).toContain("pending clinical translation review");
  });

  it("picks the three weakest scored areas for the plan", () => {
    const items = planItemsFromScores({ gross: 0.5, cog: -1.5, comm: -2.2, fine: 0.1, social: -0.4, adaptive: 0.9 });
    expect(items).toHaveLength(3);
    expect(items[0].activity).toBe(DOMAINS.comm.activity);
    expect(items.every((i) => i.activity.length > 0)).toBe(true);
  });
});
