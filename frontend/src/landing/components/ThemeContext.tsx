import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "../utils/cn";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("nirixon-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const manual = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.add("theme-transitioning");
    window.localStorage.setItem("nirixon-theme", theme);
    const timer = window.setTimeout(() => root.classList.remove("theme-transitioning"), 520);
    return () => window.clearTimeout(timer);
  }, [theme]);

  // Follow OS theme changes until the user makes an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (manual.current) return;
      setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = () => {
    manual.current = true;
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      data-cursor={isDark ? "Light" : "Dark"}
      className={cn("theme-toggle", className)}
    >
      <span className="sr-only">{isDark ? "Light mode" : "Dark mode"}</span>
      <Sun className={cn("theme-icon theme-icon-sun", !isDark && "is-active")} aria-hidden="true" />
      <Moon className={cn("theme-icon theme-icon-moon", isDark && "is-active")} aria-hidden="true" />
      <span className={cn("theme-thumb", isDark && "is-dark")} aria-hidden="true" />
    </button>
  );
}