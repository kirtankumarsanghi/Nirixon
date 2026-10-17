import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PHOTOS } from "../data";

gsap.registerPlugin(ScrollTrigger);

/* One living photograph; only its transform, opacity, and clip-path change. */
// A real family moment gives the travelling portrait context instead of a tight, isolated face crop.
const PORTRAIT_1X = "https://images.pexels.com/photos/17050887/pexels-photo-17050887.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=800&h=1000";
const PORTRAIT_SRCSET = [
  "https://images.pexels.com/photos/17050887/pexels-photo-17050887.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=480&h=600 480w",
  "https://images.pexels.com/photos/17050887/pexels-photo-17050887.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=960&h=1200 960w",
  "https://images.pexels.com/photos/17050887/pexels-photo-17050887.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1600&h=2000 1600w",
].join(", ");

const ROLE_IMAGES = [
  { src: PHOTOS.motherInfant, alt: "An Indian mother holding her infant", pos: "center 32%", rotate: -8 },
  { src: PHOTOS.ashaTall, alt: "A smiling Indian community health worker", pos: "center 18%", rotate: -4 },
  { src: PHOTOS.childGujarat, alt: "A child in Dhari, Gujarat", pos: "center 20%", rotate: 0 },
  { src: PHOTOS.doctorTall, alt: "An Indian doctor in traditional attire", pos: "center 16%", rotate: 4 },
  { src: PHOTOS.ruralMom, alt: "A woman in a rural field in Kanpur, India", pos: "center 20%", rotate: 8 },
];

const GRID_IMAGES = [
  { src: PHOTOS.motherInfant, alt: "An Indian mother holding her infant", pos: "center 32%" },
  { src: PHOTOS.ashaTall, alt: "A smiling Indian community health worker", pos: "center 18%" },
  { src: PHOTOS.doctorTall, alt: "An Indian doctor in traditional attire", pos: "center 16%" },
  { src: PHOTOS.ruralMom, alt: "A woman in a rural field in Kanpur, India", pos: "center 20%" },
];

const ZONE_DEFS = [
  { section: "#proof", lane: "proof", shape: "arch" },
  { section: "#compare", lane: "compare", shape: "circle" },
  { section: "#toolkit", lane: "toolkit", shape: "circle" },
  { section: "#audience", lane: "audience", shape: "rounded" },
] as const;

