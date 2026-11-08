import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  ClipboardCheck,
  ClipboardCopy,
  Clock3,
  Compass,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  LocateFixed,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  PhoneCall,
  Printer,
  Search,
  Send,
  Stethoscope,
  Tent,
} from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { StatCard } from "../components/StatCard";
import { Btn, Chip, Display, Eyebrow, GlowDot, Page, Reveal } from "../components/ui";
import { api, facilitiesApi, referralApi } from "../api/client";
import type {
  Facility,
  FacilityTrust,
  FacilityType,
  FacilitiesResponse,
  ReferralRecord,
  WorkerSuggestion,
} from "../api/types";
import {
  childLabel,
  DOMAINS,
  domainKeys,
  domainStatus,
  evaluate,
  fmtDate,
  STATUS_META,
  TIER_META,
  type CheckIn,
  type Child,
  type Scores,
  type Tier,
} from "../lib/model";
import { useT } from "../lib/useT";
import { useApp } from "../store";
import { cn } from "../utils/cn";

type Mode = "directory" | "workspace";
type MapVisualMode = "radar" | "street";

const TYPE_COL: Record<
  FacilityType,
  { hex: string; short: string; chip: "sea" | "moss" | "amber" | "lilac" | "rust" | "brick" | "sand" }
> = {
  DEIC: { hex: "#5aa6c4", short: "DEIC", chip: "sea" },
  RBSK: { hex: "#8fbf5a", short: "RBSK", chip: "moss" },
  "District Hospital": { hex: "#e8b13a", short: "DH", chip: "amber" },
  CHC: { hex: "#9a6aa6", short: "CHC", chip: "lilac" },
  PHC: { hex: "#d27a24", short: "PHC", chip: "rust" },
  Hospital: { hex: "#c8452f", short: "HOSP", chip: "brick" },
  Clinic: { hex: "#6e9a3a", short: "CLIN", chip: "sand" },
};

const FALLBACK_COL = { hex: "#8a7a63", short: "FAC", chip: "sand" as const };
const colOf = (t: FacilityType) => TYPE_COL[t] ?? FALLBACK_COL;

/** Provenance is shown, never hidden: official > verified > mapped-only. */
const TRUST_CHIP: Record<FacilityTrust["level"], { tone: "moss" | "sea" | "sand"; label: string }> = {
  official: { tone: "moss", label: "Government listing" },
  verified: { tone: "sea", label: "Verified" },
  unverified: { tone: "sand", label: "Mapped only" },
};

const SAMPLE_PINS = [
  { pin: "110029", label: "South Delhi" },
  { pin: "110001", label: "New Delhi" },
  { pin: "110054", label: "North Delhi" },
  { pin: "400012", label: "Mumbai" },
  { pin: "560029", label: "Bengaluru" },
  { pin: "999999", label: "Unserved PIN" },
];

interface DomainClinicalRoute {
  service: string;
  subspecialtyId: "speech_audio" | "dev_peds" | "neuro_motor" | "learning_cgc";
  ruleOut: string;
  preferredTypes: FacilityType[];
  parentQuestion: string;
}

const DOMAIN_ROUTES: Record<string, DomainClinicalRoute> = {
  comm: {
    service: "Audiology & Speech-Language Therapy (DEIC / ENT)",
    subspecialtyId: "speech_audio",
    ruleOut: "OAE / BERA audiological hearing rule-out before expressive language workup",
    preferredTypes: ["DEIC", "District Hospital", "RBSK"],
    parentQuestion: "Should we do a hearing check (OAE/BERA) alongside speech-language therapy?",
  },
  listening_speaking: {
    service: "Audiology & Receptive/Expressive Speech Clinic",
    subspecialtyId: "speech_audio",
    ruleOut: "Bilateral hearing & auditory processing check + classroom seating accommodation",
    preferredTypes: ["DEIC", "District Hospital", "Hospital"],
    parentQuestion: "Could a hearing check or speech evaluation help with following spoken instructions?",
  },
  gross: {
    service: "Paediatric Physiotherapy & Neuromotor Early Intervention",
    subspecialtyId: "neuro_motor",
    ruleOut: "Neuromuscular tone, postural reflex, and orthopaedic hip/gait evaluation",
    preferredTypes: ["DEIC", "District Hospital", "CHC"],
    parentQuestion: "What daily physical therapy exercises can strengthen balance and movement at home?",
  },
  fine: {
    service: "Paediatric Occupational Therapy (Fine Motor & Sensory)",
    subspecialtyId: "neuro_motor",
    ruleOut: "Hand-eye coordination, pincer/grasp dexterity, and visual-motor acuity check",
    preferredTypes: ["DEIC", "RBSK", "Clinic"],
    parentQuestion: "Can an occupational therapist show us hand-strengthening and grasp activities?",
  },
  motor: {
    service: "Occupational & Physical Therapy (School-Age Praxis)",
    subspecialtyId: "neuro_motor",
    ruleOut: "Developmental coordination & visual-motor integration assessment",
    preferredTypes: ["DEIC", "District Hospital", "Hospital"],
    parentQuestion: "How can we support handwriting grip and physical coordination at school?",
  },
  social: {
    service: "Developmental Paediatrics & Social-Communication Clinic",
    subspecialtyId: "dev_peds",
    ruleOut: "Joint attention, reciprocal play, and INCLEN/M-CHAT neurodevelopmental evaluation",
    preferredTypes: ["DEIC", "District Hospital"],
    parentQuestion: "Can we do a full developmental play and social-communication assessment at the DEIC?",
  },
  emotion_conduct: {
    service: "Child Guidance Clinic (CGC) & Behavioural Psychology",
    subspecialtyId: "learning_cgc",
    ruleOut: "Sleep, environmental stressors, caregiver wellbeing, and home-school consistency",
    preferredTypes: ["District Hospital", "DEIC", "Hospital"],
    parentQuestion: "What structured emotional-regulation routines can we use at home and school?",
  },
  attention: {
    service: "Developmental Paediatrics & Child Guidance (Attention)",
    subspecialtyId: "learning_cgc",
    ruleOut: "Sleep quality, iron/anaemia screen, vision/hearing check, and teacher concordance",
    preferredTypes: ["DEIC", "District Hospital", "Hospital"],
    parentQuestion: "Since attention varies between home and school, what classroom supports should we try first?",
  },
  cog: {
    service: "Early Intervention Special Educator & Developmental Paediatrics",
    subspecialtyId: "dev_peds",
    ruleOut: "Sensory (vision/hearing) screen + nutritional/anaemia evaluation",
    preferredTypes: ["DEIC", "RBSK", "District Hospital"],
    parentQuestion: "What play-based early learning activities match my child's current stage?",
  },
  reading: {
    service: "Special Education & Learning Assessment (DEIC / CGC)",
    subspecialtyId: "learning_cgc",
    ruleOut: "Snellen visual acuity / refraction rule-out + phonological decoding assessment",
    preferredTypes: ["DEIC", "District Hospital", "Clinic"],
    parentQuestion: "Should we check vision first and then evaluate phonics/reading support?",
  },
  writing: {
    service: "Occupational Therapy & Remedial Special Education",
    subspecialtyId: "learning_cgc",
    ruleOut: "Fine-motor graphomotor grip vs. orthographic spelling rule-out",
    preferredTypes: ["DEIC", "District Hospital", "Clinic"],
    parentQuestion: "Is the writing difficulty mainly hand fatigue/grip or spelling and sentence structure?",
  },
  numbers: {
    service: "Remedial Special Education & Cognitive Assessment",
    subspecialtyId: "learning_cgc",
    ruleOut: "Number-sense / working memory assessment & instructional gap check",
    preferredTypes: ["DEIC", "District Hospital", "Clinic"],
    parentQuestion: "How can we use everyday objects at home to build number sense?",
  },
  adaptive: {
    service: "Early Intervention & Everyday Independence (ADL) Therapy",
    subspecialtyId: "neuro_motor",
    ruleOut: "Fine motor, oral-motor feeding, and sensory routine evaluation",
    preferredTypes: ["RBSK", "DEIC", "CHC"],
    parentQuestion: "How can we break dressing and feeding into small step-by-step routines?",
  },
};

const SUBSPECIALTY_FILTERS = [
  { id: "all", label: "All services" },
  { id: "dev_peds", label: "Developmental / DEIC" },
  { id: "speech_audio", label: "Speech & hearing" },
  { id: "neuro_motor", label: "OT / Physiotherapy" },
  { id: "learning_cgc", label: "Child guidance & learning" },
] as const;

type SubspecialtyId = (typeof SUBSPECIALTY_FILTERS)[number]["id"];
type TierFilterId = "all" | "deic_rbsk" | "gov_hosp";

const C = 220;
const R = 190;

const shortDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

function agoShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const d = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
  return d === 0 ? "today" : `${d}d ago`;
}

function formatFacilityTarget(f: Facility): string {
  return `${f.name} (${f.type}, ~${f.km} km · ${f.district})`;
}

function referralMatchesFacility(ref: ReferralRecord | null | undefined, f: Facility): boolean {
  if (!ref || !ref.to_facility) return false;
  const target = ref.to_facility.toLowerCase();
  const name = f.name.toLowerCase();
  return target.includes(name) || name.includes(target);
}

function getFlaggedDomains(
  scores: Scores | undefined | null,
): Array<{ key: string; z: number; label: string; route: DomainClinicalRoute }> {
  if (!scores) return [];
  return domainKeys(scores)
    .filter((k) => scores[k] < -1.0)
    .sort((a, b) => scores[a] - scores[b])
    .map((key) => ({
      key,
      z: scores[key],
      label: DOMAINS[key]?.label ?? key,
      route: DOMAIN_ROUTES[key] ?? {
        service: "Multidisciplinary Developmental Evaluation (DEIC)",
        subspecialtyId: "dev_peds",
        ruleOut: "Comprehensive paediatric & sensory rule-out",
        preferredTypes: ["DEIC", "District Hospital"],
        parentQuestion: "What follow-up assessment do you recommend for this area?",
      },
    }));
}

