"""EPDS caregiver wellbeing screening schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EpdsOption(BaseModel):
    value: int
    label: str


class EpdsQuestion(BaseModel):
    item_id: str
    number: int
    text: str
    options: list[EpdsOption]
    reverse_scored: bool = False
    review_status: str = "pending"


class EpdsQuestionsResponse(BaseModel):
    instrument: str = "EPDS"
    instructions: str
    questions: list[EpdsQuestion]
    review_status: str = "pending"
    disclaimer: str


class EpdsAnswer(BaseModel):
    item_id: str
    value: int = Field(ge=0, le=3)


class EpdsSubmitRequest(BaseModel):
    answers: list[EpdsAnswer]
    child_ref: str | None = None
    consent_given: bool = False


class EpdsResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    total_score: int
    classification: str
    safety_flag: bool
    interpretation: str
    recommendations: list[str]
    helplines: list[dict]
    created_at: datetime | None = None
