/**
 * Minimal API client for the landing-page live demo.
 *
 * It mirrors the subset of the backend that the Demo section needs:
 *   POST /api/auth/login
 *   POST /api/screen/start
 *   POST /api/screen/{session_id}/answer
 *
 * Token is stored in module scope — intentionally ephemeral (no persistence).
 */

// Same-origin on the web (Vite and nginx proxy /api); only native builds or a
// remote API need an absolute VITE_API_BASE_URL.
const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");
const DEMO_EMAIL = (import.meta.env.VITE_DEMO_EMAIL as string | undefined) ?? "parent@example.com";
const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? "changeme";

let _token: string | null = null;

async function _req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (_token) headers.set("Authorization", `Bearer ${_token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Log in with the demo seed account and cache the token. */
export async function ensureToken(): Promise<void> {
  if (_token) return;
  const data = await _req<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  _token = data.access_token;
}

export interface QuestionPayload {
  item_id: string;
  question_text: string;
  domain: string;
  question_number: number;
  question_cap: number;
  response_type: string;
}

export interface ShapFeature {
  feature: string;
  shap_value: number;
}

export interface ResultPayload {
  final_classification: string;
  ml_classification: string;
  ml_score: number;
  probabilities: Record<string, number>;
  safety_override_triggered: boolean;
  override_rule: string | null;
  shap_top_features: ShapFeature[];
  stopping_reason: string | null;
  triage_tier?: string | null;
  domain_classifications?: Record<string, string>;
  guard_flags?: Record<string, boolean>;
}

export interface ScreenActionResponse {
  type: string;
  session_id: string;
  status: string;
  question: QuestionPayload | null;
  result: ResultPayload | null;
}

export interface IntakeResponsePayload {
  recall_help_needed: boolean;
  recall_help_options: string[];
  detected_domains: string[];
  rule_out_flagged: boolean;
  next_action: string;
  question: QuestionPayload | null;
  safety_message: string | null;
  helplines?: Record<string, string>;
}

/** Start a Module A screening for an illustrative 20-month-old child. */
export async function startDemoScreening(correctedAgeMonths = 20): Promise<ScreenActionResponse> {
  await ensureToken();
  return _req<ScreenActionResponse>("/api/screen/start", {
    method: "POST",
    body: JSON.stringify({
      corrected_age_months: correctedAgeMonths,
      child_ref: "landing-demo",
      question_cap: 15,
      consent_given: true,
      module: "A",
    }),
  });
}

/** Start a Module B screening for an illustrative 84-month-old (7-year-old) child. */
export async function startModuleBScreening(correctedAgeMonths = 84): Promise<ScreenActionResponse> {
  await ensureToken();
  return _req<ScreenActionResponse>("/api/screen/start", {
    method: "POST",
    body: JSON.stringify({
      corrected_age_months: correctedAgeMonths,
      child_ref: "landing-module-b",
      question_cap: 20,
      consent_given: true,
      module: "B",
    }),
  });
}

/** Submit Module B free-text observation to NLP router. */
export async function submitModuleBIntake(
  sessionId: string,
  text: string,
): Promise<IntakeResponsePayload> {
  await ensureToken();
  return _req<IntakeResponsePayload>(`/api/screen/${sessionId}/intake`, {
    method: "POST",
    body: JSON.stringify({ text, setting: "both" }),
  });
}

/** Submit one answer and get the next action. */
export async function submitDemoAnswer(
  sessionId: string,
  itemId: string,
  answer: number,
): Promise<ScreenActionResponse> {
  await ensureToken();
  return _req<ScreenActionResponse>(`/api/screen/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, answer }),
  });
}

/**
 * Map a Demo section answer choice to a numeric backend answer.
 *   "easy"      → 2  (milestone fully achieved)
 *   "hesitated" → 1  (partially)
 *   "notyet"    → 0  (not yet)
 *   regression toggle → answer=0 + marks regression_flag via yes_no item
 */
export function demoAnswerValue(
  choice: "easy" | "hesitated" | "notyet",
  isRegression: boolean,
  responseType: string,
): number {
  // yes_no (regression_flag mandatory item) → 1 means regression reported
  if (responseType === "yes_no") return isRegression ? 1 : 0;
  if (isRegression) return 0; // treat regression as "not yet" on milestone items
  return choice === "easy" ? 2 : choice === "hesitated" ? 1 : 0;
}