type ZoneShape = (typeof ZONE_DEFS)[number]["shape"];
type Zone = { section: HTMLElement; lane: HTMLElement; shape: ZoneShape };
type Geometry = { top: number; bottom: number; tl: number; tr: number; br: number; bl: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

function clipGeometry(progress: number): Geometry {
  // Circle -> arch -> softened rectangle. Morph continues while the portrait
  // is fading between lanes, so the shape never snaps when it reappears.
  const circle: Geometry = { top: 10, bottom: 10, tl: 50, tr: 50, br: 50, bl: 50 };
  const arch: Geometry = { top: 0, bottom: 0, tl: 50, tr: 50, br: 0, bl: 0 };
  const rect: Geometry = { top: 0, bottom: 0, tl: 7, tr: 7, br: 7, bl: 7 };
  const blend = (a: Geometry, b: Geometry, t: number): Geometry => ({
    top: lerp(a.top, b.top, t), bottom: lerp(a.bottom, b.bottom, t),
    tl: lerp(a.tl, b.tl, t), tr: lerp(a.tr, b.tr, t),
    br: lerp(a.br, b.br, t), bl: lerp(a.bl, b.bl, t),
  });
  if (progress < 0.42) return blend(arch, circle, smooth(progress / 0.42));
  if (progress < 0.72) return circle;
  return blend(circle, rect, smooth((progress - 0.72) / 0.28));
}

function targetSize(shape: ZoneShape, width: number, height: number) {
  if (shape === "arch") {
    const w = Math.min(width * 0.88, height * 0.68 * 0.78);
    return { sx: w / 320, sy: (w / 0.78) / 400 };
  }
  if (shape === "circle") {
    // The source frame is 320x400; a 10% vertical inset makes the visible crop square.
    const diameter = Math.min(width * 0.76, 82);
    const scale = diameter / 320;
    return { sx: scale, sy: scale };
  }
  const w = Math.min(width * 0.82, height * 0.28 * 0.8);
  return { sx: w / 320, sy: (w / 0.8) / 400 };
}

function responsiveSet(url: string) {
  try {
    const u = new URL(url);
    const baseW = Number(u.searchParams.get("w")) || 960;
    const baseH = Number(u.searchParams.get("h")) || Math.round(baseW * 1.25);
    return [640, 960, 1440].map((w) => {
      const v = new URL(u.toString());
      v.searchParams.set("w", String(w));
      v.searchParams.set("h", String(Math.round(baseH * w / baseW)));
      return `${v.toString()} ${w}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

export default function PersistentPortrait() {
  const ghost = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const portrait = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const fanCards = useRef<(HTMLDivElement | null)[]>([]);

  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-width: 899px)");
    const sync = () => {
      setReduced(motion.matches);
      setMobile(compact.matches);
    };
    motion.addEventListener("change", sync);
    compact.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      compact.removeEventListener("change", sync);
    };
  }, []);

  useLayoutEffect(() => {
    if (reduced || mobile) return;
    const zones: Zone[] = ZONE_DEFS.map((item) => {
      const section = document.querySelector<HTMLElement>(item.section);
      const lane = section?.querySelector<HTMLElement>(`[data-portrait-lane="${item.lane}"]`);
      return section && lane ? { section, lane, shape: item.shape } : null;
    }).filter((zone): zone is Zone => zone !== null);
    const audience = document.querySelector<HTMLElement>("#audience");
    const foreground = audience?.querySelector<HTMLElement>("[data-audience-foreground]");
    if (zones.length !== ZONE_DEFS.length || !audience || !foreground) return;

    let startY = 0;
    let endY = 1;
    const measure = () => {
      startY = zones[0].section.getBoundingClientRect().top + window.scrollY;
      const last = zones[zones.length - 1].section.getBoundingClientRect();
      endY = last.top + window.scrollY + last.height;
    };
    measure();

    const paint = () => {
      const g = ghost.current;
      const stageEl = stage.current;
      const p = portrait.current;
      const gridEl = grid.current;
      const fanEl = fan.current;
      if (!g || !stageEl || !p || !gridEl || !fanEl) return;

      const viewportMiddle = window.innerHeight * 0.5;
      const pageMiddle = window.scrollY + viewportMiddle;
      const overall = clamp01((pageMiddle - startY) / Math.max(1, endY - startY));

      // Ghost moves at half the page's visual scroll speed and always remains behind the site layer.
      g.style.transform = `translate3d(0, ${-(overall - 0.5) * window.innerHeight * 0.32}px, 0)`;

      const active = zones.find((zone) => {
        const r = zone.section.getBoundingClientRect();
        return r.top < viewportMiddle && r.bottom > viewportMiddle;
      });

      let portraitOpacity = 0;
      if (active) {
        const lane = active.lane.getBoundingClientRect();
        const section = active.section.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(lane.bottom, window.innerHeight) - Math.max(lane.top, 0));
        const laneVisibility = clamp01(visibleHeight / Math.max(1, lane.height) * 1.7);
        const sectionProgress = clamp01((viewportMiddle - section.top) / Math.max(1, section.height));
        const edgeIn = smooth(sectionProgress / 0.1);
        const edgeOut = 1 - smooth((sectionProgress - 0.82) / 0.15);
        portraitOpacity = laneVisibility * Math.min(edgeIn, edgeOut);

        const { sx, sy } = targetSize(active.shape, lane.width, lane.height);
        const cx = lane.left + lane.width * 0.5;
        const cy = lane.top + lane.height * 0.5;
        // Fixed 320x400 source viewport; size changes use scale only (no layout tween).
        p.style.transform = `translate3d(${cx - 160 * sx}px, ${cy - 200 * sy}px, 0) scale(${sx}, ${sy})`;
      }

      const shape = clipGeometry(overall);
      p.style.opacity = String(portraitOpacity);
      p.style.clipPath = `inset(${shape.top}% 0 ${shape.bottom}% round ${shape.tl}% ${shape.tr}% ${shape.br}% ${shape.bl}%)`;

      // Audience interludes: five role photos fan out, then four photographs fill the viewport.
      const audienceRect = audience.getBoundingClientRect();
      const audienceProgress = clamp01((viewportMiddle - audienceRect.top) / Math.max(1, audienceRect.height));
      const fanStrength = smooth((audienceProgress - 0.14) / 0.16) * (1 - smooth((audienceProgress - 0.43) / 0.16));
      const gridStrength = smooth((audienceProgress - 0.43) / 0.13) * (1 - smooth((audienceProgress - 0.68) / 0.13));
      const spectacle = Math.max(fanStrength, gridStrength);

      // The page copy fades during the photo-only beat, rather than sitting under imagery.
      foreground.style.opacity = String(1 - Math.max(fanStrength * 0.96, gridStrength));
      foreground.style.pointerEvents = spectacle > 0.55 ? "none" : "";
      stageEl.dataset.scrollImmersive = spectacle > 0.08 ? "true" : "false";
      fanEl.style.opacity = String(fanStrength);
      fanCards.current.forEach((card, i) => {
        if (!card) return;
        const stagger = clamp01(fanStrength * 1.65 - i * 0.115);
        card.style.opacity = String(stagger);
        card.style.transform = `translate3d(calc(-50% + ${(i - 2) * 13}vw), calc(-50% - ${(1 - stagger) * 52}px), 0) rotate(${ROLE_IMAGES[i].rotate}deg) scale(${lerp(0.72, 1, stagger)})`;
      });

      gridEl.style.opacity = String(gridStrength);
      gridEl.style.transform = `scale(${lerp(0.24, 1, gridStrength)})`;
      gridEl.style.clipPath = `inset(${(1 - gridStrength) * 18}% round ${(1 - gridStrength) * 5}%)`;
    };

    // Proxy tween supplies a smoothed GSAP scrub; visible element animations remain transform/opacity/clip-path only.
    const driver = { progress: 0 };
    const tween = gsap.to(driver, {
      progress: 1,
      ease: "none",
      onUpdate: paint,
      scrollTrigger: {
        trigger: zones[0].section,
        start: "top bottom",
        endTrigger: zones[zones.length - 1].section,
        end: "bottom top",
        scrub: 0.55,
        invalidateOnRefresh: true,
        onRefresh: () => {
          measure();
          paint();
        },
      },
    });

    const refresh = () => {
      measure();
      ScrollTrigger.refresh();
      paint();
    };
    window.addEventListener("load", refresh);
    if (document.fonts?.ready) document.fonts.ready.then(refresh).catch(() => {});
    requestAnimationFrame(paint);

    return () => {
      window.removeEventListener("load", refresh);
      tween.scrollTrigger?.kill();
      tween.kill();
      foreground.style.opacity = "";
      foreground.style.pointerEvents = "";
    };
  }, [reduced, mobile]);

  if (reduced || mobile) return null;

  return (
    <>
      <div ref={ghost} className="persistent-ghost" aria-hidden="true">NIRIXON</div>
      <div ref={stage} className="persistent-stage" aria-hidden="true">
        <div ref={fan} className="persistent-fan" style={{ opacity: 0 }}>
          {ROLE_IMAGES.map((item, i) => (
            <div key={item.src} ref={(el) => { fanCards.current[i] = el; }} className="persistent-fan-card" style={{ opacity: 0 }}>
              <img src={item.src} srcSet={responsiveSet(item.src)} sizes="(max-width: 1200px) 100px, 150px" alt="" className="persistent-fill" style={{ objectPosition: item.pos }} loading="lazy" draggable={false} />
            </div>
          ))}
        </div>

        <div ref={grid} className="persistent-grid" style={{ opacity: 0, transform: "scale(.24)", clipPath: "inset(18% round 5%)" }}>
          {GRID_IMAGES.map((item) => (
            <div key={item.src} className="relative overflow-hidden">
              <img src={item.src} srcSet={responsiveSet(item.src)} sizes="25vw" alt={item.alt} className="persistent-fill" style={{ objectPosition: item.pos }} loading="lazy" draggable={false} />
            </div>
          ))}
          <div className="persistent-grid-scrim" />
        </div>

        {/* One high-resolution image node travels only inside named layout lanes. */}
        <div ref={portrait} className="persistent-portrait-frame" style={{ opacity: 0, clipPath: "inset(0 0 0 0 round 50% 50% 0 0)" }}>
          <img src={PORTRAIT_1X} srcSet={PORTRAIT_SRCSET} sizes="(max-width: 1200px) 260px, 420px" alt="An Indian grandmother sharing a moment with her grandchild at home" className="persistent-fill" style={{ objectPosition: "center 28%" }} loading="lazy" decoding="async" draggable={false} />
          <span className="persistent-vignette" />
        </div>
      </div>
    </>
  );
}
