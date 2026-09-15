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
    consent_given: bool = Field(..., description="Parent informed-consent acknowledgment")


class AnswerRequest(BaseModel):
    item_id: str
    answer: int


class QuestionPayload(BaseModel):
    item_id: str
    question_text: str
    domain: str
    question_number: int
    question_cap: int
    response_type: Literal["yes_no", "frequency"] = "frequency"


class ShapFeature(BaseModel):
    feature: str
    shap_value: float


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
    # Module B: parent-vs-teacher cross-context consistency score in [0,1]
    consistency_score: float | None = None
    # Module B: which domains have a meaningful divergence between raters
    consistency_flags: dict[str, bool] = {}
    # Module identifier propagated to the frontend for render branching
    module: Literal["A", "B"] = "A"


class ScreenActionResponse(BaseModel):
    type: Literal["question", "complete", "intake_required"]
    session_id: str
    status: str
    question: QuestionPayload | None = None
    result: ResultPayload | None = None


# ---------------------------------------------------------------------------
# Module B — Intake & teacher schemas
# ---------------------------------------------------------------------------


class IntakeRequest(BaseModel):
    text: str = Field(default="", max_length=2000)
    setting: Literal["home", "school", "both"] = "both"
    # Optional recall-help chip labels selected by the caregiver
    chips: list[str] = Field(default_factory=list)


class IntakeResponse(BaseModel):
    recall_help_needed: bool
    recall_help_options: list[str]
    detected_domains: list[str]
    rule_out_flagged: bool
    # "question" = proceed to adaptive questions
    # "rule_out_referral" = stop immediately; show specialist-referral message
    next_action: Literal["question", "rule_out_referral"]


class TeacherAnswerRequest(BaseModel):
    """A batch of teacher-supplied item answers for a Module B session."""

    # item_id -> 0/1/2 (same scale as parent answers)
    answers: dict[str, int]


class TeacherAnswerResponse(BaseModel):
    consistency_score: float
    consistency_flags: dict[str, bool]  # domain -> True if divergent
    caveats: list[str]


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
