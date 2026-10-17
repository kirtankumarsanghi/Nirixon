import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import CinematicSequence from "./components/CinematicSequence";
import PersistentPortrait from "./components/PersistentPortrait";
import ScrollRail from "./components/ScrollRail";
import { ThemeProvider } from "./components/ThemeContext";
import { FloatingViewSwitcher, ViewProvider } from "./components/ViewContext";
import { GapCards, Modules, TrustMarquee } from "./sections/SectionsA";
import { CtaFooter, Faq } from "./sections/SectionsB";
import { Proof, SafetyBand } from "./sections/Proof";
import { Demo } from "./sections/Demo";
import { Intake } from "./sections/Intake";
import { Toolkit } from "./sections/Toolkit";
import { Audience, Compare } from "./sections/Reach";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  // Smooth scrolling wired into GSAP's ticker so ScrollTrigger stays in sync
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lenis: Lenis | null = null;
    let tick: ((time: number) => void) | null = null;

    if (!reduced) {
      lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      tick = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      // Route-style hashes (e.g. "#/login") are app navigation, not in-page scroll
      // anchors. Let the browser update the hash so the app router can handle them.
      if (id.startsWith("#/")) return;
      let target: Element | null = null;
      try {
        target = document.querySelector(id);
      } catch {
        target = null;
      }
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: id === "#top" ? 0 : -70, duration: 1.3 });
      else (target as HTMLElement).scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    };
    document.addEventListener("click", onClick);

    // keep pinned timelines honest once fonts/images settle
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    if (document.fonts?.ready) document.fonts.ready.then(refresh).catch(() => {});

    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("load", refresh);
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, []);

  return (
    <ThemeProvider>
      <ViewProvider>
        <div className="relative min-h-screen bg-void text-bone">
          {/* Scroll-scrubbed backdrop: persistent portrait, ghost word, grid moment, fan-out. */}
          <PersistentPortrait />
          <div className="relative z-10">
            <ScrollRail />
            <Navbar />
            <FloatingViewSwitcher />
            <main>
              <Hero />
              <CinematicSequence />
              <TrustMarquee />
              <Proof />
              <SafetyBand />
              <Demo />
              <GapCards />
              <Modules />
              <Intake />
              <Toolkit />
              <Compare />
              <Audience />
              <Faq />
            </main>
            <CtaFooter />
          </div>
        </div>
      </ViewProvider>
    </ThemeProvider>
  );
}
