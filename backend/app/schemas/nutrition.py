"""Anthropometric nutrition screening schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MeasurementPayload(BaseModel):
    item_id: str
    label: str
    value: float
    unit: str


class NutritionFlag(BaseModel):
    code: str
    label: str
    severity: str  # monitor | refer
    detail: str


class NutritionEvaluation(BaseModel):
    age_months: int | None = None
    sex: str | None = None
    weight_kg: float | None = None
    muac_cm: float | None = None
    weight_for_age_z: float | None = None
    muac_status: str | None = None
    anemia_risk: str | None = None
    flags: list[NutritionFlag] = Field(default_factory=list)
    severity: str = "none"  # none | monitor | refer
    disclaimer: str = (
        "Nutrition flags are screening prompts for a health worker, not a diagnosis."
    )
