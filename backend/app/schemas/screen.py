"""Screening API schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class StartScreenRequest(BaseModel):
    child_ref: str = ""
    # Age valid range: 1-66 months for Module A (ASQ-3), up to 144 months
    # (12 years) for Module B. Module is auto-detected from age if not specified.
    corrected_age_months: float = Field(..., ge=1.0, le=144.0)
    question_cap: Literal[10, 15, 20] = 10
    # When None the module is auto-detected: <60 months → A, ≥60 months → B.
    module: Literal["A", "B"] | None = None
    # Recorded in the session audit trail; must be true to start.
    consent_given: bool = Field(
        ..., description="Parent informed-consent acknowledgment"
    )
    # Caregiver, Child & Location Profile
    child_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    relationship_to_child: str | None = "Parent"
    location_pincode: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_address: str | None = None


class AnswerRequest(BaseModel):
    item_id: str
    answer: Any
    track: str | None = None
    engine_session: str | None = None
    source: Literal["recall", "observed"] = "recall"


class ActivityPayload(BaseModel):
    title: str
    minutes: int | None = None
    setting: str | None = None
    steps: list[str] | str | None = None


class DomainTrackPayload(BaseModel):
    state: str = "Not asked"
    score: float | None = None
    n: int = 0
    endorsed: int | None = None
    borderline: int | bool | None = None
    brief: bool | None = None
    because: list[str] = Field(default_factory=list)
    irt_theta: float | None = None
    irt_se: float | None = None
    fisher_information: float | None = None


class QuestionPayload(BaseModel):
    item_id: str
    question_text: str
    domain: str
    question_number: int
    question_cap: int
    response_type: Literal["yes_no", "frequency", "yesno", "likert5"] = "frequency"
    scale_labels: str | None = None
    track: str | None = None


class ShapFeature(BaseModel):
    feature: str
    shap_value: float


class WorkerSuggestion(BaseModel):
    id: str
    name: str
    role: str
    facility_name: str | None = None
    phone: str
    whatsapp: str | None = None
    email: str | None = None
    city: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str | None = None
    distance_hint: str | None = None
    recommendation_reason: str | None = None
    operating_hours: str | None = None
    tier_relevance: str | None = None
    free_service: bool = True
    actions: list[str] = Field(default_factory=list)


class WorkerContactRequest(BaseModel):
    worker_id: str
    contact_method: Literal["call", "sms", "whatsapp", "in_person"] = "call"
    notes: str | None = None


class WorkerContactResponse(BaseModel):
    status: str
    worker_name: str
    contact_phone: str
    message: str


class ResultPayload(BaseModel):
    final_classification: str
    ml_classification: str
    model_name: str | None = None
    ml_score: float
    probabilities: dict[str, float]
    safety_override_triggered: bool
    override_rule: str | None = None
    shap_top_features: list[ShapFeature] = []
    shap_values: dict[str, float] = {}
    stopping_reason: str | None = None
    caveats: list[str] = []
    real_answer_count: int | None = None
    imputed_count: int | None = None
    # Module B: per-domain classification; empty for Module A
    domain_classifications: dict[str, str] = {}
    # Module A: normalized per-domain score in [0,1] (mean answer / 2). Real,
    # computed from the session's answers; empty for Module B (which carries
    # per-domain IRT theta in domain_details instead).
    domain_scores: dict[str, float] = Field(default_factory=dict)
    # Module B: parent-vs-teacher cross-context consistency score in [0,1]
    consistency_score: float | None = None
    # Module B: which domains have a meaningful divergence between raters
    consistency_flags: dict[str, bool] = {}
    # DSM-5 Criterion C: per-domain multi-informant concordance classification
    concordance_classification: dict[str, str] = Field(default_factory=dict)
    # Sensory vs Cognitive Differential Masking (e.g. CAPD vs ADHD)
    differential_masking: dict[str, Any] = Field(default_factory=dict)
    teacher_invite_code: str | None = None
    # Module identifier propagated to the frontend for render branching
    module: Literal["A", "B"] = "A"
    # Module B additive fields
    summary: str | None = None
    activities: dict[str, list[ActivityPayload]] = Field(default_factory=dict)
    domain_details: dict[str, DomainTrackPayload] = Field(default_factory=dict)
    ruleouts: dict[str, DomainTrackPayload] = Field(default_factory=dict)
    flagged_domains: list[str] = Field(default_factory=list)
    ruleout_flags: list[str] = Field(default_factory=list)
    context_flags: list[str] = Field(default_factory=list)
    red_flags: list[dict[str, Any]] = Field(default_factory=list)
    help_routes: dict[str, Any] = Field(default_factory=dict)
    safety: bool = False
    # Tiered Clinical Triage (Tier 1: Pass, Tier 2: Reflex-Branch, Tier 3: Direct Referral)
    triage_tier: str | None = None
    reflex_branch_recommended: bool = False
    target_reflex_domains: list[str] = Field(default_factory=list)
    # Reporting Quality & Behavioral Guards
    guard_flags: dict[str, bool] = Field(default_factory=dict)
    guard_advisories: list[str] = Field(default_factory=list)
    # Caregiver, Child & Location Profile
    child_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    relationship_to_child: str | None = None
    location_pincode: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_address: str | None = None
    # Suggested Early Intervention & Community Health Workers
    suggested_workers: list[WorkerSuggestion] = Field(default_factory=list)
    # Model inference latency in milliseconds
    latency_ms: float | None = None
    # Live Observation & Exploratory Touch Telemetry
    observed_answers: dict[str, int] = Field(default_factory=dict)
    answer_sources: dict[str, str] = Field(default_factory=dict)
    touch_telemetry: list[dict[str, Any]] = Field(default_factory=list)
    touch_telemetry_notice: str = "Exploratory, not used in the result."


class ScreenActionResponse(BaseModel):
    type: Literal[
        "question",
        "complete",
        "intake_required",
        "recall_help",
        "safety_notice",
        "done",
    ]
    session_id: str
    status: str
    question: QuestionPayload | None = None
    result: ResultPayload | None = None
    # Additive fields
    safety_message: str | None = None
    helplines: dict[str, str] | None = None
    recall_message: str | None = None
    recall_options: dict[str, str] | None = None
    engine_session: str | None = None


# ---------------------------------------------------------------------------
# Module B — Intake & teacher schemas
# ---------------------------------------------------------------------------


class IntakeRequest(BaseModel):
    text: str = Field(default="", max_length=2000)
    setting: Literal["home", "school", "both"] = "both"
    # Optional recall-help chip labels selected by the caregiver
    chips: list[str] = Field(default_factory=list)
    seed: int = 0


class IntakeResponse(BaseModel):
    recall_help_needed: bool = False
    recall_help_options: list[str] = Field(default_factory=list)
    detected_domains: list[str] = Field(default_factory=list)
    rule_out_flagged: bool = False
    # "question" = proceed to adaptive questions
    # "rule_out_referral" = stop immediately; show specialist-referral message
    # "recall_help" = show recall chips
    # "safety_notice" = show safety helpline
    next_action: Literal[
        "question", "rule_out_referral", "recall_help", "safety_notice"
    ] = "question"
    action: ScreenActionResponse | None = None
    safety_message: str | None = None
    helplines: dict[str, str] | None = None
    recall_message: str | None = None
    recall_options: dict[str, str] | None = None
    engine_session: str | None = None
    question: QuestionPayload | None = None


class RecallChoiceRequest(BaseModel):
    domains: list[str] = Field(default_factory=list)
    engine_session: str | None = None


class TeacherInviteResponse(BaseModel):
    session_id: str
    teacher_invite_code: str
    invite_url: str
    child_ref: str = ""
    expires_in_days: int = 7


class TeacherAnswerRequest(BaseModel):
    """A batch of teacher-supplied item answers for a Module B session."""

    # item_id -> 0/1/2 or 1..5 scale
    answers: dict[str, int]


class TeacherAnswerResponse(BaseModel):
    session_id: str
    consistency_score: float
    consistency_flags: dict[str, bool]  # domain -> True if divergent
    concordance_classification: dict[str, str] = Field(default_factory=dict)
    caveats: list[str] = Field(default_factory=list)
    summary: str | None = None


class TeacherItemPayload(BaseModel):
    item_id: str
    question_text: str
    domain: str


class TeacherItemsResponse(BaseModel):
    items: list[TeacherItemPayload]


class SessionStateResponse(BaseModel):
    session_id: str
    child_ref: str
    status: str
    corrected_age_months: float
    age_bracket: str
    question_cap: int
    real_answer_count: int
    adaptive_budget_remaining: int
    answers: dict[str, int]
    mandatory_answered: dict[str, int]
    completed: bool
    result: ResultPayload | None = None
    next_question: QuestionPayload | None = None
    extra: dict[str, Any] | None = None
    module: Literal["A", "B"] = "A"
    detected_domains: list[str] = []
    child_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    relationship_to_child: str | None = None
    location_pincode: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_address: str | None = None
