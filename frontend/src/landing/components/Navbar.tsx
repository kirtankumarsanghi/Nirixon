import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { LogoLockup } from "./system";
import { ThemeToggle } from "./ThemeContext";
import { cn } from "../utils/cn";

const LINKS = [
  { label: "Results", href: "#proof" },
  { label: "Try it", href: "#try" },
  { label: "Age groups", href: "#modules" },
  { label: "Toolkit", href: "#toolkit" },
  { label: "FAQ", href: "#faq" },
];

/** URL of the real screening app (frontend dev server or deployed URL). */
const SCREENING_APP_URL =
  (import.meta.env.VITE_SCREENING_APP_URL as string | undefined) ??
  "/screen";


export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(LINKS[0].href);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 18);
      let current = LINKS[0].href;
      for (const link of LINKS) {
        const el = document.querySelector(link.href);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.38) current = link.href;
      }
      setActive(current);
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
    <>
      <header className={cn("site-header", scrolled && "is-scrolled")}>
        {/* Logo slot — the floating preloader logo docks into this position. */}
        <a href="#top" className="nav-mark group" aria-label="Nirixon home">
          <span className="mark-slot">
            <LogoLockup markClassName="h-[42px] w-[42px]" />
          </span>
        </a>

        <nav className="nav-pill" aria-label="Primary">
          {LINKS.map((link) => {
            const isActive = active === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setActive(link.href)}
                className={cn("nav-link", isActive && "active")}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="primary-nav-active"
                    className="nav-active-pill"
                    transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <a href={SCREENING_APP_URL} className="demo-btn" data-cursor="Start">
            <span>Start check-in</span>
            <span className="demo-arrow" aria-hidden>
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </a>
          <button type="button" className="menu-toggle lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] flex flex-col bg-void/95 backdrop-blur-2xl lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between px-5 py-5">
              <LogoLockup markClassName="h-9 w-9" />
              <span className="flex items-center gap-2">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="glass-dark inline-flex h-10 w-10 items-center justify-center rounded-full text-bone"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </div>
            <nav className="flex flex-1 flex-col justify-center gap-1 px-8" aria-label="Mobile">
              {LINKS.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    setActive(link.href);
                    setOpen(false);
                  }}
                  className="border-b border-bone/10 py-4 font-display text-4xl uppercase tracking-wide text-bone transition-colors hover:text-apricot"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  {link.label}
                </motion.a>
              ))}
              <motion.a
                href="#cta"
                onClick={() => setOpen(false)}
                className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-bone px-7 py-3.5 text-sm font-bold text-void"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                Book a demo <ArrowUpRight className="h-4 w-4" />
              </motion.a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
