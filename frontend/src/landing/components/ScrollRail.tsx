import { useEffect, useRef, useState } from "react";

const STOPS = [
  { id: "#top", label: "Portal" },
  { id: "#problem", label: "Story" },
  { id: "#proof", label: "Results" },
  { id: "#safety", label: "Safety" },
  { id: "#try", label: "Try it" },
  { id: "#gap", label: "Route" },
  { id: "#modules", label: "Ages" },
  { id: "#intake", label: "Listen" },
  { id: "#toolkit", label: "Lab" },
  { id: "#compare", label: "Compare" },
  { id: "#audience", label: "Reach" },
  { id: "#faq", label: "FAQ" },
  { id: "#cta", label: "Demo" },
];

/** Keeps the rail (and its stop label) from sitting on top of protected UI. */
function railHitsProtected() {
  if (document.querySelector<HTMLElement>(".persistent-stage")?.dataset.scrollImmersive === "true") return true;
  const rail = document.querySelector<HTMLElement>("[data-scroll-rail]");
  if (!rail) return false;
  const rr = rail.getBoundingClientRect();

  // Hide the rail completely while the interactive phone mockup in #try is in view
  const tryEl = document.getElementById("try");
  if (tryEl) {
    const tr = tryEl.getBoundingClientRect();
    if (tr.top < window.innerHeight * 0.78 && tr.bottom > window.innerHeight * 0.22) {
      return true;
    }
  }

  // Also hide if any protected element gets close to the right rail area
  return Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-protect]")).some((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.top < rr.bottom + 30 &&
      r.bottom > rr.top - 30 &&
      r.right > window.innerWidth - 140
    );
  });
}

/** Fixed right-edge travel rail: fills with scroll, names the current stop. */
export default function ScrollRail() {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(STOPS[0].label);
  const [visible, setVisible] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      setProgress(Math.min(1, Math.max(0, y / max)));
      setVisible(y > window.innerHeight * 0.55 && !railHitsProtected());

      // nearest stop above the probe line (document-absolute, not offsetParent-relative)
      const probe = y + window.innerHeight * 0.42;
      let current = STOPS[0].label;
      for (const s of STOPS) {
        const el = document.querySelector(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + y;
        if (top <= probe) current = s.label;
      }
      setLabel((prev) => {
        if (prev !== current && labelRef.current) {
          labelRef.current.animate(
            [
              { opacity: 0, transform: "translateY(6px)", filter: "blur(4px)" },
              { opacity: 1, transform: "translateY(0)", filter: "blur(0px)" },
            ],
            { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" },
          );
        }
        return current;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-4 transition-opacity duration-700 lg:flex"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
      data-scroll-rail
    >
      <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-faint">
        {String(Math.round(progress * 100)).padStart(2, "0")}
      </span>

      <div className="relative h-[210px] w-[2px] overflow-visible rounded-full bg-bone/12">
        <div
          className="absolute left-0 top-0 w-full origin-top rounded-full bg-gradient-to-b from-apricot via-gold to-lagoon"
          style={{ height: `${progress * 100}%` }}
        />
        <span
          className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone shadow-[0_0_16px_4px_rgba(229,138,82,0.55)]"
          style={{ top: `${progress * 100}%` }}
        />
        {STOPS.map((s, i) => (
          <span
            key={s.id}
            className="absolute left-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone/30"
            style={{ top: `${(i / (STOPS.length - 1)) * 100}%` }}
          />
        ))}
      </div>

      <span
        ref={labelRef}
        className="max-w-[74px] text-center text-[9.5px] font-bold uppercase leading-tight tracking-[0.18em] text-bone/70"
      >
        {label}
      </span>
    </div>
  );
}
