"""
Stage 4 — SQLAlchemy async engine / session factory.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: AsyncEngine | None = None
AsyncSessionLocal: async_sessionmaker[AsyncSession] | None = None


def _make_engine(url: str | None = None) -> AsyncEngine:
    settings = get_settings()
    db_url = url or settings.database_url
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_async_engine(db_url, echo=settings.debug, connect_args=connect_args)


def get_engine() -> AsyncEngine:
    global _engine, AsyncSessionLocal
    if _engine is None:
        _engine = _make_engine()
        AsyncSessionLocal = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert AsyncSessionLocal is not None
    return AsyncSessionLocal


def configure_engine(url: str) -> AsyncEngine:
    """Replace the process engine (used by tests)."""
    global _engine, AsyncSessionLocal
    if _engine is not None:
        # Caller is responsible for disposing the previous engine if needed
        pass
    _engine = _make_engine(url)
    AsyncSessionLocal = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )
    return _engine


def reset_engine() -> None:
    global _engine, AsyncSessionLocal
    _engine = None
    AsyncSessionLocal = None


# Backwards-compatible module attribute used by main.py health checks
# Resolved lazily via __getattr__ below in addition to get_engine().


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables for local/dev. Alembic owns schema in real deploys."""
    from sqlalchemy import text

    from app.db import models  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # For SQLite in dev: ensure newly added columns exist if the table was created by an older revision
        if conn.dialect.name == "sqlite":
            result = await conn.execute(text("PRAGMA table_info(screening_sessions)"))
            columns = {row[1] for row in result.fetchall()}
            new_cols = [
                ("pending_item_id", "VARCHAR(64)"),
                ("module_b_state", "JSON"),
                ("child_name", "VARCHAR(128)"),
                ("parent_name", "VARCHAR(128)"),
                ("parent_phone", "VARCHAR(32)"),
                ("relationship_to_child", "VARCHAR(64)"),
                ("location_pincode", "VARCHAR(16)"),
                ("location_city", "VARCHAR(128)"),
                ("location_state", "VARCHAR(128)"),
                ("location_address", "VARCHAR(255)"),
                ("idempotency_key", "VARCHAR(64)"),
                ("child_record_id", "VARCHAR(36)"),
            ]
            for col_name, col_type in new_cols:
                if columns and col_name not in columns:
                    await conn.execute(
                        text(
                            f"ALTER TABLE screening_sessions ADD COLUMN {col_name} {col_type}"
                        )
                    )

            # Check referrals table columns
            res_ref = await conn.execute(text("PRAGMA table_info(referrals)"))
            ref_columns = {row[1] for row in res_ref.fetchall()}
            ref_cols = [
                ("idempotency_key", "VARCHAR(64)"),
                ("domains_of_concern", "JSON"),
                ("safety_rule_trigger", "VARCHAR(255)"),
                ("outcome_notes", "TEXT"),
                ("sent_at", "DATETIME"),
                ("seen_at", "DATETIME"),
                ("outcome_recorded_at", "DATETIME"),
                ("closed_at", "DATETIME"),
            ]
            for col_name, col_type in ref_cols:
                if ref_columns and col_name not in ref_columns:
                    await conn.execute(
                        text(
                            f"ALTER TABLE referrals ADD COLUMN {col_name} {col_type}"
                        )
                    )

            # Check answers table columns
            res_ans = await conn.execute(text("PRAGMA table_info(answers)"))
            ans_columns = {row[1] for row in res_ans.fetchall()}
            if ans_columns and "source" not in ans_columns:
                await conn.execute(
                    text("ALTER TABLE answers ADD COLUMN source VARCHAR(16) DEFAULT 'recall'")
                )

            # Check risk_results table columns
            res_risk = await conn.execute(text("PRAGMA table_info(risk_results)"))
            risk_columns = {row[1] for row in res_risk.fetchall()}
            if risk_columns and "domain_details" not in risk_columns:
                await conn.execute(
                    text("ALTER TABLE risk_results ADD COLUMN domain_details JSON")
                )

    # Seed community healthcare workers
    factory = get_session_factory()
    async with factory() as db:
        from app.core.worker_service import seed_community_workers

        await seed_community_workers(db)


# Expose `engine` for code that imports it directly
def __getattr__(name: str):
    if name == "engine":
        return get_engine()
    raise AttributeError(name)
