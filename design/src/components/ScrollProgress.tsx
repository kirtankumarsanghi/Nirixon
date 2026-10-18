import { useEffect, useState } from "react";

/** Thin reading-progress line pinned to the top of the viewport. */
export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px]">
      <div className="h-full origin-left bg-gradient-to-r from-rust to-peach" style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}
