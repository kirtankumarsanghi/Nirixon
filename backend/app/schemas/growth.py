"""
Pydantic schemas for /api/growth endpoints.

Zero Personal Data:
Only contains pseudonymous identifiers, age intervals, visit dates, domain scores,
and triage classifications.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GrowthVisitCreate(BaseModel):
    child_id: str = Field(
        ...,
        description="Random pseudonymous child ID (UUID or client-generated token). No names or identifiable information.",
        examples=["c9b58e72-6804-4b52-9426-3023e659d04a"],
    )
    age_bracket: str = Field(
        ...,
        description="Age bracket (e.g. 18-24m, 24-30m) or birth cohort.",
        examples=["18-24m"],
    )
    birth_year_month: str | None = Field(
        default=None,
        description="Optional coarse birth year/month (YYYY-MM). Never stores exact day of birth.",
        examples=["2024-03"],
    )
    chronological_age_months: float = Field(
        ...,
        ge=0.0,
        le=180.0,
        description="Child's chronological age at time of visit (in months).",
        examples=[18.0],
    )
    developmental_age_months: float | None = Field(
        default=None,
        ge=0.0,
        le=180.0,
        description="Estimated developmental age in months. If omitted, computed from tier and domain scores.",
        examples=[17.5],
    )
    visit_date: datetime | None = Field(
        default=None,
        description="Date of screening visit. Defaults to current timestamp.",
    )
    domain_scores: dict[str, Any] = Field(
        default_factory=dict,
        description="Map of developmental domain names to score or level (e.g. {'communication': 2, 'motor': 1}).",
        examples=[{"communication": "Typical", "motor": "Monitor"}],
    )
    tier: str = Field(
        ...,
        description="Screening triage tier: Typical, Monitor, or Refer.",
        examples=["Typical"],
    )


class GrowthVisitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    child_id: str
    age_bracket: str
    birth_year_month: str | None
    chronological_age_months: float
    developmental_age_months: float
    visit_date: datetime
    domain_scores: dict[str, Any]
    tier: str
    created_at: datetime


class PlateauInterval(BaseModel):
    visit_index: int
    prev_chronological_age: float
    curr_chronological_age: float
    chronological_gain: float
    developmental_gain: float
    gain_ratio: float | None
    is_plateau: bool
    message: str


class TrajectoryPoint(BaseModel):
    chronological_age: float
    developmental_age: float
    visit_date: str
    tier: str


class GrowthAnalysisResponse(BaseModel):
    child_id: str
    total_visits: int
    is_plateau_detected: bool
    plateau_summary: str
    sync_enabled: bool
    trajectory: list[TrajectoryPoint]
    intervals: list[PlateauInterval]


class GrowthExportResponse(BaseModel):
    export_date: datetime
    privacy_disclaimer: str = (
        "Pseudonymous developmental tracking export. "
        "Contains zero personal names, parent identities, contact details, or free-text descriptions."
    )
    child_id: str
    total_visits: int
    visits: list[GrowthVisitResponse]
    analysis: GrowthAnalysisResponse


class GrowthDeleteResponse(BaseModel):
    child_id: str
    deleted_count: int
    message: str
