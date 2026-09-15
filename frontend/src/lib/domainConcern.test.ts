import { describe, expect, it } from "vitest";
import {
  discardImputedFeatures,
  domainFromItemId,
  toDomainConcerns,
} from "./domainConcern";

describe("domainConcern", () => {
  it("discards imputed-looking feature keys before mapping", () => {
    const cleaned = discardImputedFeatures({
      gm_01: 0.2,
      imputed_fm_02: 0.9,
      com_03__imputed: 0.5,
    });
    expect(cleaned).toEqual({ gm_01: 0.2 });
  });

  it("maps Module A item-bank ids without raw SHAP in copy", () => {
    const concerns = toDomainConcerns(
      { GM01: 0.5, CM02: 0.2, PS01: 0.1 },
      "Typical",
    );
    expect(concerns).toHaveLength(6);
    const domains = concerns.map((c) => c.domain);
    expect(domains).toContain("gross_motor");
    expect(domains).toContain("communication");
    expect(domains).toContain("personal_social");
    expect(domains).toContain("fine_motor");
    expect(domains).toContain("cognitive");
    expect(domains).toContain("self_help");
    for (const c of concerns) {
      expect(c.plainLanguage).not.toMatch(/0\.\d/);
      expect(c.plainLanguage).not.toMatch(/shap/i);
    }
  });

  it("maps Module B item ids like AT01 / RD02 to functioning domains", () => {
    expect(domainFromItemId("AT01")).toBe("attention");
    expect(domainFromItemId("RD02")).toBe("reading");
    expect(domainFromItemId("NM03")).toBe("numbers");
    expect(domainFromItemId("LS04")).toBe("listening_speaking");
    expect(domainFromItemId("EM01")).toBe("emotion_conduct");
  });
});
