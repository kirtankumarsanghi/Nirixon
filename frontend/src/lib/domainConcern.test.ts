import { describe, expect, it } from "vitest";
import { discardImputedFeatures, toDomainConcerns } from "./domainConcern";

describe("domainConcern", () => {
  it("discards imputed-looking feature keys before mapping", () => {
    const cleaned = discardImputedFeatures({
      gm_01: 0.2,
      imputed_fm_02: 0.9,
      com_03__imputed: 0.5,
    });
    expect(cleaned).toEqual({ gm_01: 0.2 });
  });

  it("maps item-bank ids like GM01 / CM02 to domains without raw SHAP in copy", () => {
    const concerns = toDomainConcerns(
      { GM01: 0.5, CM02: 0.2, PS01: 0.1 },
      "Typical",
    );
    const domains = concerns.map((c) => c.domain);
    expect(domains).toContain("gross_motor");
    expect(domains).toContain("communication");
    expect(domains).toContain("personal_social");
    for (const c of concerns) {
      expect(c.plainLanguage).not.toMatch(/0\.\d/);
      expect(c.plainLanguage).not.toMatch(/shap/i);
    }
  });
});
