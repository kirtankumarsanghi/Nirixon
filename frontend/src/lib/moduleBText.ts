/**
 * Localized text for the Module B (school-age) question bank.
 *
 * The bank ships in English only. Per-language maps are generated offline
 * (`backend/scripts/translate_module_b.py`) and served from
 * `public/module-b-<code>.json`. A missing map resolves to `{}` so the UI
 * falls back to English instead of blocking the check-in.
 */
import type { Lang } from "./i18n";

type TextMap = Record<string, string>;

function makeLoader(prefix: "module-a" | "module-b") {
  const cache: Partial<Record<Lang, TextMap>> = {};
  const inflight: Partial<Record<Lang, Promise<TextMap>>> = {};

  const load = (lang: Lang): Promise<TextMap> => {
    if (lang === "en") return Promise.resolve({});
    const cached = cache[lang];
    if (cached) return Promise.resolve(cached);
    const pending = inflight[lang];
    if (pending) return pending;

    const request = (async () => {
      let result: TextMap = {};
      try {
        const res = await fetch(`/${prefix}-${lang}.json`);
        if (res.ok) result = (await res.json()) as TextMap;
      } catch {
        result = {};
      }
      cache[lang] = result;
      return result;
    })();
    inflight[lang] = request;
    return request;
  };

  const reset = (lang?: Lang): void => {
    if (lang) {
      delete cache[lang];
      delete inflight[lang];
      return;
    }
    for (const key of Object.keys(cache) as Lang[]) delete cache[key];
    for (const key of Object.keys(inflight) as Lang[]) delete inflight[key];
  };

  return { load, reset };
}

const moduleB = makeLoader("module-b");
const moduleA = makeLoader("module-a");

export const loadModuleBText = moduleB.load;
export const resetModuleBTextCache = moduleB.reset;
export const loadModuleAText = moduleA.load;
export const resetModuleATextCache = moduleA.reset;
