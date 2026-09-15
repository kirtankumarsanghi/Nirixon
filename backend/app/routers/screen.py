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
from app.core.nlp_router import route_recall_chip, route_text
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
    inference_service_b,
)
from app.schemas.screen import (
    AnswerRequest,
    IntakeRequest,
    IntakeResponse,
    QuestionPayload,
    ResultPayload,
    ScreenActionResponse,
    SessionStateResponse,
    ShapFeature,
    StartScreenRequest,
    TeacherAnswerRequest,
    TeacherAnswerResponse,
    TeacherItemPayload,
    TeacherItemsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/screen", tags=["screen"])


def _get_inference_a() -> InferenceService:
    """FastAPI dependency: always returns the Module A inference service."""
    return inference_service


def _get_inference_b() -> InferenceService:
    """FastAPI dependency: always returns the Module B inference service."""
    return inference_service_b


async def _get_inference_for_session(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InferenceService:
    """
    FastAPI dependency for /answer.

    Reads `db_row.module` for the requested session and returns the
    correct InferenceService at request time — inference_service_b for
    Module B sessions, inference_service for Module A sessions.

    This replaces the broken `_get_inference(module="A")` plain function
    that always defaulted to the Module A service regardless of the session.
    """
    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.module == "B":
        return inference_service_b
    return inference_service


def _override_rule_name(override: str | None, session: CoreSession) -> str | None:
    if override is None:
        return None
    if session.module == "A" and session.mandatory_answered.get("regression_flag") == 1 and override == "Refer":
        return "regression_flag"
    if session.module == "B" and override == "Refer":
        return "rule_out_item"
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
    domain_classifications: dict[str, str] | None = None,
    module: str = "A",
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
        domain_classifications=domain_classifications or {},
        module=module,  # type: ignore[arg-type]
    )


async def _run_completion_b(
    *,
    core: CoreSession,
    db_row: DbSession,
    final: FinalResult,
    db: AsyncSession,
    actor_id: str,
) -> ResultPayload:
    from data.generator.item_bank_b import MODULE_B_ITEM_BY_ID

    core.completed = True
    db_row.status = "completed"
    db_row.completed_at = datetime.now(timezone.utc)
    db_row.state_json = core.to_dict()

    # Calculate domain scores and question counts
    domain_scores: dict[str, int] = {}
    domain_counts: dict[str, int] = {}
    for item_id, answer in final.real_answers.items():
        if item_id in MODULE_B_ITEM_BY_ID:
            domain = MODULE_B_ITEM_BY_ID[item_id].domain
            domain_scores[domain] = domain_scores.get(domain, 0) + answer
            domain_counts[domain] = domain_counts.get(domain, 0) + 1

    domain_classifications: dict[str, str] = {}
    has_refer = False
    has_monitor = False

    for domain, score in domain_scores.items():
        # Only classify if at least one question was answered for this domain
        if domain_counts.get(domain, 0) > 0:
            if score == 0:
                domain_classifications[domain] = "Typical"
            elif score <= 2:
                domain_classifications[domain] = "Monitor"
                has_monitor = True
            else:
                domain_classifications[domain] = "Refer"
                has_refer = True

    final_classification = "Refer" if has_refer else ("Monitor" if has_monitor else "Typical")
    safety_override_triggered = final.deterministic_override is not None
    if safety_override_triggered:
        final_classification = final.deterministic_override  # type: ignore[assignment]
    
    override_rule = _override_rule_name(final.deterministic_override, core)

    risk = RiskResult(
        session_id=db_row.id,
        ml_score=0.0,
        ml_classification=final_classification,
        model_name="rule_based_b",
        final_classification=final_classification,
        safety_override_triggered=safety_override_triggered,
        override_rule=override_rule,
        shap_values={},
        probabilities={"Typical": 0.0, "Monitor": 0.0, "Refer": 0.0},
        caveats=list(final.caveats),
        stopping_reason=final.stopping_reason,
        domain_classifications=domain_classifications,
    )
    db.add(risk)
    db.add(
        AuditLog(
            actor_id=actor_id,
            action="screen.complete",
            target_id=db_row.id,
            detail=(
                f"final={final_classification} "
                f"override={safety_override_triggered} "
                f"rule={override_rule}"
            ),
        )
    )
    await db.flush()

    return ResultPayload(
        final_classification=final_classification,
        ml_classification=final_classification,
        model_name="rule_based_b",
        ml_score=0.0,
        probabilities={"Typical": 0.0, "Monitor": 0.0, "Refer": 0.0},
        safety_override_triggered=safety_override_triggered,
        override_rule=override_rule,
        shap_top_features=[],
        shap_values={},
        stopping_reason=final.stopping_reason,
        caveats=list(final.caveats),
        real_answer_count=len(final.real_answers),
        imputed_count=0,
        domain_classifications=domain_classifications,
        module=core.module,
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
    if core.module == "B":
        return await _run_completion_b(
            core=core,
            db_row=db_row,
            final=final,
            db=db,
            actor_id=actor_id,
        )

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

    # Domain classifications for Module B (empty dict for Module A)
    domain_cls: dict[str, str] = getattr(pred, "domain_classifications", {})

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
        domain_classifications=domain_cls,
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
        domain_classifications=domain_cls,
        module=core.module,
    )


@router.post("/start", response_model=ScreenActionResponse)
async def start_screen(
    body: StartScreenRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    # Determine module first so the is_loaded guard checks the right service.
    # Auto-detect from age when caller does not specify.
    module: str = body.module or ("B" if body.corrected_age_months >= 60 else "A")

    # Guard: check only the relevant service for this module.
    if module != "B":
        svc = inference_service
        if not svc.is_loaded:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=svc.load_error or f"Module {module} model not trained — run train.py --module {module}",
            )

    if not body.consent_given:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="consent_given must be true to start a screening session",
        )

    session_id = str(uuid.uuid4())

    from data.generator.age_brackets import map_to_bracket_label
    age_bracket = map_to_bracket_label(min(body.corrected_age_months, 66))

    core = CoreSession(
        child_id=body.child_ref or session_id,
        corrected_age_months=body.corrected_age_months,
        age_bracket=age_bracket,
        question_cap=body.question_cap,
        module=module,  # type: ignore[arg-type]
    )

    db_row = DbSession(
        id=session_id,
        child_ref=body.child_ref or session_id,
        parent_user_id=user.id,
        status="in_progress",
        corrected_age_months=body.corrected_age_months,
        age_bracket=age_bracket,
        question_cap=body.question_cap,
        module=module,
        state_json=core.to_dict(),
    )
    db.add(db_row)
    db.add(
        AuditLog(
            actor_id=user.id,
            action="screen.start",
            target_id=session_id,
            detail=f"consent_given=true module={module}",
        )
    )
    await db.flush()

    repo.save(session_id, core)

    # Module B sessions require free-text intake before questions start.
    if module == "B":
        return ScreenActionResponse(
            type="intake_required",
            session_id=session_id,
            status="in_progress",
        )

    # Module A: jump straight to first question.
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
    inference: Annotated[InferenceService, Depends(_get_inference_for_session)],
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
        telemetry = (core.microtask_telemetry or {}) if core else {}
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
            domain_classifications=getattr(rr, "domain_classifications", None) or {},
            consistency_score=getattr(rr, "consistency_score", None),
            consistency_flags=dict(telemetry.get("consistency_flags") or {}),
            module=core.module if core else "A",  # type: ignore[arg-type]
            real_answer_count=core.real_answer_count if core else None,
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
        module=core.module,  # type: ignore[arg-type]
        detected_domains=list(core.detected_domains),
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


