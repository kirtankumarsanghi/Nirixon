import { useEffect, useRef } from "react";
import { Check, GraduationCap, HeartHandshake, LogOut } from "lucide-react";
import { AppFooter } from "./components/AppFooter";
import { Crumbs } from "./components/Crumbs";
import { MenuOverlay, Nav } from "./components/Nav";
import { RoleDock } from "./components/RoleDock";
import { SyncStatus } from "./components/SyncStatus";
import { ScrollProgress } from "./components/ScrollProgress";
import { ServerSettingsButton } from "./components/ServerSettings";
import { NotificationSettingsButton } from "./components/NotificationSettings";
import { ROLES, ROLE_ORDER, viewLabel, type View } from "./lib/roles";
import { useT } from "./lib/useT";
import { Localize } from "./lib/localize";
import { AppProvider, useApp } from "./store";
import { cn } from "./utils/cn";
import { PageState } from "./components/PageState";
import { Login } from "./views/Login";
import { LandingPage } from "./landing";
import { Home } from "./views/Home";
import { CheckIn } from "./views/CheckIn";
import { Growth } from "./views/Growth";
import { Share } from "./views/Share";
import { FindHelp } from "./views/FindHelp";
import { Caseload } from "./views/Caseload";
import { SupervisorCaseload } from "./views/SupervisorCaseload";
import { Referrals } from "./views/Referrals";
import { SupervisorReferrals } from "./views/SupervisorReferrals";
import { ClinicalReview } from "./views/ClinicalReview";
import { Cases } from "./views/Cases";
import { WhatIf } from "./views/WhatIf";
import { ParentWhatIf } from "./views/ParentWhatIf";
import { Wellbeing } from "./views/Wellbeing";
import { Training } from "./views/Training";
import { SupervisorTraining } from "./views/SupervisorTraining";
import { ParentTraining } from "./views/ParentTraining";
import { Evidence } from "./views/Evidence";
import { Reports } from "./views/Reports";

function Screen({ view }: { view: View }) {
  const { role, loading, error, reload, checkIns, children } = useApp();

  // Data-driven views show a matching loading / error / empty state until the
  // backend data for the role is ready (prevents rendering on empty lists).
  const needsCheckIns =
    ["home", "growth", "share", "clinical"].includes(view) ||
    (view === "whatif" && role === "parent");
  const needsChildren = ["caseload", "referrals", "cases", "reports"].includes(view);
  if (needsCheckIns || needsChildren) {
    if (loading) return <PageState kind="loading" />;
    if (error) return <PageState kind="error" message={error} onRetry={reload} />;
    if (needsCheckIns && checkIns.length === 0)
      return <PageState kind="empty" message="No check-ins yet. Run a check-in to see results on this screen." />;
    if (needsChildren && children.length === 0)
      return <PageState kind="empty" message="No children in this caseload yet." />;
  }

  switch (view) {
    case "home":
      return <Home />;
    case "checkin":
      return <CheckIn />;
    case "growth":
      return <Growth />;
    case "share":
      return <Share />;
    case "help":
      return <FindHelp />;
    case "caseload":
      return role === "supervisor" ? <SupervisorCaseload /> : <Caseload />;
    case "referrals":
      return role === "supervisor" ? <SupervisorReferrals /> : <Referrals />;
    case "clinical":
      return <ClinicalReview />;
    case "cases":
      return <Cases />;
    case "whatif":
      return role === "parent" ? <ParentWhatIf /> : <WhatIf />;
    case "wellbeing":
      return <Wellbeing />;
    case "training":
      return role === "parent" ? <ParentTraining /> : role === "supervisor" ? <SupervisorTraining /> : <Training />;
    case "evidence":
      return <Evidence />;
    case "reports":
      return <Reports />;
  }
}

const CTA: Record<string, string> = {
  parent: "Start check-in",
  chw: "Screen a child",
  supervisor: "Review referrals",
  clinician: "Demo check-in",
};

/** Where each role's primary CTA leads. Supervisors review referrals. */
const CTA_VIEW: Record<string, View> = {
  parent: "checkin",
  chw: "checkin",
  supervisor: "referrals",
  clinician: "checkin",
};

