"""
Pydantic schemas for Community Health Worker (ASHA / Anganwadi / ANM) referral system.

Privacy Architecture:
- Opt-in required: consent timestamped and recorded.
- Pseudonymous child records: zero names, contact numbers, or exact birthdates.
- Area-level data isolation: workers only see children in their own village/ward.
- Minimal referral summary: strictly age bracket, tier, domains of concern, and safety rule trigger.
- Full erasure right: removable child records and referrals.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkerCreate(BaseModel):
    name: str = Field(..., description="Worker full name", examples=["Sunita Devi"])
    role: str = Field(
        default="chw",
        description="Worker role ('chw' or 'supervisor')",
        examples=["chw"],
    )
    area: str = Field(
        ...,
        description="Assigned village, ward, or catchment area",
        examples=["Ward 12"],
    )
    phone: str | None = Field(
        default=None, description="Optional contact number", examples=["9876500001"]
    )
    user_id: str | None = Field(
        default=None, description="Linked user ID if already created"
    )


class WorkerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str | None
    name: str
    role: str
    area: str
    phone: str | None
    created_at: datetime


class ChildRecordCreate(BaseModel):
    pseudonymous_id: str | None = Field(
        default=None,
        description="Pseudonymous random child identifier (e.g. 'child-71f2...'). Generated if not provided.",
        examples=["child-98f2"],
    )
    age_bracket: str = Field(
        ...,
        description="Coarse age bracket (e.g. '18-24m', '24-30m'). Zero exact birthdates stored.",
        examples=["18-24m"],
    )
    village_ward: str | None = Field(
        default=None,
        description="Village or municipal ward for area isolation.",
        examples=["Ward 12"],
    )
    area: str | None = Field(
        default=None,
        description="Alias for village_ward.",
        examples=["Ward 12"],
    )
    consent_given: bool = Field(
        default=True,
        description="Explicit caregiver opt-in consent. Must be True to register.",
    )
    opt_in: bool = Field(
        default=True,
        description="Flag indicating active opt-in status.",
    )

    @model_validator(mode="before")
    @classmethod
    def populate_village_ward(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("village_ward") and data.get("area"):
                data["village_ward"] = data["area"]
        return data


class ChildRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pseudonymous_id: str
    age_bracket: str
    village_ward: str
    consent_given: bool
    consent_recorded_at: datetime
    opt_in: bool
    current_tier: str = "Unscreened"
    last_screened_at: datetime | None = None
    last_contacted_at: datetime | None = None
    follow_up_due_at: datetime | None = None
    contact_count: int = 0
    domains_flagged: list[str] = Field(default_factory=list)
    # Latest completed Module A session's normalized per-domain scores [0,1].
    # Empty when the child has no Module A screening (e.g. Module B or none).
    domain_scores: dict[str, float] = Field(default_factory=dict)
    safety_rule_triggered: str | None = None
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def compute_is_overdue(cls, data: Any) -> Any:
        from datetime import UTC, datetime

        now = datetime.now(UTC)
        if isinstance(data, dict):
            due = data.get("follow_up_due_at")
            if due:
                if isinstance(due, str):
                    try:
                        due_dt = datetime.fromisoformat(due)
                    except Exception:
                        due_dt = None
                else:
                    due_dt = due
                if due_dt:
                    if getattr(due_dt, "tzinfo", None) is None:
                        due_dt = due_dt.replace(tzinfo=UTC)
                    data["is_overdue"] = due_dt < now
        elif hasattr(data, "follow_up_due_at"):
            due_dt = getattr(data, "follow_up_due_at")
            if due_dt:
                if getattr(due_dt, "tzinfo", None) is None:
                    due_dt = due_dt.replace(tzinfo=UTC)
                try:
                    setattr(data, "is_overdue", due_dt < now)
                except Exception:
                    pass
        return data


class ChildContactResponse(BaseModel):
    message: str
    child_id: str
    last_contacted_at: datetime
    contact_count: int


class OneTouchReferralResponse(BaseModel):
    message: str
    referral: ReferralResponse
    summary: ReferralSummary


class RecordChildOutcomeRequest(BaseModel):
    outcome_notes: str = Field(
        ..., description="Follow-up notes and clinical services received"
    )
    new_tier: str | None = Field(
        default=None, description="Optional updated triage tier after evaluation"
    )
    next_follow_up_days: int | None = Field(
        default=None, description="Schedule next home visit in N days"
    )
    close_referral: bool = Field(
        default=True, description="Whether to close the active referral"
    )


class TierCountsResponse(BaseModel):
    total_children: int
    tier1_typical: int
    tier2_monitor: int
    tier3_referral: int
    unscreened: int
    overdue_follow_up: int


class ReferralFunnel(BaseModel):
    screened: int
    created: int
    sent: int
    seen: int
    outcome_recorded: int
    closed: int
    overdue: int
    total_referrals: int


class TimeToIntervention(BaseModel):
    median_screened_to_referral_days: float | None = None
    median_referral_to_seen_days: float | None = None


class WardCoverage(BaseModel):
    village_ward: str
    children: int
    screened: int
    coverage_pct: float
    referrals: int


class CHWAnalyticsResponse(BaseModel):
    funnel: ReferralFunnel
    time_to_intervention: TimeToIntervention
    coverage_by_ward: list[WardCoverage]


class ReferralCreate(BaseModel):
    child_id: str = Field(
        ...,
        description="Database ID or pseudonymous ID of the child record",
    )
    to_facility: str = Field(
        ...,
        description="Receiving health facility (e.g. DEIC Safdarjung, CHC Rampur)",
        examples=["Safdarjung Hospital DEIC"],
    )
    reason: str = Field(
        ...,
        description="Clinical referral rationale (e.g. 'Gross motor developmental delay flagged')",
        examples=["Motor milestone delay flagged during village screening"],
    )
    tier: str = Field(
        ...,
        description="Triage tier (e.g. 'Tier 3: Direct Referral', 'Refer', 'Tier 2')",
        examples=["Tier 3: Direct Referral"],
    )
    from_worker_id: str | None = Field(
        default=None,
        description="Worker creating referral. Inferred from auth token if omitted.",
    )
    domains_of_concern: list[str] = Field(
        default_factory=list,
        description="List of developmental domains flagged (e.g. ['motor', 'communication'])",
        examples=[["motor", "communication"]],
    )
    safety_rule_trigger: str | None = Field(
        default=None,
        description="Safety override rule code if triggered",
        examples=["Loss of motor milestones (SD <= -2.0)"],
    )
    idempotency_key: str | None = Field(
        default=None,
        description="Client-generated unique UUID for idempotent creation",
    )


class ReferralUpdate(BaseModel):
    status: str | None = Field(
        default=None,
        description="Target status: 'created', 'sent', 'seen', 'outcome recorded', 'closed'",
    )
    to_facility: str | None = None
    reason: str | None = None
    tier: str | None = None
    domains_of_concern: list[str] | None = None
    safety_rule_trigger: str | None = None
    outcome_notes: str | None = None


class ReferralOutcomeRequest(BaseModel):
    outcome_notes: str = Field(
        ...,
        description="Post-referral follow-up clinical observations and services provided",
        examples=["Child seen by DEIC pediatrician. Speech therapy initiated."],
    )
    close_referral: bool = Field(
        default=False,
        description="Whether to also close the referral upon recording the outcome",
    )


class ReferralResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    child_id: str
    from_worker_id: str
    to_facility: str
    reason: str
    tier: str
    status: str
    domains_of_concern: list[str]
    safety_rule_trigger: str | None
    outcome_notes: str | None
    idempotency_key: str | None = None
    created_at: datetime
    sent_at: datetime | None
    seen_at: datetime | None
    outcome_recorded_at: datetime | None
    closed_at: datetime | None
    updated_at: datetime
    timestamps: dict[str, Any]


class ReferralSummary(BaseModel):
    """
    CRITICAL PRIVACY SPECIFICATION:
    Strictly contains ONLY the four listed fields needed for clinical triage handoff.
    No child names, no village/ward, no worker identifiers, no extraneous data.
    """

    model_config = ConfigDict(extra="forbid")

    age_bracket: str = Field(..., description="Coarse age bracket")
    tier: str = Field(..., description="Screening triage tier")
    domains_of_concern: list[str] = Field(
        ..., description="Flagged developmental domains"
    )
    safety_rule_trigger: str | None = Field(
        default=None, description="Safety rule code if triggered"
    )


# ---------------------------------------------------------------------------
# Offline-First Synchronization & Conflict Handling Schemas
# ---------------------------------------------------------------------------


class CHWSyncItem(BaseModel):
    idempotency_key: str = Field(
        ..., description="Client-generated unique UUID for exactly-once execution"
    )
    operation: Literal["screening", "referral", "contact", "outcome"] = Field(
        ..., description="Type of queued action"
    )
    child_id: str = Field(..., description="Target child ID or pseudonymous ID")
    payload: dict[str, Any] = Field(
        default_factory=dict, description="Operation specific data"
    )
    client_timestamp: datetime | None = Field(
        default=None, description="Local client creation timestamp"
    )


class CHWSyncBatchRequest(BaseModel):
    operations: list[CHWSyncItem] = Field(
        default_factory=list, description="Array of offline queued operations"
    )


class CHWSyncItemResult(BaseModel):
    idempotency_key: str
    operation: str
    status: Literal["created", "deduplicated", "updated", "conflict", "error"]
    entity_id: str | None = None
    message: str
    conflict_detail: dict[str, Any] | None = None


class CHWSyncBatchResponse(BaseModel):
    processed_count: int
    created_count: int
    deduplicated_count: int
    conflict_count: int
    results: list[CHWSyncItemResult]
    server_timestamp: datetime


class ConflictLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    worker_id: str | None
    entity_type: str
    entity_id: str
    operation: str
    client_payload: dict[str, Any]
    server_state: dict[str, Any]
    resolution: str
    reason: str
    created_at: datetime
