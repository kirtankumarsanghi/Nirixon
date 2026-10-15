"""Add module_b_state and pending_item_id to screening_sessions

Revision ID: e7f89012ab34
Revises: d89833008070
Create Date: 2026-10-07 03:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e7f89012ab34"
down_revision: str | Sequence[str] | None = "d89833008070"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "screening_sessions",
        sa.Column("pending_item_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "screening_sessions",
        sa.Column(
            "module_b_state",
            sa.JSON().with_variant(
                postgresql.JSONB(astext_type=sa.Text()), "postgresql"
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("screening_sessions", "module_b_state")
    op.drop_column("screening_sessions", "pending_item_id")
