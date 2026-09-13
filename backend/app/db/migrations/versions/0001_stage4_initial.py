"""stage4 initial schema

Revision ID: 0001_stage4
Revises:
Create Date: 2026-09-13

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_stage4"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "screening_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("child_ref", sa.String(length=128), nullable=False),
        sa.Column("parent_user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("corrected_age_months", sa.Float(), nullable=False),
        sa.Column("question_cap", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"]),
    )
    op.create_index(
        "ix_screening_sessions_parent_user_id",
        "screening_sessions",
        ["parent_user_id"],
    )

    op.create_table(
        "answers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("response_value", sa.Integer(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["screening_sessions.id"]),
        sa.UniqueConstraint("session_id", "item_id", name="uq_answer_session_item"),
    )
    op.create_index("ix_answers_session_id", "answers", ["session_id"])

    op.create_table(
        "risk_results",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("ml_score", sa.Float(), nullable=False),
        sa.Column("ml_classification", sa.String(length=32), nullable=False),
        sa.Column("final_classification", sa.String(length=32), nullable=False),
        sa.Column("safety_override_triggered", sa.Boolean(), nullable=False),
        sa.Column("override_rule", sa.String(length=128), nullable=True),
        sa.Column("shap_values", sa.JSON(), nullable=False),
        sa.Column("probabilities", sa.JSON(), nullable=False),
        sa.Column("caveats", sa.JSON(), nullable=False),
        sa.Column("stopping_reason", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["screening_sessions.id"]),
        sa.UniqueConstraint("session_id"),
    )
    op.create_index("ix_risk_results_session_id", "risk_results", ["session_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("risk_results")
    op.drop_table("answers")
    op.drop_table("screening_sessions")
    op.drop_table("users")
