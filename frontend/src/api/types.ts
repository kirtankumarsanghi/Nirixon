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
  child_name?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  relationship_to_child?: string | null;
  location_pincode?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_address?: string | null;
}

export interface AnswerRequest {
  item_id: string;
  answer: number;
  source?: "recall" | "observed";
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
  /** Module A: normalized per-domain score in [0,1] (mean answer / 2). */
  domain_scores?: Record<string, number>;
  /** Module B: per-domain details (state, score, irt_theta). */
  domain_details?: Record<string, Record<string, unknown>>;
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
  /** Clinical triage tier (Tier 1: Routine, Tier 2: Reflex Monitor, Tier 3: Direct Referral) */
  triage_tier?: string | null;
  child_name?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  relationship_to_child?: string | null;
  location_pincode?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_address?: string | null;
  suggested_workers?: WorkerSuggestion[];
  latency_ms?: number | null;
  observed_answers?: Record<string, number>;
  answer_sources?: Record<string, "recall" | "observed">;
  touch_telemetry?: TouchTaskMetric[];
  touch_telemetry_notice?: string | null;
}

export interface WorkerSuggestion {
  id: string;
  name: string;
  role: string;
  facility_name?: string | null;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  distance_hint?: string | null;
  recommendation_reason?: string | null;
  operating_hours?: string | null;
  tier_relevance?: string | null;
  free_service?: boolean;
  actions?: string[];
}

export interface WorkerContactRequest {
  worker_id: string;
  contact_method: "call" | "sms" | "whatsapp" | "in_person";
  notes?: string | null;
}

export interface WorkerContactResponse {
  status: string;
  worker_name: string;
  contact_phone: string;
  message: string;
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
  child_name?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  relationship_to_child?: string | null;
  location_pincode?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_address?: string | null;
}

export interface SandboxSimulateRequest {
  model_name?: string | null;
  answer_overrides?: Record<string, number>;
  domain_scores?: Record<string, number>;
  corrected_age_months?: number | null;
}

export interface HelpCentreItem {
  id: string;
  name: string;
  address: string;
  district: string;
  state: string;
  pin: string;
  latitude: number;
  longitude: number;
  phone: string;
  type: string;
  source_url: string;
  last_verified_date: string;
  distance_km: number;
  is_sample: boolean;
}

export interface HelplineItem {
  name: string;
  number: string;
  available: string;
  description: string;
}

export interface DistrictGuidance {
  title: string;
  steps: string[];
}

export interface HelpNearbyResponse {
  centres: HelpCentreItem[];
  total: number;
  pin: string | null;
  child_age_years: number | null;
  helplines: HelplineItem[];
  district_guidance: DistrictGuidance;
}

// ---------------------------------------------------------------------------
// Find Help: public facility reference data (GET /api/facilities)
// Read-only OpenStreetMap / government-directory rows. No patient data.
// ---------------------------------------------------------------------------

export type FacilityType =
  | "DEIC"
  | "RBSK"
  | "District Hospital"
  | "CHC"
  | "PHC"
  | "Hospital"
  | "Clinic";

export type FacilitiesCoverage = "nearby" | "district" | "state" | "none";

export interface FacilityRelevance {
  /** 0 = developmental/early-intervention fit, 1 = referral hospital, 2 = general. */
  tier: number;
  label: string;
}

export interface Facility {
  id: number;
  name: string;
  type: FacilityType;
  km: number;
  phone: string | null;
  address: string;
  district: string;
  state: string;
  lat: number;
  lng: number;
  source: string;
  verified_at: string | null;
  specialty: string[];
  relevance: FacilityRelevance;
}

export interface FacilitySuggestion {
  id: string;
  title: string;
  detail: string;
  maps_url: string | null;
  phone: string | null;
  note?: string;
}

export interface FacilitiesResolved {
  district: string;
  state: string;
  lat: number;
  lng: number;
  approximate: boolean;
  match: string;
}

export interface StateDeic {
  state: string;
  operational: number;
  source: string;
}

export interface FacilityHelpline {
  name: string;
  number: string;
  note?: string;
}

export interface FacilitiesResponse {
  pin: string;
  age_group: string | null;
  result: string | null;
  resolved: FacilitiesResolved | null;
  coverage: FacilitiesCoverage;
  facilities: Facility[];
  nearest_specialist: Facility | null;
  suggestions: FacilitySuggestion[];
  advice: string | null;
  state_deic: StateDeic | null;
  helplines: FacilityHelpline[];
}

// ---------------------------------------------------------------------------
// Module A: Live Elicitation (Direct Observation) types
// ---------------------------------------------------------------------------

export interface LiveTaskOption {
  label: string;
  value: number;
  description?: string;
}

export interface LiveTaskDefinition {
  task_id: string;
  milestone_item_id: string;
  domain: string;
  age_bracket: string;
  title: string;
  instruction: string;
  what_to_observe: string;
  materials?: string;
  response_options: LiveTaskOption[];
}

