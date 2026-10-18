"""
FastAPI router for optional synced growth tracking.

PRIVACY & SAFETY ARCHITECTURE:
- Default: on-device.
- Syncing: strictly opt-in with explicit user consent.
- Storage: ONLY pseudonymous random child_id, age bracket / birth month-year,
  visit date, domain scores, tier, and computed developmental/chronological ages.
- Zero personal data: NO names, NO contact numbers, NO addresses, NO free-text notes.
- Right to erasure: DELETE /api/growth/data/{child_id} permanently removes all records.
- Config-driven: can be disabled entirely via settings.growth_sync_enabled.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.growth import compute_developmental_age, evaluate_growth_trajectory
from app.db.models import GrowthVisit
from app.db.session import get_db
from app.schemas.growth import (
    GrowthAnalysisResponse,
    GrowthDeleteResponse,
    GrowthExportResponse,
    GrowthVisitCreate,
    GrowthVisitResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/growth", tags=["growth"])


def _check_sync_enabled(settings: Settings) -> None:
    """Enforce configuration flag that can disable server sync entirely."""
    if not settings.growth_sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Server growth sync is disabled by configuration.",
        )


@router.get("/status")
async def get_sync_status(
    settings: Settings = Depends(get_settings),
):
    """Check whether optional server sync is enabled in this deployment."""
    return {
        "sync_enabled": settings.growth_sync_enabled,
        "privacy_model": "pseudonymous_opt_in_no_pii",
    }


@router.post(
    "/visits",
    response_model=GrowthVisitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def save_growth_visit(
    body: GrowthVisitCreate,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Save an opt-in pseudonymous growth visit snapshot.
    Rejects immediately if server sync is disabled by configuration.
    """
    _check_sync_enabled(settings)

    # Compute developmental age if omitted by caller
    dev_age = (
        body.developmental_age_months
        if body.developmental_age_months is not None
        else compute_developmental_age(
            chronological_age_months=body.chronological_age_months,
            tier=body.tier,
            domain_scores=body.domain_scores,
        )
    )

    visit_dt = body.visit_date or datetime.now(UTC)

    row = GrowthVisit(
        child_id=body.child_id.strip(),
        age_bracket=body.age_bracket.strip(),
        birth_year_month=body.birth_year_month.strip() if body.birth_year_month else None,
        chronological_age_months=float(body.chronological_age_months),
        developmental_age_months=float(dev_age),
        visit_date=visit_dt,
        domain_scores=body.domain_scores,
        tier=body.tier.strip(),
    )

    db.add(row)
    await db.commit()
    await db.refresh(row)

    logger.info("Saved pseudonymous growth visit for child_id=%s tier=%s", row.child_id, row.tier)

    return row


@router.get(
    "/visits/{child_id}",
    response_model=list[GrowthVisitResponse],
)
async def list_growth_visits(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    List all recorded growth visits for a pseudonymous child ID,
    ordered chronologically by visit date.
    """
    _check_sync_enabled(settings)

    stmt = (
        select(GrowthVisit)
        .where(GrowthVisit.child_id == child_id.strip())
        .order_by(GrowthVisit.visit_date.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return rows


@router.get(
    "/analysis/{child_id}",
    response_model=GrowthAnalysisResponse,
)
async def compute_growth_analysis(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Compute developmental age vs chronological age trajectory and evaluate the
    Plateau Rule across consecutive visits.
    """
    _check_sync_enabled(settings)

    stmt = (
        select(GrowthVisit)
        .where(GrowthVisit.child_id == child_id.strip())
        .order_by(GrowthVisit.visit_date.asc())
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    eval_result = evaluate_growth_trajectory(rows)

    return GrowthAnalysisResponse(
        child_id=child_id,
        total_visits=eval_result["total_visits"],
        is_plateau_detected=eval_result["is_plateau_detected"],
        plateau_summary=eval_result["plateau_summary"],
        sync_enabled=True,
        trajectory=eval_result["trajectory"],
        intervals=eval_result["intervals"],
    )


@router.delete(
    "/data/{child_id}",
    response_model=GrowthDeleteResponse,
)
async def delete_child_growth_data(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Permanently delete all server-stored growth data for a pseudonymous child ID.
    Enforces parent right to erasure.
    """
    _check_sync_enabled(settings)

    stmt = delete(GrowthVisit).where(GrowthVisit.child_id == child_id.strip())
    result = await db.execute(stmt)
    await db.commit()

    deleted_count = result.rowcount or 0
    logger.info("Deleted %d growth visits for child_id=%s", deleted_count, child_id)

    return GrowthDeleteResponse(
        child_id=child_id,
        deleted_count=deleted_count,
        message=f"All {deleted_count} growth visits for child ID were permanently removed.",
    )


@router.get(
    "/export/{child_id}",
    response_model=GrowthExportResponse,
)
async def export_child_growth_data(
    child_id: str,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Generate a full, portable JSON export of the child's visit trajectory.
    Contains zero personally identifiable names or contact info.
    """
    _check_sync_enabled(settings)

    stmt = (
        select(GrowthVisit)
        .where(GrowthVisit.child_id == child_id.strip())
        .order_by(GrowthVisit.visit_date.asc())
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    eval_result = evaluate_growth_trajectory(rows)
    analysis = GrowthAnalysisResponse(
        child_id=child_id,
        total_visits=eval_result["total_visits"],
        is_plateau_detected=eval_result["is_plateau_detected"],
        plateau_summary=eval_result["plateau_summary"],
        sync_enabled=True,
        trajectory=eval_result["trajectory"],
        intervals=eval_result["intervals"],
    )

    return GrowthExportResponse(
        export_date=datetime.now(UTC),
        child_id=child_id,
        total_visits=len(rows),
        visits=rows,
        analysis=analysis,
    )
