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

interface AuthState {
  token: string | null;
  role: string | null;
  /** Informed consent for the current in-memory session (not persisted). */
  consentGiven: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setConsentGiven: (value: boolean) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    const res: LoginResponse = await api.login({ email, password });
    setAuthToken(res.access_token);
    setToken(res.access_token);
    setRole(res.role);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setRole(null);
    setConsentGiven(false);
  }, []);

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
    [token, role, consentGiven, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
