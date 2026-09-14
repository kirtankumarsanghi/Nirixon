/**
 * Hand-written API types matching backend/app/schemas/screen.py.
 */

export type Classification = "Typical" | "Monitor" | "Refer";

export type ResponseType = "yes_no" | "frequency";

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
}

export interface ShapFeature {
  feature: string;
  shap_value: number;
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
}

export interface ScreenActionResponse {
  type: "question" | "complete";
  session_id: string;
  status: string;
  question: QuestionPayload | null;
  result: ResultPayload | null;
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
}