function Workspace() {
  const { role, view, go, switchRole, menuOpen, setMenuOpen, logout, toast, theme, toggleTheme } = useApp();
  const tr = useT();
  const cfg = ROLES[role];
  const mainRef = useRef<HTMLElement>(null);
  const firstRun = useRef(true);

  // every page gets its own title; after a navigation focus moves to the new page for keyboard /
  // screen-reader users (but not on first load, so the "Skip to content" link stays the first Tab stop)
  useEffect(() => {
    document.title = `${tr(viewLabel(role, view))} · ${tr(cfg.short)} — Nirixon`;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [role, view, cfg.short, tr]);

  const items = cfg.tabs.map((t) => ({
    label: tr(t.label),
    active: view === t.view,
    hint: view === t.view ? tr("You are here") : undefined,
    onClick: () => go(t.view),
  }));
  const ctaView = CTA_VIEW[role] ?? "checkin";
  if (!cfg.tabs.some((t) => t.view === ctaView)) {
    items.push({ label: tr(CTA[role]), active: view === ctaView, hint: view === ctaView ? tr("You are here") : undefined, onClick: () => go(ctaView) });
  }

  return (
    <Localize>
      <div className="min-h-screen">
      <ScrollProgress />
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="fixed top-3 left-3 z-[90] -translate-y-24 rounded-full bg-ink px-5 py-3 text-[13px] font-bold text-paper transition-transform focus:translate-y-0"
      >
        Skip to content
      </button>

      <Nav
        tabs={cfg.tabs.map((t) => ({ id: t.view, label: t.label }))}
        active={view}
        onTab={(id) => go(id as View)}
        onCta={() => go(ctaView)}
        ctaLabel={tr(CTA[role])}
        onMenu={() => setMenuOpen(true)}
        onHome={() => go(cfg.home)}
        user={cfg.user}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <MenuOverlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={items}
        photo={cfg.photo}
        eyebrow={tr(cfg.group)}
        title={cfg.user.name}
        subtitle={`${cfg.user.title}. Demo workspace — records are served by the Nirixon API.`}
        onSignOut={logout}
        footer={
          <div className="space-y-7">
            <div>
              <p className="mb-3 font-mono text-[10.5px] tracking-[0.22em] text-paper/45 uppercase">{tr("Switch workspace")}</p>
              <div className="flex flex-wrap gap-2">
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => (r === role ? setMenuOpen(false) : switchRole(r))}
                    aria-pressed={r === role}
                    tabIndex={menuOpen ? 0 : -1}
                    className={cn(
                      "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                      r === role ? "border-peach bg-peach text-night" : "border-white/20 text-paper/80 hover:border-white/50 hover:text-paper"
                    )}
                  >
                    {tr(ROLES[r].short)}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => {
                setMenuOpen(false);
                go("wellbeing");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-white/10"
            >
              <HeartHandshake className="size-4" /> {tr("Caregiver wellbeing")}
            </button>
            <button
              type="button"
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => {
                setMenuOpen(false);
                go("training");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-white/10"
            >
              <GraduationCap className="size-4" /> {tr("Training")}
            </button>
            <NotificationSettingsButton className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-white/10" />
            <ServerSettingsButton className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-white/10" />
            <button
              type="button"
              onClick={logout}
              tabIndex={menuOpen ? 0 : -1}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10 lg:hidden"
            >
              <LogOut className="size-4" /> {tr("Sign out")}
            </button>
          </div>
        }
      />

      <div className="pt-[100px] sm:pt-[108px]">
        <Crumbs />
      </div>

      <main id="main" ref={mainRef} tabIndex={-1} key={`${role}-${view}`} className="outline-none">
        <Screen view={view} />
      </main>

      <AppFooter />
      <SyncStatus />
      <RoleDock />

      {toast && (
        <div role="status" className="nrx-rise no-print fixed bottom-24 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-3 text-[13px] font-semibold text-paper shadow-[0_24px_50px_-18px_rgba(31,20,9,0.9)]">
          <span className="grid size-6 place-items-center rounded-full bg-peach text-night">
            <Check className="size-3.5" />
          </span>
          {toast}
        </div>
      )}
      </div>
    </Localize>
  );
}

function Shell() {
  const { screen } = useApp();
  useEffect(() => {
    if (screen === "landing") document.title = "Nirixon — Developmental Screening";
    else if (screen === "login") document.title = "Sign in — Nirixon";
  }, [screen]);
  if (screen === "landing") return <LandingPage />;
  return screen === "login" ? <Login /> : <Workspace />;
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
