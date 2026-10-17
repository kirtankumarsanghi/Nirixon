import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE_ROW, JOURNEY, MEDIA, PHOTOS, STATES, type StateId } from "../data";
import { LogoMark } from "./system";

const INTRO_FRAMES = [
  { src: PHOTOS.motherBaby, pos: "center 30%" },
  { src: PHOTOS.childrenPlaying, pos: "center 42%" },
  { src: PHOTOS.schoolGroup, pos: "center 36%" },
];

/* ================================================================== */
/*  Nirixon portal experience — faithful port of the "Planet Jumping"  */
/*  mechanic: preloader -> canvas mask window -> travel transition.    */
/*  Destinations: Early (0–5) -> Scholar (6–12) -> Triage (terminal).  */
/* ================================================================== */

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function animateValue(setter: (v: number) => void, duration: number) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setter(easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const twoFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

function waitCanPlay(v: HTMLVideoElement, timeout = 1600) {
  return new Promise<void>((resolve) => {
    if (v.readyState >= 3) return resolve();
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(t);
      v.removeEventListener("canplaythrough", done);
      v.removeEventListener("error", done);
    };
    const t = window.setTimeout(done, timeout);
    v.addEventListener("canplaythrough", done);
    v.addEventListener("error", done);
  });
}

/* Resolve once the playhead passes `seconds` (ambient destination footage is
   long, so we freeze a representative frame rather than awaiting 'ended'). */
function waitPlayhead(v: HTMLVideoElement, seconds: number, timeout = 3200) {
  return new Promise<void>((resolve) => {
    if (v.ended || v.currentTime >= seconds) return resolve();
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
      v.removeEventListener("ended", done);
      v.removeEventListener("error", done);
    };
    const t = window.setTimeout(done, timeout);
    const iv = window.setInterval(() => {
      if (v.currentTime >= seconds || v.ended) done();
    }, 90);
    v.addEventListener("ended", done);
    v.addEventListener("error", done);
  });
}

