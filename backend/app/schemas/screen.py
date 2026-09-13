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
    corrected_age_months: float = Field(..., gt=0, le=72)
    question_cap: Literal[10, 15, 20] = 10
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


class ScreenActionResponse(BaseModel):
    type: Literal["question", "complete"]
    session_id: str
    status: str
    question: QuestionPayload | None = None
    result: ResultPayload | None = None


class SessionStateResponse(BaseModel):
    session_id: str
    child_ref: str
    status: str
    corrected_age_months: float
    question_cap: int
    real_answer_count: int
    adaptive_budget_remaining: int
    answers: dict[str, int]
    mandatory_answered: dict[str, int]
    completed: bool
    result: ResultPayload | None = None
    next_question: QuestionPayload | None = None
    extra: dict[str, Any] | None = None
