import { describe, expect, it } from "vitest";
import { LANGS, STRINGS, t, tAll } from "../lib/i18n";

describe("i18n", () => {
  it("returns the string for each language", () => {
    expect(t("en", "common.viewingAs")).toBe("Viewing as");
    expect(t("hi", "common.viewingAs")).toBe("देख रहे हैं");
    expect(t("ta", "common.viewingAs").length).toBeGreaterThan(0);
  });

  it("has every language for every key", () => {
    for (const key of Object.keys(STRINGS) as (keyof typeof STRINGS)[]) {
      const entry = tAll(key);
      for (const lang of LANGS) {
        expect(entry[lang.id], `${key} is missing ${lang.id}`).toBeTruthy();
      }
    }
    expect(LANGS.map((l) => l.id)).toEqual([
      "en",
      "hi",
      "mr",
      "ta",
      "te",
      "bn",
      "gu",
      "kn",
    ]);
  });
});
