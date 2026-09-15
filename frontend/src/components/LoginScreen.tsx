import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../toast/Toast";

export function LoginScreen() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/consent", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/consent", { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Sign-in failed. Please try again.";
      push(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="login" aria-labelledby="login-title">
      <div className="login__brand">
        <p className="eyebrow">Developmental check-in</p>
        <h1 id="login-title" className="display display--hero">
          Nirixon
        </h1>
        <p className="lede login__lede">
          A calm check-in for young children — not a diagnosis. Sign in to begin.
        </p>
      </div>
      <form className="login__form" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
