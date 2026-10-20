export type Lang = "en" | "hi";

type Entry = { en: string; hi: string };

/**
 * Dependency-free i18n for the workspace chrome.
 *
 * Scope is deliberately small and honest: only the strings actually consumed by
 * `t()` live here (the role dock). The check-in carries its own bilingual copy
 * (question audio, answer labels, regression prompt) and the remaining views are
 * English only until their copy is translated and reviewed — see README coverage.
 */
export const STRINGS = {
  "common.viewingAs": { en: "Viewing as", hi: "देख रहे हैं" },
  "common.language": { en: "Language", hi: "भाषा" },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "hi", label: "हिं" },
];

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}
