"""
Caregiver/clinician share flows — Stage 4 stub.

TODO(Stage 5+): wire share_models / share_merge and real share endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.session_repo import SessionRepository, get_session_repo
from app.db.models import ScreeningSession as DbSession
from pydantic import BaseModel

router = APIRouter(prefix="/api/share", tags=["share"])

class ShareMergeRequest(BaseModel):
    answers: dict[str, int]

@router.get("/session/{session_id}")
async def get_shared_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DbSession).where(DbSession.id == session_id).options(selectinload(DbSession.answers))
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()
    
    if db_row is None:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {
        "session_id": db_row.id,
        "child_ref": db_row.child_ref,
        "status": db_row.status,
        "state_json": db_row.state_json,
    }

@router.post("/session/{session_id}/merge")
async def merge_shared_session(
    session_id: str,
    body: ShareMergeRequest,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    stmt = select(DbSession).where(DbSession.id == session_id).options(selectinload(DbSession.answers))
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()
    
    if db_row is None:
        raise HTTPException(status_code=404, detail="Session not found")
        
    core = repo.get(session_id)
    if core is None:
        from app.core.session import ScreeningSession as CoreSession
        core = CoreSession.from_dict(db_row.state_json)
        
    for item_id, ans in body.answers.items():
        if item_id in core.mandatory_answered:
            core.mandatory_answered[item_id] = ans
        else:
            core.answers[item_id] = ans
            
    repo.save(session_id, core)
    
    db_row.state_json = core.to_dict()
    await db.commit()
    
    return {"status": "success", "merged_answers": len(body.answers)}
