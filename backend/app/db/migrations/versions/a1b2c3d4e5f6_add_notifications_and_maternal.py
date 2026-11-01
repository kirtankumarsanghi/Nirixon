"""add notifications and maternal wellbeing tables

Revision ID: a1b2c3d4e5f6
Revises: 6396750443e6
Create Date: 2026-10-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "6396750443e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("worker_id", sa.String(length=36), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=True),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["worker_id"], ["workers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index(
        op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"]
    )
    op.create_index(
        op.f("ix_push_subscriptions_worker_id"), "push_subscriptions", ["worker_id"]
    )

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("subject_type", sa.String(length=16), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("channels", _JSON, nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("whatsapp_number", sa.String(length=32), nullable=True),
        sa.Column("phone_hash", sa.String(length=64), nullable=True),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("quiet_start", sa.String(length=5), nullable=True),
        sa.Column("quiet_end", sa.String(length=5), nullable=True),
        sa.Column("reminder_lead_days", sa.Integer(), nullable=False),
        sa.Column("consent_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "subject_type", "subject_id", name="uq_notification_pref_subject"
        ),
    )
    op.create_index(
        op.f("ix_notification_preferences_subject_id"),
        "notification_preferences",
        ["subject_id"],
    )
    op.create_index(
        op.f("ix_notification_preferences_phone_hash"),
        "notification_preferences",
        ["phone_hash"],
    )

    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("template", sa.String(length=64), nullable=False),
        sa.Column("subject_type", sa.String(length=16), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("child_ref", sa.String(length=64), nullable=True),
        sa.Column("payload", _JSON, nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_deliveries_idempotency_key"),
        "notification_deliveries",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        op.f("ix_notification_deliveries_subject_id"),
        "notification_deliveries",
        ["subject_id"],
    )
    op.create_index(
        op.f("ix_notification_deliveries_child_ref"),
        "notification_deliveries",
        ["child_ref"],
    )
    op.create_index(
        op.f("ix_notification_deliveries_scheduled_for"),
        "notification_deliveries",
        ["scheduled_for"],
    )

    op.create_table(
        "notification_conversations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("phone_hash", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("context", _JSON, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notification_conversations_phone_hash"),
        "notification_conversations",
        ["phone_hash"],
        unique=True,
    )

    op.create_table(
        "maternal_screenings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("subject_user_id", sa.String(length=36), nullable=True),
        sa.Column("child_ref", sa.String(length=64), nullable=True),
        sa.Column("answers", _JSON, nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=False),
        sa.Column("classification", sa.String(length=32), nullable=False),
        sa.Column("safety_flag", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subject_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_maternal_screenings_subject_user_id"),
        "maternal_screenings",
        ["subject_user_id"],
    )
    op.create_index(
        op.f("ix_maternal_screenings_child_ref"), "maternal_screenings", ["child_ref"]
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_maternal_screenings_child_ref"), table_name="maternal_screenings"
    )
    op.drop_index(
        op.f("ix_maternal_screenings_subject_user_id"),
        table_name="maternal_screenings",
    )
    op.drop_table("maternal_screenings")

    op.drop_index(
        op.f("ix_notification_conversations_phone_hash"),
        table_name="notification_conversations",
    )
    op.drop_table("notification_conversations")

    op.drop_index(
        op.f("ix_notification_deliveries_scheduled_for"),
        table_name="notification_deliveries",
    )
    op.drop_index(
        op.f("ix_notification_deliveries_child_ref"),
        table_name="notification_deliveries",
    )
    op.drop_index(
        op.f("ix_notification_deliveries_subject_id"),
        table_name="notification_deliveries",
    )
    op.drop_index(
        op.f("ix_notification_deliveries_idempotency_key"),
        table_name="notification_deliveries",
    )
    op.drop_table("notification_deliveries")

    op.drop_index(
        op.f("ix_notification_preferences_phone_hash"),
        table_name="notification_preferences",
    )
    op.drop_index(
        op.f("ix_notification_preferences_subject_id"),
        table_name="notification_preferences",
    )
    op.drop_table("notification_preferences")

    op.drop_index(
        op.f("ix_push_subscriptions_worker_id"), table_name="push_subscriptions"
    )
    op.drop_index(
        op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions"
    )
    op.drop_table("push_subscriptions")
