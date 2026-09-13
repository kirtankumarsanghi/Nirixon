import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/screen", label: "Screening" },
  { to: "/growth", label: "Growth trends" },
  { to: "/share", label: "Family sharing" },
  { to: "/sandbox", label: "Clinician tools" },
] as const;

export function NavBar() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <header className="nav">
      <Link to={isAuthenticated ? "/screen" : "/login"} className="nav__brand">
        Nirixon
      </Link>
      <nav className="nav__links" aria-label="Primary">
        {isAuthenticated ? (
          <>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "nav__link nav__link--active" : "nav__link"
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button type="button" className="nav__link nav__button" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              isActive ? "nav__link nav__link--active" : "nav__link"
            }
          >
            Sign in
          </NavLink>
        )}
      </nav>
    </header>
  );
}
