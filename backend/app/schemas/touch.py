"""Pydantic schemas for touch micro-task telemetry."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TouchTaskMetric(BaseModel):
    task_type: Literal["tap", "trace", "drag"]
    reaction_time_ms: float = Field(..., ge=0.0, description="Reaction time in milliseconds")
    path_accuracy_pct: float | None = Field(default=None, ge=0.0, le=100.0, description="Path tracking accuracy percentage")
    jitter_px: float | None = Field(default=None, ge=0.0, description="Trajectory jitter/dispersion in pixels")
    spatial_error_px: float | None = Field(default=None, ge=0.0, description="Distance from target center in pixels")
    completion_time_ms: float | None = Field(default=None, ge=0.0, description="Total duration to complete activity in milliseconds")


class TouchTelemetrySubmission(BaseModel):
    session_id: str | None = None
    age_months: float = Field(..., ge=24.0, le=144.0, description="Child corrected age in months (must be >= 24)")
    tasks: list[TouchTaskMetric] = Field(..., min_length=1, max_length=10)


class TouchTelemetryResponse(BaseModel):
    status: str = "received"
    message: str = "Touch micro-task telemetry recorded."
    recorded_metrics_count: int
    exploratory_notice: str = "Exploratory, not used in the result."
    comparisons: list[dict[str, Any]] = Field(default_factory=list)
    provisional_config_version: str = "2026.1-provisional"
