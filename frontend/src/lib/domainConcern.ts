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
  gross_motor: "Gross Motor",
  fine_motor: "Fine Motor",
  communication: "Communication",
  cognitive: "Cognitive",
  personal_social: "Personal-Social",
  self_help: "Self-Help / Adaptive",
  background: "Background",
};

const PLAIN: Record<ConcernLevel, string> = {
  // PLACEHOLDER copy — clinical UX sign-off pending (Section 5)
  typical: "Typical for this check-in",
  keep_an_eye: "Keep an eye on this",
  worth_discussing: "Worth discussing with a pediatrician",
};

const SCREENING_DOMAINS = [
  "gross_motor",
  "fine_motor",
  "communication",
  "personal_social",
  "cognitive",
  "self_help",
] as const;

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

  // If SHAP is empty, still show domains with a neutral default based on
  // overall classification — keeps the chart layout stable.
  const domains =
    byDomain.size > 0 ? [...byDomain.keys()] : [...SCREENING_DOMAINS];

  const magnitudes = [...byDomain.values()];
  const maxMag = magnitudes.length ? Math.max(...magnitudes) : 0;

  return domains
    .filter((d) => d !== "background")
    .map((domain) => {
      const mag = byDomain.get(domain) ?? 0;
      const level = concernFromMagnitude(mag, maxMag, finalClassification);
      return {
        domain,
        label: DOMAIN_LABELS[domain] ?? humanize(domain),
        level,
        plainLanguage: PLAIN[level],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
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
  for (const d of SCREENING_DOMAINS) {
    if (lower.includes(d)) {
      return d;
    }
  }
  // Item bank ids: GM01, FM02, CM03, CG04, PS05, SH06 (+ shap-style prefixes)
  const PREFIX_MAP: Record<string, string> = {
    gm: "gross_motor",
    fm: "fine_motor",
    cm: "communication",
    cg: "cognitive",
    ps: "personal_social",
    sh: "self_help",
    com: "communication",
    cog: "cognitive",
  };
  const letters = lower.replace(/[^a-z]/g, "");
  for (const prefix of ["com", "cog", "gm", "fm", "cm", "cg", "ps", "sh"]) {
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
