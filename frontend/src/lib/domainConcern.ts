/**
 * Maps backend SHAP / domain signals to parent-facing concern levels.
 *
 * PLACEHOLDER (Section 5): clinical sign-off required before shipping
 * real attribution messaging to parents. Keep this transform isolated —
 * swap the mapping in one place when the decision lands.
 *
 * Domain labels match the Stage 1 item bank / design rationale:
 * Gross Motor, Fine Motor, Communication, Personal-Social, Cognitive,
 * Self-Help/Adaptive.
 *
 * Imputed-item attribution must never reach the parent UI. We only consume
 * `shap_values` / `shap_top_features` from ResultPayload (backend documents
 * these as real-answer attributions) and explicitly discard any feature keys
 * that look like imputation markers if they ever appear.
 */

export type ConcernLevel =
  | "typical"
  | "keep_an_eye"
  | "worth_discussing";

export interface DomainConcern {
  domain: string;
  label: string;
  level: ConcernLevel;
  plainLanguage: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  // Module A
  gross_motor: "Gross Motor",
  fine_motor: "Fine Motor",
  communication: "Communication",
  cognitive: "Cognitive",
  personal_social: "Personal-Social",
  self_help: "Self-Help / Adaptive",
  background: "Background",
  // Module B
  attention: "Attention",
  reading: "Reading",
  writing: "Writing",
  numbers: "Numbers",
  listening_speaking: "Listening & speaking",
  motor: "Motor coordination",
  social: "Social",
  emotion_conduct: "Emotion & conduct",
};

/** Parent-friendly guides for the six Module A developmental areas. */
export interface DomainGuide {
  /** Short everyday name parents recognize. */
  everydayName: string;
  /** One-sentence definition. */
  whatItMeans: string;
  /** Concrete examples at toddler/preschool ages. */
  examples: string;
  /** Why clinicians care, in plain language. */
  whyItMatters: string;
  /** Soft tip when this area is flagged keep-an-eye / worth discussing. */
  discussTip: string;
}

