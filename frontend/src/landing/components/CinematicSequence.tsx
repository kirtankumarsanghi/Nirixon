import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import gsap from "gsap";
import { ArrowLeft, ArrowRight, ArrowUpRight, MoveHorizontal } from "lucide-react";
import { PHOTOS } from "../data";

type Chapter = {
  photo: string;
  label: string;
  kicker: string;
  stat: string;
  statNote: string;
  words: string[];
  accentWord?: string;
  caption: string;
  tone: string;
  credit: string;
  position?: string;
};

const CHAPTERS: Chapter[] = [
  {
    photo: PHOTOS.street,
    label: "The scale",
    kicker: "Chapter 01 — The scale",
    stat: "200M+",
    statNote: "children in LMICs",
    words: ["Two", "hundred", "million", "children"],
    caption:
      "fail to reach their developmental potential — not because care is unavailable, but because the delay was never detected in time.",
    tone: "#e58a52",
    credit: "Raipur, India",
  },
  {
    photo: PHOTOS.clinicChild,
    label: "The bottleneck",
    kicker: "Chapter 02 — The bottleneck",
    stat: "1 : 100K",
    statNote: "specialists per child",
    words: ["One", "specialist.", "A", "hundred", "thousand", "children."],
    caption:
      "India's developmental pediatrician ratio makes universal screening arithmetically impossible with today's tools.",
    tone: "#84b8c6",
    credit: "Pediatric consultation",
  },
  {
    photo: PHOTOS.eyeExam,
    label: "The misread",
    kicker: "Chapter 03 — The misread",
    stat: "12 in 100",
    statNote: "healthy children wrongly flagged on paper",
    words: ["Labelled", "before", "being", "looked", "at."],
    accentWord: "Labelled",
    caption:
      "Fixed 30–36 item paper checklists wrongly worry about 12 of every 100 healthy children — while vision, hearing and home-vs-school context go unasked.",
    tone: "#d9a44a",
    credit: "Vision screening",
  },
  {
    photo: PHOTOS.childGujarat,
    label: "The window",
    kicker: "Chapter 04 — The window",
    stat: "< 5 min",
    statNote: "12–18 questions, in your language",
    words: ["The", "window", "is", "still", "open."],
    accentWord: "open.",
    caption:
      "Nirixon checks a child in under 5 minutes, in English, Hindi or Hinglish. Most children are cleared at home — only those who need a doctor are sent to one.",
    tone: "#bfe0cf",
    credit: "Dhari, Gujarat",
    position: "center 36%",
  },
];

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  chapter: number;
  horizontal: boolean;
};

