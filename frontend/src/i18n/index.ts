/**
 * i18n scaffold — English only for Stage 5.
 *
 * TODO (Section 5): Confirm whether item_bank.py's per-item translation
 * metadata is populated and exposed via the API, and secure professional
 * translation review, before building a translation layer.
 *
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
