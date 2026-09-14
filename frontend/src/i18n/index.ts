/**
 * i18n scaffold — English only for Stage 5.
 *
 * (English only for now; requires clinical review before adding translations)
 * Section 0.5: mistranslating a red-flag item (e.g. skill loss) is a safety
 * risk, not a cosmetic gap. Do not add machine-translated copy or rely on
 * browser auto-translate hacks for screening text.
 */

export type Locale = "en";

const DEFAULT_LOCALE: Locale = "en";

export function getLocale(): Locale {
  return DEFAULT_LOCALE;
}

export function t(key: string, fallback: string): string {
  void key;
  return fallback;
}
