/** Role helpers — keep staff out of the parent screening funnel by default. */

export type AppRole = "parent" | "chw" | "supervisor" | "internal" | string;

export function normalizeRole(role: string | null | undefined): AppRole {
  return (role ?? "parent").toLowerCase();
}

/** Where each role lands after sign-in. */
export function homePathForRole(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case "chw":
    case "supervisor":
      return "/referrals";
    case "internal":
      return "/sandbox";
    case "parent":
    default:
      return "/consent";
  }
}

/** Catch-all / brand home while authenticated. */
export function defaultAuthenticatedPath(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case "chw":
    case "supervisor":
      return "/referrals";
    case "internal":
      return "/sandbox";
    case "parent":
    default:
      return "/screen";
  }
}

export function isParentRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "parent";
}

export function isFrontlineRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "chw" || r === "supervisor";
}

export function isClinicianRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === "internal";
}

export function roleLabel(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case "chw":
      return "Community health worker";
    case "supervisor":
      return "Field supervisor";
    case "internal":
      return "Clinician";
    case "parent":
      return "Parent / caregiver";
    default:
      return "User";
  }
}

export interface NavItem {
  to: string;
  label: string;
  title?: string;
}

/** Primary nav items for the signed-in role. */
export function navItemsForRole(role: string | null | undefined): NavItem[] {
  const r = normalizeRole(role);

  if (r === "chw" || r === "supervisor") {
    return [
      { to: "/referrals", label: "Referrals", title: "Village caseload & handoffs" },
      { to: "/help", label: "Find Help", title: "DEIC / helplines near a family" },
      { to: "/screen", label: "Assist screen", title: "Optional — help a family complete a check-in" },
    ];
  }

  if (r === "internal") {
    return [
      { to: "/sandbox", label: "Clinician", title: "Model detail & probabilities" },
      { to: "/deferred/what-if", label: "What-if", title: "Simulate screening scenarios" },
      { to: "/help", label: "Find Help", title: "DEIC / early intervention centres" },
      { to: "/screen", label: "Demo screen", title: "Optional — walk a demo check-in" },
    ];
  }

  // Parent / caregiver
  return [
    { to: "/screen", label: "Screening", title: "Start or continue a check-in" },
    { to: "/help", label: "Find Help", title: "Nearby centres & helplines" },
    { to: "/growth", label: "Growth", title: "Trends across check-ins" },
    { to: "/share", label: "Sharing", title: "Family summary & invites" },
  ];
}