function facilityMatchesSubspecialty(f: Facility, sub: SubspecialtyId): boolean {
  if (sub === "all") return true;
  const specs = f.specialty.map((s) => s.toLowerCase());
  const nameLower = f.name.toLowerCase();
  if (sub === "dev_peds") {
    return f.type === "DEIC" || f.type === "RBSK" || specs.includes("developmental") || specs.includes("pediatric");
  }
  if (sub === "speech_audio") {
    return (
      f.type === "DEIC" ||
      f.type === "District Hospital" ||
      /speech|audio|hearing|ent|deic/i.test(nameLower) ||
      specs.includes("developmental") ||
      specs.includes("therapy")
    );
  }
  if (sub === "neuro_motor") {
    return (
      f.type === "DEIC" ||
      f.type === "RBSK" ||
      f.type === "CHC" ||
      /physio|occupational|rehab|ortho|deic/i.test(nameLower) ||
      specs.includes("therapy") ||
      specs.includes("developmental")
    );
  }
  if (sub === "learning_cgc") {
    return (
      f.type === "DEIC" ||
      f.type === "District Hospital" ||
      /guidance|psych|mental|learning|child|deic/i.test(nameLower) ||
      specs.includes("mental_health") ||
      specs.includes("developmental")
    );
  }
  return true;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type LabelBox = { x: number; y: number; w: number; h: number };
type Placed = {
  f: Facility;
  i: number;
  x: number;
  y: number;
  col: ReturnType<typeof colOf>;
  text: string;
  bx: number;
  by: number;
  w: number;
  h: number;
  anchor: "middle" | "start" | "end";
  tx: number;
  ty: number;
};

const LABEL_SIZE = 10;
const LABEL_TRACKING = 1;
const CHAR_W = LABEL_SIZE * 0.6 + LABEL_TRACKING;
const LABEL_PAD = 5;
const LABEL_H = 14;
const LABEL_GAP = 12;

function placeLabels(
  list: Facility[],
  maxKm: number,
  origin: { lat: number; lng: number } | null,
): Placed[] {
  const usedAngles: number[] = [];
  const pts = list
    .map((f, i) => {
      let a: number;
      if (origin && Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
        const dLat = f.lat - origin.lat;
        const dLng = (f.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180);
        if (Math.hypot(dLat, dLng) > 1e-4) {
          // True geographic compass bearing: North (+dLat) = -90 deg (top), East (+dLng) = 0 deg (right)
          a = Math.atan2(-dLat, dLng);
        } else {
          a = ((-90 + i * (360 / Math.max(1, list.length)) + 28) * Math.PI) / 180;
        }
      } else {
        a = ((-90 + i * (360 / Math.max(1, list.length)) + 28) * Math.PI) / 180;
      }
      // Prevent exact angular overlap when two facilities share a hospital campus
      while (usedAngles.some((prev) => Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev))) < 0.16)) {
        a += 0.2;
      }
      usedAngles.push(a);

      const r = Math.max(24, (Math.max(0.4, Math.min(f.km, maxKm)) / maxKm) * R);
      return { f, i, x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
    })
    .sort((p, q) => Math.hypot(p.x - C, p.y - C) - Math.hypot(q.x - C, q.y - C));

  const taken: LabelBox[] = [{ x: C - 34, y: C + 18, w: 68, h: 16 }];
  for (const p of pts) taken.push({ x: p.x - 12, y: p.y - 12, w: 24, h: 24 });
  const hit = (b: LabelBox) => taken.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);

  type Cand = { bx: number; by: number; anchor: "middle" | "start" | "end"; tx: number; ty: number };
  return pts.map((p) => {
    const text = `${colOf(p.f.type).short} · ${p.f.km} km`;
    const w = text.length * CHAR_W + LABEL_PAD * 2;
    const cands: Cand[] = [
      { bx: p.x - w / 2, by: p.y - LABEL_GAP - LABEL_H, anchor: "middle", tx: p.x, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x - w / 2, by: p.y + LABEL_GAP, anchor: "middle", tx: p.x, ty: p.y + LABEL_GAP + LABEL_H - 4 },
      { bx: p.x + LABEL_GAP, by: p.y - LABEL_H / 2, anchor: "start", tx: p.x + LABEL_GAP + LABEL_PAD, ty: p.y + 4 },
      { bx: p.x - LABEL_GAP - w, by: p.y - LABEL_H / 2, anchor: "end", tx: p.x - LABEL_GAP - LABEL_PAD, ty: p.y + 4 },
      { bx: p.x + 8, by: p.y - LABEL_GAP - LABEL_H, anchor: "start", tx: p.x + 8 + LABEL_PAD, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x - 8 - w, by: p.y - LABEL_GAP - LABEL_H, anchor: "end", tx: p.x - 8 - LABEL_PAD, ty: p.y - LABEL_GAP - 4 },
      { bx: p.x + 8, by: p.y + LABEL_GAP, anchor: "start", tx: p.x + 8 + LABEL_PAD, ty: p.y + LABEL_GAP + LABEL_H - 4 },
      { bx: p.x - 8 - w, by: p.y + LABEL_GAP, anchor: "end", tx: p.x - 8 - LABEL_PAD, ty: p.y + LABEL_GAP + LABEL_H - 4 },
    ];

    let pick: Cand | undefined = cands.find((c) => !hit({ x: c.bx, y: c.by, w, h: LABEL_H }));
    if (!pick) {
      const dx = p.x - C || 0.01;
      const dy = p.y - C || 0.01;
      const len = Math.hypot(dx, dy) || 1;
      const cx = p.x + (dx / len) * 42;
      const cy = p.y + (dy / len) * 42;
      pick = { bx: cx - w / 2, by: cy - LABEL_H / 2, anchor: "middle", tx: cx, ty: cy + 4 };
    }
    taken.push({ x: pick.bx, y: pick.by, w, h: LABEL_H });
    return { ...p, ...pick, w, h: LABEL_H, col: colOf(p.f.type), text };
  });
}

