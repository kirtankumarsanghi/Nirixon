"""Audio narration schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AudioItemEntry(BaseModel):
    item_id: str
    language: str
    language_label: str
    audio_url: str
    text: str
    duration_ms: int
    reviewed_by: str | None = None
    reviewed_date: str | None = None
    status: Literal["reviewed", "unreviewed"] = "reviewed"


class AudioManifestResponse(BaseModel):
    manifest_version: str
    generated_at: str
    clinical_reviewer: str | None = None
    clinical_review_date: str | None = None
    supported_languages: list[str]
    items: dict[str, dict[str, AudioItemEntry]]


class AudioItemQueryResponse(BaseModel):
    item_id: str
    has_audio: bool
    fallback_to_text: bool
    reason: str | None = None
    text: str | None = None
    audio: AudioItemEntry | None = None
    available_languages: list[str] = Field(default_factory=list)


class UncoveredItemReportEntry(BaseModel):
    item_id: str
    domain: str
    bank: str
    text: str
    reason: str
    fallback_mode: str = "text"


class CoveredItemReportEntry(BaseModel):
    item_id: str
    domain: str
    bank: str
    languages: list[str]
    reviewed_by: str
    reviewed_date: str


class AudioCoverageReport(BaseModel):
    report_title: str = (
        "Nirixon Audio Narration Coverage & Clinical Verification Report"
    )
    generated_at: str
    total_system_items: int
    covered_items_count: int
    uncovered_items_count: int
    coverage_percentage: float
    clinical_reviewer: str
    clinical_review_date: str
    gating_rules: list[str]
    covered_items: list[CoveredItemReportEntry]
    uncovered_items: list[UncoveredItemReportEntry]
    unreviewed_hidden_items: list[str]