# ---------------------------------------------------------------------------
# Module B endpoints
# ---------------------------------------------------------------------------


@router.post("/{session_id}/intake", response_model=IntakeResponse)
async def submit_intake(
    session_id: str,
    body: IntakeRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """
    Module B only. Submit the free-text observation from a parent or teacher.
    Returns the NLP-detected domains and the next action for the frontend.

    If recall_help_needed is True, the frontend should render a chip grid.
    If rule_out_flagged is True, the frontend should show a specialist-referral
    message and not proceed to adaptive questions.
    """
    import hashlib

    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.module != "B":
        raise HTTPException(status_code=400, detail="Intake is only for Module B sessions")
    if db_row.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # Chip path: merge domains from each selected recall chip (+ optional text)
    if body.chips:
        detected: set[str] = set()
        rule_out_flagged = False
        for chip in body.chips:
            chip_result = route_recall_chip(chip)
            detected.update(chip_result["detected_domains"])
            if chip_result["rule_out_flagged"]:
                rule_out_flagged = True
        if body.text.strip():
            text_result = route_text(body.text)
            detected.update(text_result["detected_domains"])
            if text_result["rule_out_flagged"]:
                rule_out_flagged = True
        router_result = {
            "detected_domains": sorted(detected),
            "rule_out_flagged": rule_out_flagged,
            "recall_help_needed": False,
            "recall_help_options": [],
            "setting": body.setting,
            "token_count": 0,
        }
    else:
        if not body.text.strip():
            raise HTTPException(
                status_code=422,
                detail="Please describe what you've noticed, or select areas of concern.",
            )
        router_result = route_text(body.text)

    # Store hash of intake text (never the text itself)
    hash_source = body.text.strip() or "|".join(body.chips)
    db_row.intake_text_hash = hashlib.sha256(hash_source.encode()).hexdigest()

    if router_result["recall_help_needed"]:
        await db.flush()
        return IntakeResponse(
            recall_help_needed=True,
            recall_help_options=router_result["recall_help_options"],
            detected_domains=[],
            rule_out_flagged=False,
            next_action="question",
        )

    if router_result["rule_out_flagged"]:
        db_row.status = "completed"
        db.add(AuditLog(
            actor_id=user.id,
            action="screen.rule_out",
            target_id=session_id,
            detail="rule_out_flagged=true",
        ))
        await db.flush()
        return IntakeResponse(
            recall_help_needed=False,
            recall_help_options=[],
            detected_domains=[],
            rule_out_flagged=True,
            next_action="rule_out_referral",
        )

    # Update session with detected domains so adaptive_tree can filter
    domains = list(router_result["detected_domains"])
    if not domains:
        # Broad check-in when caregiver cannot narrow the concern
        from data.generator.item_bank_b import MODULE_B_DOMAINS

        domains = list(MODULE_B_DOMAINS)
    core.detected_domains = domains
    core.microtask_telemetry["intake_setting"] = router_result.get("setting", body.setting)
    db_row.state_json = core.to_dict()
    repo.save(session_id, core)
    await db.flush()

    return IntakeResponse(
        recall_help_needed=False,
        recall_help_options=[],
        detected_domains=domains,
        rule_out_flagged=False,
        next_action="question",
    )


@router.get("/{session_id}/teacher-items", response_model=TeacherItemsResponse)
async def get_teacher_items(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """
    Module B only. Return school-facing items matched to the parent's answers
    so the teacher form shares item IDs for consistency scoring.
    """
    from data.generator.item_bank_b import MODULE_B_ITEM_BY_ID

    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.module != "B":
        raise HTTPException(status_code=400, detail="Teacher form is only for Module B sessions")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # Prefer one answered item per domain (up to 5), falling back to first answered
    by_domain: dict[str, str] = {}
    for item_id in core.answers:
        item = MODULE_B_ITEM_BY_ID.get(item_id)
        if item is None or item.domain == "rule_out":
            continue
        if item.domain not in by_domain:
            by_domain[item.domain] = item_id

    selected_ids = list(by_domain.values())[:5]
    if not selected_ids:
        # Session completed without answers somehow — seed common school items
        selected_ids = ["AT01", "SC02", "EM01"]

    items = [
        TeacherItemPayload(
            item_id=iid,
            question_text=MODULE_B_ITEM_BY_ID[iid].text,
            domain=MODULE_B_ITEM_BY_ID[iid].domain,
        )
        for iid in selected_ids
        if iid in MODULE_B_ITEM_BY_ID
    ]
    return TeacherItemsResponse(items=items)


@router.post("/{session_id}/teacher", response_model=TeacherAnswerResponse)
async def submit_teacher_form(
    session_id: str,
    body: TeacherAnswerRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """
    Module B only. Submit teacher-reported answers for cross-context
    consistency scoring. Does not affect the adaptive question flow.

    Consistency score of <0.6 triggers a divergence flag per domain in the
    results view. Teacher answers are stored on the session but never surfaced
    to the teacher themselves.
    """
    db_row = await _load_owned_session(db, session_id, user.id, with_result=True)
    if db_row.module != "B":
        raise HTTPException(status_code=400, detail="Teacher form is only for Module B sessions")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # Validate answer values
    for item_id, value in body.answers.items():
        if value not in (0, 1, 2):
            raise HTTPException(
                status_code=422,
                detail=f"Answer for {item_id!r} must be 0, 1, or 2",
            )

    core.teacher_answers = dict(body.answers)
    score, flags, caveats = _compute_consistency(core)
    core.microtask_telemetry["consistency_score"] = score
    core.microtask_telemetry["consistency_flags"] = flags
    db_row.state_json = core.to_dict()
    repo.save(session_id, core)

    # Update RiskResult if the session is already complete
    if db_row.status == "completed" and db_row.risk_result is not None:
        db_row.risk_result.consistency_score = score
        existing = list(db_row.risk_result.caveats or [])
        for note in caveats:
            if note not in existing:
                existing.append(note)
        db_row.risk_result.caveats = existing

    await db.flush()
    return TeacherAnswerResponse(
        consistency_score=score,
        consistency_flags=flags,
        caveats=caveats,
    )


def _compute_consistency(
    core: CoreSession,
) -> tuple[float, dict[str, bool], list[str]]:
    """
    Compute parent-vs-teacher consistency per domain.

    Returns (score, per_domain_flags, caveats).
      score: mean agreement across shared items, 0.0–1.0.
      flags: {domain: True if mean abs diff > 0.5} — i.e. meaningful divergence.
      caveats: human-readable notes for the results view.
    """
    from data.generator.item_bank_b import MODULE_B_ITEM_BY_ID

    parent_answers = core.answers
    teacher_answers = core.teacher_answers

    shared_ids = set(parent_answers) & set(teacher_answers)
    if not shared_ids:
        return 1.0, {}, [
            "No overlapping home/school items were compared — consistency could not be scored."
        ]

    # Per-domain absolute differences
    domain_diffs: dict[str, list[float]] = {}
    for iid in shared_ids:
        if iid not in MODULE_B_ITEM_BY_ID:
            continue
        domain = MODULE_B_ITEM_BY_ID[iid].domain
        diff = abs(parent_answers[iid] - teacher_answers[iid]) / 2.0  # normalise to [0,1]
        domain_diffs.setdefault(domain, []).append(diff)

    if not domain_diffs:
        return 1.0, {}, [
            "Teacher answers did not match known school-age items — consistency could not be scored."
        ]

    domain_mean: dict[str, float] = {
        d: sum(diffs) / len(diffs) for d, diffs in domain_diffs.items()
    }
    overall_score = 1.0 - (sum(domain_mean.values()) / len(domain_mean))
    flags: dict[str, bool] = {d: mean > 0.25 for d, mean in domain_mean.items()}
    caveats: list[str] = [
        f"Parent and teacher perspectives differ notably on {d.replace('_', ' ')}."
        for d, flagged in flags.items() if flagged
    ]
    return round(overall_score, 3), flags, caveats
