import { ChevronDown, Languages } from "lucide-react";
import { LANGS, LANG_META, t, type Lang } from "../lib/i18n";
import { useApp } from "../store";
import { cn } from "../utils/cn";

/**
 * Compact language switcher. A native select keeps all eight languages usable
 * inside the floating RoleDock without an overflowing chip rail, and its popup
 * is never clipped by the dock's horizontal scroll.
 */
export function LangPicker({
  tone = "light",
  compact = false,
  className,
}: {
  tone?: "light" | "dark";
  compact?: boolean;
  className?: string;
}) {
  const { lang, setLang } = useApp();
  const dark = tone === "dark";

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      {!compact && <Languages className="pointer-events-none absolute left-3 size-3.5 text-muted" />}
      <select
        value={lang}
        onChange={(event) => setLang(event.target.value as Lang)}
        aria-label={t(lang, "common.language")}
        className={cn(
          "appearance-none rounded-full border font-semibold transition-colors focus:outline-none",
          compact ? "py-1.5 pr-7 text-[11px]" : "py-2.5 pr-9 text-[13px]",
          !compact && "pl-9",
          compact && "pl-3",
          dark
            ? "border-white/20 bg-night-2 text-paper/85 hover:border-white/40"
            : "border-line-2 bg-card-2 text-ink hover:border-ink/50",
        )}
      >
        {LANGS.map((item) => (
          <option key={item.id} value={item.id} className="bg-card text-ink">
            {item.native}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute size-3",
          compact ? "right-2" : "right-3",
          dark ? "text-paper/60" : "text-muted",
        )}
      />
      <span className="sr-only">{LANG_META[lang].label}</span>
    </label>
  );
}