function RadarMap({
  list,
  origin,
  hover,
  selectedId,
  activeHandoffFacilityId,
  referralCountByFacilityId,
  onHover,
  onSelect,
}: {
  list: Facility[];
  origin: { lat: number; lng: number } | null;
  hover: number | null;
  selectedId: number | null;
  activeHandoffFacilityId: number | null;
  referralCountByFacilityId: Map<number, number>;
  onHover: (i: number | null) => void;
  onSelect: (f: Facility) => void;
}) {
  const maxKm = Math.max(10, Math.ceil(Math.max(0, ...list.map((f) => f.km)) / 5) * 5);
  const placed = useMemo(() => placeLabels(list, maxKm, origin), [list, maxKm, origin]);
  const wedge = (a0: number, a1: number) => {
    const p = (a: number) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${C} ${C} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`;
  };
  return (
    <svg viewBox="-70 -70 580 580" className="w-full" role="img" aria-label="True-bearing radar map of nearby facilities">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <circle cx={C} cy={C} r={R * f} fill="none" stroke="rgba(255,244,220,.16)" strokeDasharray={f === 1 ? undefined : "3 6"} />
          <text x={C + 6} y={C - R * f + 13} fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="rgba(255,244,220,.55)">
            {Math.round(maxKm * f)} km
          </text>
        </g>
      ))}
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="rgba(255,244,220,.1)" />
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="rgba(255,244,220,.1)" />
      {/* True cardinal compass markers */}
      <text x={C} y={C - R - 10} textAnchor="middle" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="rgba(255,244,220,.45)">N</text>
      <text x={C + R + 12} y={C + 3} textAnchor="start" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="rgba(255,244,220,.45)">E</text>
      <text x={C} y={C + R + 18} textAnchor="middle" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="rgba(255,244,220,.45)">S</text>
      <text x={C - R - 12} y={C + 3} textAnchor="end" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="rgba(255,244,220,.45)">W</text>

      <g className="nrx-spin-slow" style={{ transformOrigin: `${C}px ${C}px`, animationDuration: "7s" }}>
        <path d={wedge(-50, -8)} fill="rgba(234,143,99,.18)" />
      </g>

      {placed.map((p) => {
        const isSelected = selectedId === p.f.id;
        const isHandoffTarget = activeHandoffFacilityId === p.f.id;
        const refCount = referralCountByFacilityId.get(p.f.id) ?? 0;
        const on = hover === p.i || isSelected || isHandoffTarget;
        const cx = Math.max(p.bx, Math.min(p.x, p.bx + p.w));
        const cy = Math.max(p.by, Math.min(p.y, p.by + p.h));
        const leader = Math.hypot(cx - p.x, cy - p.y) > 6;
        return (
          <g
            key={p.f.id}
            className="nrx-pop cursor-pointer"
            style={{ animationDelay: `${p.i * 90}ms` }}
            onMouseEnter={() => onHover(p.i)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(p.f)}
          >
            <line
              x1={C}
              y1={C}
              x2={p.x}
              y2={p.y}
              stroke={isHandoffTarget ? "#8fbf5a" : isSelected ? "#ea8f63" : p.col.hex}
              strokeWidth={isHandoffTarget || isSelected ? 2.2 : 1}
              strokeOpacity={on ? 0.9 : 0.25}
              strokeDasharray={isHandoffTarget ? undefined : "3 4"}
            />
            {on && (
              <circle
                cx={p.x}
                cy={p.y}
                r={22}
                fill={isHandoffTarget ? "#8fbf5a" : p.col.hex}
                opacity={0.32}
                className="nrx-ping"
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={on ? 12.5 : 9}
              fill={p.col.hex}
              stroke={isHandoffTarget ? "#8fbf5a" : isSelected ? "#fff4dc" : "#21160b"}
              strokeWidth={isHandoffTarget || isSelected ? 3.5 : 3}
              style={{ transition: "r .2s" }}
            />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="#21160b">
              {p.i + 1}
            </text>
            {refCount > 0 && (
              <g>
                <circle cx={p.x + 10} cy={p.y - 10} r={7} fill="#8fbf5a" stroke="#21160b" strokeWidth={1.5} />
                <text x={p.x + 10} y={p.y - 7} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#21160b">
                  {refCount}
                </text>
              </g>
            )}
            <rect
              x={p.bx}
              y={p.by}
              width={p.w}
              height={p.h}
              rx={3}
              fill={isHandoffTarget ? "rgba(143,191,90,.95)" : on ? "rgba(234,143,99,.92)" : "rgba(16,11,6,.72)"}
            />
            {leader && <line x1={p.x} y1={p.y} x2={cx} y2={cy} stroke={p.col.hex} strokeOpacity={on ? 0.95 : 0.5} strokeWidth={1} />}
            <text
              x={p.tx}
              y={p.ty}
              textAnchor={p.anchor}
              fontSize={LABEL_SIZE}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fill={on ? "#21160b" : "#fff4dc"}
              letterSpacing={LABEL_TRACKING}
            >
              {p.text}
            </text>
          </g>
        );
      })}

      <circle cx={C} cy={C} r={20} fill="#ea8f63" opacity={0.25} className="nrx-ping" style={{ transformOrigin: `${C}px ${C}px` }} />
      <circle cx={C} cy={C} r={8} fill="#ea8f63" stroke="#fff4dc" strokeWidth={3} />
      <text x={C} y={C + 28} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="#ea8f63" letterSpacing="2">
        YOU
      </text>
    </svg>
  );
}

interface CatchmentAuditRow {
  pin: string;
  label: string;
  district: string;
  state: string;
  coverage: FacilitiesResponse["coverage"];
  totalCount: number;
  deicRbskCount: number;
  trustedCount: number;
  nearestDeicKm: number | null;
}

const ROLE_META: Record<
  string,
  {
    eyebrow: string;
    line1: string;
    line2: string;
    blurb: string;
    workspaceTab: string;
  }
> = {
  parent: {
    eyebrow: "Family care · early intervention directory",
    line1: "Find the",
    line2: "nearest help.",
    blurb:
      "Search government DEICs, RBSK units and paediatric hospitals by PIN code, matched to your child's latest check-in and connected to live community worker support.",
    workspaceTab: "Visit pass",
  },
  chw: {
    eyebrow: "Frontline · field referral directory",
    line1: "Route every",
    line2: "child to care.",
    blurb:
      "Select a facility on the map, dispatch a live referral for any child in your ward, and track the handoff from sent to seen.",
    workspaceTab: "Referral slip",
  },
  supervisor: {
    eyebrow: "Oversight · block catchment & coverage",
    line1: "Every ward.",
    line2: "Mapped to care.",
    blurb:
      "Compare facility coverage across sector PIN codes, reroute stuck referrals to verified DEICs on the map, and export directories.",
    workspaceTab: "Catchment audit",
  },
  clinician: {
    eyebrow: "Clinical tools · subspecialty & rule-out directory",
    line1: "Route to the",
    line2: "right clinic.",
    blurb:
      "Filter referral centres by subspecialty rule-out, acknowledge referrals onto a selected map facility, and persist clinical handoff notes.",
    workspaceTab: "Clinical handoff",
  },
};

export function FindHelp() {
  const {
    role,
    checkIns,
    children,
    referralRecords,
    workerName,
    contactChild,
    go,
    showToast,
    reload,
  } = useApp();
  const tr = useT();

  const [mode, setMode] = useState<Mode>("directory");
  const [mapVisualMode, setMapVisualMode] = useState<MapVisualMode>("radar");
  const [pin, setPin] = useState("110029");
  const [age, setAge] = useState("3");
  const [screeningResult, setScreeningResult] = useState<"typical" | "monitor" | "refer" | undefined>(undefined);
  const [res, setRes] = useState<FacilitiesResponse | null>(null);
  const [asked, setAsked] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilterId>("all");
  const [subspecialtyFilter, setSubspecialtyFilter] = useState<SubspecialtyId>("all");
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [selectedCheckInId, setSelectedCheckInId] = useState<string>("");
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [dispatchingChildId, setDispatchingChildId] = useState<string | null>(null);

  // Live parent community worker suggestions + contact log state
  const [suggestedWorkers, setSuggestedWorkers] = useState<WorkerSuggestion[]>([]);
  const [parentContactStatus, setParentContactStatus] = useState<string | null>(null);
  const [loggingVisit, setLoggingVisit] = useState(false);

  // Live clinician note editor synced with the active referral record
  const [clinicalNoteDraft, setClinicalNoteDraft] = useState<string>("");
  const [savingClinicalHandoff, setSavingClinicalHandoff] = useState(false);

  const [prepChecked, setPrepChecked] = useState<Record<string, boolean>>({
    mcp_card: true,
    nirixon_pass: true,
    birth_records: false,
    school_notes: false,
  });

  const [auditRows, setAuditRows] = useState<CatchmentAuditRow[]>([]);
  const [auditingBlock, setAuditingBlock] = useState(false);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** Map each child_id to its newest live ReferralRecord from /api/referrals */
  const latestRefByChild = useMemo(() => {
    const map = new Map<string, ReferralRecord>();
    for (const ref of referralRecords) {
      const prev = map.get(ref.child_id);
      if (!prev || new Date(ref.created_at).getTime() >= new Date(prev.created_at).getTime()) {
        map.set(ref.child_id, ref);
      }
    }
    return map;
  }, [referralRecords]);

  // Sync default check-in for parent / clinician
  useEffect(() => {
    if (checkIns.length > 0 && !selectedCheckInId) {
      const latest = checkIns[0];
      setSelectedCheckInId(latest.id);
      setAge(String(Math.max(0, Math.round(latest.ageMonths / 12))));
      const ev = evaluate(latest.scores, latest.regression);
      setScreeningResult((latest.tier ?? ev.tier).toLowerCase() as "typical" | "monitor" | "refer");
    }
  }, [checkIns, selectedCheckInId]);

  const actionableChildren = useMemo(() => {
    const order: Record<Child["status"], number> = {
      refer: 0,
      overdue: 1,
      watch: 2,
      unscreened: 3,
      ontrack: 4,
    };
    return [...children].sort((a, b) => {
      const refA = latestRefByChild.get(a.id) ? 0 : 1;
      const refB = latestRefByChild.get(b.id) ? 0 : 1;
      if (refA !== refB) return refA - refB;
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [children, latestRefByChild]);

  useEffect(() => {
    if (actionableChildren.length > 0 && !selectedChildId) {
      const first = actionableChildren[0];
      setSelectedChildId(first.id);
      if (role === "chw" || role === "supervisor" || role === "clinician") {
        setAge(String(Math.max(0, Math.round(first.ageMonths / 12))));
        setScreeningResult(
          first.status === "refer" ? "refer" : first.status === "watch" || first.status === "overdue" ? "monitor" : "typical",
        );
      }
    }
  }, [actionableChildren, selectedChildId, role]);

  const activeCheckIn: CheckIn | null = useMemo(
    () => checkIns.find((c) => c.id === selectedCheckInId) ?? checkIns[0] ?? null,
    [checkIns, selectedCheckInId],
  );

  const activeChild: Child | null = useMemo(
    () => children.find((c) => c.id === selectedChildId) ?? actionableChildren[0] ?? null,
    [children, actionableChildren, selectedChildId],
  );

  /** Live backend referral record for the currently selected child */
  const activeReferral: ReferralRecord | null = useMemo(
    () => (activeChild ? latestRefByChild.get(activeChild.id) ?? null : null),
    [activeChild, latestRefByChild],
  );

  const activeReferralNotes = activeReferral?.clinical_notes ?? "";

  // Sync clinician note draft when the active referral's notes change.
  useEffect(() => {
    setClinicalNoteDraft(activeReferralNotes);
  }, [activeReferralNotes]);

  // Fetch live suggested workers from /api/screen/{sessionId}/workers for Parent role
  useEffect(() => {
    if (role !== "parent" || !activeCheckIn?.id || activeCheckIn.source !== "live") {
      setSuggestedWorkers([]);
      return;
    }
    let cancelled = false;
    api
      .getWorkers(activeCheckIn.id)
      .then((w) => {
        if (!cancelled) setSuggestedWorkers(w);
      })
      .catch(() => {
        if (!cancelled) setSuggestedWorkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, activeCheckIn?.id, activeCheckIn?.source]);

  const activeContext = useMemo(() => {
    if ((role === "chw" || role === "supervisor" || role === "clinician") && activeChild) {
      const tier: Tier =
        activeChild.status === "refer" ? "Refer" : activeChild.status === "watch" || activeChild.status === "overdue" ? "Monitor" : "Typical";
      return {
        name: childLabel(activeChild),
        sub: `${activeChild.ageMonths} mo · ${activeChild.ward ?? `Sector ${activeChild.sector}`}`,
        ageMonths: activeChild.ageMonths,
        tier,
        regression: activeChild.regression,
        scores: activeChild.scores,
        module: (activeChild.ageMonths >= 60 ? "B" : "A") as "A" | "B",
        flagged: getFlaggedDomains(activeChild.scores),
      };
    }
    if (activeCheckIn) {
      const ev = evaluate(activeCheckIn.scores, activeCheckIn.regression);
      const tier: Tier = activeCheckIn.tier ?? ev.tier;
      return {
        name: activeCheckIn.child,
        sub: `${activeCheckIn.ageMonths} mo · ${fmtDate(activeCheckIn.date, true)}`,
        ageMonths: activeCheckIn.ageMonths,
        tier,
        regression: activeCheckIn.regression,
        scores: activeCheckIn.scores,
        module: activeCheckIn.module ?? (activeCheckIn.ageMonths >= 60 ? "B" : "A"),
        flagged: getFlaggedDomains(activeCheckIn.scores),
      };
    }
    return null;
  }, [role, activeChild, activeCheckIn]);

  const ageGroup: "0-5" | "6-12" | undefined =
    age === "" ? undefined : parseInt(age || "0", 10) >= 6 ? "6-12" : "0-5";

  const search = async (raw: string, only = verifiedOnly, resultOverride = screeningResult) => {
    const d = raw.replace(/\D/g, "").slice(0, 6);
    if (d.length < 6 || d[0] === "0") {
      showToast(tr("Enter a 6-digit PIN code"));
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const r = await facilitiesApi.get(d, {
        ageGroup,
        result: resultOverride,
        limit: 12,
        verifiedOnly: only,
      });
      setRes(r);
      setAsked(d);
      setLastCoords(null);
      setSelectedFacilityId(r.facilities[0]?.id ?? null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not reach the facility directory.");
    } finally {
      setBusy(false);
    }
  };

  const searchNear = async (coords: { lat: number; lng: number }, only = verifiedOnly) => {
    try {
      const r = await facilitiesApi.getNear(coords, {
        ageGroup,
        result: screeningResult,
        limit: 12,
        verifiedOnly: only,
      });
      setRes(r);
      setAsked("your location");
      setLastCoords(coords);
      setSelectedFacilityId(r.facilities[0]?.id ?? null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not search near you");
    }
  };

  const setTrustFilter = (only: boolean) => {
    setVerifiedOnly(only);
    if (!res) return;
    if (lastCoords) void searchNear(lastCoords, only);
    else if (res.pin) void search(res.pin, only);
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showToast("Location is not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await searchNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        showToast("Location permission denied — enter a PIN instead");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const rawList = useMemo(() => res?.facilities ?? [], [res]);
  const list = useMemo(() => {
    return rawList.filter((f) => {
      if (tierFilter === "deic_rbsk" && f.type !== "DEIC" && f.type !== "RBSK") return false;
      if (tierFilter === "gov_hosp" && f.type !== "District Hospital" && f.type !== "CHC" && f.type !== "PHC") return false;
      if (!facilityMatchesSubspecialty(f, subspecialtyFilter)) return false;
      return true;
    });
  }, [rawList, tierFilter, subspecialtyFilter]);

  /** Count how many live referrals in referralRecords match each facility on the map */
  const referralCountByFacilityId = useMemo(() => {
    const map = new Map<number, number>();
    for (const f of rawList) {
      let count = 0;
      for (const ref of referralRecords) {
        if ((ref.status ?? "").toLowerCase() === "closed") continue;
        if (referralMatchesFacility(ref, f)) count += 1;
      }
      if (count > 0) map.set(f.id, count);
    }
    return map;
  }, [rawList, referralRecords]);

  /** Find which facility on the map is the current destination of activeReferral */
  const activeHandoffFacility: Facility | null = useMemo(() => {
    if (!activeReferral) return null;
    return rawList.find((f) => referralMatchesFacility(activeReferral, f)) ?? null;
  }, [activeReferral, rawList]);

  // When switching children, if their live referral already points to a facility in the list, select it on the map!
  const activeHandoffFacilityId = activeHandoffFacility?.id ?? null;
  useEffect(() => {
    if (activeHandoffFacilityId != null) {
      setSelectedFacilityId(activeHandoffFacilityId);
    }
  }, [activeHandoffFacilityId]);

  const selectedFacility: Facility | null = useMemo(
    () => list.find((f) => f.id === selectedFacilityId) ?? list[0] ?? rawList[0] ?? null,
    [list, rawList, selectedFacilityId],
  );

  const mapOrigin = useMemo<{ lat: number; lng: number } | null>(() => {
    if (lastCoords) return lastCoords;
    if (res?.resolved && Number.isFinite(res.resolved.lat) && Number.isFinite(res.resolved.lng)) {
      return { lat: res.resolved.lat, lng: res.resolved.lng };
    }
    return null;
  }, [lastCoords, res?.resolved]);

  const coverage = res?.coverage ?? null;
  const showSuggestions = res !== null && coverage !== "nearby" && res.suggestions.length > 0;
  const hasOsm = list.some((f) => /openstreetmap/i.test(f.source));

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    setCopied(label);
    showToast(`${label} copied`);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800);
  };

  const copyFacility = (f: Facility) => {
    const t = `${f.name} (${f.type})\n${f.address || `${f.district}, ${f.state}`}\nDistance: ~${f.km} km\n${f.phone ? `Phone: ${f.phone}` : "No phone listed"}`;
    void copyText(t, f.name);
  };

  const buildParentVisitPass = (f: Facility | null): string => {
    const flagged = activeContext?.flagged ?? [];
    return [
      "Nirixon clinic visit pass",
      activeContext
        ? `Child: ${activeContext.name} · ${activeContext.sub} · Module ${activeContext.module}`
        : `Child age group: ${age} years (${ageGroup ?? "0-5"})`,
      activeContext ? `Overall result: ${activeContext.tier} (${TIER_META[activeContext.tier].hint})` : "",
      f ? `Chosen centre: ${f.name} (${f.type}) — about ${f.km} km` : "Chosen centre: Nearest District Early Intervention Centre (DEIC)",
      f ? `Address: ${f.address || `${f.district}, ${f.state}`}${f.phone ? ` · Phone: ${f.phone}` : ""}` : "",
      "",
      flagged.length > 0 ? "Areas to discuss with the doctor:" : "Checked areas are currently inside the expected range.",
      ...flagged.map((d) => `• ${d.label} (${d.z.toFixed(1)} SD) → ${d.route.service}`),
      "",
      "Questions to ask:",
      ...(flagged.length > 0
        ? flagged.slice(0, 3).map((d, idx) => `${idx + 1}. ${d.route.parentQuestion}`)
        : ["1. When should we repeat our next developmental check-in?"]),
      "",
      "Screening summary for discussion — not a medical diagnosis.",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const buildChwFieldSlip = (f: Facility | null, forWhatsApp = false): string => {
    const c = activeChild;
    const flagged = activeContext?.flagged ?? [];
    if (forWhatsApp) {
      return [
        `Namaste, this is ${workerName ?? "your ASHA / Anganwadi worker"} (${c?.ward ?? "Ward 12"}).`,
        c
          ? `Following the Nirixon check-in for ${childLabel(c)} (${c.ageMonths} months), please visit:`
          : `Please visit the nearest referral centre for your child's developmental check-up:`,
        f
          ? `${f.name} (${f.type}, about ${f.km} km)\n${f.address || `${f.district}, ${f.state}`}${f.phone ? `\nPhone: ${f.phone}` : ""}`
          : "Nearest District Early Intervention Centre (DEIC)",
        flagged.length > 0 ? `Areas to mention: ${flagged.map((d) => d.label).join(", ")}.` : "",
        `Please bring your MCP / immunization card.`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      "Nirixon frontline referral slip (RBSK / DEIC)",
      `Worker: ${workerName ?? "Sunita Devi (ASHA)"} · ${c?.ward ?? "Ward 12"}`,
      c ? `Child: ${childLabel(c)} · ${c.ageMonths} months · ${STATUS_META[c.status].long}` : "Child: Unlinked lookup",
      f
        ? `Receiving facility: ${f.name} (${f.type}, ~${f.km} km)\nAddress: ${f.address || `${f.district}, ${f.state}`}\nListing source: ${TRUST_CHIP[f.trust.level].label}`
        : "Receiving facility: Nodal District DEIC / RBSK team",
      "",
      flagged.length > 0 ? "Flagged areas:" : "General developmental follow-up",
      ...flagged.map((d) => `• ${d.label} (${d.z.toFixed(1)} SD) → ${d.route.service}`),
    ].join("\n");
  };

  const buildClinicianCounterReferral = (f: Facility | null): string => {
    const ctx = activeContext;
    const flagged = ctx?.flagged ?? [];
    return [
      "Nirixon clinical counter-referral & subspecialty handoff",
      `Case: ${ctx?.name ?? "Clinical consult"} (${ctx?.sub ?? `${age} yrs`}) · Module ${ctx?.module ?? (ageGroup === "6-12" ? "B" : "A")}`,
      `Triage classification: ${ctx?.tier ?? "Refer"}${ctx?.regression ? " · Safety rule triggered (regression reported)" : ""}`,
      "",
      f
        ? `Receiving centre: ${f.name} (${f.type}) · ~${f.km} km\nAddress: ${f.address || `${f.district}, ${f.state}`}${f.phone ? ` · Tel: ${f.phone}` : ""}\nProvenance: ${f.trust.label} (${f.source}${f.trust.verified_at ? `, verified ${f.trust.verified_at}` : ""})`
        : "Receiving centre: Nodal DEIC / Developmental Paediatrics Unit",
      "",
      "Domain z-score profile:",
      ...(ctx?.scores
        ? domainKeys(ctx.scores).map(
            (k) => `• ${DOMAINS[k]?.label ?? k}: ${ctx.scores![k].toFixed(2)} SD (${domainStatus(ctx.scores![k]).label})`,
          )
        : ["• No domain profile attached"]),
      "",
      "Recommended rule-outs & specialist workup:",
      ...(flagged.length > 0
        ? flagged.map((d, i) => `${i + 1}. ${d.label} → ${d.route.service}\n   Rule-out: ${d.route.ruleOut}`)
        : ["1. Routine developmental surveillance; all domains above -1.0 SD."]),
      ...(clinicalNoteDraft.trim() ? ["", `Clinician note: ${clinicalNoteDraft.trim()}`] : []),
    ].join("\n");
  };

  /**
   * LIVE BACKEND HANDOFF: Create or update the child's ReferralRecord in the backend
   * with the exact facility selected on the map, then dispatch it (/api/referrals/{id}/send)
   * and reload all app state so the map, facility cards, and referral desk update in real time.
   */
  const handleLiveFacilityReferral = async (f: Facility, targetChild: Child | null = activeChild) => {
    if (!targetChild) {
      showToast("Select a child first");
      return;
    }
    setDispatchingChildId(targetChild.id);
    setSelectedFacilityId(f.id);
    try {
      const dest = formatFacilityTarget(f);
      const flagged = getFlaggedDomains(targetChild.scores);
      const domains = flagged.length > 0 ? flagged.map((d) => d.key) : ["communication"];
      const reason =
        flagged.length > 0
          ? `Routed via Find Help map to ${f.name} (${f.type}): ${flagged.map((d) => `${d.label} (${d.z.toFixed(1)} SD)`).join(", ")}`
          : `Routed via Find Help map to ${f.name} (${f.type}) for developmental evaluation`;
      const tier =
        targetChild.status === "refer"
          ? "Tier 3: Direct Referral"
          : targetChild.status === "watch" || targetChild.status === "overdue"
            ? "Tier 2: Monitor & Rescreen"
            : "Tier 1: Routine Pass";

      const existing = latestRefByChild.get(targetChild.id);
      let ref: ReferralRecord;
      if (existing && (existing.status ?? "").toLowerCase() !== "closed") {
        ref = await referralApi.updateReferral(existing.id, {
          to_facility: dest,
          reason,
          domains_of_concern: domains,
        });
      } else {
        ref = await referralApi.createReferral({
          child_id: targetChild.id,
          to_facility: dest,
          reason,
          tier,
          domains_of_concern: domains,
          safety_rule_trigger: targetChild.regression ? "Skill regression reported" : null,
        });
      }

      const dispatchRes = await referralApi.dispatchReferral(ref.id, {
        channel: "whatsapp",
        recipient: f.phone ?? null,
      });

      if (role === "chw") {
        void contactChild(targetChild.id, { handoff: "queued", status: "refer" });
      }
      reload();
      showToast(`${childLabel(targetChild)} routed to ${f.name} · ${dispatchRes.detail}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not dispatch referral to facility");
    } finally {
      setDispatchingChildId(null);
    }
  };

  /** Advance an active referral on the backend to 'seen' when the child arrives at the facility */
  const handleMarkReferralSeen = async () => {
    if (!activeReferral || !activeChild) return;
    setDispatchingChildId(activeChild.id);
    try {
      await referralApi.updateReferral(activeReferral.id, {
        status: "seen",
        ...(selectedFacility ? { to_facility: formatFacilityTarget(selectedFacility) } : {}),
      });
      reload();
      showToast(`${childLabel(activeChild)} marked seen at ${selectedFacility?.name ?? activeReferral.to_facility}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not mark referral seen");
    } finally {
      setDispatchingChildId(null);
    }
  };

  /** Clinician: Acknowledge handoff & persist subspecialty facility + clinical note to /api/referrals/{id}/acknowledge */
  const handleClinicianAcknowledgeAndRoute = async () => {
    if (!activeChild) {
      showToast("Select a patient case first");
      return;
    }
    setSavingClinicalHandoff(true);
    try {
      const dest = selectedFacility
        ? formatFacilityTarget(selectedFacility)
        : activeReferral?.to_facility ?? "Nodal DEIC / Developmental Paediatrics";
      const flagged = activeContext?.flagged ?? [];
      const noteToSave =
        clinicalNoteDraft.trim() ||
        (flagged.length > 0
          ? `Subspecialty routing to ${dest}. Rule-outs: ${flagged.map((d) => `${d.label} -> ${d.route.service}`).join("; ")}`
          : `Reviewed and routed to ${dest}.`);

      let ref = activeReferral;
      if (!ref || (ref.status ?? "").toLowerCase() === "closed") {
        ref = await referralApi.createReferral({
          child_id: activeChild.id,
          to_facility: dest,
          reason: noteToSave,
          tier: "Tier 3: Direct Referral",
          domains_of_concern: flagged.map((d) => d.key),
        });
      } else {
        ref = await referralApi.updateReferral(ref.id, {
          to_facility: dest,
        });
      }

      await referralApi.acknowledgeReferral(ref.id, {
        clinical_notes: noteToSave,
      });
      reload();
      showToast(`Handoff acknowledged & routed to ${selectedFacility?.name ?? dest}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save clinical handoff");
    } finally {
      setSavingClinicalHandoff(false);
    }
  };

  /** Parent: Log real facility visit / ASHA accompaniment request via POST /api/screen/{sessionId}/contact_worker */
  const handleParentLogFacilityVisit = async (f: Facility | null) => {
    if (!activeCheckIn) {
      showToast("Complete a check-in first to log a facility visit");
      return;
    }
    setLoggingVisit(true);
    try {
      const workerId = suggestedWorkers[0]?.id ?? "asha-ward-12";
      const facLabel = f ? `${f.name} (${f.type}, ~${f.km} km)` : "Nearest DEIC";
      if (activeCheckIn.source === "live") {
        const resp = await api.contactWorker(activeCheckIn.id, {
          worker_id: workerId,
          contact_method: "in_person",
          notes: `Family selected ${facLabel} on Find Help map for ${activeCheckIn.child}.`,
        });
        setParentContactStatus(`${resp.message} · Destination: ${facLabel}`);
        showToast(resp.message);
      } else {
        setParentContactStatus(`Visit plan logged for ${activeCheckIn.child} at ${facLabel}.`);
        showToast(`Visit plan logged for ${facLabel}`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not log facility contact");
    } finally {
      setLoggingVisit(false);
    }
  };

  const runBlockCatchmentAudit = async () => {
    if (auditingBlock) return;
    setAuditingBlock(true);
    try {
      const pinsToAudit = SAMPLE_PINS.filter((p) => p.pin !== "999999");
      const results = await Promise.all(
        pinsToAudit.map(async (item) => {
          const r = await facilitiesApi.get(item.pin, { ageGroup: "0-5", result: "refer", limit: 15 });
          const deicRbsk = r.facilities.filter((f) => f.type === "DEIC" || f.type === "RBSK");
          const trusted = r.facilities.filter((f) => f.trust.level === "official" || f.trust.level === "verified");
          return {
            pin: item.pin,
            label: item.label,
            district: r.resolved?.district ?? "Unresolved",
            state: r.resolved?.state ?? "—",
            coverage: r.coverage,
            totalCount: r.facilities.length,
            deicRbskCount: deicRbsk.length,
            trustedCount: trusted.length,
            nearestDeicKm: deicRbsk.length > 0 ? Math.min(...deicRbsk.map((f) => f.km)) : null,
          } satisfies CatchmentAuditRow;
        }),
      );
      setAuditRows(results);
      showToast("Compared 5 sector PIN codes");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not run block audit");
    } finally {
      setAuditingBlock(false);
    }
  };

  useEffect(() => {
    if (role === "supervisor" && mode === "workspace" && auditRows.length === 0 && !auditingBlock) {
      void runBlockCatchmentAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, mode]);

  const exportDirectoryCsv = () => {
    if (list.length === 0) {
      showToast("Search a PIN first to export facilities");
      return;
    }
    const header = ["Rank", "Name", "Type", "Distance_km", "District", "State", "Phone", "Trust_Level", "Source"];
    const rows = list.map((f, i) => [
      String(i + 1),
      `"${f.name.replace(/"/g, '""')}"`,
      f.type,
      String(f.km),
      `"${f.district}"`,
      `"${f.state}"`,
      f.phone ?? "",
      f.trust.level,
      `"${f.source}"`,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadTextFile(`nirixon-facilities-${asked || pin}.csv`, csv, "text/csv;charset=utf-8");
    showToast(`Exported ${list.length} facilities to CSV`);
  };

  const supervisorStats = useMemo(() => {
    const referCount = children.filter((c) => c.status === "refer").length;
    const watchCount = children.filter((c) => c.status === "watch" || c.status === "overdue").length;
    const queuedHandoffs = children.filter((c) => c.handoff === "queued").length;
    const completedHandoffs = children.filter((c) => c.handoff === "done").length;
    const deicCountInList = rawList.filter((f) => f.type === "DEIC" || f.type === "RBSK").length;
    const trustedCountInList = rawList.filter((f) => f.trust.level === "official" || f.trust.level === "verified").length;
    return {
      referCount,
      watchCount,
      queuedHandoffs,
      completedHandoffs,
      deicCountInList,
      trustedCountInList,
      activeReferralsDb: referralRecords.length,
    };
  }, [children, referralRecords, rawList]);

  const meta = ROLE_META[role] ?? ROLE_META.parent;

  // Compute OpenStreetMap embed URL for the selected facility or resolved PIN coordinates
  const osmTarget = useMemo(() => {
    if (selectedFacility && Number.isFinite(selectedFacility.lat) && Number.isFinite(selectedFacility.lng)) {
      return {
        lat: selectedFacility.lat,
        lng: selectedFacility.lng,
        label: selectedFacility.name,
      };
    }
    if (mapOrigin) {
      return {
        lat: mapOrigin.lat,
        lng: mapOrigin.lng,
        label: res?.resolved ? `${res.resolved.district}, ${res.resolved.state}` : asked || pin,
      };
    }
    return null;
  }, [selectedFacility, mapOrigin, res?.resolved, asked, pin]);

  return (
    <Page>
      {/* ============================ HEADER ============================ */}
      <Eyebrow index="01">{tr(meta.eyebrow)}</Eyebrow>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <Display as="h1" className="text-[clamp(52px,8vw,118px)]">
          {tr(meta.line1)}
          <br />
          <span className="text-rust">{tr(meta.line2)}</span>
        </Display>

        <div className="flex rounded-full border border-line-2 bg-card p-1" role="group" aria-label="Find help mode">
          {(
            [
              ["directory", "Directory & map"],
              ["workspace", meta.workspaceTab],
            ] as [Mode, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setMode(val)}
              aria-pressed={mode === val}
              className={cn(
                "rounded-full px-5 py-2.5 text-[12px] font-bold transition-colors",
                mode === val ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
              )}
            >
              {tr(label)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-[620px] text-[15px] leading-relaxed text-ink-2">{meta.blurb}</p>

      {/* ================================================================= */}
      {/* LIVE CASE / HANDOFF BRIDGE BAR (CONNECTS MAP TO REAL DB RECORDS)  */}
      {/* ================================================================= */}
      <Reveal className="mt-8">
        <div className="rounded-[32px] border border-line-2 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Role selector for which child / check-in is linked to the map */}
              {role === "parent" && checkIns.length > 0 && (
                <label className="flex items-center gap-2.5 text-[13px] font-semibold">
                  <span className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">Child check-in:</span>
                  <select
                    value={activeCheckIn?.id ?? ""}
                    onChange={(e) => {
                      const next = checkIns.find((c) => c.id === e.target.value);
                      if (next) {
                        setSelectedCheckInId(next.id);
                        setAge(String(Math.max(0, Math.round(next.ageMonths / 12))));
                        const ev = evaluate(next.scores, next.regression);
                        const nextRes = (next.tier ?? ev.tier).toLowerCase() as "typical" | "monitor" | "refer";
                        setScreeningResult(nextRes);
                        if (res?.pin) void search(res.pin, verifiedOnly, nextRes);
                      }
                    }}
                    className="nrx-select rounded-full border border-line-2 bg-card-2 py-2 pr-9 pl-4 text-[12.5px] font-bold text-ink"
                  >
                    {checkIns.map((c) => {
                      const ev = evaluate(c.scores, c.regression);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.child} ({c.ageMonths}m · {c.tier ?? ev.tier})
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}

              {(role === "chw" || role === "supervisor" || role === "clinician") && actionableChildren.length > 0 && (
                <label className="flex items-center gap-2.5 text-[13px] font-semibold">
                  <span className="font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
                    {role === "clinician" ? "Patient case:" : "Active child:"}
                  </span>
                  <select
                    value={activeChild?.id ?? ""}
                    onChange={(e) => {
                      const next = children.find((c) => c.id === e.target.value);
                      if (next) {
                        setSelectedChildId(next.id);
                        setAge(String(Math.max(0, Math.round(next.ageMonths / 12))));
                        const nextRes =
                          next.status === "refer"
                            ? "refer"
                            : next.status === "watch" || next.status === "overdue"
                              ? "monitor"
                              : "typical";
                        setScreeningResult(nextRes);
                      }
                    }}
                    className="nrx-select rounded-full border border-line-2 bg-card-2 py-2 pr-9 pl-4 text-[12.5px] font-bold text-ink"
                  >
                    {actionableChildren.map((c) => {
                      const ref = latestRefByChild.get(c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {childLabel(c)} ({c.ageMonths}m · {STATUS_META[c.status].label}
                          {ref ? ` · ${ref.status}` : ""})
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}

              {activeReferral ? (
                <Chip
                  tone={
                    activeReferral.status === "seen" || activeReferral.status === "outcome recorded"
                      ? "moss"
                      : activeReferral.status === "sent"
                        ? "amber"
                        : "brick"
                  }
                >
                  Live DB referral: {activeReferral.status.toUpperCase()} → {activeReferral.to_facility}
                </Chip>
              ) : (
                role !== "parent" &&
                activeChild && <Chip tone="sand">No referral sent yet for {childLabel(activeChild)}</Chip>
              )}

              {role === "parent" && parentContactStatus && <Chip tone="moss">{parentContactStatus}</Chip>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedFacility && (
                <Chip tone="sea">
                  Map pin: {selectedFacility.name.slice(0, 26)}
                  {selectedFacility.name.length > 26 ? "…" : ""} (~{selectedFacility.km} km)
                </Chip>
              )}
              {selectedFacility && (role === "chw" || role === "supervisor") && activeChild && (
                <Btn
                  size="xs"
                  variant="rust"
                  disabled={dispatchingChildId === activeChild.id}
                  onClick={() => void handleLiveFacilityReferral(selectedFacility, activeChild)}
                >
                  {dispatchingChildId === activeChild.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {activeReferral ? "Reroute & send to pin" : "Send referral to pin"}
                </Btn>
              )}
              {selectedFacility && role === "clinician" && activeChild && (
                <Btn
                  size="xs"
                  variant="rust"
                  disabled={savingClinicalHandoff}
                  onClick={() => void handleClinicianAcknowledgeAndRoute()}
                >
                  {savingClinicalHandoff ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="size-3.5" />
                  )}
                  Acknowledge & route to pin
                </Btn>
              )}
              {selectedFacility && role === "parent" && activeCheckIn && (
                <Btn
                  size="xs"
                  variant="rust"
                  disabled={loggingVisit}
                  onClick={() => void handleParentLogFacilityVisit(selectedFacility)}
                >
                  {loggingVisit ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                  Log visit to this centre
                </Btn>
              )}
              <Btn size="xs" variant="light" onClick={() => setMode(mode === "directory" ? "workspace" : "directory")}>
                {mode === "directory" ? `Open ${meta.workspaceTab.toLowerCase()}` : "Back to map"}{" "}
                <ArrowRight className="size-3.5" />
              </Btn>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ================================================================= */}
      {/* MODE 1: LIVE DIRECTORY, TRUE-BEARING RADAR & STREET MAP           */}
      {/* ================================================================= */}
      {mode === "directory" && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Left column: PIN search + Interactive Map + Live Destination Handoff Dock */}
          <div className="space-y-4">
            <div className="rounded-[36px] border border-line-2 bg-card p-7 sm:p-9">
              <div className="grid gap-5 sm:grid-cols-[1.3fr_0.7fr]">
                <label className="block">
                  <span className="mb-2.5 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">
                    {tr("Postal PIN code")}
                  </span>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && void search(pin)}
                    inputMode="numeric"
                    placeholder="110029"
                    className="w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 font-mono text-[22px] font-semibold tracking-[0.15em] placeholder:text-ink/20 focus:border-sea focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">
                    {tr("Age (years)")}
                  </span>
                  <input
                    value={age}
                    onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-line-2 bg-card-2 px-5 py-4 font-mono text-[22px] font-semibold focus:border-sea focus:outline-none"
                  />
                </label>
              </div>
              <p className="mt-3 text-[12px] text-muted">
                Under 6 → DEIC & RBSK first · 6 and over → child guidance & referral services first
              </p>

              <Btn size="lg" className="mt-6 w-full" onClick={() => void search(pin)} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{" "}
                {busy ? tr("Searching…") : tr("Find nearest help")}
              </Btn>
              <Btn size="lg" variant="light" className="mt-2 w-full" onClick={useMyLocation} disabled={busy || locating}>
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}{" "}
                {locating ? tr("Locating…") : tr("Use my location")}
              </Btn>

              <div className="mt-7 border-t border-line pt-6">
                <p className="mb-3 font-mono text-[10px] tracking-[0.22em] text-muted uppercase">{tr("Try a sample PIN")}</p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_PINS.map((s) => (
                    <button
                      key={s.pin}
                      aria-label={`Try sample PIN ${s.label} ${s.pin}`}
                      onClick={() => {
                        setPin(s.pin);
                        void search(s.pin);
                      }}
                      className={cn(
                        "rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-all hover:-translate-y-0.5",
                        asked === s.pin ? "border-ink bg-ink text-paper" : "border-line-2 bg-card-2 hover:border-ink",
                      )}
                    >
                      {s.label}{" "}
                      <span className={cn("font-mono text-[11px]", asked === s.pin ? "text-paper/75" : "text-muted")}>
                        {s.pin}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Interactive Map Card: True-Bearing Compass Radar OR Live OpenStreetMap */}
            <div className="relative overflow-hidden rounded-[40px] bg-night p-5 text-paper sm:p-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Eyebrow tone="peach" index="02">
                  {mapVisualMode === "radar" ? tr("True-bearing radar") : tr("Live street map")}
                </Eyebrow>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-full border border-white/15 bg-white/[0.06] p-0.5">
                    <button
                      type="button"
                      onClick={() => setMapVisualMode("radar")}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                        mapVisualMode === "radar" ? "bg-peach text-night" : "text-paper/70 hover:text-paper",
                      )}
                    >
                      <Compass className="size-3" /> Radar
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapVisualMode("street")}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                        mapVisualMode === "street" ? "bg-peach text-night" : "text-paper/70 hover:text-paper",
                      )}
                    >
                      <MapIcon className="size-3" /> Street map
                    </button>
                  </div>
                </div>
              </div>

              {mapVisualMode === "radar" ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tracking-wider text-paper/60 uppercase">
                    <div className="flex flex-wrap gap-3">
                      {(["DEIC", "RBSK", "District Hospital"] as FacilityType[]).map((t) => (
                        <span key={t} className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: TYPE_COL[t].hex }} />
                          {TYPE_COL[t].short}
                        </span>
                      ))}
                    </div>
                    {activeHandoffFacility && (
                      <span className="flex items-center gap-1.5 text-[#8fbf5a]">
                        <span className="size-2 rounded-full bg-[#8fbf5a]" />
                        Active handoff: {activeHandoffFacility.name.slice(0, 22)}
                      </span>
                    )}
                  </div>
                  <RadarMap
                    list={list}
                    origin={mapOrigin}
                    hover={hover}
                    selectedId={selectedFacility?.id ?? null}
                    activeHandoffFacilityId={activeHandoffFacility?.id ?? null}
                    referralCountByFacilityId={referralCountByFacilityId}
                    onHover={setHover}
                    onSelect={(f) => setSelectedFacilityId(f.id)}
                  />
                </>
              ) : osmTarget ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[24px] border border-white/15 bg-card">
                    <iframe
                      title={`OpenStreetMap around ${osmTarget.label}`}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${osmTarget.lng - 0.035}%2C${osmTarget.lat - 0.025}%2C${osmTarget.lng + 0.035}%2C${osmTarget.lat + 0.025}&layer=mapnik&marker=${osmTarget.lat}%2C${osmTarget.lng}`}
                      className="h-[360px] w-full border-0"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.slice(0, 6).map((f, idx) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFacilityId(f.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 font-mono text-[10.5px] font-semibold transition-colors",
                          selectedFacility?.id === f.id
                            ? "border-peach bg-peach text-night"
                            : "border-white/15 bg-white/[0.06] text-paper/75 hover:text-paper",
                        )}
                      >
                        #{idx + 1} {colOf(f.type).short} · {f.km}km
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-12 text-center text-[13px] text-paper/60">
                  Search a PIN code to load the street map.
                </p>
              )}

              {/* Live Selected Facility Handoff Dock right inside the map card */}
              {selectedFacility && (
                <div className="mt-4 rounded-[26px] border border-white/12 bg-white/[0.06] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-peach uppercase">
                        Selected on map · {selectedFacility.type} · ~{selectedFacility.km} km
                      </p>
                      <p className="mt-1 font-display text-[24px] leading-tight uppercase">{selectedFacility.name}</p>
                      <p className="mt-1 text-[12px] text-paper/70">
                        {selectedFacility.address || `${selectedFacility.district}, ${selectedFacility.state}`}
                        {selectedFacility.phone ? ` · ${selectedFacility.phone}` : ""}
                      </p>
                    </div>
                    <Chip tone="night">{TRUST_CHIP[selectedFacility.trust.level].label}</Chip>
                  </div>

                  {/* Live referral timeline if the selected child has an open referral */}
                  {activeReferral && role !== "parent" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-[11.5px]">
                      <span className="text-paper/80">
                        <b className="text-peach">{activeContext?.name}:</b> status{" "}
                        <b className="uppercase text-paper">{activeReferral.status}</b>
                        {activeReferral.sent_at ? ` · sent ${agoShort(activeReferral.sent_at)}` : ""}
                        {activeReferral.seen_at ? ` · seen ${agoShort(activeReferral.seen_at)}` : ""}
                      </span>
                      {referralMatchesFacility(activeReferral, selectedFacility) ? (
                        <span className="font-mono text-[10px] font-bold text-[#8fbf5a] uppercase">
                          ● Matched to this pin
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-paper/55">
                          Currently at: {activeReferral.to_facility.slice(0, 28)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(role === "chw" || role === "supervisor") && activeChild && (
                      <>
                        <Btn
                          size="xs"
                          variant="peach"
                          disabled={dispatchingChildId === activeChild.id}
                          onClick={() => void handleLiveFacilityReferral(selectedFacility, activeChild)}
                        >
                          {dispatchingChildId === activeChild.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Send className="size-3.5" />
                          )}
                          {activeReferral && referralMatchesFacility(activeReferral, selectedFacility)
                            ? `Re-send handoff (${childLabel(activeChild)})`
                            : `Route & send ${childLabel(activeChild)} here`}
                        </Btn>
                        {activeReferral && activeReferral.status === "sent" && (
                          <Btn
                            size="xs"
                            variant="ghostDark"
                            disabled={dispatchingChildId === activeChild.id}
                            onClick={() => void handleMarkReferralSeen()}
                          >
                            <CheckCheck className="size-3.5" /> Mark child seen
                          </Btn>
                        )}
                      </>
                    )}
                    {role === "clinician" && activeChild && (
                      <Btn
                        size="xs"
                        variant="peach"
                        disabled={savingClinicalHandoff}
                        onClick={() => void handleClinicianAcknowledgeAndRoute()}
                      >
                        {savingClinicalHandoff ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="size-3.5" />
                        )}
                        Acknowledge & route {childLabel(activeChild)} here
                      </Btn>
                    )}
                    {role === "parent" && (
                      <Btn
                        size="xs"
                        variant="peach"
                        disabled={loggingVisit}
                        onClick={() => void handleParentLogFacilityVisit(selectedFacility)}
                      >
                        {loggingVisit ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                        Log visit / request ASHA support
                      </Btn>
                    )}
                    <Btn size="xs" variant="ghostDark" onClick={() => setMode("workspace")}>
                      Open {meta.workspaceTab.toLowerCase()} →
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column: Filter pills + Facility cards with live referral badges */}
          <div>
            {res && coverage === "none" && (
              <div className="nrx-rise rounded-[36px] bg-brick-bg p-8">
                <Tent className="size-7 text-brick" />
                <h3 className="mt-4 font-display text-[40px] leading-none uppercase">
                  {res.verified_only
                    ? tr("No verified listing yet")
                    : res.resolved
                      ? `No listed facility near ${asked}`
                      : `No listing for ${asked}`}
                </h3>
                <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-ink-2">
                  {res.verified_only
                    ? "Mapped-only entries exist for this area, but none are verified. Use the programme routes below, or show all listings."
                    : res.state_deic
                      ? res.state_deic.operational > 0
                        ? `${res.state_deic.state} reports ${res.state_deic.operational} operational DEIC${res.state_deic.operational === 1 ? "" : "s"}. Contact your district health office or the district hospital for the one nearest you.`
                        : `No DEIC is reported as operational in ${res.state_deic.state}. Go to the district hospital instead.`
                      : "No facility directory data covers this area yet. Start with your district hospital or PHC."}
                </p>
                {res.resolved?.approximate && (
                  <p className="mt-3 text-[12.5px] text-muted">
                    {tr("Approximate location (exact coordinates unavailable for this PIN).")}
                  </p>
                )}
                {res.verified_only && (
                  <Btn variant="light" className="mt-5" onClick={() => setTrustFilter(false)}>
                    {tr("Show all listings")}
                  </Btn>
                )}
              </div>
            )}

            {res && coverage !== "none" && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-3 text-[13px] font-semibold text-ink-2">
                    <span className="font-display text-[34px] leading-none text-ink">{list.length}</span>{" "}
                    {coverage === "nearby" ? "facilities near" : "closest facilities to"}
                    <b className="text-ink">
                      {res.resolved ? `${res.resolved.district}, ${res.resolved.state}` : asked} ({asked})
                    </b>
                  </p>
                  <button
                    type="button"
                    aria-pressed={verifiedOnly}
                    onClick={() => setTrustFilter(!verifiedOnly)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-[12px] font-bold transition-colors",
                      verifiedOnly ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:bg-sand",
                    )}
                  >
                    {verifiedOnly ? tr("Showing trusted only") : tr("Show trusted only")}
                  </button>
                </div>

                {/* Clean pill filters */}
                {rawList.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {(
                      [
                        { id: "all", label: "All types" },
                        { id: "deic_rbsk", label: "DEIC & RBSK" },
                        { id: "gov_hosp", label: "District Hospital / CHC / PHC" },
                      ] as const
                    ).map((tf) => (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setTierFilter(tf.id)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                          tierFilter === tf.id
                            ? "border-ink bg-ink text-paper"
                            : "border-line-2 bg-card text-ink-2 hover:border-ink/50",
                        )}
                      >
                        {tf.label}
                      </button>
                    ))}
                    {role === "clinician" &&
                      SUBSPECIALTY_FILTERS.filter((s) => s.id !== "all").map((sf) => (
                        <button
                          key={sf.id}
                          type="button"
                          onClick={() => setSubspecialtyFilter(subspecialtyFilter === sf.id ? "all" : sf.id)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                            subspecialtyFilter === sf.id
                              ? "border-sea bg-sea text-paper"
                              : "border-line-2 bg-card text-ink-2 hover:border-ink/50",
                          )}
                        >
                          {sf.label}
                        </button>
                      ))}
                  </div>
                )}

                {(coverage !== "nearby" || res.resolved?.approximate) && (
                  <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
                    {coverage === "district" && `No listed facility within 25 km — showing the closest in your district. `}
                    {coverage === "state" && `No listed facility in your district — showing the closest in your state. `}
                    {res.resolved?.approximate && "Approximate location (exact coordinates unavailable for this PIN). "}
                    Distances are straight-line.
                  </p>
                )}

                {list.length === 0 && rawList.length > 0 && (
                  <div className="rounded-[30px] border border-dashed border-line-2 p-8 text-center">
                    <p className="text-[14px] font-semibold text-ink">No facilities match this filter.</p>
                    <Btn
                      size="xs"
                      variant="light"
                      className="mt-3"
                      onClick={() => {
                        setTierFilter("all");
                        setSubspecialtyFilter("all");
                      }}
                    >
                      Show all facilities
                    </Btn>
                  </div>
                )}

                <div className="space-y-3">
                  {list.map((f, i) => {
                    const isSelected = selectedFacility?.id === f.id;
                    const isCurrentChildHandoff = referralMatchesFacility(activeReferral, f);
                    const facilityRefCount = referralCountByFacilityId.get(f.id) ?? 0;
                    const matchedDomain = activeContext?.flagged.find((d) => d.route.preferredTypes.includes(f.type));
                    return (
                      <Reveal key={f.id} delay={i * 60}>
                        <div
                          onMouseEnter={() => setHover(i)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => setSelectedFacilityId(f.id)}
                          className={cn(
                            "cursor-pointer rounded-[30px] border bg-card p-6 transition-all duration-300",
                            isCurrentChildHandoff
                              ? "border-moss ring-2 ring-moss/30"
                              : hover === i || isSelected
                                ? "-translate-y-1 border-ink shadow-[0_26px_44px_-28px_rgba(31,20,9,0.7)]"
                                : "border-line-2",
                          )}
                        >
                          <div className="flex items-start gap-4">
                            <span
                              className="grid size-11 shrink-0 place-items-center rounded-full font-display text-[22px] text-night"
                              style={{ background: colOf(f.type).hex }}
                            >
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip tone={colOf(f.type).chip}>{f.type}</Chip>
                                {isCurrentChildHandoff && activeReferral && (
                                  <Chip tone="moss">
                                    Active handoff ({activeReferral.status})
                                  </Chip>
                                )}
                                {!isCurrentChildHandoff && facilityRefCount > 0 && (
                                  <Chip tone="amber">{facilityRefCount} ward referral{facilityRefCount > 1 ? "s" : ""}</Chip>
                                )}
                                {ageGroup && f.relevance.tier === 0 && (
                                  <Chip tone="rust">{tr("Best for age {n}", { n: age })}</Chip>
                                )}
                                {matchedDomain && <Chip tone="sea">Fits {matchedDomain.label}</Chip>}
                                <Chip tone={TRUST_CHIP[f.trust.level].tone}>
                                  {f.trust.level === "verified" && f.trust.verified_at
                                    ? `${tr("Verified")} ${shortDate(f.trust.verified_at)}`
                                    : tr(TRUST_CHIP[f.trust.level].label)}
                                </Chip>
                              </div>
                              <h3 className="mt-3 font-display text-[28px] leading-[1.02] uppercase">{f.name}</h3>
                              <p className="mt-1 text-[13px] text-ink-2">{f.address || `${f.district}, ${f.state}`}</p>
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <p className="font-mono text-[13px] font-semibold">
                                  {tr("about {n} km", { n: f.km })}
                                  {f.phone ? (
                                    <>
                                      <span className="text-muted"> · </span>
                                      {f.phone}
                                    </>
                                  ) : null}
                                </p>
                                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                                  {(role === "chw" || role === "supervisor") && activeChild && (
                                    <Btn
                                      size="xs"
                                      variant={isCurrentChildHandoff ? "outline" : "dark"}
                                      disabled={dispatchingChildId === activeChild.id}
                                      onClick={() => void handleLiveFacilityReferral(f, activeChild)}
                                    >
                                      <Send className="size-3.5" />{" "}
                                      {isCurrentChildHandoff
                                        ? "Sent · Re-dispatch"
                                        : `Refer ${childLabel(activeChild)}`}
                                    </Btn>
                                  )}
                                  {role === "clinician" && activeChild && (
                                    <Btn
                                      size="xs"
                                      variant={isCurrentChildHandoff ? "outline" : "dark"}
                                      disabled={savingClinicalHandoff}
                                      onClick={() => {
                                        setSelectedFacilityId(f.id);
                                        setMode("workspace");
                                      }}
                                    >
                                      <Stethoscope className="size-3.5" /> Route case here
                                    </Btn>
                                  )}
                                  {role === "parent" && (
                                    <Btn
                                      size="xs"
                                      variant="soft"
                                      onClick={() => {
                                        setSelectedFacilityId(f.id);
                                        setMode("workspace");
                                      }}
                                    >
                                      Attach to visit pass
                                    </Btn>
                                  )}
                                  <Btn size="xs" variant="light" onClick={() => copyFacility(f)}>
                                    {copied === f.name ? (
                                      <Check className="size-3.5" />
                                    ) : (
                                      <ClipboardCopy className="size-3.5" />
                                    )}{" "}
                                    {tr("Copy")}
                                  </Btn>
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      f.name + " " + (f.address || f.district + " " + f.state),
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper transition-colors hover:bg-night-3"
                                  >
                                    <ExternalLink className="size-3.5" /> {tr("Map")}
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
                <p className="mt-4 text-[12px] leading-relaxed text-muted">{res.trust_note}</p>
              </div>
            )}

            {res && showSuggestions && (
              <div className={cn("rounded-[36px] border border-line-2 bg-card p-7 sm:p-8", coverage !== "none" && "mt-4")}>
                <Eyebrow index="03" tone="muted">
                  {tr("Where to go next")}
                </Eyebrow>
                <ul className="mt-5 space-y-3.5">
                  {res.suggestions.map((s) => (
                    <li key={s.id} className="border-b border-line pb-3.5 last:border-0 last:pb-0">
                      <p className="text-[14px] font-bold">{s.title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.detail}</p>
                      {s.note && <p className="mt-1 text-[12px] leading-relaxed text-muted">{s.note}</p>}
                      {s.maps_url && (
                        <a
                          href={s.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-sea"
                        >
                          <ExternalLink className="size-3.5" /> Open in Maps
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {res && res.helplines.length > 0 && (
              <div
                className={cn(
                  "rounded-[36px] border border-line-2 bg-card-2 p-7 sm:p-8",
                  (coverage !== "none" || showSuggestions) && "mt-4",
                )}
              >
                <Eyebrow index="04" tone="muted">
                  {tr("Helplines")}
                </Eyebrow>
                <ul className="mt-4 space-y-2.5">
                  {res.helplines.map((h) => (
                    <li key={h.number} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">
                        {h.name}
                        {h.note ? <span className="ml-2 text-[11.5px] font-normal text-muted">{h.note}</span> : null}
                      </span>
                      <a
                        href={`tel:${h.number}`}
                        className="rounded-full bg-ink px-4 py-1.5 font-mono text-[12px] font-bold text-paper"
                      >
                        {h.number}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasOsm && (
              <p className="mt-4 text-[11.5px] text-muted">
                Facility data © OpenStreetMap contributors (ODbL). Crowd-sourced — verify before travelling.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODE 2: ROLE-SPECIFIC LIVE WORKSPACE                              */}
      {/* ================================================================= */}
      {mode === "workspace" && (
        <Reveal className="mt-10">
          {/* ------------------------------------------------------------- */}
          {/* 1. PARENT WORKSPACE: VISIT PASS & LIVE WORKER CONNECTION       */}
          {/* ------------------------------------------------------------- */}
          {role === "parent" && (
            <div className="grid items-start gap-6 lg:grid-cols-[0.82fr_1.18fr]">
              <div className="space-y-4">
                <p className="font-mono text-[10.5px] font-semibold tracking-[0.22em] text-muted uppercase">
                  {tr("Which check-in?")}
                </p>
                {checkIns.length > 0 ? (
                  checkIns.map((c) => {
                    const e = evaluate(c.scores, c.regression);
                    const tier = c.tier ?? e.tier;
                    const m = TIER_META[tier];
                    const sel = c.id === activeCheckIn?.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCheckInId(c.id);
                          setAge(String(Math.max(0, Math.round(c.ageMonths / 12))));
                          setScreeningResult(tier.toLowerCase() as "typical" | "monitor" | "refer");
                        }}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-[26px] border p-5 text-left transition-all duration-300",
                          sel
                            ? "border-ink bg-ink text-paper shadow-[0_24px_40px_-24px_rgba(31,20,9,0.9)]"
                            : "border-line-2 bg-card hover:-translate-y-0.5 hover:bg-card-2",
                        )}
                      >
                        <span className="size-4 shrink-0 rounded-full" style={{ background: m.hexLight }} />
                        <span className="flex-1">
                          <span className="block font-display text-[30px] leading-none uppercase">
                            {c.child} · {tier}
                          </span>
                          <span className={cn("mt-1 block font-mono text-[11px]", sel ? "text-paper/60" : "text-muted")}>
                            {fmtDate(c.date, true)} · {c.ageMonths} mo
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid size-7 place-items-center rounded-full border",
                            sel ? "border-peach bg-peach text-night" : "border-line-2",
                          )}
                        >
                          {sel && <Check className="size-4" />}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[28px] border border-dashed border-line-2 p-6">
                    <p className="text-[14px] font-bold">No check-in linked yet</p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      Run a short developmental check-in to tailor this visit pass to your child.
                    </p>
                    <Btn size="sm" className="mt-4" onClick={() => go("checkin")}>
                      Start check-in
                    </Btn>
                  </div>
                )}

                <div className="rounded-[32px] border border-line-2 bg-card p-6">
                  <p className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">
                    <ClipboardCheck className="size-3.5 text-rust" /> What to bring to the clinic
                  </p>
                  <ul className="mt-4 space-y-3 text-[13.5px]">
                    {[
                      { id: "mcp_card", label: "Mother & Child Protection (MCP) / immunization card" },
                      { id: "nirixon_pass", label: "This Nirixon visit pass (copied or printed)" },
                      { id: "birth_records", label: "Birth discharge summary & any prior hearing/vision notes" },
                      {
                        id: "school_notes",
                        label:
                          activeContext?.module === "B"
                            ? "School notebook sample & teacher notes (ages 5–12)"
                            : "Short 30-second phone video of the skill at home",
                      },
                    ].map((item) => (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={!!prepChecked[item.id]}
                            onChange={(e) => setPrepChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                            className="mt-1 size-4 rounded border-line-2 accent-ink"
                          />
                          <span className={cn("leading-relaxed", prepChecked[item.id] ? "font-semibold text-ink" : "text-ink-2")}>
                            {item.label}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Live Community Worker / ASHA Support from /api/screen/{sessionId}/workers */}
                {suggestedWorkers.length > 0 && (
                  <div className="rounded-[32px] border border-line-2 bg-card p-6">
                    <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-muted uppercase">
                      Matched community workers
                    </p>
                    <ul className="mt-4 space-y-3">
                      {suggestedWorkers.slice(0, 3).map((w) => (
                        <li key={w.id} className="rounded-2xl border border-line-2 bg-card-2 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13.5px] font-bold">{w.name}</span>
                            <Chip tone="sea">{w.role}</Chip>
                          </div>
                          {w.facility_name && <p className="mt-1 text-[12px] text-ink-2">{w.facility_name}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Btn
                              size="xs"
                              onClick={async () => {
                                if (!activeCheckIn) return;
                                try {
                                  const resp = await api.contactWorker(activeCheckIn.id, {
                                    worker_id: w.id,
                                    contact_method: "whatsapp",
                                    notes: `Requested accompaniment to ${selectedFacility?.name ?? "DEIC"}`,
                                  });
                                  setParentContactStatus(resp.message);
                                  showToast(resp.message);
                                } catch (err) {
                                  showToast(err instanceof Error ? err.message : "Could not log worker request");
                                }
                              }}
                            >
                              Request accompaniment
                            </Btn>
                            {w.phone && (
                              <a
                                href={`tel:${w.phone}`}
                                className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3 py-1.5 text-[11.5px] font-bold"
                              >
                                <PhoneCall className="size-3" /> {w.phone}
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Right: Editorial Visit Pass Card */}
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
                  <Btn size="sm" variant="light" onClick={() => setMode("directory")}>
                    ← Change facility on map
                  </Btn>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      size="sm"
                      variant="rust"
                      disabled={loggingVisit}
                      onClick={() => void handleParentLogFacilityVisit(selectedFacility)}
                    >
                      {loggingVisit ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirm visit to centre
                    </Btn>
                    <Btn
                      size="sm"
                      variant="light"
                      onClick={() => void copyText(buildParentVisitPass(selectedFacility), "Visit pass")}
                    >
                      {copied === "Visit pass" ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} Copy pass
                    </Btn>
                    <Btn size="sm" variant="light" onClick={() => window.print()}>
                      <Printer className="size-3.5" /> Print
                    </Btn>
                    <Btn
                      size="sm"
                      onClick={() =>
                        downloadTextFile(
                          `nirixon-visit-pass-${activeContext?.name ?? "child"}.txt`,
                          buildParentVisitPass(selectedFacility),
                        )
                      }
                    >
                      <Download className="size-3.5" /> Save .txt
                    </Btn>
                  </div>
                </div>

                <div className="rounded-[44px] bg-night p-8 text-paper sm:p-11">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                      <Eyebrow tone="peach" index="02">
                        Clinic visit pass
                      </Eyebrow>
                      <p className="mt-3 font-display text-[clamp(36px,4.5vw,56px)] leading-[0.94] uppercase">
                        {activeContext ? activeContext.name : "Family check-in"}
                      </p>
                      <p className="mt-2 font-mono text-[11.5px] tracking-[0.14em] text-paper/60 uppercase">
                        {activeContext ? `${activeContext.sub} · Module ${activeContext.module}` : `Age ${age} years`}
                      </p>
                    </div>
                    {activeContext && (
                      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
                        <GlowDot
                          hex={TIER_META[activeContext.tier].hexLight}
                          glow={TIER_META[activeContext.tier].glow}
                          size={34}
                        />
                        <div>
                          <p className="font-mono text-[9.5px] tracking-[0.18em] text-paper/55 uppercase">Overall</p>
                          <p
                            className="font-display text-[28px] leading-none uppercase"
                            style={{ color: TIER_META[activeContext.tier].hexLight }}
                          >
                            {activeContext.tier}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Selected Facility */}
                  <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-peach uppercase">
                        Selected map destination
                      </span>
                      {selectedFacility && <Chip tone="night">{selectedFacility.type} · ~{selectedFacility.km} km</Chip>}
                    </div>
                    <p className="mt-2 font-display text-[30px] leading-tight uppercase">
                      {selectedFacility ? selectedFacility.name : "Nearest District Early Intervention Centre (DEIC)"}
                    </p>
                    <p className="mt-1 text-[13.5px] text-paper/75">
                      {selectedFacility
                        ? `${selectedFacility.address || `${selectedFacility.district}, ${selectedFacility.state}`}${selectedFacility.phone ? ` · ${selectedFacility.phone}` : ""}`
                        : "Search your PIN on the directory tab to attach a specific hospital or DEIC."}
                    </p>
                  </div>

                  {/* Matched Services & Questions */}
                  <div className="mt-7">
                    <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">
                      Areas to discuss & specialist match
                    </p>
                    {activeContext && activeContext.flagged.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        {activeContext.flagged.map((d) => (
                          <div key={d.key} className="rounded-2xl bg-white/[0.06] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[14px] font-bold">{d.label}</span>
                              <span className="font-mono text-[11px] text-peach">{d.route.service}</span>
                            </div>
                            <p className="mt-2 text-[13px] leading-relaxed text-paper/75">
                              <b className="text-paper">Ask the doctor:</b> “{d.route.parentQuestion}”
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] text-paper/80">
                        Every checked area is currently in the expected range. Keep this pass for routine well-child visits.
                      </p>
                    )}
                  </div>

                  <p className="mt-7 font-mono text-[10.5px] tracking-[0.14em] text-paper/45 uppercase">
                    Screening summary for discussion — not a medical diagnosis
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 2. HEALTH WORKER WORKSPACE: LIVE CASELOAD DISPATCH & SLIP      */}
          {/* ------------------------------------------------------------- */}
          {role === "chw" && (
            <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
              <div className="space-y-3">
                <p className="px-2 font-mono text-[10.5px] font-semibold tracking-[0.22em] text-muted uppercase">
                  Select child from ward caseload
                </p>
                <ul className="max-h-[560px] space-y-1.5 overflow-y-auto rounded-[36px] border border-line-2 bg-card p-3">
                  {actionableChildren.map((c) => {
                    const on = c.id === activeChild?.id;
                    const sm = STATUS_META[c.status];
                    const ref = latestRefByChild.get(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChildId(c.id);
                            setAge(String(Math.max(0, Math.round(c.ageMonths / 12))));
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors",
                            on ? "bg-ink text-paper" : "hover:bg-card-2",
                          )}
                        >
                          <span className="size-3 shrink-0 rounded-full" style={{ background: sm.hex }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold">{childLabel(c)}</span>
                            <span className={cn("block truncate font-mono text-[11px]", on ? "text-paper/60" : "text-muted")}>
                              {c.ageMonths}m · {ref ? ref.to_facility : c.ward ?? `Sector ${c.sector}`}
                            </span>
                          </span>
                          <Chip tone={ref ? (ref.status === "seen" ? "moss" : "amber") : "sand"}>
                            {ref ? ref.status : "ready"}
                          </Chip>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-[44px] bg-night p-7 text-paper sm:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
                  <div>
                    <Eyebrow tone="peach" index="02">
                      RBSK / DEIC field referral slip
                    </Eyebrow>
                    <p className="mt-3 font-display text-[clamp(34px,4vw,52px)] leading-[0.95] uppercase">
                      {activeChild ? childLabel(activeChild) : "Select a child"}
                    </p>
                    <p className="mt-2 font-mono text-[11px] tracking-[0.14em] text-paper/60 uppercase">
                      {activeChild
                        ? `${activeChild.ageMonths} months · ${activeChild.ward ?? `Sector ${activeChild.sector}`} · Worker: ${workerName ?? "Sunita Devi"}`
                        : "Ward 12"}
                    </p>
                  </div>
                  {activeReferral ? (
                    <Chip tone="moss">
                      DB Status: {activeReferral.status.toUpperCase()}
                    </Chip>
                  ) : (
                    activeChild && <Chip tone="night">{STATUS_META[activeChild.status].long}</Chip>
                  )}
                </div>

                {/* Live Referral Status Trail */}
                {activeReferral && (
                  <div className="mt-5 rounded-2xl border border-moss/40 bg-moss/15 px-5 py-3.5 text-[12.5px]">
                    <p className="font-bold text-paper">
                      Live referral record #{activeReferral.id.slice(0, 8)} · Routed to: {activeReferral.to_facility}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-paper/70">
                      Created {agoShort(activeReferral.created_at) ?? "today"}
                      {activeReferral.sent_at ? ` · Sent ${agoShort(activeReferral.sent_at)}` : ""}
                      {activeReferral.seen_at ? ` · Seen ${agoShort(activeReferral.seen_at)}` : ""}
                      {activeReferral.clinical_notes ? ` · Clinician note: "${activeReferral.clinical_notes}"` : ""}
                    </p>
                  </div>
                )}

                {/* Target Facility Box */}
                <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-peach uppercase">
                      Selected map facility
                    </span>
                    <button
                      type="button"
                      onClick={() => setMode("directory")}
                      className="font-mono text-[11px] font-semibold text-peach underline-offset-4 hover:underline"
                    >
                      Change on map →
                    </button>
                  </div>
                  <p className="mt-2 font-display text-[28px] leading-tight uppercase">
                    {selectedFacility ? selectedFacility.name : activeReferral?.to_facility ?? "Nodal District Early Intervention Centre (DEIC)"}
                  </p>
                  {selectedFacility && (
                    <p className="mt-1 text-[13px] text-paper/75">
                      {selectedFacility.type} · about {selectedFacility.km} km ·{" "}
                      {selectedFacility.address || `${selectedFacility.district}, ${selectedFacility.state}`}
                      {selectedFacility.phone ? ` · ${selectedFacility.phone}` : ""}
                    </p>
                  )}
                </div>

                {/* Flagged domains */}
                <div className="mt-6">
                  <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">
                    Developmental areas to report at DEIC / RBSK
                  </p>
                  {activeContext && activeContext.flagged.length > 0 ? (
                    <ol className="mt-3 space-y-2.5">
                      {activeContext.flagged.map((d, i) => (
                        <li
                          key={d.key}
                          className="flex items-start gap-3.5 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] leading-relaxed text-paper/85"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-peach font-mono text-[11px] font-bold text-night">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-bold text-paper">
                              {d.label} <span className="font-mono text-[11px] text-peach">({d.z.toFixed(1)} SD)</span>
                            </p>
                            <p className="mt-0.5 text-[12.5px] text-paper/75">{d.route.service}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] text-paper/75">
                      General developmental surveillance — no single domain below -1.0 SD on last check-in.
                    </p>
                  )}
                </div>

                {/* Live Actions */}
                <div className="mt-8 flex flex-wrap gap-3">
                  {selectedFacility && activeChild && (
                    <Btn
                      variant="peach"
                      disabled={dispatchingChildId === activeChild.id}
                      onClick={() => void handleLiveFacilityReferral(selectedFacility, activeChild)}
                    >
                      {dispatchingChildId === activeChild.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      {activeReferral
                        ? `Route & re-send to ${selectedFacility.name.slice(0, 22)}`
                        : `Dispatch referral to ${selectedFacility.name.slice(0, 22)}`}
                    </Btn>
                  )}
                  {activeReferral && activeReferral.status === "sent" && (
                    <Btn
                      variant="ghostDark"
                      disabled={dispatchingChildId === activeChild?.id}
                      onClick={() => void handleMarkReferralSeen()}
                    >
                      <CheckCheck className="size-4" /> Mark child seen at facility
                    </Btn>
                  )}
                  {activeReferral && (
                    <a
                      href={referralApi.getSummaryPdfUrl(activeReferral.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[12.5px] font-bold text-paper hover:bg-white/10"
                    >
                      <FileText className="size-4" /> Official PDF summary
                    </a>
                  )}
                  <Btn
                    variant="ghostDark"
                    onClick={() => void copyText(buildChwFieldSlip(selectedFacility, true), "Family WhatsApp message")}
                  >
                    {copied === "Family WhatsApp message" ? <Check className="size-4" /> : <MessageCircle className="size-4" />} Copy family WhatsApp / SMS
                  </Btn>
                  <Btn
                    variant="ghostDark"
                    onClick={() => void copyText(buildChwFieldSlip(selectedFacility, false), "Official RBSK slip")}
                  >
                    {copied === "Official RBSK slip" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} Copy RBSK slip
                  </Btn>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 3. SUPERVISOR WORKSPACE: BLOCK CATCHMENT AUDIT & REROUTING     */}
          {/* ------------------------------------------------------------- */}
          {role === "supervisor" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: "Children needing referral",
                    value: String(supervisorStats.referCount),
                    helper: `+ ${supervisorStats.watchCount} on watch or overdue across Sectors A–D`,
                    tone: "text-brick",
                    icon: <AlertTriangle className="size-4" />,
                  },
                  {
                    label: "Queued handoffs",
                    value: String(supervisorStats.queuedHandoffs),
                    helper: `${supervisorStats.completedHandoffs} completed · ${supervisorStats.activeReferralsDb} tracked records`,
                    tone: "text-amber",
                    icon: <Clock3 className="size-4" />,
                  },
                  {
                    label: `DEIC & RBSK near ${asked || pin}`,
                    value: String(supervisorStats.deicCountInList),
                    helper: res?.state_deic
                      ? `${res.state_deic.operational} operational DEICs in ${res.state_deic.state}`
                      : "Early-intervention centres in current PIN lookup",
                    tone: "text-sea",
                    icon: <Stethoscope className="size-4" />,
                  },
                  {
                    label: "Trusted listings",
                    value: `${supervisorStats.trustedCountInList}/${rawList.length || 0}`,
                    helper: "Government & verified entries vs. mapped-only leads",
                    tone: "text-moss",
                    icon: <CheckCheck className="size-4" />,
                  },
                ].map((item, i) => (
                  <Reveal key={item.label} delay={i * 50} className="h-full">
                    <StatCard label={item.label} value={item.value} helper={item.helper} tone={item.tone} icon={item.icon} />
                  </Reveal>
                ))}
              </div>

              <SectionCard
                index="02"
                eyebrow="Multi-PIN block catchment audit"
                title="Compare DEIC/RBSK availability, nearest specialist distance and provenance across sector PINs."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Btn size="xs" variant="light" onClick={exportDirectoryCsv}>
                      <FileSpreadsheet className="size-3.5" /> Export current PIN (.CSV)
                    </Btn>
                    <Btn size="xs" onClick={() => void runBlockCatchmentAudit()} disabled={auditingBlock}>
                      {auditingBlock ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />}
                      {auditingBlock ? "Auditing…" : "Refresh 5-PIN audit"}
                    </Btn>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line bg-sand/40 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
                        <th className="px-6 py-3.5">PIN / Area</th>
                        <th className="px-4 py-3.5">District & State</th>
                        <th className="px-4 py-3.5">Coverage tier</th>
                        <th className="px-4 py-3.5 text-right">DEIC / RBSK</th>
                        <th className="px-4 py-3.5 text-right">Nearest DEIC</th>
                        <th className="px-4 py-3.5 text-right">Trusted / Total</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-[13.5px]">
                      {auditRows.map((row) => (
                        <tr key={row.pin} className="transition-colors hover:bg-sand/30">
                          <td className="px-6 py-4 font-bold">
                            <span className="font-mono">{row.pin}</span> · {row.label}
                          </td>
                          <td className="px-4 py-4 text-ink-2">
                            {row.district}, {row.state}
                          </td>
                          <td className="px-4 py-4">
                            <Chip tone={row.coverage === "nearby" ? "moss" : row.coverage === "district" ? "amber" : "brick"}>
                              {row.coverage}
                            </Chip>
                          </td>
                          <td className="px-4 py-4 text-right font-mono font-bold">{row.deicRbskCount}</td>
                          <td className="px-4 py-4 text-right font-mono">
                            {row.nearestDeicKm !== null ? `${row.nearestDeicKm} km` : "Gap"}
                          </td>
                          <td className="px-4 py-4 text-right font-mono">
                            {row.trustedCount}/{row.totalCount}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Btn
                              size="xs"
                              variant="light"
                              onClick={() => {
                                setPin(row.pin);
                                void search(row.pin);
                                setMode("directory");
                              }}
                            >
                              View on map →
                            </Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard
                index="03"
                eyebrow="Live referral routing desk"
                title="Reroute open ward referrals to the currently selected map facility."
                action={
                  <Btn size="xs" variant="light" onClick={() => go("referrals")}>
                    Open full referral desk →
                  </Btn>
                }
              >
                <div className="divide-y divide-line">
                  {referralRecords.slice(0, 6).map((ref) => {
                    const c = children.find((ch) => ch.id === ref.child_id);
                    if (!c) return null;
                    return (
                      <div key={ref.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-[13px] font-bold">{childLabel(c)}</span>
                            <Chip tone={ref.status === "seen" ? "moss" : ref.status === "sent" ? "amber" : "brick"}>
                              {ref.status}
                            </Chip>
                          </div>
                          <p className="mt-1 text-[12px] text-ink-2">
                            Current destination: <b className="text-ink">{ref.to_facility}</b>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedFacility && (ref.status ?? "").toLowerCase() !== "closed" && (
                            <Btn
                              size="xs"
                              variant="rust"
                              disabled={dispatchingChildId === c.id}
                              onClick={() => void handleLiveFacilityReferral(selectedFacility, c)}
                            >
                              <Send className="size-3.5" /> Route to {selectedFacility.name.slice(0, 22)}
                            </Btn>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* 4. CLINICIAN WORKSPACE: LIVE SUBSPECIALTY ROUTER & DB HANDOFF  */}
          {/* ------------------------------------------------------------- */}
          {role === "clinician" && (
            <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
              <div className="space-y-4">
                <p className="px-2 font-mono text-[10.5px] font-semibold tracking-[0.22em] text-muted uppercase">
                  Select referred patient case
                </p>
                <ul className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-[36px] border border-line-2 bg-card p-3">
                  {actionableChildren.slice(0, 14).map((c) => {
                    const on = c.id === activeChild?.id;
                    const sm = STATUS_META[c.status];
                    const ref = latestRefByChild.get(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChildId(c.id);
                            setAge(String(Math.max(0, Math.round(c.ageMonths / 12))));
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition-colors",
                            on ? "bg-ink text-paper" : "hover:bg-card-2",
                          )}
                        >
                          <span className="size-3 shrink-0 rounded-full" style={{ background: sm.hex }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold">{childLabel(c)}</span>
                            <span className={cn("block truncate font-mono text-[11px]", on ? "text-paper/60" : "text-muted")}>
                              {c.ageMonths}m · {ref ? ref.to_facility : sm.label}
                            </span>
                          </span>
                          {ref && (
                            <Chip tone={ref.status === "seen" ? "moss" : ref.status === "sent" ? "amber" : "brick"}>
                              {ref.status}
                            </Chip>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="rounded-[32px] border border-line-2 bg-card p-5">
                  <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                    Filter directory by subspecialty
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SUBSPECIALTY_FILTERS.map((sf) => (
                      <button
                        key={sf.id}
                        type="button"
                        onClick={() => {
                          setSubspecialtyFilter(sf.id);
                          setMode("directory");
                        }}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                          subspecialtyFilter === sf.id
                            ? "border-ink bg-ink text-paper"
                            : "border-line-2 bg-card-2 text-ink-2 hover:border-ink",
                        )}
                      >
                        {sf.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[44px] bg-night p-7 text-paper sm:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
                  <div>
                    <Eyebrow tone="peach" index="02">
                      Clinical counter-referral & rule-out protocol
                    </Eyebrow>
                    <p className="mt-3 font-display text-[clamp(34px,4vw,52px)] leading-[0.95] uppercase">
                      {activeContext ? activeContext.name : "Clinical case"}
                    </p>
                    <p className="mt-2 font-mono text-[11px] tracking-[0.14em] text-paper/60 uppercase">
                      {activeContext ? `${activeContext.sub} · Module ${activeContext.module}` : "Multidisciplinary routing"}
                    </p>
                  </div>
                  {activeContext && (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
                      <GlowDot
                        hex={TIER_META[activeContext.tier].hexLight}
                        glow={TIER_META[activeContext.tier].glow}
                        size={32}
                      />
                      <span
                        className="font-display text-[26px] leading-none uppercase"
                        style={{ color: TIER_META[activeContext.tier].hexLight }}
                      >
                        {activeContext.tier}
                      </span>
                    </div>
                  )}
                </div>

                {/* Live DB Referral Status */}
                {activeReferral && (
                  <div className="mt-5 rounded-2xl border border-moss/40 bg-moss/15 px-5 py-3.5 text-[12.5px]">
                    <p className="font-bold text-paper">
                      Live referral #{activeReferral.id.slice(0, 8)} · Status: {activeReferral.status.toUpperCase()}
                    </p>
                    <p className="mt-1 text-paper/75">
                      Assigned facility: <b className="text-paper">{activeReferral.to_facility}</b>
                      {activeReferral.seen_at ? ` · Acknowledged ${agoShort(activeReferral.seen_at)}` : ""}
                    </p>
                  </div>
                )}

                {/* Receiving facility + provenance */}
                <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-peach uppercase">
                      Selected map centre & provenance
                    </span>
                    <button
                      type="button"
                      onClick={() => setMode("directory")}
                      className="font-mono text-[11px] font-semibold text-peach underline-offset-4 hover:underline"
                    >
                      Change on map →
                    </button>
                  </div>
                  <p className="mt-2 font-display text-[28px] leading-tight uppercase">
                    {selectedFacility ? selectedFacility.name : activeReferral?.to_facility ?? "Nodal DEIC / Developmental Paediatrics"}
                  </p>
                  {selectedFacility && (
                    <p className="mt-1 text-[13px] text-paper/75">
                      {selectedFacility.type} · ~{selectedFacility.km} km · Provenance:{" "}
                      <b className="text-paper">{selectedFacility.trust.label}</b> ({selectedFacility.source})
                    </p>
                  )}
                </div>

                {/* Mandatory pre-diagnostic rule-outs */}
                <div className="mt-6">
                  <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">
                    Mandatory clinical rule-outs before diagnostic labelling
                  </p>
                  {activeContext && activeContext.flagged.length > 0 ? (
                    <ol className="mt-3 space-y-3">
                      {activeContext.flagged.map((d, i) => (
                        <li
                          key={d.key}
                          className="flex items-start gap-3.5 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] leading-relaxed text-paper/85"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-peach font-mono text-[11px] font-bold text-night">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-paper">
                                {d.label} <span className="font-mono text-[11px] text-peach">({d.z.toFixed(2)} SD)</span>
                              </span>
                              <span className="font-mono text-[11px] text-paper/70">{d.route.service}</span>
                            </div>
                            <p className="mt-1 text-[12.5px] text-paper/75">
                              <b className="text-paper">Rule-out:</b> {d.route.ruleOut}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-white/[0.06] p-4 text-[13.5px] text-paper/75">
                      All domains sit above -1.0 SD for this case. Routine developmental surveillance applies.
                    </p>
                  )}
                </div>

                {/* Live Clinical Note Input saved to ReferralRecord */}
                <div className="mt-6">
                  <label className="block">
                    <span className="mb-2 block font-mono text-[10.5px] font-semibold tracking-[0.2em] text-paper/55 uppercase">
                      Clinical counter-referral note (persisted to referral record)
                    </span>
                    <textarea
                      value={clinicalNoteDraft}
                      onChange={(e) => setClinicalNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="e.g. Complete OAE/BERA hearing rule-out at DEIC prior to speech therapy intake…"
                      className="w-full resize-none rounded-2xl border border-white/15 bg-white/[0.06] p-4 text-[13.5px] text-paper placeholder:text-paper/35 focus:border-peach focus:outline-none"
                    />
                  </label>
                </div>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Btn
                    variant="peach"
                    disabled={savingClinicalHandoff || !activeChild}
                    onClick={() => void handleClinicianAcknowledgeAndRoute()}
                  >
                    {savingClinicalHandoff ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
                    Acknowledge & save route to {selectedFacility ? selectedFacility.name.slice(0, 20) : "DEIC"}
                  </Btn>
                  <Btn
                    variant="ghostDark"
                    onClick={() => void copyText(buildClinicianCounterReferral(selectedFacility), "Clinical handoff note")}
                  >
                    {copied === "Clinical handoff note" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} Copy handoff note
                  </Btn>
                  <Btn
                    variant="ghostDark"
                    onClick={() =>
                      downloadTextFile(
                        `nirixon-clinical-handoff-${activeContext?.name ?? "case"}.txt`,
                        buildClinicianCounterReferral(selectedFacility),
                      )
                    }
                  >
                    <Download className="size-4" /> Download .txt
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </Reveal>
      )}
    </Page>
  );
}
