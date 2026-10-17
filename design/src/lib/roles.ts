import { PHOTO } from "../photos";

export type Role = "parent" | "chw" | "supervisor" | "clinician";
export type View =
  | "home"
  | "checkin"
  | "growth"
  | "share"
  | "help"
  | "caseload"
  | "referrals"
  | "clinical"
  | "cases"
  | "whatif"
  | "evidence";

export interface RoleConfig {
  id: Role;
  short: string;
  label: string;
  group: string;
  email: string;
  blurb: string;
  photo: string;
  user: { name: string; initials: string; title: string };
  home: View;
  tabs: { view: View; label: string }[];
}

export const ROLE_ORDER: Role[] = ["parent", "chw", "supervisor", "clinician"];

/** Human label for a view inside a role (used by breadcrumbs, menu, footer and the page title). */
export function viewLabel(role: Role, view: View): string {
  const tab = ROLES[role].tabs.find((t) => t.view === view);
  if (tab) return tab.label;
  if (view === "checkin") return role === "clinician" ? "Demo check-in" : "Check-in";
  if (view === "clinical") return "Clinical check";
  if (view === "referrals") return "Referrals";
  return view;
}

export const ROLES: Record<Role, RoleConfig> = {
  parent: {
    id: "parent",
    short: "Parent",
    label: "Parent / caregiver",
    group: "Family",
    email: "parent@example.com",
    blurb: "Answer a short check-in, watch the picture form, and get activities to try at home.",
    photo: PHOTO.motherChild,
    user: { name: "Priya Sharma", initials: "PS", title: "Parent of Aarav" },
    home: "home",
    tabs: [
      { view: "home", label: "Today" },
      { view: "checkin", label: "Check-in" },
      { view: "growth", label: "Growth" },
      { view: "whatif", label: "What-if" },
      { view: "share", label: "Share" },
      { view: "help", label: "Find help" },
    ],
  },
  chw: {
    id: "chw",
    short: "Health Worker",
    label: "Community health worker",
    group: "Frontline",
    email: "chw@example.com",
    blurb: "A live map of every child in your ward — who is overdue, who needs referring, and who to visit today.",
    photo: PHOTO.nurses,
    user: { name: "Sunita Devi", initials: "SD", title: "ASHA · Ward 12" },
    home: "caseload",
    tabs: [
      { view: "caseload", label: "Caseload" },
      { view: "referrals", label: "Referrals" },
      { view: "checkin", label: "Screen a child" },
      { view: "help", label: "Find help" },
    ],
  },
  supervisor: {
    id: "supervisor",
    short: "Supervisor",
    label: "Field supervisor",
    group: "Oversight",
    email: "supervisor@example.com",
    blurb: "See coverage by worker, spot gaps early, and make sure every referral reaches a facility.",
    photo: PHOTO.women,
    user: { name: "Rekha Sharma", initials: "RS", title: "Supervisor · Ward 12" },
    home: "caseload",
    tabs: [
      { view: "caseload", label: "Team & caseload" },
      { view: "referrals", label: "Referrals" },
      { view: "checkin", label: "Screen a child" },
      { view: "help", label: "Find help" },
    ],
  },
  clinician: {
    id: "clinician",
    short: "Clinician",
    label: "Clinician",
    group: "Clinical",
    email: "clinician@example.com",
    blurb: "Review referrals, test what-if scenarios against the safety rule, and inspect the evidence.",
    photo: PHOTO.doctor,
    user: { name: "Dr. Meera Iyer", initials: "MI", title: "Paediatrician" },
    home: "clinical",
    tabs: [
      { view: "clinical", label: "Clinical check" },
      { view: "cases", label: "Referrals" },
      { view: "whatif", label: "What-if" },
      { view: "evidence", label: "Evidence" },
      { view: "help", label: "Find help" },
    ],
  },
};
