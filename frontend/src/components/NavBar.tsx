import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV = [
  { to: "/screen", label: "Screening" },
  { to: "/growth", label: "Growth" },
  { to: "/share", label: "Sharing" },
  { to: "/sandbox", label: "Clinician" },
] as const;

export function NavBar() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <header className="nav">
      <div className="nav__inner">
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
                  title={
                    item.to === "/growth"
                      ? "Growth trends"
                      : item.to === "/share"
                        ? "Family sharing"
                        : item.to === "/sandbox"
                          ? "Clinician tools"
                          : undefined
                  }
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
      </div>
    </header>
  );
}