export default function Hero() {
  const [current, setCurrent] = useState<StateId>("early");
  const [playIntro] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean((window as Window & { __NIRIXON_PLAY_INTRO?: boolean }).__NIRIXON_PLAY_INTRO);
  });
  const [preGone, setPreGone] = useState(!playIntro);
  const [countGone, setCountGone] = useState(!playIntro);
  const [logoGone, setLogoGone] = useState(!playIntro);

  const expRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const portalRef = useRef<HTMLButtonElement>(null);
  const portalVideoRef = useRef<HTMLVideoElement>(null);
  const portalImageRef = useRef<HTMLImageElement>(null);
  const transitionRef = useRef<HTMLVideoElement>(null);
  const preloaderRef = useRef<HTMLDivElement>(null);
  const preCountRef = useRef<HTMLDivElement>(null);
  const preValueRef = useRef<HTMLSpanElement>(null);
  const introPhotoRefs = useRef<(HTMLImageElement | null)[]>([]);
  const finishPreloaderRef = useRef<() => void>(() => {});
  const introStoryRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const bgRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const currentRef = useRef<StateId>("early");
  const busyRef = useRef(false);
  const startedRef = useRef(false);
  const runningRef = useRef(true);
  const frozenRef = useRef(false);
  const transitionActiveRef = useRef(false);
  const expansionRef = useRef(0);
  const maskScaleRef = useRef(0);
  const canvasOpacityRef = useRef(1);
  const rotRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const radiusRef = useRef(90);
  const reducedRef = useRef(false);
  const firstRenderRef = useRef(true);

  const retrigger = useCallback((cls: string) => {
    const el = expRef.current;
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }, []);

  const revealMask = useCallback(() => {
    retrigger("mask-revealing");
    maskScaleRef.current = 0;
    return animateValue((v) => (maskScaleRef.current = v), reducedRef.current ? 1 : 1050);
  }, [retrigger]);

  const revealContent = useCallback(() => retrigger("content-revealing"), [retrigger]);

  /* ---------------------------- travel ---------------------------- */
  const travel = useCallback(
    async (target: StateId) => {
      if (busyRef.current || target === currentRef.current) return;
      busyRef.current = true;
      rotRef.current.tx = 0;
      rotRef.current.ty = 0;
      const exp = expRef.current!;
      const tv = transitionRef.current!;
      const reduced = reducedRef.current;
      try {
        tv.src = MEDIA[STATES[target].bg];
        tv.load();
        exp.classList.add("is-loading");
        await waitCanPlay(tv, 1600);
        exp.classList.remove("is-loading", "content-revealing", "mask-revealing");
        exp.classList.add("is-transitioning");
        tv.currentTime = 0;
        tv.playbackRate = 1.3;
        canvasOpacityRef.current = 1;
        transitionActiveRef.current = true;
        try {
          await tv.play();
        } catch {
          /* frame may be unavailable; expansion still runs */
        }
        await animateValue((v) => (expansionRef.current = v), reduced ? 1 : 1100);
        await waitPlayhead(tv, 2.4);

        // freeze the final frame into the scene canvas
        try {
          const sc = sceneRef.current!;
          const sctx = sc.getContext("2d")!;
          const expR = exp.getBoundingClientRect();
          const d = Math.min(window.devicePixelRatio || 1, 2);
          sc.width = Math.max(1, Math.round(expR.width * d));
          sc.height = Math.max(1, Math.round(expR.height * d));
          sctx.setTransform(d, 0, 0, d, 0, 0);
          const mw = tv.videoWidth;
          const mh = tv.videoHeight;
          if (mw > 0 && mh > 0) {
            const s = Math.max(expR.width / mw, expR.height / mh);
            sctx.drawImage(tv, (expR.width - mw * s) / 2, (expR.height - mh * s) / 2, mw * s, mh * s);
            frozenRef.current = true;
          } else {
            // no decodable frame — release the old freeze so the live backdrop shows
            frozenRef.current = false;
          }
        } catch {
          frozenRef.current = false;
        }

        currentRef.current = target;
        setCurrent(target);
        exp.classList.add("is-committing");
        await twoFrames();
        transitionActiveRef.current = false;
        expansionRef.current = 0;
        maskScaleRef.current = 0;
        canvasOpacityRef.current = 1;
        exp.classList.remove("is-transitioning", "is-committing");
        const maskReveal = revealMask();
        window.setTimeout(revealContent, 100);
        await maskReveal;
        window.setTimeout(() => {
          tv.removeAttribute("src");
          tv.load();
          busyRef.current = false;
        }, 450);
      } catch {
        transitionActiveRef.current = false;
        expansionRef.current = 0;
        maskScaleRef.current = 1;
        canvasOpacityRef.current = 1;
        exp.classList.remove("is-transitioning", "is-committing", "is-loading");
        busyRef.current = false;
      }
    },
    [revealMask, revealContent],
  );

  const travelRef = useRef(travel);
  travelRef.current = travel;

  const onPortalClick = useCallback(() => {
    const cur = currentRef.current;
    // Journey loops: Early → Scholar → Triage → Early
    const next: StateId = cur === "early" ? "scholar" : cur === "scholar" ? "triage" : "early";
    travelRef.current(next);
  }, []);

  /* --------------------- render-sync (spec render()) -------------- */
  useEffect(() => {
    const st = STATES[current];
    // backgrounds: play active, pause others
    (Object.keys(bgRefs.current) as (keyof typeof MEDIA)[]).forEach((key) => {
      const v = bgRefs.current[key];
      if (!v) return;
      if (key === st.bg) v.play().catch(() => {});
      else v.pause();
    });
    // portal media: image vs video
    const pv = portalVideoRef.current;
    const pi = portalImageRef.current;
    if (pv && pi) {
      if (st.image) {
        if (pi.getAttribute("src") !== st.image) pi.src = st.image;
        pi.style.display = "block";
        pv.style.display = "none";
        pv.pause();
      } else if (st.video) {
        pi.style.display = "none";
        pv.style.display = "block";
        if (!pv.src.endsWith(st.video)) {
          pv.src = st.video;
          pv.load();
        }
        pv.play().catch(() => {});
      }
    }
    // sidebar switching animation on re-renders after the first
    if (!firstRenderRef.current && listRef.current) {
      const list = listRef.current;
      list.classList.remove("is-switching");
      void list.offsetWidth;
      list.classList.add("is-switching");
    }
    firstRenderRef.current = false;
  }, [current]);

  /* --------------------------- engine ----------------------------- */
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const exp = expRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    /* ----- resize (spec §7) ----- */
    const resize = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const r = exp.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * d));
      canvas.height = Math.max(1, Math.round(r.height * d));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (!frozenRef.current && sceneRef.current) {
        sceneRef.current.width = canvas.width;
        sceneRef.current.height = canvas.height;
      }
      const cssRadius = parseFloat(getComputedStyle(exp).getPropertyValue("--portal-radius"));
      if (!Number.isNaN(cssRadius)) radiusRef.current = cssRadius;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(exp);
    window.addEventListener("resize", resize);

    const io = new IntersectionObserver(([e]) => (runningRef.current = e.isIntersecting), { threshold: 0 });
    io.observe(exp);

    /* ----- pointer tilt (spec §7) ----- */
    const onMove = (e: PointerEvent) => {
      if (busyRef.current || reducedRef.current) return;
      const r = exp.getBoundingClientRect();
      rotRef.current.ty = ((e.clientX - r.left) / r.width - 0.5) * 37.4;
      rotRef.current.tx = ((e.clientY - r.top) / r.height - 0.5) * -33;
    };
    const onLeave = () => {
      rotRef.current.tx = 0;
      rotRef.current.ty = 0;
    };
    exp.addEventListener("pointermove", onMove);
    exp.addEventListener("pointerleave", onLeave);

    /* ----- helpers ----- */
    const roundedPts = (w: number, h: number, r: number): [number, number][] => {
      r = Math.max(0.0001, Math.min(r, w / 2, h / 2));
      const arcs: [number, number, number, number][] = [
        [w / 2 - r, -h / 2 + r, -Math.PI / 2, 0],
        [w / 2 - r, h / 2 - r, 0, Math.PI / 2],
        [-w / 2 + r, h / 2 - r, Math.PI / 2, Math.PI],
        [-w / 2 + r, -h / 2 + r, Math.PI, Math.PI * 1.5],
      ];
      const pts: [number, number][] = [];
      for (const [cx, cy, a0, a1] of arcs) {
        for (let i = 0; i <= 10; i++) {
          const a = a0 + ((a1 - a0) * i) / 10;
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
      }
      return pts;
    };

    const drawCover = (c: CanvasRenderingContext2D, media: CanvasImageSource, mw: number, mh: number, W: number, H: number) => {
      const s = Math.max(W / mw, H / mh);
      c.drawImage(media, (W - mw * s) / 2, (H - mh * s) / 2, mw * s, mh * s);
    };

    const drawShade = (c: CanvasRenderingContext2D, W: number, H: number) => {
      const g = c.createLinearGradient(0, H * 0.52, 0, H);
      g.addColorStop(0, "rgba(29,20,9,0)");
      g.addColorStop(1, "rgba(29,20,9,0.9)");
      c.fillStyle = g;
      c.fillRect(0, H * 0.52, W, H * 0.48);
    };

    const mediaSize = (m: HTMLVideoElement | HTMLImageElement | null): [number, number] => {
      if (!m) return [0, 0];
      if (m instanceof HTMLVideoElement) return [m.videoWidth, m.videoHeight];
      return [m.naturalWidth, m.naturalHeight];
    };

    /* ----- frame loop (spec §7) ----- */
    const FOCAL = 850;
    let last = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!runningRef.current) {
        last = now;
        return;
      }
      const portal = portalRef.current;
      if (!portal) return;
      const dt = Math.min(40, now - last);
      last = now;

      const rot = rotRef.current;
      const k = Math.min(1, dt * 0.009);
      rot.x += (rot.tx - rot.x) * k;
      rot.y += (rot.ty - rot.y) * k;

      const cR = canvas.getBoundingClientRect();
      const pR = portal.getBoundingClientRect();
      const W = cR.width;
      const H = cR.height;
      const rect = { left: pR.left - cR.left, top: pR.top - cR.top, width: pR.width, height: pR.height };
      const e = expansionRef.current;
      const scale = e ? 1 : maskScaleRef.current;

      const cx = rect.left + rect.width / 2 + (W / 2 - (rect.left + rect.width / 2)) * e;
      const cy = rect.top + rect.height / 2 + (H / 2 - (rect.top + rect.height / 2)) * e;
      const baseW = rect.width + (W - rect.width) * e;
      const baseH = rect.height + (H - rect.height) * e;
      const w = baseW * scale;
      const h = baseH * scale;
      const r = radiusRef.current * (1 - e) * scale;
      const rx = rot.x * (1 - e);
      const ry = rot.y * (1 - e);

      ctx.clearRect(0, 0, W, H);
      if (frozenRef.current && sceneRef.current) {
        ctx.drawImage(sceneRef.current, 0, 0, W, H);
        drawShade(ctx, W, H);
      }
      if (w <= 1 || h <= 1) return;

      const ax = (rx * Math.PI) / 180;
      const ay = (ry * Math.PI) / 180;
      const path = new Path2D();
      roundedPts(w, h, r).forEach(([x, y], i) => {
        const xx = x * Math.cos(ay);
        const yy = y * Math.cos(ax);
        const z = x * Math.sin(ay) - y * Math.sin(ax);
        const p = FOCAL / (FOCAL + z);
        const sx = cx + xx * p;
        const sy = cy + yy * p;
        if (i === 0) path.moveTo(sx, sy);
        else path.lineTo(sx, sy);
      });
      path.closePath();

      const st = STATES[currentRef.current];
      const media = transitionActiveRef.current
        ? transitionRef.current
        : st.image
          ? portalImageRef.current
          : portalVideoRef.current;
      const [mw, mh] = mediaSize(media as HTMLVideoElement | HTMLImageElement | null);

      ctx.save();
      ctx.globalAlpha = canvasOpacityRef.current;
      ctx.clip(path);
      ctx.fillStyle = "#030303";
      ctx.fillRect(0, 0, W, H);
      if (media && mw > 0 && mh > 0) drawCover(ctx, media as CanvasImageSource, mw, mh, W, H);
      if (transitionActiveRef.current) drawShade(ctx, W, H);
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);

    /* ----- startExperience (spec §6) ----- */
    const startExperience = async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const pv = portalVideoRef.current;
      if (pv) await waitCanPlay(pv, 2800);
      await revealMask();
      document.body.classList.add("intro-ready");
      window.setTimeout(revealContent, 850);
    };

    /* ----- photo-story preloader: image readiness + 4.5s sequence ----- */
    let finished = false;
    let rafCount = 0;
    let hardFallback = 0;
    const introStart = performance.now();
    const introDuration = reducedRef.current ? 420 : 4700;

    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.style.overflow = "";
      cancelAnimationFrame(rafCount);
      if (preValueRef.current) preValueRef.current.textContent = "100";
      preCountRef.current?.classList.add("is-leaving");
      logoRef.current?.classList.add("is-docked");
      preloaderRef.current?.classList.add("is-background", "is-opening");
      document.body.classList.add("preload-complete");
      void startExperience();
      window.setTimeout(() => setCountGone(true), 750);
      window.setTimeout(() => preloaderRef.current?.classList.add("is-gone"), 1550);
      window.setTimeout(() => setPreGone(true), 2350);
      window.setTimeout(() => {
        logoRef.current?.classList.add("is-settled");
        if (logoRef.current) logoRef.current.style.opacity = "0";
        window.setTimeout(() => setLogoGone(true), 500);
      }, 2000);
    };
    finishPreloaderRef.current = finish;

    const photoProgress = () => {
      const refs = introPhotoRefs.current;
      if (!refs.length) return 1;
      const ready = refs.filter((img) => img && (img.complete || img.dataset.failed === "true")).length;
      return ready / refs.length;
    };

    const smooth = (v: number) => {
      const t = Math.max(0, Math.min(1, v));
      return t * t * (3 - 2 * t);
    };

    const syncPhotoSequence = (p: number) => {
      const crossA = smooth((p - 0.23) / 0.17);
      const crossB = smooth((p - 0.59) / 0.17);
      const weights = [1 - crossA, crossA * (1 - crossB), crossB];
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      introPhotoRefs.current.forEach((img, i) => {
        if (!img) return;
        const normalized = weights[i] / totalWeight;
        img.style.opacity = String(normalized);
        // A very restrained image-scale drift keeps still photography cinematic, not synthetic.
        const local = i === 0 ? Math.min(1, p / 0.4) : i === 1 ? Math.min(1, Math.max(0, (p - 0.28) / 0.42)) : Math.min(1, Math.max(0, (p - 0.62) / 0.38));
        img.style.transform = `scale(${1.035 + local * 0.018})`;
      });
    };

    const syncStoryStage = (p: number) => {
      const stage = p < 0.12 ? 0 : p < 0.49 ? 1 : p < 0.68 ? 2 : p < 0.85 ? 3 : 4;
      const story = introStoryRef.current;
      if (story && story.dataset.stage !== String(stage)) story.dataset.stage = String(stage);
    };

    const tickCount = (now: number) => {
      if (finished || !playIntro) return;
      const elapsedProgress = Math.min(1, (now - introStart) / introDuration);
      // Most of the counter follows the five-second story; its last 10% waits for the real images.
      const p = Math.min(1, elapsedProgress * 0.9 + photoProgress() * 0.1);
      if (preValueRef.current) preValueRef.current.textContent = String(Math.round(p * 100));
      if (reducedRef.current) {
        introPhotoRefs.current.forEach((img, i) => {
          if (img) img.style.opacity = i === 0 ? "1" : "0";
        });
        if (introStoryRef.current) introStoryRef.current.dataset.stage = "0";
      } else {
        syncPhotoSequence(p);
        syncStoryStage(p);
      }
      if (p >= 1 || (reducedRef.current && elapsedProgress >= 1)) {
        finish();
        return;
      }
      rafCount = requestAnimationFrame(tickCount);
    };

    const skipIntro = () => finishPreloaderRef.current();
    const onKey = () => skipIntro();
    const onWheel = () => skipIntro();
    const onTouch = () => skipIntro();
    const onPointer = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("[data-intro-skip]")) skipIntro();
    };

    if (!playIntro) {
      document.body.classList.add("preload-complete");
      void startExperience();
    } else {
      document.body.style.overflow = "hidden";
      rafCount = requestAnimationFrame(tickCount);
      // Broken third-party media must never leave the page behind an intro.
      hardFallback = window.setTimeout(finish, reducedRef.current ? 900 : 9000);
      window.addEventListener("keydown", onKey, { once: true });
      window.addEventListener("wheel", onWheel, { once: true, passive: true });
      window.addEventListener("touchstart", onTouch, { once: true, passive: true });
      exp.addEventListener("pointerdown", onPointer, { passive: true });
    }

    return () => {
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafCount);
      window.clearTimeout(hardFallback);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("resize", resize);
      exp.removeEventListener("pointermove", onMove);
      exp.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouch);
      exp.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = STATES[current];
  const activeRow = ACTIVE_ROW[current];

  return (
    <main ref={expRef} id="top" className="experience" data-module={current} aria-label="Nirixon — choose a screening journey">
      {/* backgrounds */}
      <div className="backgrounds" aria-hidden="true">
        <video ref={(el) => { bgRefs.current.earlyBg = el; }} className={`background${current === "early" ? " is-visible" : ""}`} src={MEDIA.earlyBg} muted playsInline preload="auto" loop />
        <video ref={(el) => { bgRefs.current.scholarBg = el; }} className={`background${current === "scholar" ? " is-visible" : ""}`} src={MEDIA.scholarBg} muted playsInline preload="metadata" loop />
        <video ref={(el) => { bgRefs.current.triageBg = el; }} className={`background${current === "triage" ? " is-visible" : ""}`} src={MEDIA.triageBg} muted playsInline preload="metadata" loop />
      </div>

      <canvas ref={sceneRef} className="scene-canvas" aria-hidden="true" />
      <div className="shade" aria-hidden="true" />

      {/* sidebar journey rail */}
      <aside ref={listRef} className="module-list chrome" aria-label="Screening journey">
        {JOURNEY.map((item, i) =>
          item.state ? (
            <button
              key={item.label}
              type="button"
              className={`module-item${i === activeRow ? " is-active" : ""}`}
              aria-current={i === activeRow ? "true" : undefined}
              onClick={() => travelRef.current(item.state!)}
              data-cursor="Travel"
            >
              {item.label}
            </button>
          ) : (
            <span key={item.label} className="module-item is-dim" aria-hidden="true">
              {item.label}
            </span>
          ),
        )}
      </aside>

      <canvas ref={canvasRef} className="portal-canvas" aria-hidden="true" />

      {/* portal */}
      <section className="portal-wrap chrome" aria-label="Next destination">
        <div className="portal-heading">
          <span>Next:</span>
          <span>
            <span>{st.number}</span> <strong>{st.next}</strong>
          </span>
        </div>
        <button
          ref={portalRef}
          className="portal"
          type="button"
          onClick={onPortalClick}
          aria-label={`Travel to ${st.next}`}
          data-cursor="Enter"
        >
          <video ref={portalVideoRef} muted playsInline preload="auto" loop />
          <img ref={portalImageRef} alt="" />
        </button>
      </section>

      {/* bottom content */}
      <section className="module-content chrome" aria-live="polite">
        <h1>{st.title}</h1>
        <dl>
          {st.facts.map(([k, v]) => (
            <div className="fact" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="transition-layer" aria-hidden="true">
        <video ref={transitionRef} muted playsInline preload="auto" />
      </div>
      <div className="loading" aria-hidden="true">
        Preparing screening…
      </div>

      {/* preloader */}
      {!preGone && (
        <div ref={preloaderRef} className="preloader" aria-label="Loading Nirixon">
          <div className="preloader-photo-stack" aria-hidden="true">
            {INTRO_FRAMES.map((frame, i) => (
              <img
                key={frame.src}
                ref={(el) => { introPhotoRefs.current[i] = el; }}
                className="preloader-photo"
                src={frame.src}
                alt=""
                style={{ opacity: i === 0 ? 1 : 0, objectPosition: frame.pos }}
                loading="eager"
                decoding="async"
                draggable={false}
                onLoad={() => {
                  // The intro counter includes these real image assets in its final progress segment.
                  if (preValueRef.current) preValueRef.current.dataset.assets = "loading";
                }}
                onError={(event) => {
                  const image = event.currentTarget;
                  if (!image.dataset.fallback) {
                    image.dataset.fallback = "true";
                    image.src = PHOTOS.early;
                    return;
                  }
                  image.dataset.failed = "true";
                  if (preValueRef.current) preValueRef.current.dataset.assets = "fallback";
                }}
              />
            ))}
          </div>
          <div className="preloader-shade" />
          <div ref={introStoryRef} className="intro-story" data-stage="0" aria-live="polite">
            <div className="intro-question" aria-label="Can your child pick up a toy from the floor without holding on?">
              <span>Can your child pick up a toy</span>
              <span>from the floor without holding on?</span>
              <div className="intro-answer-chips" aria-hidden="true">
                {["Yes, did it easily", "Tried, but fell or hesitated", "Not yet"].map((answer, i) => (
                  <span key={answer} className={`intro-answer-chip intro-chip-${i + 1}`}>{answer}</span>
                ))}
              </div>
            </div>

            <div className="intro-question-progress" aria-label="Example question progress">
              <p className="intro-progress-copy">Question 9 of about 14 <span>·</span> 18 skipped because they don’t apply</p>
              <div className="intro-progress-layout">
                <div className="intro-progress-track"><span /></div>
                <div className="intro-skipped-dots" aria-hidden="true">
                  {Array.from({ length: 18 }).map((_, i) => <i key={i} />)}
                </div>
              </div>
            </div>

            <div className="intro-outcomes" aria-label="Three possible screening results">
              {[
                { icon: "●", name: "On track", color: "#8eb977" },
                { icon: "●", name: "Let’s look closer", color: "#d9a44a" },
                { icon: "●", name: "Please see a doctor", color: "#e17c68" },
              ].map((result, i) => (
                <span key={result.name} className={`intro-outcome intro-outcome-${i + 1}`} style={{ "--outcome-color": result.color } as React.CSSProperties}>
                  <i aria-hidden="true">{result.icon}</i>{result.name}
                </span>
              ))}
            </div>

            <p className="intro-safety-line">A safety rule no AI score can override.</p>
          </div>
          <button
            type="button"
            className="intro-skip"
            onClick={() => finishPreloaderRef.current()}
            data-intro-skip
            aria-label="Skip introduction"
          >
            Skip <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      {!logoGone && (
        <div ref={logoRef} className="floating-logo" aria-hidden="true">
          <LogoMark className="h-full w-full" />
        </div>
      )}
      {!countGone && (
        <div ref={preCountRef} className="preloader-count" aria-live="polite">
          <span ref={preValueRef}>0</span>
          <span className="percent">%</span>
        </div>
      )}
    </main>
  );
}
