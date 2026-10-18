import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CheckIn, Child, Scores } from "./lib/model";
import { ROLES, type Role, type View } from "./lib/roles";
import { parseHash, toHash, type Route } from "./lib/router";
import { api, referralApi, setAuthToken } from "./api/client";
import { childRecordToChild, sessionsToCheckIns } from "./lib/apiAdapters";

/** Map a backend role string onto a design role id. Backend uses "internal"
 *  for clinicians; everything else passes through, unknown → "parent". */
function mapBackendRole(role: string): Role {
  const mapped = role === "internal" ? "clinician" : role;
  return (ROLES as Record<string, unknown>)[mapped] ? (mapped as Role) : "parent";
}

export interface WhatIfSeed {
  scores: Scores;
  regression: boolean;
  label: string;
}

interface AppCtx {
  screen: "landing" | "login" | "app";
  role: Role;
  view: View;
  login: (role: Role, view?: View) => void;
  /** Authenticate against the backend and enter the workspace. */
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => void;
  go: (view: View) => void;
  switchRole: (role: Role) => void;
  /** Step back inside the workspace — never leaves the workspace for the sign-in page. */
  back: () => void;
  canBack: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;

  checkIns: CheckIn[];
  addCheckIn: (ci: CheckIn) => void;

  children: Child[];
  patchChild: (id: string, patch: Partial<Child>) => void;
  /** Persisted caseload mutations — optimistic, rollback + toast on failure. */
  referChild: (id: string, patch: Partial<Child>) => Promise<void>;
  contactChild: (id: string, patch: Partial<Child>) => Promise<void>;
  outcomeChild: (id: string, patch: Partial<Child>, notes?: string) => Promise<void>;

  /** Backend data state for the current workspace. */
  loading: boolean;
  error: string | null;
  reload: () => void;

  checkInTarget: string | null;
  setCheckInTarget: (id: string | null) => void;
  whatIfSeed: WhatIfSeed | null;
  setWhatIfSeed: (s: WhatIfSeed | null) => void;
  caseId: string | null;
  setCaseId: (id: string | null) => void;

  toast: string | null;
  showToast: (msg: string) => void;
  menuOpen: boolean;
  setMenuOpen: (b: boolean) => void;
}

const Ctx = createContext<AppCtx | null>(null);

interface HistState {
  idx?: number;
  prevApp?: boolean;
}
const histState = () => (window.history.state ?? {}) as HistState;
const toTop = () => window.scrollTo({ top: 0, behavior: "auto" });

export function AppProvider({ children: kids }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkInTarget, setCheckInTarget] = useState<string | null>(null);
  const [whatIfSeed, setWhatIfSeed] = useState<WhatIfSeed | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = window.localStorage.getItem("nirixon-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem("nirixon-theme", theme);
    } catch {
      /* private mode / restricted storage */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#071914" : "#fff4dc");
  }, [theme]);

  /* Browser back / forward / manual URL edits → state. */
  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* not supported */
    }
    const raw = window.location.hash;
    const canon = toHash(parseHash(raw));
    if (raw !== "" && raw !== canon) {
      try {
        window.history.replaceState(histState(), "", canon);
      } catch {
        /* ignore */
      }
    }
    const sync = () => {
      setRoute(parseHash(window.location.hash));
      setMenuOpen(false);
      toTop();
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // Load the real workspace data for the active role. Parents (and clinicians)
  // get their completed screening history; frontline workers get their caseload.
  const activeRole: Role | null = route.screen === "app" ? route.role : null;
  useEffect(() => {
    if (activeRole === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (activeRole === "parent" || activeRole === "clinician") {
          const sessions = await api.getSessions();
          if (!cancelled) setCheckIns(sessionsToCheckIns(sessions));
        }
        if (activeRole === "chw" || activeRole === "supervisor" || activeRole === "clinician") {
          const recs = await referralApi.getChildren({ limit: 500 });
          if (!cancelled) setChildren(recs.map(childRecordToChild));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRole, reloadKey]);

  const navigate = useCallback((wanted: Route, replace = false) => {
    const next = parseHash(toHash(wanted)); // normalise
    const hash = toHash(next);
    const here = parseHash(window.location.hash);
    const st = histState();
    try {
      if (replace) {
        window.history.replaceState({ idx: st.idx ?? 0, prevApp: st.prevApp ?? false }, "", hash);
      } else if (window.location.hash !== hash) {
        window.history.pushState({ idx: (st.idx ?? 0) + 1, prevApp: here.screen === "app" }, "", hash);
      }
    } catch {
      window.location.hash = hash;
    }
    setRoute(next);
    setMenuOpen(false);
    toTop();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      setAuthToken(res.access_token);
      const role = mapBackendRole(res.role);
      navigate({ screen: "app", role, view: ROLES[role].home });
    },
    [navigate],
  );

  /** Apply an optimistic caseload change, persist it, and roll back on failure. */
  const mutateChild = useCallback(
    async (id: string, optimistic: Partial<Child>, call: () => Promise<unknown>, failMsg: string) => {
      const snapshot = children.find((c) => c.id === id);
      setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...optimistic } : c)));
      try {
        await call();
      } catch {
        if (snapshot) setChildren((prev) => prev.map((c) => (c.id === id ? snapshot : c)));
        showToast(failMsg);
      }
    },
    [children, showToast],
  );

  const referChild = useCallback(
    (id: string, patch: Partial<Child>) =>
      mutateChild(id, patch, () => referralApi.oneTouchReferral(id), "Referral failed — change reverted."),
    [mutateChild],
  );
  const contactChild = useCallback(
    (id: string, patch: Partial<Child>) =>
      mutateChild(id, patch, () => referralApi.markContacted(id), "Could not record contact — change reverted."),
    [mutateChild],
  );
  const outcomeChild = useCallback(
    (id: string, patch: Partial<Child>, notes?: string) =>
      mutateChild(
        id,
        patch,
        () =>
          referralApi.recordChildOutcome(id, {
            outcome_notes: notes ?? "Outcome recorded from caseload",
            close_referral: true,
          }),
        "Could not record outcome — change reverted.",
      ),
    [mutateChild],
  );

  const value = useMemo<AppCtx>(() => {
    const role: Role = route.screen === "app" ? route.role : "parent";
    const view: View = route.screen === "app" ? route.view : "home";
    return {
      screen: route.screen,
      role,
      view,
      login: (r, v) => navigate({ screen: "app", role: r, view: v ?? ROLES[r].home }),
      signIn,
      logout: () => navigate({ screen: "landing" }),
      go: (v) => navigate({ screen: "app", role, view: v }),
      switchRole: (r) => navigate({ screen: "app", role: r, view: ROLES[r].home }),
      back: () => {
        if (histState().prevApp === true) window.history.back();
        else navigate({ screen: "app", role, view: ROLES[role].home }, true);
      },
      canBack: histState().prevApp === true,
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
      checkIns,
      addCheckIn: (ci) => setCheckIns((p) => [ci, ...p]),
      children,
      patchChild: (id, patch) => setChildren((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c))),
      referChild,
      contactChild,
      outcomeChild,
      checkInTarget,
      setCheckInTarget,
      whatIfSeed,
      setWhatIfSeed,
      caseId,
      setCaseId,
      toast,
      showToast,
      menuOpen,
      setMenuOpen,
      loading,
      error,
      reload: () => setReloadKey((k) => k + 1),
    };
  }, [route, navigate, signIn, checkIns, children, checkInTarget, whatIfSeed, caseId, toast, showToast, menuOpen, theme, loading, error, referChild, contactChild, outcomeChild]);

  return <Ctx.Provider value={value}>{kids}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
