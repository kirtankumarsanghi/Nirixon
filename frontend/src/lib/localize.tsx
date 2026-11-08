import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useApp } from "../store";
import { translate, type Lang } from "./i18n";

/** Props that hold human-readable copy rather than machine values. */
const TEXT_PROPS = new Set([
  "label",
  "title",
  "helper",
  "eyebrow",
  "summary",
  "note",
  "subtitle",
  "description",
  "placeholder",
  "aria-label",
  "alt",
  "items",
  "tiles",
  "segments",
  "steps",
  "questions",
  "options",
  "question",
  "rationale",
  "watch",
  "intro",
  "look",
  "tryAtHome",
  "talk",
  "ages",
]);

/** Elements whose text content must never be touched. */
const SKIP_TAGS = new Set(["script", "style", "pre", "code"]);

/** Translate a whole visible sentence, preserving surrounding whitespace. */
function localizeString(value: string, lang: Lang): string {
  if (!value.trim()) return value;
  const core = value.trim();
  const translated = translate(lang, core);
  if (translated === core) return value;
  const start = value.indexOf(core);
  return value.slice(0, start) + translated + value.slice(start + core.length);
}

function localizeObject(value: Record<string, unknown>, lang: Lang): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = { ...value };
  for (const key of Object.keys(value)) {
    if (!TEXT_PROPS.has(key)) continue;
    const localized = localizeProp(value[key], lang);
    if (localized !== value[key]) {
      next[key] = localized;
      changed = true;
    }
  }
  return changed ? next : value;
}

function localizeProp(value: unknown, lang: Lang): unknown {
  if (typeof value === "string") return localizeString(value, lang);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const localized = localizeProp(item, lang);
      if (localized !== item) changed = true;
      return localized;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") return localizeObject(value as Record<string, unknown>, lang);
  return value;
}

export function localizeNode(node: ReactNode, lang: Lang): ReactNode {
  if (typeof node === "string") return localizeString(node, lang);
  if (Array.isArray(node)) return Children.map(node, (child) => localizeNode(child, lang));
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  const { type, props } = element;
  if (typeof type === "string" && SKIP_TAGS.has(type)) return node;

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (key === "children") continue;
    if (TEXT_PROPS.has(key)) {
      const localized = localizeProp(value, lang);
      if (localized !== value) {
        next[key] = localized;
        changed = true;
      }
    }
  }

  if (props.children !== undefined) {
    const mapped = Children.map(props.children as ReactNode, (child) => localizeNode(child, lang));
    next.children = mapped;
    changed = true;
  }

  return changed ? cloneElement(element, next) : element;
}

/**
 * Translates every visible text node (and readable prop) in a subtree using the
 * workspace's selected language. Pages already call `tr()` for most copy; this
 * catches strings that live inside markup or data props so the whole site
 * follows the language picker rather than only the hand-migrated headings.
 */
export function Localize({ children }: { children: ReactNode }) {
  const { lang } = useApp();
  return <>{localizeNode(children, lang)}</>;
}
