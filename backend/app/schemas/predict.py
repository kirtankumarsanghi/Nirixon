"""Standalone predict schemas (debug / internal)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.schemas.screen import ShapFeature


class PredictRequest(BaseModel):
    features: dict[str, Any] = Field(
        ..., description="Raw feature map matching feature_columns.pkl"
    )
    deterministic_override: str | None = None
    override_rule: str | None = None


class PredictResponse(BaseModel):
    final_classification: str
    ml_classification: str
    ml_score: float
    probabilities: dict[str, float]
    safety_override_triggered: bool
    override_rule: str | None = None
    shap_top_features: list[ShapFeature] = []
    shap_values: dict[str, float] = {}
