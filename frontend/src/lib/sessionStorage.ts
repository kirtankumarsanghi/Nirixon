const SESSION_KEY = "nirixon_screen_session_id";
const COVERED_KEY = "nirixon_screen_covered_domains";
// Tracks the timestamp of the most recent Begin click.
// Any session saved before this timestamp is stale (different age bracket)
// and must NOT be resumed — the user clicked Begin with new inputs.
const SESSION_STARTED_AT_KEY = "nirixon_screen_started_at";
// Written once per actual browser page navigation (not per HMR module reload).
// Survives Vite hot-reload without invalidating an in-progress session.
const PAGE_NAV_KEY = "nirixon_page_nav_ts";
function getPageNavTs(): string {
  try {
    let ts = sessionStorage.getItem(PAGE_NAV_KEY);
    if (!ts) {
      ts = Date.now().toString();
      sessionStorage.setItem(PAGE_NAV_KEY, ts);
    }
    return ts;
  } catch {
    return Date.now().toString();
  }
}

export function loadSessionId(): string | null {
  try {
    // Only resume if this session was started in the current page context
    // (i.e. started_at timestamp matches the current page load or is newer).
    // This prevents resuming a session from a previous Begin click with
    // a different age — the old questions would be wrong for the new age.
    const startedAt = sessionStorage.getItem(SESSION_STARTED_AT_KEY);
    if (!startedAt || Number(startedAt) < Number(getPageNavTs())) {
      // Session predates this page load — it's stale, clear it
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(COVERED_KEY);
      sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
      return null;
    }
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  try {
    const now = Date.now().toString();
    sessionStorage.setItem(SESSION_KEY, id);
    // Stamp both the session and the page-nav key with the same timestamp
    // so loadSessionId() sees this session as valid (not stale).
    sessionStorage.setItem(SESSION_STARTED_AT_KEY, now);
    sessionStorage.setItem(PAGE_NAV_KEY, now);
  } catch {
    // sessionStorage may be unavailable (private mode); resume won't work
  }
}

export function loadCoveredDomains(): Set<string> {
  try {
    const raw = sessionStorage.getItem(COVERED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((d): d is string => typeof d === "string"));
  } catch {
    return new Set();
  }
}

export function saveCoveredDomains(domains: Set<string>): void {
  try {
    sessionStorage.setItem(COVERED_KEY, JSON.stringify([...domains]));
  } catch {
    // ignore
  }
}

export function clearSessionId(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(COVERED_KEY);
    sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
  } catch {
    // ignore
  }
}
