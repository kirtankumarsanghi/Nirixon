import { ROLES, ROLE_ORDER, type Role, type View } from "./roles";

/**
 * Tiny hash router so every screen has a real, shareable URL:
 *   #/                     → sign-in
 *   #/parent/growth        → Parent workspace, Growth
 *   #/clinician/evidence   → Clinician workspace, Evidence
 * Anything malformed falls back to the nearest valid page.
 */
export type Route =
  | { screen: "landing" }
  | { screen: "login" }
  | { screen: "app"; role: Role; view: View };

/** Views a role may open: its tabs plus the shared check-in flow. */
export function allowedViews(role: Role): View[] {
  return [...ROLES[role].tabs.map((t) => t.view), "checkin"];
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "login") return { screen: "login" };
  const role = ROLE_ORDER.find((r) => r === parts[0]);
  if (!role) return { screen: "landing" };
  const asked = parts[1] as View | undefined;
  const view = asked && allowedViews(role).includes(asked) ? asked : ROLES[role].home;
  return { screen: "app", role, view };
}

export function toHash(route: Route): string {
  if (route.screen === "landing") return "#/";
  if (route.screen === "login") return "#/login";
  return `#/${route.role}/${route.view}`;
}
