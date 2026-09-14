"""Clinician Sandbox API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SandboxSimulateRequest(BaseModel):
    model_name: str | None = Field(
        None, description="Optional model to use instead of production winner"
    )
    answer_overrides: dict[str, int] = Field(
        default_factory=dict,
        description="Optional overrides for answers (item_id -> response_value)",
    )
    corrected_age_months: float | None = Field(
        None, description="Optional age override"
    )
