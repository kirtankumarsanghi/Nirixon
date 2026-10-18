"""
Stage 4 — Persistent ORM models.

ScreeningSession here is the durable DB row. The orchestrator still owns
transient adaptive state via app.core.session.ScreeningSession, persisted
through SessionRepository (not duplicated as a second source of truth in
these columns beyond resume metadata).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


# JSON that works on both Postgres (JSONB) and SQLite (JSON)
JsonType = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(
        String(32), default="parent"
    )  # parent | internal | teacher | specialist
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    sessions: Mapped[list[ScreeningSession]] = relationship(back_populates="parent")


class ScreeningSession(Base):
    __tablename__ = "screening_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    child_ref: Mapped[str] = mapped_column(String(128), default="")
    parent_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="in_progress"
    )  # in_progress|completed
    corrected_age_months: Mapped[float | None] = mapped_column(Float, nullable=True)
    age_bracket: Mapped[str] = mapped_column(String(16), default="Unknown")
    question_cap: Mapped[int] = mapped_column(Integer, default=10)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Module discriminator: "A" = early-childhood screener (0–60 months),
    # "B" = school-age screener (60–144 months). Null on legacy rows means A.
    module: Mapped[str] = mapped_column(String(8), default="A", nullable=False)

    # SHA-256 hash of the free-text intake (Module B only).
    # The raw text is never stored; the hash enables server-side dedup and
    # audit without persisting identifiable language.
    intake_text_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Serialized orchestrator state (to_dict) for resume — SessionRepository
    # is the live source during a request; this column is the durable backup.
    state_json: Mapped[dict] = mapped_column(JsonType, default=dict)

    # Module B adaptive session state and pending item
    pending_item_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    module_b_state: Mapped[dict | None] = mapped_column(JsonType, nullable=True)

    # Caregiver, Child & Location Profile
    child_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parent_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parent_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    relationship_to_child: Mapped[str | None] = mapped_column(
        String(64), default="Parent", nullable=True
    )
    location_pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    location_state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    location_address: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Frontline CHW offline-first synchronization
    idempotency_key: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    child_record_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("child_records.id"), nullable=True, index=True
    )

    parent: Mapped[User | None] = relationship(back_populates="sessions")
    answers: Mapped[list[Answer]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    risk_result: Mapped[RiskResult | None] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    joint_invites: Mapped[list[JointInviteToken]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    joint_answers: Mapped[list[JointRespondentAnswer]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("session_id", "item_id", name="uq_answer_session_item"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_sessions.id"), index=True
    )
    item_id: Mapped[str] = mapped_column(String(64))
    response_value: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(16), default="recall", nullable=False)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    session: Mapped[ScreeningSession] = relationship(back_populates="answers")


class RiskResult(Base):
    __tablename__ = "risk_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_sessions.id"), unique=True, index=True
    )
    ml_score: Mapped[float] = mapped_column(Float)
    ml_classification: Mapped[str] = mapped_column(String(32))
    model_name: Mapped[str] = mapped_column(String(64), default="unknown")
    final_classification: Mapped[str] = mapped_column(String(32))
    safety_override_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    override_rule: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shap_values: Mapped[dict] = mapped_column(JsonType, default=dict)
    probabilities: Mapped[dict] = mapped_column(JsonType, default=dict)
    caveats: Mapped[list] = mapped_column(JsonType, default=list)
    stopping_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Module B: per-domain classification map, e.g.
    # {"attention": "Monitor", "reading": "Refer", "motor": "Typical", ...}
    # Empty dict for Module A sessions.
    domain_classifications: Mapped[dict] = mapped_column(JsonType, default=dict)
    # Module B: per-domain details (score, IRT theta, state) keyed by domain.
    domain_details: Mapped[dict] = mapped_column(JsonType, default=dict)

    # Module B: cross-context consistency score in [0, 1].
    # 1.0 = parent and teacher responses perfectly aligned;
    # <0.6 = meaningful divergence flagged in the results view.
    # None for Module A sessions or when teacher form was not completed.
    consistency_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    session: Mapped[ScreeningSession] = relationship(back_populates="risk_result")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(128))
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class CommunityWorker(Base):
    __tablename__ = "community_workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(128))
    # Role: "ASHA Worker", "Anganwadi Worker / ICDS", "DEIC Pediatrician", "RBSK Medical Officer",
    # "Speech & Language Therapist", "Developmental Physiotherapist", "Child Psychologist"
    role: Mapped[str] = mapped_column(String(64))
    facility_name: Mapped[str] = mapped_column(String(192))
    phone: Mapped[str] = mapped_column(String(32))
    whatsapp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str] = mapped_column(String(128), index=True)
    district: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(128), index=True)
    pincode_prefix: Mapped[str] = mapped_column(String(16), index=True)
    specialties: Mapped[list] = mapped_column(JsonType, default=list)
    tier_scope: Mapped[str] = mapped_column(
        String(32), default="all"
    )  # all, tier1_routine, tier2_monitor, tier3_referral
    operating_hours: Mapped[str] = mapped_column(
        String(64), default="9:00 AM - 4:00 PM"
    )
    languages: Mapped[list] = mapped_column(
        JsonType, default=lambda: ["Hindi", "English"]
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class WorkerContactLog(Base):
    __tablename__ = "worker_contact_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_sessions.id"), index=True
    )
    worker_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    worker_name: Mapped[str] = mapped_column(String(128))
    worker_role: Mapped[str] = mapped_column(String(64))
    parent_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_channel: Mapped[str] = mapped_column(String(32), default="call")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class GrowthVisit(Base):
    """
    Opt-in synchronized growth tracking visit.

    CRITICAL PRIVACY GUARANTEE:
    Stores ONLY a pseudonymous random child ID, age bracket / birth month & year,
    visit date, domain scores, tier, and computed developmental/chronological ages.
    NO names, NO contact numbers, NO addresses, NO free-text clinical notes.
    """

    __tablename__ = "growth_visits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    age_bracket: Mapped[str] = mapped_column(String(32), nullable=False)
    birth_year_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    chronological_age_months: Mapped[float] = mapped_column(Float, nullable=False)
    developmental_age_months: Mapped[float] = mapped_column(Float, nullable=False)
    visit_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    domain_scores: Mapped[dict] = mapped_column(JsonType, default=dict, nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class HelpCentre(Base):
    """
    Public and community developmental health centres (DEIC, RBSK, District Hospitals, Rehabilitation).
    Imported from user data files or sample data files.
    """

    __tablename__ = "help_centres"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    district: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    state: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    pin: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    phone: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    # DEIC / RBSK team / district hospital / rehabilitation / school resource / other
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_verified_date: Mapped[str] = mapped_column(String(32), nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Worker(Base):
    """
    Community health worker profile (ASHA / Anganwadi / ANM / Supervisor).
    A worker is scoped to an area (village or ward).
    """

    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(
        String(32), default="chw"
    )  # "chw" or "supervisor"
    area: Mapped[str] = mapped_column(String(128), index=True)  # village or ward
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    user: Mapped[User | None] = relationship()
    referrals: Mapped[list[Referral]] = relationship(
        back_populates="from_worker", cascade="all, delete-orphan"
    )


class ChildRecord(Base):
    """
    Opt-in pseudonymous child record for community health worker referral coordination.
    Zero identifiable names, contact numbers, or exact birthdates stored.
    """

    __tablename__ = "child_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    pseudonymous_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, default=_uuid
    )
    age_bracket: Mapped[str] = mapped_column(String(32))  # e.g. "18-24m"
    village_ward: Mapped[str] = mapped_column(String(128), index=True)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    opt_in: Mapped[bool] = mapped_column(Boolean, default=True)

    # Dashboard triage and follow-up tracking
    current_tier: Mapped[str] = mapped_column(
        String(64), default="Unscreened"
    )  # Tier 1: Typical | Tier 2: In-App Reflex Monitor | Tier 3: Direct Referral | Unscreened
    last_screened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_contacted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    follow_up_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    contact_count: Mapped[int] = mapped_column(Integer, default=0)
    domains_flagged: Mapped[list] = mapped_column(JsonType, default=list)
    safety_rule_triggered: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    referrals: Mapped[list[Referral]] = relationship(
        back_populates="child", cascade="all, delete-orphan"
    )

    @property
    def area(self) -> str:
        return self.village_ward


Child = ChildRecord  # Alias for convenience


class Referral(Base):
    """
    Community health worker referral to a clinical facility (e.g. DEIC, CHC).
    Tracks status through created, sent, seen, outcome recorded, closed.
    """

    __tablename__ = "referrals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("child_records.id"), index=True
    )
    from_worker_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workers.id"), index=True
    )
    to_facility: Mapped[str] = mapped_column(String(192))
    reason: Mapped[str] = mapped_column(Text)
    tier: Mapped[str] = mapped_column(
        String(64)
    )  # e.g. "Tier 3: Direct Referral" or "Refer"
    status: Mapped[str] = mapped_column(
        String(32), default="created"
    )  # created, sent, seen, outcome recorded, closed
    domains_of_concern: Mapped[list] = mapped_column(JsonType, default=list)
    safety_rule_trigger: Mapped[str | None] = mapped_column(String(255), nullable=True)
    outcome_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    child: Mapped[ChildRecord] = relationship(back_populates="referrals")
    from_worker: Mapped[Worker] = relationship(back_populates="referrals")


class JointInviteToken(Base):
    """
    One-time expiring invite link for joint family respondents (max 3 per session).
    Exposes only question items, zero personal details about the child.
    """

    __tablename__ = "joint_invite_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_sessions.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    role_label: Mapped[str] = mapped_column(String(64), default="Co-Parent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)

    session: Mapped[ScreeningSession] = relationship(back_populates="joint_invites")
    answers: Mapped[list[JointRespondentAnswer]] = relationship(
        back_populates="invite_token", cascade="all, delete-orphan"
    )


class JointRespondentAnswer(Base):
    """
    Independent answers submitted by a secondary family/caregiver respondent.
    Identified strictly by a role label (e.g. 'Grandparent', 'Father') — NO personal names.
    """

    __tablename__ = "joint_respondent_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_sessions.id", ondelete="CASCADE"), index=True
    )
    token_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("joint_invite_tokens.id", ondelete="SET NULL"),
        nullable=True,
    )
    role_label: Mapped[str] = mapped_column(String(64), default="Secondary Caregiver")
    answers: Mapped[dict] = mapped_column(JsonType, default=dict)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    session: Mapped[ScreeningSession] = relationship(back_populates="joint_answers")
    invite_token: Mapped[JointInviteToken | None] = relationship(
        back_populates="answers"
    )


class SyncOperation(Base):
    """
    Idempotency registry for frontline offline-first operations.
    Guarantees exactly-once application for screenings, referrals, contacts, and outcomes.
    """

    __tablename__ = "sync_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    worker_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workers.id"), index=True
    )
    operation_type: Mapped[str] = mapped_column(
        String(32)
    )  # "screening", "referral", "contact", "outcome"
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(
        String(32), default="created"
    )  # "created", "deduplicated", "conflict"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class ConflictLog(Base):
    """
    Audit log of synchronization conflicts between offline client operations and server state.
    """

    __tablename__ = "conflict_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    worker_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workers.id"), nullable=True, index=True
    )
    entity_type: Mapped[str] = mapped_column(
        String(32)
    )  # "screening", "referral", "child", "outcome"
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    operation: Mapped[str] = mapped_column(String(64))
    client_payload: Mapped[dict] = mapped_column(JsonType, default=dict)
    server_state: Mapped[dict] = mapped_column(JsonType, default=dict)
    resolution: Mapped[str] = mapped_column(
        String(64)
    )  # "server_retained", "client_applied", "merged", "rejected"
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
