import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  defaultAuthenticatedPath,
  navItemsForRole,
  roleLabel,
} from "../auth/roles";

export function NavBar() {
  const { isAuthenticated, logout, role } = useAuth();
  const location = useLocation();
  const onScreen = location.pathname.startsWith("/screen");
  const items = navItemsForRole(role);
  const home = defaultAuthenticatedPath(role);

  return (
    <header className="nav">
      <div className="nav__inner">
        <Link to={isAuthenticated ? home : "/"} className="nav__brand">
          Nirixon
        </Link>
        <nav className="nav__links" aria-label="Primary">
          {isAuthenticated ? (
            <>
              {role ? (
                <span className="nav__role" title={`Signed in as ${role}`}>
                  {roleLabel(role)}
                </span>
              ) : null}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "nav__link nav__link--active" : "nav__link"
                  }
                  title={item.title}
                >
                  {item.label}
                </NavLink>
              ))}
              <button
                type="button"
                className="nav__link nav__button"
                onClick={logout}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  isActive ? "nav__link nav__link--active" : "nav__link"
                }
              >
                Sign in
              </NavLink>
              {!onScreen ? (
                <Link to="/login" className="nav__cta">
                  Start check-in
                  <span className="nav__cta-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              ) : null}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
