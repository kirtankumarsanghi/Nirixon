import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar";

export function AppLayout() {
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NavBar />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
