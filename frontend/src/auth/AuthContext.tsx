import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setAuthToken } from "../api/client";
import type { LoginResponse } from "../api/types";
import { clearAllOfflineData } from "../lib/offlineStorage";

interface AuthState {
  token: string | null;
  role: string | null;
  /** Informed consent for the current in-memory session (not persisted). */
  consentGiven: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => void;
  setConsentGiven: (value: boolean) => void;
}

const TOKEN_KEY = "nirixon_token";
const ROLE_KEY = "nirixon_role";
const CONSENT_KEY = "nirixon_consent";

const defaultAuthState: AuthState = {
  token: null,
  role: null,
  consentGiven: false,
  isAuthenticated: false,
  login: async () => {
    throw new Error("AuthProvider not available");
  },
  logout: () => {},
  setConsentGiven: () => {},
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(TOKEN_KEY);
        if (saved) {
          setAuthToken(saved);
          return saved;
        }
      }
    } catch {}
    return null;
  });

  const [role, setRole] = useState<string | null>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(ROLE_KEY);
      }
    } catch {}
    return null;
  });

  const [consentGiven, setConsentGivenState] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(CONSENT_KEY) === "true";
      }
    } catch {}
    return false;
  });

  const setConsentGiven = useCallback((value: boolean) => {
    setConsentGivenState(value);
    try {
      if (typeof localStorage !== "undefined") {
        if (value) {
          localStorage.setItem(CONSENT_KEY, "true");
        } else {
          localStorage.removeItem(CONSENT_KEY);
        }
      }
    } catch {}
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res: LoginResponse = await api.login({ email, password });
      setAuthToken(res.access_token);
      setToken(res.access_token);
      setRole(res.role);
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          localStorage.setItem(ROLE_KEY, res.role);
        }
      } catch {}
      // Staff accounts don't need the parent screening consent gate.
      if (res.role && res.role !== "parent") {
        setConsentGiven(true);
      }
      return res;
    },
    [setConsentGiven],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setRole(null);
    setConsentGiven(false);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(CONSENT_KEY);
      }
    } catch {}
    clearAllOfflineData().catch((err) => {
      console.warn("Failed to clear offline device data on logout:", err);
    });
  }, [setConsentGiven]);

  const value = useMemo(
    () => ({
      token,
      role,
      consentGiven,
      isAuthenticated: Boolean(token),
      login,
      logout,
      setConsentGiven,
    }),
    [token, role, consentGiven, login, logout, setConsentGiven],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuthState;
}
