import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Activity,
  ClipboardList,
  Stethoscope,
  ArrowRight,
  Lock,
  Mail,
  AlertCircle,
} from "lucide-react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { homePathForRole, roleLabel } from "../auth/roles";
import { useToast } from "../toast/Toast";

const DEMO_ACCOUNTS = [
  {
    email: "parent@example.com",
    password: "changeme",
    role: "parent",
    hint: "Family developmental screening check-in",
    Icon: Users,
    badge: "Family",
  },
  {
    email: "chw@example.com",
    password: "changeme",
    role: "chw",
    hint: "ASHA caseload & village follow-up (Ward 12)",
    Icon: Activity,
    badge: "Frontline",
  },
  {
    email: "supervisor@example.com",
    password: "changeme",
    role: "supervisor",
    hint: "Field supervisor oversight & multi-ward coverage",
    Icon: ClipboardList,
    badge: "Supervisor",
  },
  {
    email: "clinician@example.com",
    password: "changeme",
    role: "internal",
    hint: "Clinician diagnostic review & sandbox simulations",
    Icon: Stethoscope,
    badge: "Clinical",
  },
] as const;

export function LoginScreen() {
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(homePathForRole(role), { replace: true });
    }
  }, [isAuthenticated, navigate, role]);

  async function handleAuthenticate(targetEmail: string, targetPass: string) {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await login(targetEmail.trim().toLowerCase(), targetPass);
      push(`Signed in as ${roleLabel(res.role)}`, "success");
      navigate(homePathForRole(res.role), { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Sign-in failed. Please verify credentials.";
      setErrorMessage(msg);
      push(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await handleAuthenticate(email, password);
  }

  async function quickSignIn(acct: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acct.email);
    setPassword(acct.password);
    await handleAuthenticate(acct.email, acct.password);
  }

  return (
    <section className="login" aria-labelledby="login-title">
      <div className="login__brand">
        <p className="eyebrow">Secure Access</p>
        <h1 id="login-title" className="display display--hero">
          Nirixon
        </h1>
        <p className="lede login__lede">
          Child developmental screening triage, field handoffs, and clinical decision support.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "0.75rem",
            color: "#b04f1f",
            fontSize: "0.88rem",
            fontWeight: 500,
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form className="login__form" onSubmit={onSubmit}>
        <label className="field">
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Mail size={14} /> Email Address
          </span>
          <input
            type="email"
            autoComplete="username"
            placeholder="e.g. parent@example.com"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorMessage(null);
            }}
          />
        </label>
        <label className="field">
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <Lock size={14} /> Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorMessage(null);
            }}
          />
        </label>
        <button
          type="submit"
          className="btn btn--primary btn--block btn--lg"
          disabled={busy || !email || !password}
          style={{ marginTop: "0.5rem" }}
        >
          {busy ? "Authenticating…" : "Sign In to Workspace"}
        </button>
      </form>

      <div className="login__accounts" aria-label="Demo role accounts">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Quick Demo Access (1-Click Sign In)
          </p>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Pass: <code>changeme</code>
          </span>
        </div>

        <ul className="login__account-list" style={{ listStyle: "none", padding: 0, margin: "0.5rem 0", display: "grid", gap: "0.5rem" }}>
          {DEMO_ACCOUNTS.map((acct) => {
            const IconComponent = acct.Icon;
            return (
              <li key={acct.email}>
                <button
                  type="button"
                  className="login__account-card"
                  onClick={() => quickSignIn(acct)}
                  disabled={busy}
                  title={`Sign in as ${roleLabel(acct.role)}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    padding: "0.85rem 1rem",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "rgba(47, 109, 129, 0.12)",
                        color: "var(--teal)",
                        flexShrink: 0,
                      }}
                    >
                      <IconComponent size={18} />
                    </div>
                    <div className="login__account-body" style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <strong>{roleLabel(acct.role)}</strong>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "999px",
                            background: "rgba(33, 23, 9, 0.08)",
                            fontWeight: 600,
                          }}
                        >
                          {acct.badge}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{acct.hint}</span>
                      <code style={{ fontSize: "0.75rem", color: "var(--fog)" }}>{acct.email}</code>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "var(--teal)",
                      flexShrink: 0,
                      paddingLeft: "0.5rem",
                    }}
                  >
                    <span>Enter</span>
                    <ArrowRight size={14} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="consent__nav-hint" style={{ marginTop: "1.5rem", textAlign: "center" }}>
        New to Nirixon? <Link to="/">Explore the public overview and clinical validation</Link>
      </p>
    </section>
  );
}
