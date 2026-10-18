export type Lang = "en" | "hi";

type Entry = { en: string; hi: string };

/**
 * Dependency-free i18n. The chrome strings are migrated now; the same `t()`
 * mechanism is ready for the remaining views (see README for coverage).
 */
export const STRINGS = {
  "common.viewingAs": { en: "Viewing as", hi: "देख रहे हैं" },
  "common.switchWorkspace": { en: "Switch workspace", hi: "वर्कस्पेस बदलें" },
  "common.signOut": { en: "Sign out", hi: "साइन आउट" },
  "common.language": { en: "Language", hi: "भाषा" },
  "findHelp.pin": { en: "Postal PIN code", hi: "पोस्टल पिन कोड" },
  "findHelp.age": { en: "Age (years)", hi: "उम्र (वर्ष)" },
  "findHelp.search": { en: "Find nearest help", hi: "नज़दीकी सहायता खोजें" },
  "findHelp.searching": { en: "Searching…", hi: "खोज रहे हैं…" },
  "findHelp.sample": { en: "Try a sample PIN", hi: "नमूना पिन आज़माएँ" },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "hi", label: "हिं" },
];

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}
