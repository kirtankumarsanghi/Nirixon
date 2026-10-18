import claimsRegister from "./claims_register.json";

export const claims = claimsRegister.claims;

/* ------------------------------------------------------------------ */
/*  Media (stock footage, URL-based)                                   */
/* ------------------------------------------------------------------ */

export const MEDIA = {
  earlyBg: "https://videos.pexels.com/video-files/7270074/7270074-uhd_4096_2160_25fps.mp4", // mother & child blocks
  scholarBg: "https://videos.pexels.com/video-files/5198168/5198168-uhd_3840_2160_25fps.mp4", // classroom teaching
  triageBg: "https://videos.pexels.com/video-files/6036522/6036522-uhd_3840_2160_30fps.mp4", // pediatric checkup
  /** Young Indian child, Dhari, Gujarat — real photograph */
  triageStill:
    "https://images.pexels.com/photos/16061710/pexels-photo-16061710.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1000&h=1100",
};

/* ------------------------------------------------------------------ */
/*  Portal destinations — the Planet-Jumping state chain, re-themed:   */
/*  Early (0–5) -> Scholar (5–12) -> Triage (terminal)                  */
/* ------------------------------------------------------------------ */

export type StateId = "early" | "scholar" | "triage";

export interface PortalState {
  id: StateId;
  name: string;
  title: string;
  next: string;
  number: string;
  video?: string;
  image?: string;
  bg: "earlyBg" | "scholarBg" | "triageBg";
  accent: string;
  facts: [string, string][];
}

export const STATES: Record<StateId, PortalState> = {
  early: {
    id: "early",
    name: "Early",
    title: "EARLY",
    next: "Scholar",
    number: "[02]",
    video: MEDIA.scholarBg,
    bg: "earlyBg",
    accent: "#e58a52",
    facts: [
      ["Age band:", "0–60 months (0–5 yrs) · 6 areas."],
      ["Adaptive flow:", `${claims.module_a_questions_range.display} · under 5 minutes.`],
      ["Language:", "English, Hindi or Hinglish."],
      ["Built on:", "CDC milestones · WHO motor standards."],
    ],
  },
  scholar: {
    id: "scholar",
    name: "Scholar",
    title: "SCHOLAR",
    next: "Triage",
    number: "[03]",
    video: MEDIA.triageBg,
    bg: "scholarBg",
    accent: "#84b8c6",
    facts: [
      ["Age band:", "5–12 years (60–144 mo) · 8 areas."],
      ["Adaptive flow:", `${claims.module_b_questions_range.display} · NLP intake routing.`],
      ["Settings:", "Home and school answers compared."],
      ["Includes:", "Vision & hearing, attention, reading."],
    ],
  },
  triage: {
    id: "triage",
    name: "Triage",
    title: "TRIAGE",
    next: "Early",
    number: "[01]",
    // Preview the destination (Early) so the journey loops: Early → Scholar → Triage → Early
    video: MEDIA.earlyBg,
    bg: "triageBg",
    accent: "#7fb069",
    facts: [
      ["Backend tiers:", "Typical · Monitor · Refer."],
      ["Refer precision:", `${claims.module_a_refer_precision.display} on held-out test.`],
      ["Refer specificity:", `${claims.module_a_refer_specificity.display} (n=${claims.module_a_test_n.value}).`],
      ["Safety floor:", "Deterministic override, always on."],
    ],
  },
};

export const CHAIN: StateId[] = ["early", "scholar", "triage"];

/* Sidebar journey rail — destination rows are navigable */
export const JOURNEY: { label: string; state?: StateId }[] = [
  { label: "Early · 0–60 months (0–5 yrs)", state: "early" },
  { label: "6 Areas of Development" },
  { label: "English · Hindi · Hinglish" },
  { label: "Scholar · 5–12 yrs", state: "scholar" },
  { label: "Home + School Compared" },
  { label: "Vision & Hearing" },
  { label: "Triage · 3 Results", state: "triage" },
  { label: "Safety Rule · Always On" },
];

export const ACTIVE_ROW: Record<StateId, number> = { early: 0, scholar: 3, triage: 6 };

/* ------------------------------------------------------------------ */
/*  Real photography — India context (Pexels, not AI-generated)         */
/* ------------------------------------------------------------------ */