// ---------------------------------------------------------------------------
// Module A: Touch Motor Telemetry (Exploratory, 24m+) types
// ---------------------------------------------------------------------------

export interface TouchTaskMetric {
  task_type: "tap" | "trace" | "drag";
  reaction_time_ms: number;
  path_accuracy_pct: number;
  jitter_px: number;
  completed: boolean;
  duration_ms?: number | null;
}

export interface TouchTelemetrySubmission {
  metrics: TouchTaskMetric[];
  device_info?: Record<string, unknown> | null;
}

export interface TouchTaskEvaluation {
  task_type: string;
  metrics: TouchTaskMetric;
  reaction_time_status: "expected" | "below_expected" | "above_expected" | "no_norm";
  accuracy_status: "expected" | "below_expected" | "above_expected" | "no_norm";
  jitter_status: "expected" | "below_expected" | "above_expected" | "no_norm";
  reference_bracket: string | null;
  provisional_notice: string;
}

export interface TouchTelemetryResponse {
  status: string;
  session_id: string;
  touch_count: number;
  exploratory_notice: string;
  provisional_evaluations: TouchTaskEvaluation[];
}

export interface TouchTaskReferenceRange {
  reaction_time_ms_expected: [number, number];
  path_accuracy_pct_expected: [number, number];
  jitter_px_expected: [number, number];
  sample_size_n: number;
  provisional_source: string;
}

export interface TouchConfigResponse {
  is_provisional: boolean;
  status: string;
  notice: string;
  minimum_age_months: number;
  supported_brackets: string[];
  brackets: Record<string, Record<string, TouchTaskReferenceRange>>;
}

// ---------------------------------------------------------------------------
// Joint Family / Caregiver Concordance types
// ---------------------------------------------------------------------------

export interface CreateJointInviteRequest {
  role_label: string;
  expires_in_hours?: number;
}

export interface JointInviteResponse {
  token: string;
  invite_url: string;
  role_label: string;
  expires_at: string;
  session_id: string;
  max_respondents_limit: number;
  active_invites_count: number;
}

export interface JointInviteSummary {
  id: string;
  token: string;
  role_label: string;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  used_at: string | null;
  is_expired: boolean;
}

export interface JointCompletedRespondent {
  id: string;
  role_label: string;
  answers_count: number;
  submitted_at: string;
}

export interface JointInvitesListResponse {
  session_id: string;
  max_limit: number;
  invites: JointInviteSummary[];
  completed_respondents: JointCompletedRespondent[];
  respondent_count: number;
}

export interface JointQuestionOption {
  value: number;
  label: string;
  description?: string | null;
}

export interface JointQuestionItem {
  item_id: string;
  question_text: string;
  domain: string;
  response_type: string;
  options: JointQuestionOption[];
}

export interface JointInvitePublicDetail {
  valid: boolean;
  role_label: string;
  expires_at: string;
  items: JointQuestionItem[];
  item_count: number;
}

export interface SubmitJointResponseRequest {
  role_label?: string | null;
  answers: Record<string, number>;
}

export interface SubmitJointResponseResponse {
  status: string;
  session_id: string;
  role_label: string;
  submitted_items_count: number;
  message: string;
}

export interface JointDisagreementPayload {
  item_id: string;
  domain: string;
  question_text: string;
  primary_answer: number;
  respondent_answers: Array<{ role_label: string; answer: number }>;
  max_delta: number;
  most_concerning_answer: number;
  most_concerning_role: string;
  follow_up_prompt: string;
}

export interface JointItemConcordancePayload {
  item_id: string;
  domain: string;
  primary_answer: number;
  secondary_answers: Record<string, number>;
  is_concordant: boolean;
  concordance_score: number;
  exact_match_ratio: number;
  most_concerning_value: number;
}

export interface JointMergeResponse {
  session_id: string;
  respondent_count: number;
  roles: string[];
  overall_concordance: number;
  exact_agreement_pct: number;
  total_overlapping_items: number;
  concordance_level: string;
  disagreements: JointDisagreementPayload[];
  item_concordance: JointItemConcordancePayload[];
  safety_override_triggered: boolean;
  override_rule: string | null;
  safety_source: string | null;
  final_classification: string;
  ml_classification: string;
}


// ---------------------------------------------------------------------------
// Community Health Worker Referral System types
// ---------------------------------------------------------------------------

export interface WorkerRecord {
  id: string;
  user_id: string | null;
  name: string;
  role: "chw" | "supervisor" | string;
  area: string;
  phone: string | null;
  created_at: string;
}

