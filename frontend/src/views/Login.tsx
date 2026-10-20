import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, ArrowUpRight, Eye, EyeOff, Info, Loader2, Lock, Mail } from "lucide-react";
import { MenuOverlay, Nav } from "../components/Nav";
import { ServerSettingsButton } from "../components/ServerSettings";
import { getApiBase } from "../api/client";
import { LogoMark, Wordmark } from "../components/Brand";
import { Photo } from "../components/Photo";
import { Btn, Chip, Display, Eyebrow, Marquee, Reveal } from "../components/ui";
import { ScrollProgress } from "../components/ScrollProgress";
import { PHOTO } from "../photos";
import { ROLES, ROLE_ORDER, type Role, type View } from "../lib/roles";
import { useApp } from "../store";
import { cn } from "../utils/cn";

const STEPS: { n: string; role: Role; view: View; title: string; desc: string; who: string }[] = [
  { n: "01", role: "parent", view: "checkin", who: "Parent", title: "Answer a check-in", desc: "Tap through a short adaptive set of questions and watch the result form live. Try the Hindi toggle." },
  { n: "02", role: "chw", view: "caseload", who: "Health worker", title: "Work a village map", desc: "Open Ward 12's 200-child map, click any square, and send a one-touch referral." },
  { n: "03", role: "supervisor", view: "referrals", who: "Supervisor", title: "Track every referral", desc: "Filter by worker, see what is ready or queued, and confirm the facility handoff." },
  { n: "04", role: "clinician", view: "whatif", who: "Clinician", title: "Cross the safety line", desc: "Drag the lowest area score below −2.0 and watch the model step aside for a direct referral." },
  { n: "05", role: "clinician", view: "evidence", who: "Clinician", title: "Inspect the evidence", desc: "Reported held-out metrics and a confusion matrix — clearly marked as synthetic." },
];

function CircleBadge() {
  const text = "SCREENING AID • NOT A DIAGNOSIS • SAFETY RULE ALWAYS ON • ";
  return (
    <div className="relative size-[190px]">
      <svg viewBox="0 0 200 200" className="nrx-spin-slow absolute inset-0 size-full" aria-hidden>
        <defs>
          <path id="nrx-circ" d="M100,100 m-83,0 a83,83 0 1,1 166,0 a83,83 0 1,1 -166,0" />
        </defs>
        <text fontSize="12" fontWeight="700" fill="#fff4dc" letterSpacing="2">
          <textPath href="#nrx-circ" textLength="518" lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      </svg>
      <div className="absolute inset-[26px] overflow-hidden rounded-full border-[5px] border-night-3 shadow-[0_18px_30px_-12px_rgba(0,0,0,0.7)]">
        <Photo src={PHOTO.girl} alt="" className="rounded-full" eager />
      </div>
    </div>
  );
}