const px = (id: number, w: number, h: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`;

/* Every frame below is real photography shot in India / of Indian subjects.
   No synthetic or AI-generated imagery is used anywhere on this site.       */
export const PHOTOS = {
  /** Mother caressing her laughing daughter, India — early years */
  early: px(18094985, 1400, 1050),
  /** Indian schoolgirls in uniform, classroom — school age */
  scholar: px(3231359, 1400, 1050),
  /** Joyful mother holding toddler at home, India */
  ctaEarly: px(6059971, 800, 1000),
  /** Teacher guiding students through a lesson, India */
  ctaSchool: px(22616347, 800, 1000),
  /** Schoolgirls walking a tree-lined street in Raipur, India */
  street: px(39122596, 1800, 1012),
  /** Indian female doctor in traditional attire — Dr. Jyoti Bandi */
  doctor: px(36665076, 400, 400),
  /** Indian educator portrait — Animesh Srivastava */
  teacher: px(7704090, 400, 400),
  /** Smiling Indian woman in traditional attire — Satyabrata Maiti */
  asha: px(19224008, 400, 400),

  /* ---- cinematic act chapters ---- */
  /** Young Indian child, Dhari, Gujarat — Darshan Dave */
  childGujarat: px(16061710, 1100, 1400),
  /** Indian boy smiling on a busy street — Anas Jawed */
  streetBoy: px(16542981, 1100, 1400),
  /** Indian girl in yellow at a cultural event, Khatti — Ramkrishan Rathore */
  drumGirl: px(16574703, 1100, 1400),
  /** Doctor examining a child with a stethoscope, clinic */
  clinicChild: px(5998445, 1800, 1012),
  /** Pediatric eye examination — the sensory-deficit chapter */
  eyeExam: px(5996762, 1800, 1012),
  /** Cheerful South Asian siblings — Tarikul Raana */
  siblings: px(9633840, 1100, 1400),
  /** Children playing joyfully in a sunny rural field, India — Dev Raj */
  childrenPlaying: px(11344264, 1600, 1000),
  /** Happy Indian school children sitting together learning — Kunal Lakhotia */
  schoolGroup: px(20556421, 1600, 1000),
  /** Cheerful boys standing together, India — Tasveere Byquasai */
  boysGroup: px(14587888, 1400, 950),
  /** Traditional Indian baby shoes held in hands — Darshan Dave */
  babyCare: px(39739598, 1200, 900),
  /** Loving mother caressing laughing child indoor — Pragyan */
  motherLaugh: px(18094985, 1200, 900),

  /* ---- editorial lower half ---- */
  /** Mother holding her baby under a traditional roof, Kerala — Albin Biju */
  motherBaby: px(9366092, 1100, 1100),
  /** Mother embracing her infant — Charanjeet Channi */
  motherInfant: px(20317513, 900, 1300),
  /** Woman in traditional attire in a rural field, Kanpur — Tanmay Awasthi */
  ruralMom: px(20281428, 900, 1300),
  /** Grandmother with her grandchild at a home entrance — Sagar Sintan */
  grandma: px(17050887, 900, 1300),
  /** Father carrying his smiling son — Shailesh Mishra */
  father: px(13068718, 900, 1300),
  /** Indian female doctor in traditional attire, tall crop — Dr. Jyoti Bandi */
  doctorTall: px(36665076, 900, 1300),
  /** Smiling Indian woman in traditional attire, tall crop — Satyabrata Maiti */
  ashaTall: px(19224008, 900, 1300),
  /** Girl in yellow at a cultural event, Khatti, square crop */
  drumGirlSquare: px(16574703, 1000, 1000),
};

/* ------------------------------------------------------------------ */
/*  Module showcase (below the fold)                                   */
/* ------------------------------------------------------------------ */

export const SHOWCASE = [
  {
    id: "early",
    num: "[01]",
    name: "Nirixon Early",
    band: "Ages 0–60 months (0–5 yrs)",
    headline: "6 areas of development, checked in under 5 minutes",
    tagline: "CDC milestones · WHO motor standards",
    img: PHOTOS.early,
    accent: "#b04f1f",
    facts: [
      ["Age band", "0–60 months"],
      ["Questions", claims.module_a_questions_range.display],
      ["Age brackets", "17"],
      ["Basis", "CDC 75th percentile"],
    ] as [string, string][],
    areas: [
      ["Large body movement", "sitting, cruising, walking, kicking a ball"],
      ["Hand & finger skills", "pincer grasp, stacking blocks, turning pages"],
      ["Speech & understanding", "babbling, responding to name, two-word phrases"],
      ["Thinking & exploring", "finding hidden objects, sorting shapes"],
      ["Social connection", "smiling, eye contact, parallel play"],
      ["Daily-life independence", "drinking from a cup, feeding self, washing hands"],
    ] as [string, string][],
    blurbs: [
      "Built on CDC 75th-percentile milestones and WHO motor standards, across 17 age brackets.",
    ],
  },
  {
    id: "scholar",
    num: "[02]",
    name: "Nirixon Scholar",
    band: "Ages 5–12",
    headline: "8 areas of functioning, home and school together",
    tagline: "Parent + teacher · Your own words",
    img: PHOTOS.scholar,
    accent: "#2f6d81",
    facts: [
      ["Age band", "5–12 years (60–144 mo)"],
      ["Questions", claims.module_b_questions_range.display],
      ["Languages", "English · Hindi · Hinglish"],
      ["Settings", "Home + school"],
    ] as [string, string][],
    areas: [
      ["Attention & focus", ""],
      ["Reading & phonics", ""],
      ["Writing & motor", ""],
      ["Math & numbers", ""],
      ["Listening & speech", ""],
      ["Social skills", ""],
      ["Emotion & behaviour", ""],
      ["Vision & hearing", ""],
    ] as [string, string][],
    blurbs: [
      "Tell us in your own words; we match it to the right areas and ask a few focused questions.",
    ],
  },
];

export const TIERS = [
  {
    tier: "Typical",
    name: "Typical (On Track)",
    tone: "#7fb069",
    description:
      "Children on track receive age-appropriate developmental enrichment and home practice activities.",
    stat: "Guided home activities",
  },
  {
    tier: "Monitor",
    name: "Monitor (Targeted Watch)",
    tone: "#d9a44a",
    description:
      "Borderline profiles receive structured follow-up items, home stimulation activities, and re-screening.",
    stat: "Active developmental follow-up",
  },
  {
    tier: "Refer",
    name: "Refer (Clinical Pathway)",
    tone: "#e58a52",
    description:
      "High-risk indicators or safety-floor triggers route directly to paediatric specialists and local DEIC centres.",
    stat: "Prompt clinical evaluation",
  },
];