export const DOMAIN_GUIDES: Record<string, DomainGuide> = {
  gross_motor: {
    everydayName: "Big movements",
    whatItMeans:
      "How your child uses large muscles for sitting, crawling, walking, running, and climbing.",
    examples:
      "Rolling, pulling to stand, walking, kicking a ball, climbing stairs.",
    whyItMatters:
      "Strong big-movement skills help children explore, play safely, and build confidence.",
    discussTip:
      "Notice how your child moves during play and outdoor time, and share examples with your paediatrician.",
  },
  fine_motor: {
    everydayName: "Hand & finger skills",
    whatItMeans:
      "How your child uses hands and fingers for grasping, stacking, scribbling, and self-feeding.",
    examples:
      "Picking up small pieces of food, stacking blocks, turning pages, holding a crayon.",
    whyItMatters:
      "These skills support feeding, play, drawing, and later writing.",
    discussTip:
      "Try short play with blocks, crayons, or spoons and note what feels easy or hard.",
  },
  communication: {
    everydayName: "Talking & understanding",
    whatItMeans:
      "How your child understands words and expresses needs through sounds, gestures, or speech.",
    examples:
      "Responding to their name, pointing, saying words, following simple directions.",
    whyItMatters:
      "Communication underpins learning, bonding, and asking for help.",
    discussTip:
      "Note how your child asks for things and how they respond when you talk with them.",
  },
  personal_social: {
    everydayName: "People skills",
    whatItMeans:
      "How your child relates to caregivers and others — eye contact, sharing attention, and social play.",
    examples:
      "Smiling back, showing toys, playing peek-a-boo, noticing other children.",
    whyItMatters:
      "Social connection supports emotional security and later friendships.",
    discussTip:
      "Share how your child greets familiar people and joins in simple back-and-forth play.",
  },
  cognitive: {
    everydayName: "Thinking & learning",
    whatItMeans:
      "How your child solves problems, remembers, and explores how things work.",
    examples:
      "Finding a hidden toy, matching shapes, simple pretend play, figuring out containers.",
    whyItMatters:
      "Thinking skills grow through everyday curiosity and guided play.",
    discussTip:
      "Describe puzzles or everyday problems your child tries to figure out on their own.",
  },
  self_help: {
    everydayName: "Everyday independence",
    whatItMeans:
      "How your child begins to manage daily routines like feeding, dressing, and hygiene with support.",
    examples:
      "Holding a cup, helping with clothes, washing hands with help, tidy-up routines.",
    whyItMatters:
      "Growing independence builds confidence and prepares children for school routines.",
    discussTip:
      "Note which daily routines your child can start or finish with a little help.",
  },
  // Module B (5–12 years)
  attention: {
    everydayName: "Focus & work habits",
    whatItMeans:
      "How your child sustains attention, finishes tasks, and manages distractions at home or school.",
    examples:
      "Staying with homework, listening when spoken to, organising belongings, sitting through a lesson.",
    whyItMatters:
      "Attention skills support learning, safety, and completing everyday responsibilities.",
    discussTip:
      "Note times of day or settings when focus is easier or harder, and share concrete examples.",
  },
  reading: {
    everydayName: "Reading",
    whatItMeans:
      "How your child reads words, keeps pace with classmates, and understands what they read.",
    examples:
      "Sounding out words, reading aloud, losing place on the page, avoiding books.",
    whyItMatters:
      "Reading underpins almost every school subject and builds confidence.",
    discussTip:
      "Bring a recent reading sample or note how homework reading goes at home.",
  },
  writing: {
    everydayName: "Writing & spelling",
    whatItMeans:
      "How your child forms letters, spells, and puts thoughts on paper.",
    examples:
      "Messy handwriting, slow writing, spelling struggles, avoiding written work.",
    whyItMatters:
      "Writing is how children show what they know across subjects.",
    discussTip:
      "Save a short writing sample and note whether saying ideas aloud is easier than writing them.",
  },
  numbers: {
    everydayName: "Numbers & maths",
    whatItMeans:
      "How your child understands numbers, calculations, and everyday maths like money or time.",
    examples:
      "Counting, times tables, word problems, telling time, handling small amounts of money.",
    whyItMatters:
      "Number sense supports school maths and practical daily life.",
    discussTip:
      "Note which maths tasks feel hardest and whether the struggle is new or long-standing.",
  },
  listening_speaking: {
    everydayName: "Listening & speaking",
    whatItMeans:
      "How your child follows spoken instructions and explains ideas clearly.",
    examples:
      "Following multi-step directions, finding words, being understood by others.",
    whyItMatters:
      "Listening and speaking skills affect classroom learning and friendships.",
    discussTip:
      "Share whether misunderstandings happen more with new instructions or everyday chat.",
  },
  motor: {
    everydayName: "Movement & coordination",
    whatItMeans:
      "How your child coordinates large and fine movements for play, sports, and classroom tasks.",
    examples:
      "Catching a ball, using scissors, balance, PE class, riding a bike.",
    whyItMatters:
      "Coordination supports play, handwriting stamina, and joining in with peers.",
    discussTip:
      "Note PE, playground, or craft activities that feel awkward compared with classmates.",
  },
  social: {
    everydayName: "Friendships & peers",
    whatItMeans:
      "How your child joins in with peers, takes turns, and maintains friendships.",
    examples:
      "Making friends, sharing, playdates, feeling left out, getting along in class.",
    whyItMatters:
      "Peer relationships shape wellbeing and school belonging.",
    discussTip:
      "Describe how your child gets on with classmates at school and in free play.",
  },
  emotion_conduct: {
    everydayName: "Feelings & behaviour",
    whatItMeans:
      "How your child manages worry, frustration, and everyday behaviour at home and school.",
    examples:
      "School refusal, big anger, anxiety before school, frequent outbursts, low mood.",
    whyItMatters:
      "Emotional regulation and conduct affect learning, safety, and family life.",
    discussTip:
      "Note triggers, how long outbursts last, and what helps your child settle.",
  },
};

const PLAIN: Record<ConcernLevel, string> = {
  // PLACEHOLDER copy — clinical UX sign-off pending (Section 5)
  typical: "Looking typical for this check-in",
  keep_an_eye: "Something to keep an eye on over the next weeks",
  worth_discussing: "Worth mentioning to your paediatrician",
};

export function getDomainGuide(domain: string): DomainGuide | null {
  return DOMAIN_GUIDES[domain] ?? null;
}

export function concernLevelLabel(level: ConcernLevel): string {
  switch (level) {
    case "typical":
      return "Typical";
    case "keep_an_eye":
      return "Keep an eye on this";
    case "worth_discussing":
      return "Worth discussing";
  }
}

const SCREENING_DOMAINS = [
  "gross_motor",
  "fine_motor",
  "communication",
  "personal_social",
  "cognitive",
  "self_help",
] as const;

/** Module B functioning domains (ages 60–144 months). */
export const MODULE_B_DOMAINS = [
  "attention",
  "reading",
  "writing",
  "numbers",
  "listening_speaking",
  "motor",
  "social",
  "emotion_conduct",
] as const;

export type ModuleKind = "A" | "B";

export function domainsForModule(module: ModuleKind): readonly string[] {
  return module === "B" ? MODULE_B_DOMAINS : SCREENING_DOMAINS;
}

/** Drop keys that could represent imputed / synthetic attributions. */
export function discardImputedFeatures(
  shapValues: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [feature, value] of Object.entries(shapValues)) {
    const lower = feature.toLowerCase();
    if (
      lower.includes("imput") ||
      lower.startsWith("imputed_") ||
      lower.includes("__imputed")
    ) {
      continue;
    }
    out[feature] = value;
  }
  return out;
}

