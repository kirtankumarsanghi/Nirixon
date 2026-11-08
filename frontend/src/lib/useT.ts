import { useCallback } from "react";
import { useApp } from "../store";
import { translate } from "./i18n";

/** Returns a translator bound to the workspace's selected language. */
export function useT() {
  const { lang } = useApp();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars),
    [lang],
  );
}
