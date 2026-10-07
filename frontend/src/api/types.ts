/**
 * Hand-written API types matching backend/app/schemas/screen.py.
 */

export type Classification = "Typical" | "Monitor" | "Refer";

export type ResponseType = "yes_no" | "frequency" | "likert5" | "yesno";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
}

export interface StartScreenRequest {
  child_ref?: string;
  corrected_age_months: number;
  question_cap?: 10 | 15 | 20;
  /** Optional: auto-detected from age if omitted. */
  module?: "A" | "B";
  /** Must be true; recorded server-side in the session audit trail. */
  consent_given: boolean;
}

export interface AnswerRequest {
  item_id: string;
  answer: number;
}

export interface QuestionPayload {
  item_id: string;
  question_text: string;
  domain: string;
  question_number: number;
  question_cap: number;
  response_type: ResponseType;
  /** Module B: track label (e.g. "attention"). */
  track?: string;
  /**
    * Module B Likert-5 scale descriptor, e.g.
    * "1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often"
    */
  scale?: string;
  /** Live backend field for Likert scale descriptor */
  scale_labels?: string | null;
}

export interface ShapFeature {
  feature: string;
  shap_value: number;
}

/** Module B: per-domain result detail. */
export interface DomainResult {
  status: Classification;
  answers: Record<string, number>;
  score: number;
}

/** Module B: practice activity from the API. */
export interface ActivityPayload {
  title: string;
  domain?: string;
  setting?: string | null;
  description?: string;
  frequency?: string;
  minutes?: number | null;
  steps?: string[] | string | null;
}

/** Module B: progress counter from the backend. */
export interface ProgressPayload {
  answered: number;
  max: number;
}

export interface ResultPayload {
  final_classification: string;
  ml_classification: string;
  model_name?: string | null;
  ml_score: number;
  probabilities: Record<string, number>;
  safety_override_triggered: boolean;
  override_rule: string | null;
  shap_top_features: ShapFeature[];
  shap_values: Record<string, number>;
  stopping_reason: string | null;
  caveats: string[];
  real_answer_count?: number | null;
  imputed_count?: number | null;
  /** Module B: per-domain classification. Empty/omitted for Module A. */
  domain_classifications?: Record<string, "Typical" | "Monitor" | "Refer">;
  /** Module B: parent vs. teacher consistency score in [0,1]. */
  consistency_score?: number | null;
  /** Module B: which domains have meaningful parent-teacher divergence. */
  consistency_flags?: Record<string, boolean>;
  /** Module identifier — used by frontend to select render path. */
  module?: "A" | "B";
  /** Module B: structured per-domain results. */
  domains?: Record<string, DomainResult>;
  /** Module B: domain keys flagged for follow-up. */
  flagged_domains?: string[];
  /** Module B: rule-out flags (vision/hearing, broader development). */
  rule_out_flags?: Record<string, boolean>;
  ruleout_flags?: string[];
  context_flags?: string[];
  red_flags?: Record<string, unknown>[];
  /** Module B: plain-language summary from the API. */
  summary?: string | null;
  /** Module B: practice activities per flagged domain. */
  activities?: ActivityPayload[] | Record<string, ActivityPayload[]>;
  /** Module B: contact/help text from the API (free options first). */
  help?: string;
  help_routes?: Record<string, unknown>;
  /** Module B: whether safety helplines should appear prominently. */
  safety?: boolean;
  /** Module B: disclaimer text from the API. */
  disclaimer?: string | null;
}

/** Module B action types include recall_help, safety_notice, and done. */
export type ScreenActionType =
  | "question"
  | "complete"
  | "intake_required"
  | "recall_help"
  | "safety_notice"
  | "done";

export interface ScreenActionResponse {
  type: ScreenActionType;
  session_id: string;
  status: string;
  question: QuestionPayload | null;
  result: ResultPayload | null;
  /** Module B: domain keys for recall-help chip selection. */
  recall_help_options?: string[];
  /** Module B: safety helpline text to display prominently. */
  safety_message?: string | null;
  helplines?: Record<string, string> | null;
  recall_message?: string | null;
  recall_options?: Record<string, string> | null;
  engine_session?: string | null;
  /** Module B: progress counter (answered / max). */
  progress?: ProgressPayload | null;
}

// ---------------------------------------------------------------------------
// Module B types
// ---------------------------------------------------------------------------

export interface IntakeRequest {
  text: string;
  setting?: "home" | "school" | "both";
  chips?: string[];
  seed?: number;
}

export interface IntakeResponse {
  recall_help_needed: boolean;
  recall_help_options: string[];
  detected_domains: string[];
  rule_out_flagged: boolean;
  next_action: "question" | "rule_out_referral" | "recall_help" | "safety_notice";
  action?: ScreenActionResponse | null;
  safety_message?: string | null;
  helplines?: Record<string, string> | null;
  recall_message?: string | null;
  recall_options?: Record<string, string> | null;
  engine_session?: string | null;
  question?: QuestionPayload | null;
}

export interface RecallRequest {
  domains?: string[];
  selected_domains?: string[];
  engine_session?: string | null;
}

export interface TeacherAnswerRequest {
  answers: Record<string, number>;
}

export interface TeacherAnswerResponse {
  consistency_score: number;
  consistency_flags: Record<string, boolean>;
  caveats: string[];
}

export interface TeacherItemPayload {
  item_id: string;
  question_text: string;
  domain: string;
}

export interface TeacherItemsResponse {
  items: TeacherItemPayload[];
}

export interface SessionStateResponse {
  session_id: string;
  child_ref: string;
  status: string;
  corrected_age_months: number;
  age_bracket: string;
  question_cap: number;
  real_answer_count: number;
  adaptive_budget_remaining: number;
  answers: Record<string, number>;
  mandatory_answered: Record<string, number>;
  completed: boolean;
  result: ResultPayload | null;
  next_question: QuestionPayload | null;
  extra?: Record<string, unknown> | null;
  /** Present on newer backends; omit/unknown → infer from age. */
  module?: "A" | "B";
  detected_domains?: string[];
}
