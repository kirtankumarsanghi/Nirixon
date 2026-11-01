"""EPDS caregiver wellbeing endpoints (separate from child screening)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.core.maternal import epds
from app.db.models import MaternalScreening, User
from app.db.session import get_db
from app.schemas.maternal import (
    EpdsQuestionsResponse,
    EpdsResultResponse,
    EpdsSubmitRequest,
)

router = APIRouter(prefix="/api/maternal", tags=["maternal-wellbeing"])


def _to_response(row: MaternalScreening) -> EpdsResultResponse:
    scored = epds.score_epds(
        {key: int(value) for key, value in (row.answers or {}).items()}
    )
    return EpdsResultResponse(
        id=row.id,
        total_score=row.total_score,
        classification=row.classification,
        safety_flag=row.safety_flag,
        interpretation=scored["interpretation"],
        recommendations=scored["recommendations"],
        helplines=scored["helplines"],
        created_at=row.created_at,
    )


@router.get("/questions", response_model=EpdsQuestionsResponse)
async def get_questions() -> EpdsQuestionsResponse:
    return EpdsQuestionsResponse(**epds.questions_payload())


@router.post("/score", response_model=EpdsResultResponse)
async def score(
    body: EpdsSubmitRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EpdsResultResponse:
    if not body.consent_given:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="consent_given must be true to record a wellbeing screening",
        )
    answers = {answer.item_id: answer.value for answer in body.answers}
    try:
        scored = epds.score_epds(answers)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    row = MaternalScreening(
        subject_user_id=user.id,
        child_ref=body.child_ref,
        answers=answers,
        total_score=int(scored["total_score"]),
        classification=str(scored["classification"]),
        safety_flag=bool(scored["safety_flag"]),
    )
    db.add(row)
    await db.flush()
    return EpdsResultResponse(
        id=row.id,
        total_score=row.total_score,
        classification=row.classification,
        safety_flag=row.safety_flag,
        interpretation=scored["interpretation"],
        recommendations=scored["recommendations"],
        helplines=scored["helplines"],
        created_at=row.created_at,
    )


@router.get("/history", response_model=list[EpdsResultResponse])
async def history(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
) -> list[EpdsResultResponse]:
    rows = (
        (
            await db.execute(
                select(MaternalScreening)
                .where(MaternalScreening.subject_user_id == user.id)
                .order_by(MaternalScreening.created_at.desc())
                .limit(max(1, min(limit, 100)))
            )
        )
        .scalars()
        .all()
    )
    return [_to_response(row) for row in rows]