export default function CinematicSequence() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[][]>([]);
  const capRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const kickerRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const statRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const playhead = useRef<gsap.core.Tween | null>(null);
  const current = useRef(0);
  const introduced = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    CHAPTERS.forEach((c) => {
      const image = new Image();
      image.decoding = "async";
      image.src = c.photo;
    });
    return () => media.removeEventListener("change", update);
  }, []);

  const goTo = useCallback((requested: number) => {
    const next = Math.max(0, Math.min(CHAPTERS.length - 1, requested));
    const tl = timeline.current;
    if (!tl) return;
    const destination = next + 1;
    if (next === current.current && Math.abs(tl.time() - destination) < 0.001) return;

    introduced.current = true;
    playhead.current?.kill();
    current.current = next;
    setActive(next);
    if (reduced) {
      tl.time(destination);
      return;
    }
    playhead.current = tl.tweenTo(destination, {
      duration: Math.min(1.45, 0.8 + Math.abs(destination - tl.time()) * 0.18),
      ease: "none",
    });
  }, [reduced]);

  useLayoutEffect(() => {
    let observer: IntersectionObserver | undefined;
    const ctx = gsap.context(() => {
      // One reversible playhead keeps buttons, swipes and interrupted transitions in sync.
      const tl = gsap.timeline({ paused: true });
      timeline.current = tl;
      gsap.set(track.current, { xPercent: 0 });
      gsap.set(imgRefs.current, { scale: 1.04, xPercent: 0 });
      gsap.set(wordRefs.current.flat(), { xPercent: 110, opacity: 0 });
      gsap.set([...kickerRefs.current, ...capRefs.current, ...statRefs.current], { opacity: 0 });
      gsap.set(bar.current, { scaleX: 1 / CHAPTERS.length });

      CHAPTERS.forEach((_, index) => {
        const at = index;
        const photo = imgRefs.current[index];
        const words = wordRefs.current[index] ?? [];
        const kicker = kickerRefs.current[index];
        const caption = capRefs.current[index];
        const statistic = statRefs.current[index];

        if (index > 0) {
          tl.to(track.current, { xPercent: -index * 100, duration: 1, ease: "power3.inOut" }, at);
          tl.to(wordRefs.current[index - 1] ?? [], {
            xPercent: -45, opacity: 0, duration: 0.24, stagger: 0.016, ease: "power2.in",
          }, at);
          tl.to([kickerRefs.current[index - 1], capRefs.current[index - 1], statRefs.current[index - 1]], {
            x: -24, opacity: 0, duration: 0.27, ease: "power2.in",
          }, at);
          tl.to(imgRefs.current[index - 1], {
            scale: 1.14, xPercent: -3, opacity: 0.68, duration: 1, ease: "power2.inOut",
          }, at);
        }

        if (photo) tl.fromTo(photo,
          { scale: 1.17, xPercent: index ? 4 : 0, opacity: index ? 0.7 : 1 },
          { scale: 1.04, xPercent: 0, opacity: 1, duration: 1, ease: "power2.out", immediateRender: false }, at);
        if (words.length) tl.fromTo(words,
          { xPercent: 110, opacity: 0 },
          { xPercent: 0, opacity: 1, duration: 0.52, stagger: 0.035, ease: "power3.out", immediateRender: false },
          at + (index ? 0.3 : 0.08));
        if (kicker) tl.fromTo(kicker,
          { x: 28, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.32, ease: "power2.out", immediateRender: false },
          at + (index ? 0.26 : 0.05));
        if (caption) tl.fromTo(caption,
          { x: 40, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.45, ease: "power2.out", immediateRender: false },
          at + (index ? 0.38 : 0.2));
        if (statistic) tl.fromTo(statistic,
          { x: 32, scale: 0.9, opacity: 0 },
          { x: 0, scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.2)", immediateRender: false },
          at + (index ? 0.22 : 0.1));
        tl.addLabel(`chapter-${index}`, index + 1);
      });

      tl.fromTo(bar.current, { scaleX: 1 / CHAPTERS.length }, {
        scaleX: 1, duration: CHAPTERS.length - 1, ease: "none", immediateRender: false,
      }, 1);

      if (reduced || introduced.current) {
        tl.time(current.current + 1);
        return;
      }
      tl.time(0);
      if (root.current) {
        observer = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting || introduced.current) return;
          introduced.current = true;
          playhead.current = tl.tweenTo("chapter-0", { duration: 1.15, ease: "none" });
          observer?.disconnect();
        }, { threshold: 0.25 });
        observer.observe(root.current);
      }
    }, root);

    return () => {
      observer?.disconnect();
      playhead.current?.kill();
      ctx.revert();
      timeline.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let accumulated = 0;
    let lastEvent = 0;
    let lockedUntil = 0;
    const wheel = (event: WheelEvent) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.2;
      if (!horizontal && !event.shiftKey) return;
      const delta = (horizontal ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : 1);
      const next = current.current + Math.sign(delta);
      if (!delta || next < 0 || next >= CHAPTERS.length) return;

      // Vertical wheel scrolling is deliberately never intercepted.
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now < lockedUntil) return;
      if (now - lastEvent > 160 || Math.sign(accumulated) !== Math.sign(delta)) accumulated = 0;
      lastEvent = now;
      accumulated += delta;
      if (Math.abs(accumulated) >= 42) {
        goTo(next);
        accumulated = 0;
        lockedUntil = now + 800;
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [goTo]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const destinations: Record<string, number> = {
      ArrowLeft: current.current - 1,
      ArrowRight: current.current + 1,
      Home: 0,
      End: CHAPTERS.length - 1,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    goTo(destinations[event.key]);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: Math.max(1, timeline.current?.time() ?? current.current + 1),
      chapter: current.current,
      horizontal: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      gesture.current = null;
      event.currentTarget.classList.remove("is-dragging");
      if (drag.horizontal) goTo(drag.chapter);
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.horizontal) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      drag.horizontal = true;
      introduced.current = true;
      playhead.current?.kill();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add("is-dragging");
    }
    if (event.pointerType === "mouse") event.preventDefault();
    if (!reduced && timeline.current) {
      const time = drag.time - dx / event.currentTarget.clientWidth;
      timeline.current.time(Math.max(1, Math.min(CHAPTERS.length, time)));
    }
  };

  const finishGesture = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gesture.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.horizontal) return;
    const dx = event.clientX - drag.x;
    const threshold = Math.min(85, event.currentTarget.clientWidth * 0.14);
    const step = !cancelled && Math.abs(dx) > threshold ? (dx < 0 ? 1 : -1) : 0;
    goTo(drag.chapter + step);
  };

  const currentChapter = CHAPTERS[active];

  return (
    <section
      ref={root}
      id="problem"
      data-overlay-protect
      className="chapter-deck"
      role="region"
      aria-roledescription="carousel"
      aria-labelledby="chapter-story-title"
      aria-describedby="chapter-story-help"
      tabIndex={0}
      style={{ "--chapter-accent": currentChapter.tone } as CSSProperties}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishGesture(event)}
      onPointerCancel={(event) => finishGesture(event, true)}
    >
      <div className="chapter-toolbar">
        <div>
          <p id="chapter-story-title" className="chapter-story-title">Why early matters</p>
          <p className="chapter-story-subtitle">Four chapters. One childhood.</p>
        </div>
        <a className="chapter-skip" href="#modules" data-cursor="Explore">
          Explore modules <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>

      <p id="chapter-story-help" className="sr-only">
        Swipe or drag horizontally, use the chapter buttons, or press the left and right arrow keys.
        Vertical scrolling continues to the rest of the page.
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Chapter {active + 1} of {CHAPTERS.length}: {currentChapter.label}.
      </p>

      <div ref={track} className="chapter-track">
        {CHAPTERS.map((chapter, index) => (
          <article
            key={chapter.kicker}
            id={`story-chapter-${index}`}
            className="chapter-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${CHAPTERS.length}: ${chapter.label}`}
            aria-hidden={active !== index}
            inert={active !== index}
          >
            <div
              ref={(element) => { imgRefs.current[index] = element; }}
              className="chapter-photo"
              aria-hidden="true"
            >
              <img
                src={chapter.photo}
                alt=""
                className="chapter-image"
                style={{ objectPosition: chapter.position }}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.fallback) return;
                  image.dataset.fallback = "true";
                  image.src = PHOTOS.early;
                }}
              />
            </div>
            <div className="chapter-shade" aria-hidden="true" />

            <div className="chapter-panel-inner">
              <div
                ref={(element) => { statRefs.current[index] = element; }}
                className="chapter-stat"
              >
                <p className="chapter-stat-value" style={{ color: chapter.tone }}>{chapter.stat}</p>
                <p className="chapter-stat-note">{chapter.statNote}</p>
                <p className="chapter-credit">{chapter.credit}</p>
              </div>

              <div className="chapter-copy">
                <p
                  ref={(element) => { kickerRefs.current[index] = element; }}
                  className="chapter-kicker"
                  style={{ color: chapter.tone }}
                >
                  {chapter.kicker}
                </p>
                <h2 className="chapter-title" aria-label={chapter.words.join(" ")}>
                  {chapter.words.map((word, wordIndex) => (
                    <span key={`${index}-${wordIndex}`} className="chapter-word-mask" aria-hidden="true">
                      <span
                        ref={(element) => {
                          wordRefs.current[index] = wordRefs.current[index] ?? [];
                          wordRefs.current[index][wordIndex] = element;
                        }}
                        className="chapter-word"
                        style={{ color: chapter.accentWord === word ? chapter.tone : undefined }}
                      >
                        {word}
                      </span>
                    </span>
                  ))}
                </h2>
                <p
                  ref={(element) => { capRefs.current[index] = element; }}
                  className="chapter-caption"
                >
                  {chapter.caption}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="chapter-controls">
        <nav className="chapter-navigation" aria-label="Story chapters">
          {CHAPTERS.map((chapter, index) => (
            <button
              key={chapter.label}
              type="button"
              className="chapter-nav-button"
              aria-current={active === index ? "step" : undefined}
              aria-controls={`story-chapter-${index}`}
              aria-label={`Read chapter ${index + 1}: ${chapter.label}`}
              onClick={() => goTo(index)}
              data-active={active === index}
              data-cursor="Read"
            >
              <span className="chapter-nav-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="chapter-nav-label">{chapter.label}</span>
              <span className="chapter-nav-line" aria-hidden="true" />
            </button>
          ))}
        </nav>

        <div className="chapter-actions">
          <span className="chapter-gesture-hint"><MoveHorizontal size={16} aria-hidden="true" /> Swipe to explore</span>
          <div className="chapter-direction-controls">
            <span className="chapter-count" aria-hidden="true">
              <strong>{String(active + 1).padStart(2, "0")}</strong> / 04
            </span>
            <button
              type="button"
              className="chapter-arrow"
              onClick={() => goTo(current.current - 1)}
              disabled={active === 0}
              aria-label="Previous chapter"
              data-cursor="Previous"
            ><ArrowLeft size={19} aria-hidden="true" /></button>
            <button
              type="button"
              className="chapter-arrow"
              onClick={() => goTo(current.current + 1)}
              disabled={active === CHAPTERS.length - 1}
              aria-label="Next chapter"
              data-cursor="Next"
            ><ArrowRight size={19} aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      <div className="chapter-progress" aria-hidden="true">
        <div ref={bar} className="chapter-progress-fill" />
      </div>
    </section>
  );
}
