/**
 * Hindi text for the Module B (school-age) question bank.
 *
 * The bank itself ships in English only, so this map — generated offline by
 * `backend/scripts/translate_module_b_hi.py` and served from
 * `public/module-b-hi.json` — lets the check-in speak Module B questions in
 * Hindi. Loaded once, lazily, only when a Module B check-in is active.
 */
type HindiMap = Record<string, string>;

let cache: HindiMap | null = null;
let inflight: Promise<HindiMap> | null = null;

export function loadModuleBHindi(): Promise<HindiMap> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = (async () => {
      let result: HindiMap = {};
      try {
        const res = await fetch("/module-b-hi.json");
        if (res.ok) result = (await res.json()) as HindiMap;
      } catch {
        result = {}; // no map available — questions fall back to English speech
      }
      cache = result;
      return result;
    })();
  }
  return inflight;
}

export function resetModuleBHindiCache(): void {
  cache = null;
  inflight = null;
}
