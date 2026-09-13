const SESSION_KEY = "nirixon_screen_session_id";
const COVERED_KEY = "nirixon_screen_covered_domains";

export function loadSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
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
  } catch {
    // ignore
  }
}