/**
 * Derive a simplified concern level per developmental domain from
 * shap_values keys. Does NOT expose raw SHAP numbers to the parent UI.
 */
export function toDomainConcerns(
  shapValues: Record<string, number>,
  finalClassification: string,
): DomainConcern[] {
  const realOnly = discardImputedFeatures(shapValues);
  const byDomain = new Map<string, number>();

  for (const [feature, value] of Object.entries(realOnly)) {
    const domain = inferDomainFromFeature(feature);
    if (!domain || domain === "background") continue;
    const abs = Math.abs(value);
    byDomain.set(domain, Math.max(byDomain.get(domain) ?? 0, abs));
  }

  // Always show all six Module A domains so parents get a complete picture.
  const magnitudes = [...byDomain.values()];
  const maxMag = magnitudes.length ? Math.max(...magnitudes) : 0;

  return [...SCREENING_DOMAINS].map((domain) => {
    const mag = byDomain.get(domain) ?? 0;
    const level = concernFromMagnitude(mag, maxMag, finalClassification);
    return {
      domain,
      label: DOMAIN_LABELS[domain] ?? humanize(domain),
      level,
      plainLanguage: PLAIN[level],
    };
  });
}

/** Map Module B rule-based domain labels into parent-facing concern rows. */
export function toModuleBDomainConcerns(
  domainClassifications: Record<string, string> | null | undefined,
  finalClassification: string,
): DomainConcern[] {
  const map: Record<string, ConcernLevel> = {
    Typical: "typical",
    Monitor: "keep_an_eye",
    Refer: "worth_discussing",
  };

  const entries = Object.entries(domainClassifications ?? {});
  if (entries.length === 0) {
    const level: ConcernLevel =
      finalClassification === "Refer"
        ? "worth_discussing"
        : finalClassification === "Monitor"
          ? "keep_an_eye"
          : "typical";
    return [
      {
        domain: "overall",
        label: "Overall functioning",
        level,
        plainLanguage: PLAIN[level],
      },
    ];
  }

  // Show classified domains first (touched in this check-in), stable order
  const classified = new Map(entries);
  return [...MODULE_B_DOMAINS]
    .filter((d) => classified.has(d))
    .map((domain) => {
      const raw = classified.get(domain) ?? "Typical";
      const level = map[raw] ?? "typical";
      return {
        domain,
        label: DOMAIN_LABELS[domain] ?? humanize(domain),
        level,
        plainLanguage: PLAIN[level],
      };
    });
}

function concernFromMagnitude(
  mag: number,
  maxMag: number,
  finalClassification: string,
): ConcernLevel {
  if (maxMag <= 0) {
    if (finalClassification === "Refer") return "worth_discussing";
    if (finalClassification === "Monitor") return "keep_an_eye";
    return "typical";
  }
  const ratio = mag / maxMag;
  // PLACEHOLDER thresholds — swap after clinical review (Section 5)
  if (ratio >= 0.66) return "worth_discussing";
  if (ratio >= 0.33) return "keep_an_eye";
  return "typical";
}

function inferDomainFromFeature(feature: string): string | null {
  const lower = feature.toLowerCase();
  for (const d of [...SCREENING_DOMAINS, ...MODULE_B_DOMAINS]) {
    if (lower.includes(d)) {
      return d;
    }
  }
  // Module A: GM01, FM02, CM03, CG04, PS05, SH06
  // Module B: AT, RD, WR, NM, LS, MT, SC, EM
  const PREFIX_MAP: Record<string, string> = {
    gm: "gross_motor",
    fm: "fine_motor",
    cm: "communication",
    cg: "cognitive",
    ps: "personal_social",
    sh: "self_help",
    com: "communication",
    cog: "cognitive",
    at: "attention",
    rd: "reading",
    wr: "writing",
    nm: "numbers",
    ls: "listening_speaking",
    mt: "motor",
    sc: "social",
    em: "emotion_conduct",
  };
  const letters = lower.replace(/[^a-z]/g, "");
  for (const prefix of [
    "com",
    "cog",
    "ls",
    "gm",
    "fm",
    "cm",
    "cg",
    "ps",
    "sh",
    "at",
    "rd",
    "wr",
    "nm",
    "mt",
    "sc",
    "em",
  ]) {
    if (letters.startsWith(prefix) && PREFIX_MAP[prefix]) {
      return PREFIX_MAP[prefix]!;
    }
  }
  return null;
}

/** Infer domain from a answered item_id for progress resume. */
export function domainFromItemId(itemId: string): string | null {
  return inferDomainFromFeature(itemId);
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export { DOMAIN_LABELS, SCREENING_DOMAINS };
