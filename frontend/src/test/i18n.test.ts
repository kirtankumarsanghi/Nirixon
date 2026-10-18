import { describe, expect, it } from "vitest";
import { LANGS, STRINGS, t } from "../lib/i18n";

describe("i18n", () => {
  it("returns the string for each language", () => {
    expect(t("en", "common.viewingAs")).toBe("Viewing as");
    expect(t("hi", "common.viewingAs")).toBe("देख रहे हैं");
  });

  it("has both languages for every key", () => {
    for (const key of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      expect(t("en", key).length).toBeGreaterThan(0);
      expect(t("hi", key).length).toBeGreaterThan(0);
    }
    expect(LANGS.map((l) => l.id)).toEqual(["en", "hi"]);
  });
});
