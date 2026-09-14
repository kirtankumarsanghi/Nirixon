"""
Clinician what-if sandbox — Stage 4 stub.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_internal
from app.core.session import ScreeningSession as CoreSession, FinalResult
from app.core.orchestrator import get_next_action
from app.db.models import ScreeningSession as DbSession
from app.db.session import get_db
from app.db.session_repo import SessionRepository, get_session_repo
from app.ml.inference_service import InferenceService, inference_service, build_feature_vector
from app.schemas.sandbox import SandboxSimulateRequest
from app.schemas.screen import ResultPayload
from app.routers.screen import _result_payload_from_prediction, _override_rule_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


def _get_inference() -> InferenceService:
    return inference_service


@router.post("/{session_id}/simulate", response_model=ResultPayload)
async def simulate_session(
    session_id: str,
    body: SandboxSimulateRequest,
    user=Depends(require_internal),
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
    inference: InferenceService = Depends(_get_inference),
):
    """
    Clinician sandbox: what-if re-scoring of a completed session.
    Takes optional model_name, answer_overrides, and age override.
    """
    stmt = select(DbSession).where(DbSession.id == session_id).options(selectinload(DbSession.answers))
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()

    if db_row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if db_row.status != "completed":
        raise HTTPException(status_code=400, detail="Can only simulate completed sessions")

    # Reconstruct core session state
    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)
        
    # Apply what-if overrides
    if body.corrected_age_months is not None:
        core.corrected_age_months = body.corrected_age_months
        
    for item_id, ans in body.answer_overrides.items():
        if item_id in core.mandatory_answered:
            core.mandatory_answered[item_id] = ans
        else:
            core.answers[item_id] = ans

    # Re-evaluate logic to get final action
    try:
        action = get_next_action(core)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(action, FinalResult):
        # By changing age or answers, the session might no longer be complete.
        # But in a sandbox we just want the what-if ML score. We can forcefully build features.
        # Let's derive labels anyway.
        action = FinalResult(
            real_answers=core.all_answers(),
            imputed_answers={}, # We could re-impute, but simplified for sandbox
            deterministic_override=None,
            caveats=["Session not fully complete after what-if overrides"],
            stopping_reason="sandbox_incomplete",
        )
        
    # Re-impute if needed (in a real scenario we'd call label_derivation directly)
    # For now, let's use the actual FinalResult returned by orchestrator.

    model_to_use = None
    target_model_name = body.model_name or inference.production_model_name
    
    if target_model_name != inference.production_model_name:
        try:
            model_to_use = inference.load_model_by_name(target_model_name)
        except (KeyError, FileNotFoundError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    features = build_feature_vector(
        corrected_age_months=core.corrected_age_months,
        real_answers=action.real_answers,
        imputed_answers=action.imputed_answers,
        feature_columns=inference.feature_columns,
    )

    override_rule = _override_rule_name(action.deterministic_override, core)
    
    try:
        pred = inference.predict(
            features,
            model=model_to_use,
            deterministic_override=action.deterministic_override,
            override_rule=override_rule,
            real_answer_keys=set(action.real_answers.keys()) | {"corrected_age_months"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _result_payload_from_prediction(
        pred,
        model_name=target_model_name,
        stopping_reason=action.stopping_reason,
        caveats=list(action.caveats),
        real_answer_count=len(action.real_answers),
        imputed_count=len(action.imputed_answers),
    )
