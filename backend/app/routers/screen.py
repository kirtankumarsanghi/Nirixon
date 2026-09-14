"""
Stage 4 — Screening session endpoints.

Orchestrator owns state transitions; SessionRepository persists them;
DB Answer/RiskResult rows are the durable audit trail.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_parent
from app.core.mandatory_items import record_mandatory_answer
from app.core.orchestrator import get_next_action
from app.core.session import MANDATORY_IDS, FinalResult, NextQuestion
from app.core.session import ScreeningSession as CoreSession
from app.db.models import Answer, AuditLog, RiskResult, User
from app.db.models import ScreeningSession as DbSession
from app.db.session import get_db
from app.db.session_repo import SessionRepository, get_session_repo
from app.ml.inference_service import (
    FeatureColumnMismatchError,
    InferenceService,
    ModelNotLoadedError,
    build_feature_vector,
    inference_service,
)
from app.schemas.screen import (
    AnswerRequest,
    QuestionPayload,
    ResultPayload,
    ScreenActionResponse,
    SessionStateResponse,
    ShapFeature,
    StartScreenRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/screen", tags=["screen"])


def _get_inference() -> InferenceService:
    return inference_service


def _override_rule_name(override: str | None, session: CoreSession) -> str | None:
    if override is None:
        return None
    if session.mandatory_answered.get("regression_flag") == 1 and override == "Refer":
        return "regression_flag"
    return "deterministic_override"


def _question_payload(q: NextQuestion) -> QuestionPayload:
    response_type: Literal["yes_no", "frequency"] = (
        "yes_no" if q.item_id in MANDATORY_IDS else "frequency"
    )
    return QuestionPayload(
        item_id=q.item_id,
        question_text=q.question_text,
        domain=q.domain,
        question_number=q.question_number,
        question_cap=q.question_cap,
        response_type=response_type,
    )


def _result_payload_from_prediction(
    pred,
    *,
    model_name: str | None,
    stopping_reason: str | None,
    caveats: list[str],
    real_answer_count: int | None = None,
    imputed_count: int | None = None,
) -> ResultPayload:
    return ResultPayload(
        final_classification=pred.final_classification,
        ml_classification=pred.ml_classification,
        model_name=model_name,
        ml_score=pred.ml_score,
        probabilities=pred.probabilities,
        safety_override_triggered=pred.safety_override_triggered,
        override_rule=pred.override_rule,
        shap_top_features=[ShapFeature(**f) for f in pred.top_contributing_features],
        shap_values=pred.shap_values,
        stopping_reason=stopping_reason,
        caveats=caveats,
        real_answer_count=real_answer_count,
        imputed_count=imputed_count,
    )


async def _run_completion(
    *,
    core: CoreSession,
    db_row: DbSession,
    final: FinalResult,
    db: AsyncSession,
    inference: InferenceService,
    actor_id: str,
) -> ResultPayload:
    if not inference.is_loaded or inference.feature_columns is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=inference.load_error or "model not trained — run train.py",
        )

    features = build_feature_vector(
        corrected_age_months=core.corrected_age_months,
        real_answers=final.real_answers,
        imputed_answers=final.imputed_answers,
        feature_columns=inference.feature_columns,
    )
    # Fail loudly if any expected column is None (incomplete assemble)
    if any(v is None for v in features.values()):
        missing = [k for k, v in features.items() if v is None]
        logger.error("Incomplete feature vector missing=%s", missing)
        raise HTTPException(
            status_code=500,
            detail=f"Incomplete feature vector; missing values for: {missing}",
        )

    override_rule = _override_rule_name(final.deterministic_override, core)
    try:
        pred = inference.predict(
            features,
            deterministic_override=final.deterministic_override,
            override_rule=override_rule,
            real_answer_keys=set(final.real_answers.keys()) | {"corrected_age_months"},
        )
    except FeatureColumnMismatchError as exc:
        logger.error("Feature column mismatch: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    core.completed = True
    db_row.status = "completed"
    db_row.completed_at = datetime.now(timezone.utc)
    db_row.state_json = core.to_dict()

    risk = RiskResult(
        session_id=db_row.id,
        ml_score=pred.ml_score,
        ml_classification=pred.ml_classification,
        model_name=inference.production_model_name or "unknown",
        final_classification=pred.final_classification,
        safety_override_triggered=pred.safety_override_triggered,
        override_rule=pred.override_rule,
        shap_values=pred.shap_values,
        probabilities=pred.probabilities,
        caveats=list(final.caveats),
        stopping_reason=final.stopping_reason,
    )
    db.add(risk)
    db.add(
        AuditLog(
            actor_id=actor_id,
            action="screen.complete",
            target_id=db_row.id,
            detail=(
                f"final={pred.final_classification} "
                f"override={pred.safety_override_triggered} "
                f"rule={pred.override_rule}"
            ),
        )
    )
    if pred.safety_override_triggered:
        logger.warning(
            "override.applied session=%s rule=%s final=%s",
            db_row.id,
            pred.override_rule,
            pred.final_classification,
        )
        db.add(
            AuditLog(
                actor_id=actor_id,
                action="override.applied",
                target_id=db_row.id,
                detail=pred.override_rule,
            )
        )
    await db.flush()

    return _result_payload_from_prediction(
        pred,
        model_name=inference.production_model_name,
        stopping_reason=final.stopping_reason,
        caveats=list(final.caveats),
        real_answer_count=len(final.real_answers),
        imputed_count=len(final.imputed_answers),
    )


@router.post("/start", response_model=ScreenActionResponse)
async def start_screen(
    body: StartScreenRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
    inference: Annotated[InferenceService, Depends(_get_inference)],
):
    if not inference.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=inference.load_error or "model not trained — run train.py",
        )
    if not body.consent_given:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="consent_given must be true to start a screening session",
        )

    session_id = str(uuid.uuid4())
    
    from data.generator.age_brackets import map_to_bracket_label
    age_bracket = map_to_bracket_label(body.corrected_age_months)

    core = CoreSession(
        child_id=body.child_ref or session_id,
        corrected_age_months=body.corrected_age_months,
        age_bracket=age_bracket,
        question_cap=body.question_cap,
    )

    db_row = DbSession(
        id=session_id,
        child_ref=body.child_ref or session_id,
        parent_user_id=user.id,
        status="in_progress",
        corrected_age_months=body.corrected_age_months,
        age_bracket=age_bracket,
        question_cap=body.question_cap,
        state_json=core.to_dict(),
    )
    db.add(db_row)
    db.add(
        AuditLog(
            actor_id=user.id,
            action="screen.start",
            target_id=session_id,
            detail="consent_given=true",
        )
    )
    await db.flush()

    repo.save(session_id, core)

    action = get_next_action(core)
    if isinstance(action, FinalResult):
        # Extremely unlikely at start, but handle cleanly
        result = await _run_completion(
            core=core,
            db_row=db_row,
            final=action,
            db=db,
            inference=inference,
            actor_id=user.id,
        )
        repo.save(session_id, core)
        return ScreenActionResponse(
            type="complete",
            session_id=session_id,
            status="completed",
            result=result,
        )

    return ScreenActionResponse(
        type="question",
        session_id=session_id,
        status="in_progress",
        question=_question_payload(action),
    )


@router.post("/{session_id}/answer", response_model=ScreenActionResponse)
async def submit_answer(
    session_id: str,
    body: AnswerRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
    inference: Annotated[InferenceService, Depends(_get_inference)],
):
    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    core = repo.get(session_id)
    if core is None:
        # Resume from durable state_json if process memory was lost
        core = CoreSession.from_dict(db_row.state_json)

    if core.completed:
        raise HTTPException(status_code=400, detail="Session already completed")

    if core.item_already_answered(body.item_id):
        raise HTTPException(status_code=400, detail="Item already answered")

    try:
        if body.item_id in MANDATORY_IDS:
            record_mandatory_answer(core, body.item_id, body.answer)
        else:
            if body.answer not in (0, 1, 2):
                raise HTTPException(
                    status_code=422, detail="Milestone answer must be 0, 1, or 2"
                )
            core.answers[body.item_id] = body.answer
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.add(
        Answer(
            session_id=session_id,
            item_id=body.item_id,
            response_value=body.answer,
        )
    )
    db_row.state_json = core.to_dict()
    await db.flush()
    repo.save(session_id, core)

    try:
        action = get_next_action(core)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if isinstance(action, FinalResult):
        result = await _run_completion(
            core=core,
            db_row=db_row,
            final=action,
            db=db,
            inference=inference,
            actor_id=user.id,
        )
        repo.save(session_id, core)
        return ScreenActionResponse(
            type="complete",
            session_id=session_id,
            status="completed",
            result=result,
        )

    return ScreenActionResponse(
        type="question",
        session_id=session_id,
        status="in_progress",
        question=_question_payload(action),
    )


@router.get("/{session_id}/result", response_model=ResultPayload)
async def get_result(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    db_row = await _load_owned_session(db, session_id, user.id, with_result=True)
    if db_row.status != "completed" or db_row.risk_result is None:
        raise HTTPException(status_code=409, detail="Session not yet complete")

    rr = db_row.risk_result
    return ResultPayload(
        final_classification=rr.final_classification,
        ml_classification=rr.ml_classification,
        model_name=rr.model_name,
        ml_score=rr.ml_score,
        probabilities=rr.probabilities or {},
        safety_override_triggered=rr.safety_override_triggered,
        override_rule=rr.override_rule,
        shap_top_features=[
            ShapFeature(feature=k, shap_value=float(v))
            for k, v in sorted(
                (rr.shap_values or {}).items(),
                key=lambda kv: abs(float(kv[1])),
                reverse=True,
            )[:5]
        ],
        shap_values=rr.shap_values or {},
        stopping_reason=rr.stopping_reason,
        caveats=list(rr.caveats or []),
    )


@router.get("/{session_id}", response_model=SessionStateResponse)
async def get_session(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    db_row = await _load_owned_session(db, session_id, user.id, with_result=True)
    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    result_payload = None
    if db_row.risk_result is not None:
        rr = db_row.risk_result
        result_payload = ResultPayload(
            final_classification=rr.final_classification,
            ml_classification=rr.ml_classification,
            model_name=rr.model_name,
            ml_score=rr.ml_score,
            probabilities=rr.probabilities or {},
            safety_override_triggered=rr.safety_override_triggered,
            override_rule=rr.override_rule,
            shap_values=rr.shap_values or {},
            stopping_reason=rr.stopping_reason,
            caveats=list(rr.caveats or []),
        )

    next_q = None
    if not core.completed:
        action = get_next_action(core)
        if isinstance(action, NextQuestion):
            next_q = _question_payload(action)

    return SessionStateResponse(
        session_id=session_id,
        child_ref=db_row.child_ref,
        status=db_row.status,
        corrected_age_months=core.corrected_age_months,
        age_bracket=core.age_bracket,
        question_cap=core.question_cap,
        real_answer_count=core.real_answer_count,
        adaptive_budget_remaining=core.adaptive_budget_remaining,
        answers=dict(core.answers),
        mandatory_answered=dict(core.mandatory_answered),
        completed=core.completed,
        result=result_payload,
        next_question=next_q,
    )


async def _load_owned_session(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    *,
    with_result: bool = False,
) -> DbSession:
    stmt = select(DbSession).where(DbSession.id == session_id)
    if with_result:
        stmt = stmt.options(selectinload(DbSession.risk_result))
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if row.parent_user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")
    return row