export function Login() {
  const { signIn, signInAs, theme, toggleTheme } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState<Role | null>(null);
  const [active, setActive] = useState<Role>("parent");
  const [tab, setTab] = useState("signin");
  const [menu, setMenu] = useState(false);
  const [apiState, setApiState] = useState<"checking" | "ok" | "down" | null>(null);
  const timers = useRef<number[]>([]);

  // Surface whether the phone can actually reach the configured API host.
  useEffect(() => {
    const base = getApiBase();
    if (!base) {
      setApiState(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    setApiState("checking");
    fetch(`${base}/health`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        setApiState(res.ok && body?.status === "ok" ? "ok" : "down");
      })
      .catch(() => setApiState("down"))
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const ids = ["signin", "roles", "walkthrough"];
    const on = () => {
      let cur = "signin";
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.45) cur = id;
      });
      setTab(cur);
    };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => {
      window.removeEventListener("scroll", on);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const scrollTo = (id: string) => {
    setMenu(false);
    // Tracked so the unmount cleanup in the scroll effect can cancel it.
    timers.current.push(
      window.setTimeout(
        () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        menu ? 450 : 0,
      ),
    );
  };

  const fill = (r: Role) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setError("");
    setEmail("");
    setPw("");
    setShowPw(false);
    setFilled(r);
    const target = ROLES[r].email;
    let i = 0;
    const typeEmail = () => {
      i++;
      setEmail(target.slice(0, i));
      if (i < target.length) timers.current.push(window.setTimeout(typeEmail, 22));
      else {
        let j = 0;
        const typePw = () => {
          j++;
          setPw("changeme".slice(0, j));
          if (j < 8) timers.current.push(window.setTimeout(typePw, 50));
        };
        timers.current.push(window.setTimeout(typePw, 150));
      }
    };
    typeEmail();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), pw);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Sign-in failed. Is the backend running?");
    }
  };

  /** Open a role's workspace, authenticating as its demo account first. */
  const enter = async (r: Role, v?: View) => {
    setError("");
    try {
      await signInAs(r, v);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Is the backend running?");
      document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const ready = email.length > 0 && pw.length > 0;

  return (
    <div className="relative overflow-x-clip">
      <ScrollProgress />

      {/* section rail — mirrors the landing page; uses a blend mode so it reads on light and dark sections */}
      <nav aria-label="Page sections" className="no-print fixed top-1/2 right-6 z-40 hidden -translate-y-1/2 text-white mix-blend-difference xl:block">
        <ul className="flex flex-col items-end gap-1">
          {[
            { id: "signin", label: "Sign in" },
            { id: "roles", label: "Roles" },
            { id: "walkthrough", label: "Walkthrough" },
          ].map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => scrollTo(s.id)}
                aria-label={`Go to ${s.label}`}
                aria-current={tab === s.id ? "true" : undefined}
                className="group flex items-center gap-3 py-2"
              >
                <span className="font-mono text-[10px] font-semibold tracking-[0.22em] uppercase opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  0{i + 1} · {s.label}
                </span>
                <span className={cn("block rounded-full bg-white transition-all duration-300", tab === s.id ? "h-7 w-2" : "size-2 opacity-45 group-hover:opacity-100")} />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Nav
        tabs={[
          { id: "signin", label: "Sign in" },
          { id: "roles", label: "Roles" },
          { id: "walkthrough", label: "Walkthrough" },
        ]}
        active={tab}
        onTab={scrollTo}
        onCta={() => void enter("parent", "checkin")}
        onMenu={() => setMenu(true)}
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <MenuOverlay
        open={menu}
        onClose={() => setMenu(false)}
        photo={PHOTO.blocksGirl}
        eyebrow="Nirixon · demo workspace"
        title="Every child. The next step."
        subtitle="Four connected workspaces, one shared set of records. Pick a door and walk through."
        items={[
          { label: "Sign in", hint: "Access", onClick: () => scrollTo("signin") },
          { label: "Four roles", hint: "Pick a workspace", onClick: () => scrollTo("roles") },
          { label: "Walkthrough", hint: "For evaluators", onClick: () => scrollTo("walkthrough") },
          { label: "Start check-in", hint: "Try it now", onClick: () => void enter("parent", "checkin") },
        ]}
        footer={
          <ServerSettingsButton className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-white/10" />
        }
      />

      {/* ============================ HERO ============================ */}
      <section id="signin" className="relative isolate min-h-screen pt-32 pb-24 sm:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[12%] -z-10 text-center font-display text-[34vw] leading-none text-ink/[0.035] select-none"
        >
          NIRIXON
        </div>

        <div className="mx-auto grid max-w-[1360px] items-center gap-14 px-5 lg:grid-cols-[1.3fr_0.7fr] lg:gap-10 lg:px-8">
          <div className="relative">
            <Eyebrow index="00">Secure access · demo workspace</Eyebrow>
            <h1 className="mt-6 font-display text-[clamp(60px,9.6vw,150px)] leading-[0.88] uppercase">
              <span className="block text-ink">Every child.</span>
              <span
                className="mask-photo block pb-[0.04em]"
                style={{
                  backgroundImage: `linear-gradient(rgba(31,20,9,.28),rgba(31,20,9,.28)), url(${PHOTO.blocks})`,
                  backgroundPosition: "center 55%",
                }}
              >
                The next step.
              </span>
            </h1>
            <p className="mt-7 max-w-[540px] text-[17px] leading-relaxed text-ink-2">
              A five-minute check-in becomes a clear next step — for families, health workers, supervisors and clinicians,
              all looking at the same child.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-10 gap-y-5">
              {[
                ["6", "areas of development"],
                ["3", "result tiers"],
                ["EN · हिं", "check-in languages"],
              ].map(([v, l]) => (
                <div key={l} className="flex items-baseline gap-3">
                  <span className="font-display text-[44px] leading-none text-rust">{v}</span>
                  <span className="max-w-[90px] text-[12px] leading-tight font-medium text-ink-2">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* sign-in card */}
          <div className="relative mx-auto w-full max-w-[470px] lg:mx-0 lg:ml-auto">
            <div className="relative overflow-hidden rounded-[36px] bg-night p-7 text-paper shadow-[0_50px_90px_-40px_rgba(31,20,9,0.95)] sm:p-9">
              <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-peach/15 blur-3xl" />
              <Eyebrow tone="peach">Workspace access</Eyebrow>
              <h2 className="mt-3 font-display text-[44px] leading-[0.95] text-paper uppercase">Welcome back</h2>
              <p className="mt-2 text-[13px] text-paper/60">Sign in, or tap a role to fill in a demo account.</p>

              {apiState === "down" && (
                <p role="alert" className="mt-4 rounded-2xl bg-brick/20 px-4 py-3 text-[12.5px] leading-snug text-[#ffb59f]">
                  Can't reach {getApiBase()}. Use “Change” at the bottom of this card, and make sure the phone is on the
                  same Wi-Fi as the backend.
                </p>
              )}

              <form onSubmit={submit} className="mt-7 space-y-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] text-paper/60 uppercase">
                    <Mail className="size-3.5" /> Email
                  </span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="parent@example.com"
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 text-[14px] text-paper transition placeholder:text-paper/30 focus:border-peach focus:bg-white/10 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] text-paper/60 uppercase">
                    <Lock className="size-3.5" /> Password
                  </span>
                  <span className="relative block">
                    <input
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      value={pw}
                      onChange={(e) => {
                        setPw(e.target.value);
                        setError("");
                      }}
                      placeholder="••••••••"
                      className="w-full rounded-2xl border border-white/12 bg-white/[0.06] py-3.5 pr-12 pl-4 text-[14px] text-paper transition placeholder:text-paper/30 focus:border-peach focus:bg-white/10 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-2 text-paper/60 hover:text-paper"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </span>
                </label>

                {error && (
                  <p role="alert" className="rounded-2xl bg-brick/20 px-4 py-3 text-[12.5px] leading-snug text-[#ffb59f]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!ready || busy}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-full py-2 pr-2 pl-7 text-[14px] font-bold transition-all duration-300",
                    ready ? "bg-peach text-night hover:bg-[#f3a07a]" : "bg-white/10 text-paper/40",
                    ready && !busy && "shadow-[0_0_0_6px_rgba(234,143,99,0.14)]"
                  )}
                >
                  {busy ? "Opening your workspace…" : "Sign in to workspace"}
                  <span className={cn("grid size-11 place-items-center rounded-full transition-transform duration-300", ready ? "bg-night text-peach group-hover:translate-x-0.5" : "bg-white/10")}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  </span>
                </button>
              </form>

              <div className="mt-7 border-t border-white/10 pt-5">
                <p className="mb-3 font-mono text-[10px] tracking-[0.22em] text-paper/45 uppercase">Quick fill · password “changeme”</p>
                <div className="flex flex-wrap gap-2">
                  {ROLE_ORDER.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => fill(r)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-[12px] font-semibold transition-all",
                        filled === r ? "border-peach bg-peach/15 text-peach" : "border-white/15 text-paper/80 hover:border-white/40 hover:text-paper"
                      )}
                    >
                      {ROLES[r].short}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void enter("parent", "checkin")}
                className="mt-4 flex w-full items-center justify-between rounded-full bg-peach py-2 pr-2 pl-6 text-[14px] font-bold text-night transition-all hover:bg-[#f3a07a] active:scale-[0.99]"
              >
                Start a demo check-in
                <span className="grid size-10 place-items-center rounded-full bg-night text-peach">
                  <ArrowRight className="size-4" />
                </span>
              </button>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="min-w-0">
                  <p className="font-mono text-[9.5px] tracking-[0.2em] text-paper/40 uppercase">API server</p>
                  <p className="truncate font-mono text-[10.5px] text-paper/60">{getApiBase() || "same origin"}</p>
                  {apiState && (
                    <p
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1.5 font-mono text-[9.5px] font-semibold tracking-[0.14em] uppercase",
                        apiState === "ok" ? "text-[#9ccf74]" : apiState === "down" ? "text-[#ff9b84]" : "text-paper/40"
                      )}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {apiState === "checking" ? "checking…" : apiState === "ok" ? "connected" : "unreachable"}
                    </p>
                  )}
                </div>
                <ServerSettingsButton className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-[11.5px] font-semibold text-paper/75 transition-colors hover:border-white/40 hover:text-paper">
                  Change
                </ServerSettingsButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================== MARQUEE =========================== */}
      <div className="border-y border-line-2/60 bg-paper/60 py-6">
        <Marquee
          items={[
            "6 areas of development",
            "English · हिन्दी · Hinglish",
            "Safety rule always on",
            "3 result tiers",
            "Screening aid, not a diagnosis",
            "ASHA · Anganwadi · DEIC ready",
          ]}
        />
      </div>

      {/* ============================ ROLES ============================ */}
      <section id="roles" className="relative bg-night py-24 text-paper sm:py-32">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 text-center font-display text-[30vw] leading-none text-white/[0.025] select-none">
          FOUR
        </div>
        <div className="relative mx-auto max-w-[1360px] px-5 lg:px-8">
          <Reveal>
            <Eyebrow index="01" tone="peach">
              Four workspaces
            </Eyebrow>
            <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.4fr_0.6fr]">
              <h2 className="font-display text-[clamp(52px,8vw,128px)] leading-[0.9] uppercase">
                Four roles.
                <br />
                <span className="text-peach">One child.</span>
              </h2>
              <div className="flex flex-col items-start gap-8 lg:items-end">
                <div className="hidden lg:block">
                  <CircleBadge />
                </div>
                <p className="max-w-[360px] text-[15px] leading-relaxed text-paper/70 lg:text-right">
                  Hover or tap a panel, then step inside. Everything you do in one workspace shows up in the others.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120} className="mt-14">
            <div className="flex h-[800px] flex-col gap-3 sm:h-[720px] lg:h-[600px] lg:flex-row">
              {ROLE_ORDER.map((r, i) => {
                const cfg = ROLES[r];
                const on = active === r;
                return (
                  <div
                    key={r}
                    role="button"
                    tabIndex={0}
                    aria-expanded={on}
                    onMouseEnter={() => setActive(r)}
                    onFocus={() => setActive(r)}
                    onClick={() => setActive(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(r);
                      }
                    }}
                    className={cn(
                      "relative min-h-[84px] basis-0 cursor-pointer overflow-hidden rounded-[32px] transition-[flex-grow] duration-[850ms] ease-[cubic-bezier(0.7,0,0.2,1)]",
                      on ? "grow-[6]" : "grow-[1]"
                    )}
                  >
                    <img
                      src={cfg.photo}
                      alt=""
                      loading="lazy"
                      className={cn("absolute inset-0 size-full object-cover transition-all duration-[1000ms]", on ? "scale-100 saturate-100" : "scale-110 saturate-50")}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-night/5" />
                    <span className="absolute top-5 left-6 font-mono text-[11px] font-semibold tracking-[0.2em] text-paper/85">[0{i + 1}]</span>

                    {/* collapsed label */}
                    <div className={cn("absolute inset-0 flex items-center p-6 transition-opacity duration-500 lg:items-end lg:justify-center", on ? "opacity-0" : "opacity-100 delay-300")}>
                      <span className="font-display text-[28px] leading-none text-paper uppercase lg:rotate-180 lg:text-[36px] lg:[writing-mode:vertical-rl]">
                        {cfg.short}
                      </span>
                    </div>

                    {/* expanded content */}
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 w-full p-6 transition-all duration-500 sm:p-8 lg:w-[560px]",
                        on ? "translate-y-0 opacity-100 delay-300" : "pointer-events-none translate-y-5 opacity-0"
                      )}
                    >
                      <Chip tone="night">{cfg.group}</Chip>
                      <h3 className="mt-4 font-display text-[clamp(38px,4.4vw,64px)] leading-[0.95] text-paper uppercase">{cfg.label}</h3>
                      <p className="mt-3 max-w-[440px] text-[14px] leading-relaxed text-paper/80">{cfg.blurb}</p>
                      <div className="mt-6 flex flex-wrap items-center gap-4">
                        <Btn
                          variant="peach"
                          size="lg"
                          tabIndex={on ? 0 : -1}
                          onClick={(e) => {
                            e.stopPropagation();
                            void enter(r);
                          }}
                        >
                          Enter workspace <ArrowUpRight className="size-4" />
                        </Btn>
                        <span className="font-mono text-[11px] text-paper/55">{cfg.email}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ========================== WALKTHROUGH ========================== */}
      <section id="walkthrough" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-[1360px] px-5 lg:px-8">
          <Reveal>
            <Eyebrow index="02">For faculty & evaluators</Eyebrow>
            <div className="mt-6 grid items-end gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <Display as="h2" className="text-[clamp(48px,7vw,108px)]">
                A five-stop
                <br />
                <span className="text-sea">walkthrough.</span>
              </Display>
              <p className="max-w-[380px] text-[15px] leading-relaxed text-ink-2">
                Each stop signs you in as the right person and drops you on the screen that matters. Use the “viewing as”
                dock at the bottom to switch roles any time.
              </p>
            </div>
          </Reveal>

          <ul className="mt-14 border-t border-ink/80">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 60}>
                <li className="border-b border-line-2">
                  <button
                    type="button"
                    onClick={() => void enter(s.role, s.view)}
                    className="group grid w-full grid-cols-[48px_1fr_auto] items-center gap-4 py-7 text-left transition-all duration-300 hover:bg-card hover:px-4 sm:grid-cols-[72px_220px_1fr_auto] sm:gap-8"
                  >
                    <span className="font-mono text-[13px] font-semibold text-rust">{s.n}</span>
                    <span className="hidden sm:block">
                      <span className="block font-display text-[34px] leading-none uppercase transition-colors group-hover:text-rust">{s.title}</span>
                    </span>
                    <span>
                      <span className="mb-1 block font-display text-[26px] leading-none uppercase sm:hidden">{s.title}</span>
                      <span className="block max-w-[560px] text-[14px] leading-relaxed text-ink-2">{s.desc}</span>
                      <span className="mt-2 block font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">As {s.who}</span>
                    </span>
                    <span className="grid size-12 place-items-center rounded-full border border-ink/30 transition-all duration-300 group-hover:rotate-45 group-hover:border-rust group-hover:bg-rust group-hover:text-white">
                      <ArrowUpRight className="size-5" />
                    </span>
                  </button>
                </li>
              </Reveal>
            ))}
          </ul>

          <div className="mt-12 flex items-center gap-3 rounded-2xl border border-line-2 bg-sand/60 px-5 py-4 text-[14px] font-medium">
            <Info className="size-5 shrink-0 text-rust" />
            Evaluated on synthetic data. Clinical validation pending. Screening aid, not a diagnosis.
          </div>
        </div>
      </section>

      <footer className="border-t border-line-2/70 py-12">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-8 px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <LogoMark size={38} />
            <Wordmark />
          </div>
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              ["Sign in", "signin"],
              ["Four roles", "roles"],
              ["Walkthrough", "walkthrough"],
            ].map(([label, id]) => (
              <li key={id}>
                <button type="button" onClick={() => scrollTo(id)} className="text-[14px] font-semibold transition-colors hover:text-rust">
                  {label}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => void enter("parent", "checkin")} className="text-[14px] font-semibold transition-colors hover:text-rust">
                Start check-in
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center gap-2 text-[14px] font-semibold transition-colors hover:text-rust"
              >
                <ArrowUp className="size-4" /> Back to top
              </button>
            </li>
          </ul>
        </div>
        <p className="mx-auto mt-8 max-w-[1360px] px-5 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase lg:px-8">
          Demo workspace · records served by the Nirixon API · Screening aid, not a diagnosis
        </p>
      </footer>
    </div>
  );
}