export interface ChildRecord {
  id: string;
  pseudonymous_id: string;
  age_bracket: string;
  village_ward: string;
  consent_given: boolean;
  consent_recorded_at: string;
  opt_in: boolean;
  current_tier?: string;
  last_screened_at?: string | null;
  last_contacted_at?: string | null;
  follow_up_due_at?: string | null;
  contact_count?: number;
  domains_flagged?: string[];
  /** Latest completed Module A session's normalized per-domain scores [0,1]. */
  domain_scores?: Record<string, number>;
  safety_rule_triggered?: string | null;
  is_overdue?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TierCounts {
  total_children: number;
  tier1_typical: number;
  tier2_monitor: number;
  tier3_referral: number;
  unscreened: number;
  overdue_follow_up: number;
}

export interface ChildContactResponse {
  message: string;
  child_id: string;
  last_contacted_at: string;
  contact_count: number;
}

export interface OneTouchReferralResponse {
  message: string;
  referral: ReferralRecord;
  summary: ReferralSummary;
}

export interface RecordChildOutcomeRequest {
  outcome_notes: string;
  new_tier?: string;
  next_follow_up_days?: number;
  close_referral?: boolean;
}

export interface ChildRecordCreateRequest {
  pseudonymous_id?: string;
  age_bracket: string;
  village_ward?: string;
  area?: string;
  consent_given: boolean;
  opt_in?: boolean;
}

export interface ReferralRecord {
  id: string;
  child_id: string;
  from_worker_id: string;
  to_facility: string;
  reason: string;
  tier: string;
  status: "created" | "sent" | "seen" | "outcome recorded" | "closed" | string;
  domains_of_concern: string[];
  safety_rule_trigger: string | null;
  outcome_notes: string | null;
  created_at: string;
  sent_at: string | null;
  seen_at: string | null;
  outcome_recorded_at: string | null;
  closed_at: string | null;
  updated_at: string;
  timestamps: {
    created_at: string;
    sent_at: string | null;
    seen_at: string | null;
    outcome_recorded_at: string | null;
    closed_at: string | null;
    updated_at: string;
  };
}

export interface ReferralCreateRequest {
  child_id: string;
  to_facility: string;
  reason: string;
  tier: string;
  from_worker_id?: string;
  domains_of_concern?: string[];
  safety_rule_trigger?: string | null;
}

export interface ReferralUpdateRequest {
  status?: string;
  to_facility?: string;
  reason?: string;
  tier?: string;
  domains_of_concern?: string[];
  safety_rule_trigger?: string | null;
  outcome_notes?: string | null;
}

export interface ReferralOutcomeRequest {
  outcome_notes: string;
  close_referral?: boolean;
}

export interface ReferralSummary {
  age_bracket: string;
  tier: string;
  domains_of_concern: string[];
  safety_rule_trigger: string | null;
}

export interface CHWSyncItem {
  idempotency_key: string;
  operation: "screening" | "referral" | "contact" | "outcome";
  child_id: string;
  payload: Record<string, any>;
  client_timestamp?: string;
}

export interface CHWSyncBatchRequest {
  operations: CHWSyncItem[];
}

export interface CHWSyncItemResult {
  idempotency_key: string;
  operation: string;
  status: "created" | "deduplicated" | "updated" | "conflict" | "error";
  entity_id?: string | null;
  message: string;
  conflict_detail?: any;
}

export interface CHWSyncBatchResponse {
  processed_count: number;
  created_count: number;
  deduplicated_count: number;
  conflict_count: number;
  results: CHWSyncItemResult[];
  server_timestamp: string;
}

export interface ConflictLogRecord {
  id: string;
  worker_id?: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  client_payload: Record<string, any>;
  server_state: Record<string, any>;
  resolution: string;
  reason: string;
  created_at: string;
}

export interface AudioItemEntry {
  item_id: string;
  language: string;
  language_label: string;
  audio_url: string;
  text: string;
  duration_ms: number;
  reviewed_by: string | null;
  reviewed_date: string | null;
  status: "reviewed" | "unreviewed";
}

export interface AudioManifestResponse {
  manifest_version: string;
  generated_at: string;
  clinical_reviewer?: string | null;
  clinical_review_date?: string | null;
  supported_languages: string[];
  items: Record<string, Record<string, AudioItemEntry>>;
}

export interface AudioItemQueryResponse {
  item_id: string;
  has_audio: boolean;
  fallback_to_text: boolean;
  reason?: string | null;
  text?: string | null;
  audio?: AudioItemEntry | null;
  available_languages: string[];
}

export interface AudioCoverageReport {
  report_title: string;
  generated_at: string;
  total_system_items: number;
  covered_items_count: number;
  uncovered_items_count: number;
  coverage_percentage: number;
  clinical_reviewer: string;
  clinical_review_date: string;
  gating_rules: string[];
  covered_items: Array<{
    item_id: string;
    domain: string;
    bank: string;
    languages: string[];
    reviewed_by: string;
    reviewed_date: string;
  }>;
  uncovered_items: Array<{
    item_id: string;
    domain: string;
    bank: string;
    text: string;
    reason: string;
    fallback_mode: string;
  }>;
  unreviewed_hidden_items: string[];
}


