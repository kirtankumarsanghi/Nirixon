"""
Stage 4 — Persistent ORM models.

ScreeningSession here is the durable DB row. The orchestrator still owns
transient adaptive state via app.core.session.ScreeningSession, persisted
through SessionRepository (not duplicated as a second source of truth in
these columns beyond resume metadata).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

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
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# JSON that works on both Postgres (JSONB) and SQLite (JSON)
JsonType = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="parent")  # parent|internal
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    sessions: Mapped[list[ScreeningSession]] = relationship(back_populates="parent")


class ScreeningSession(Base):
    __tablename__ = "screening_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    child_ref: Mapped[str] = mapped_column(String(128), default="")
    parent_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="in_progress"
    )  # in_progress|completed
    corrected_age_months: Mapped[float] = mapped_column(Float)
    question_cap: Mapped[int] = mapped_column(Integer, default=10)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Serialized orchestrator state (to_dict) for resume — SessionRepository
    # is the live source during a request; this column is the durable backup.
    state_json: Mapped[dict] = mapped_column(JsonType, default=dict)

    parent: Mapped[User] = relationship(back_populates="sessions")
    answers: Mapped[list[Answer]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    risk_result: Mapped[RiskResult | None] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
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
    final_classification: Mapped[str] = mapped_column(String(32))
    safety_override_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    override_rule: Mapped[str | None] = mapped_column(String(128), nullable=True)
    shap_values: Mapped[dict] = mapped_column(JsonType, default=dict)
    probabilities: Mapped[dict] = mapped_column(JsonType, default=dict)
    caveats: Mapped[list] = mapped_column(JsonType, default=list)
    stopping_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
