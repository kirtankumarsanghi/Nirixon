"""
Stage 4 — Screening session endpoints.

Orchestrator owns state transitions; SessionRepository persists them;
DB Answer/RiskResult rows are the durable audit trail.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_parent
from app.core.mandatory_items import record_mandatory_answer
from app.core.module_b.age import months_to_module_b_age
from app.core.module_b.domains import to_api_domain, to_engine_domain
from app.core.module_b.engine_b import POOL_NAME
from app.core.module_b.engine_b import Session as EngineSession
from app.core.module_b.screen_bridge import (
    build_action_response,
    build_result_payload,
)
from app.core.module_b.service import module_b_service
from app.core.nlp_router import DomainRouterResult, route_recall_chip, route_text
from app.core.orchestrator import get_next_action
from app.core.session import MANDATORY_IDS, FinalResult, NextQuestion
from app.core.session import ScreeningSession as CoreSession
from app.core.triage_guard import (
    ITEM_METADATA,
    evaluate_live_tiered_triage,
    evaluate_response_guards,
)
from app.core.worker_service import get_suggested_workers
from app.db.models import Answer, AuditLog, RiskResult, User, WorkerContactLog
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
    RecallChoiceRequest,
    ResultPayload,
    ScreenActionResponse,
    SessionStateResponse,
    ShapFeature,
    StartScreenRequest,
    TeacherAnswerRequest,
    TeacherAnswerResponse,
    TeacherInviteResponse,
    TeacherItemPayload,
    TeacherItemsResponse,
    WorkerContactRequest,
    WorkerContactResponse,
    WorkerSuggestion,
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
    if (
        session.module == "A"
        and session.mandatory_answered.get("regression_flag") == 1
        and override == "Refer"
    ):
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
    triage_tier: str | None = None,
    reflex_branch_recommended: bool = False,
    target_reflex_domains: list[str] | None = None,
    guard_flags: dict[str, bool] | None = None,
    guard_advisories: list[str] | None = None,
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
        triage_tier=triage_tier,
        reflex_branch_recommended=reflex_branch_recommended,
        target_reflex_domains=target_reflex_domains or [],
        guard_flags=guard_flags or {},
        guard_advisories=guard_advisories or [],
    )


async def _run_completion_b(
    *,
    core: CoreSession,
    db_row: DbSession,
    final: FinalResult | None,
    db: AsyncSession,
    actor_id: str,
    engine_session: EngineSession | None = None,
) -> ResultPayload:
    core.completed = True
    db_row.status = "completed"
    db_row.completed_at = datetime.now(UTC)

    # Use the finished Module B engine result if loaded
    if module_b_service.is_loaded and (
        engine_session is not None or core.module_b_state is not None
    ):
        if engine_session is None and core.module_b_state is not None:
            engine_session = EngineSession.from_dict(core.module_b_state)

        if engine_session is not None:
            raw_res = module_b_service.engine.result(engine_session)
            payload = build_result_payload(raw_res)

            # Rule-outs: vision_hearing or global_asd positive rule-out forces Refer override
            ro_flagged = bool(raw_res.get("ruleout_flags"))
            final_cls = "Refer" if ro_flagged else payload.final_classification
            override_triggered = payload.safety_override_triggered or ro_flagged
            override_rule = payload.override_rule or (
                "rule_out_item" if ro_flagged else None
            )

            payload.final_classification = final_cls
            payload.ml_classification = final_cls
            payload.safety_override_triggered = override_triggered
            if ro_flagged or override_triggered:
                payload.triage_tier = "Tier 3: Direct Referral"
                payload.reflex_branch_recommended = False

            db_row.module_b_state = engine_session.to_dict()
            core.module_b_state = db_row.module_b_state
            db_row.state_json = core.to_dict()

            risk = RiskResult(
                session_id=db_row.id,
                ml_score=0.0,
                ml_classification=final_cls,
                model_name="module_b_engine",
                final_classification=final_cls,
                safety_override_triggered=override_triggered,
                override_rule=override_rule,
                shap_values={},
                probabilities={"Typical": 0.0, "Monitor": 0.0, "Refer": 0.0},
                caveats=payload.caveats,
                stopping_reason=payload.stopping_reason or "module_b_engine",
                domain_classifications=payload.domain_classifications,
            )
            db.add(risk)
            db.add(
                AuditLog(
                    actor_id=actor_id,
                    action="screen.complete",
                    target_id=db_row.id,
                    detail=(
                        f"final={final_cls} "
                        f"tier={payload.triage_tier} "
                        f"override={override_triggered} "
                        f"rule={override_rule}"
                    ),
                )
            )
            await db.flush()

            # Community & healthcare worker suggestions based on location and triage
            suggested = await get_suggested_workers(
                db,
                city=db_row.location_city,
                state=db_row.location_state,
                pincode=db_row.location_pincode,
                triage_tier=payload.triage_tier,
                final_classification=payload.final_classification,
                flagged_domains=payload.flagged_domains,
            )
            payload.suggested_workers = [WorkerSuggestion(**w) for w in suggested]
            payload.child_name = db_row.child_name
            payload.parent_name = db_row.parent_name
            payload.parent_phone = db_row.parent_phone
            payload.relationship_to_child = db_row.relationship_to_child
            payload.location_pincode = db_row.location_pincode
            payload.location_city = db_row.location_city
            payload.location_state = db_row.location_state
            payload.location_address = db_row.location_address
            return payload

    from data.generator.item_bank_b import MODULE_B_ITEM_BY_ID

    db_row.state_json = core.to_dict()

    real_answers = final.real_answers if final else core.answers
    # Calculate domain scores and question counts
    domain_scores: dict[str, int] = {}
    domain_counts: dict[str, int] = {}
    for item_id, answer in real_answers.items():
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

    final_classification = (
        "Refer" if has_refer else ("Monitor" if has_monitor else "Typical")
    )
    safety_override_triggered = bool(final and final.deterministic_override is not None)
    if safety_override_triggered and final:
        final_classification = final.deterministic_override  # type: ignore[assignment]

    override_rule = (
        _override_rule_name(final.deterministic_override, core) if final else None
    )

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
        caveats=list(final.caveats) if final else [],
        stopping_reason=final.stopping_reason if final else "domain_quota_b",
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

    flagged_b = [
        dom
        for dom, cls_val in domain_classifications.items()
        if cls_val in ("Monitor", "Refer")
    ]
    triage_tier_b = (
        "Tier 3: Direct Referral"
        if final_classification == "Refer"
        else (
            "Tier 2: In-App Reflex Monitor"
            if final_classification == "Monitor"
            else "Tier 1: Routine Pass"
        )
    )
    suggested_b = await get_suggested_workers(
        db,
        city=db_row.location_city,
        state=db_row.location_state,
        pincode=db_row.location_pincode,
        triage_tier=triage_tier_b,
        final_classification=final_classification,
        flagged_domains=flagged_b,
    )

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
        stopping_reason=final.stopping_reason if final else "domain_quota_b",
        caveats=list(final.caveats) if final else [],
        real_answer_count=len(real_answers),
        imputed_count=0,
        domain_classifications=domain_classifications,
        module=core.module,
        triage_tier=triage_tier_b,
        child_name=db_row.child_name,
        parent_name=db_row.parent_name,
        parent_phone=db_row.parent_phone,
        relationship_to_child=db_row.relationship_to_child,
        location_pincode=db_row.location_pincode,
        location_city=db_row.location_city,
        location_state=db_row.location_state,
        location_address=db_row.location_address,
        suggested_workers=[WorkerSuggestion(**w) for w in suggested_b],
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
    db_row.completed_at = datetime.now(UTC)
    db_row.state_json = core.to_dict()

    # Domain classifications for Module B (empty dict for Module A)
    domain_cls: dict[str, str] = getattr(pred, "domain_classifications", {})

    # Calculate domain scores from real answers for Module A
    domain_totals: dict[str, float] = {}
    domain_counts: dict[str, int] = {}
    for item_id, ans in final.real_answers.items():
        if item_id in ITEM_METADATA:
            dom = ITEM_METADATA[item_id]["domain"]
            domain_totals[dom] = domain_totals.get(dom, 0.0) + float(ans)
            domain_counts[dom] = domain_counts.get(dom, 0) + 1
    domain_scores = {
        dom: (domain_totals[dom] / (2.0 * domain_counts[dom]))
        for dom in domain_totals
        if domain_counts.get(dom, 0) > 0
    }

    # Evaluate reporting quality & acquiescence/inconsistency guards
    guard_flags, guard_advisories = evaluate_response_guards(
        core.corrected_age_months,
        final.real_answers,
    )

    # Evaluate 3-tier clinical triage allocation
    prob_refer = float(pred.probabilities.get("Refer", 0.0))
    triage_tier, reflex_rec, target_reflex_domains = evaluate_live_tiered_triage(
        prob_refer=prob_refer,
        safety_override=pred.safety_override_triggered,
        domain_scores=domain_scores,
    )

    all_caveats = list(final.caveats) + guard_advisories

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
        caveats=all_caveats,
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
    db.add(
        AuditLog(
            actor_id=actor_id,
            action="screen.triage",
            target_id=db_row.id,
            detail=(
                f"tier={triage_tier} "
                f"reflex={reflex_rec} "
                f"targets={target_reflex_domains} "
                f"guards={guard_flags}"
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

    res = _result_payload_from_prediction(
        pred,
        model_name=inference.production_model_name,
        stopping_reason=final.stopping_reason,
        caveats=all_caveats,
        real_answer_count=len(final.real_answers),
        imputed_count=len(final.imputed_answers),
        domain_classifications=domain_cls,
        module=core.module,
        triage_tier=triage_tier,
        reflex_branch_recommended=reflex_rec,
        target_reflex_domains=target_reflex_domains,
        guard_flags=guard_flags,
        guard_advisories=guard_advisories,
    )
    flagged_a = [dom for dom, score in domain_scores.items() if score > 0.3]
    suggested_a = await get_suggested_workers(
        db,
        city=db_row.location_city,
        state=db_row.location_state,
        pincode=db_row.location_pincode,
        triage_tier=triage_tier,
        final_classification=pred.final_classification,
        flagged_domains=flagged_a,
    )
    res.suggested_workers = [WorkerSuggestion(**w) for w in suggested_a]
    res.child_name = db_row.child_name
    res.parent_name = db_row.parent_name
    res.parent_phone = db_row.parent_phone
    res.relationship_to_child = db_row.relationship_to_child
    res.location_pincode = db_row.location_pincode
    res.location_city = db_row.location_city
    res.location_state = db_row.location_state
    res.location_address = db_row.location_address
    return res


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
                detail=svc.load_error
                or f"Module {module} model not trained — run train.py --module {module}",
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
        child_name=body.child_name,
        parent_name=body.parent_name,
        parent_phone=body.parent_phone,
        relationship_to_child=body.relationship_to_child or "Parent",
        location_pincode=body.location_pincode,
        location_city=body.location_city,
        location_state=body.location_state,
        location_address=body.location_address,
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
        child_name=body.child_name,
        parent_name=body.parent_name,
        parent_phone=body.parent_phone,
        relationship_to_child=body.relationship_to_child or "Parent",
        location_pincode=body.location_pincode,
        location_city=body.location_city,
        location_state=body.location_state,
        location_address=body.location_address,
        state_json=core.to_dict(),
    )
    db.add(db_row)
    db.add(
        AuditLog(
            actor_id=user.id,
            action="screen.start",
            target_id=session_id,
            detail=(
                f"consent_given=true module={module} "
                f"city={body.location_city} pin={body.location_pincode}"
            ),
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
            inference=inference_service,
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

    # Module B adaptive engine loop
    if (
        core.module == "B"
        and module_b_service.is_loaded
        and core.module_b_state is not None
    ):
        if core.item_already_answered(body.item_id):
            raise HTTPException(status_code=400, detail="Item already answered")

        if core.pending_item_id is not None and body.item_id != core.pending_item_id:
            raise HTTPException(
                status_code=422,
                detail=f"Item mismatch: expected {core.pending_item_id}, got {body.item_id}",
            )

        try:
            row = module_b_service.engine.bank.row(body.item_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=422, detail=f"Unknown item {body.item_id}"
            ) from exc

        rt = str(row["response_type"])
        val: int | str
        if rt == "likert5":
            try:
                val = int(body.answer)
                if val < 1 or val > 5:
                    raise HTTPException(
                        status_code=422,
                        detail="Likert answer must be an integer between 1 and 5",
                    )
            except (ValueError, TypeError) as exc:
                raise HTTPException(
                    status_code=422,
                    detail="Likert answer must be an integer between 1 and 5",
                ) from exc
        elif rt == "yesno":
            str_val = str(body.answer).strip().lower()
            if str_val in ("yes", "1", "true"):
                val = "Yes"
            elif str_val in ("no", "0", "false"):
                val = "No"
            elif str_val in ("not sure", "not_sure", "2"):
                val = "Not sure"
            else:
                raise HTTPException(
                    status_code=422,
                    detail="Yes/No answer must be Yes, No, or Not sure",
                )
        else:
            val = body.answer

        # Never trust client-supplied track; derive it from the item
        dom = str(row["domain"])
        derived_track = (
            "safety"
            if dom == "safety"
            else {v: k for k, v in POOL_NAME.items()}.get(dom, dom)
        )

        eng_sess = EngineSession.from_dict(core.module_b_state)
        module_b_service.engine.answer(eng_sess, body.item_id, val, track=derived_track)

        resp_num = (
            val
            if isinstance(val, int)
            else (1 if val == "Yes" else (0 if val == "No" else 2))
        )
        core.answers[body.item_id] = resp_num
        db.add(
            Answer(
                session_id=session_id,
                item_id=body.item_id,
                response_value=resp_num,
            )
        )

        b_action = module_b_service.engine.next_action(eng_sess)
        if b_action.get("type") == "done":
            result = await _run_completion_b(
                core=core,
                db_row=db_row,
                final=None,
                db=db,
                actor_id=user.id,
                engine_session=eng_sess,
            )
            core.pending_item_id = None
            db_row.pending_item_id = None
            core.module_b_state = eng_sess.to_dict()
            db_row.module_b_state = core.module_b_state
            db_row.state_json = core.to_dict()
            repo.save(session_id, core)
            await db.flush()
            return ScreenActionResponse(
                type="complete",
                session_id=session_id,
                status="completed",
                result=result,
            )

        if b_action.get("type") == "question":
            core.pending_item_id = str(b_action["item_id"])
            db_row.pending_item_id = core.pending_item_id

        core.module_b_state = eng_sess.to_dict()
        db_row.module_b_state = core.module_b_state
        db_row.state_json = core.to_dict()
        repo.save(session_id, core)
        await db.flush()

        return build_action_response(
            session_id=session_id, engine_session="", action=b_action
        )

    # --- Module A / legacy fallback path ---
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
    flagged = [
        k
        for k, v in (rr.domain_classifications or {}).items()
        if v in ("Monitor", "Refer")
    ]
    triage_tier = (
        "Tier 3: Direct Referral"
        if rr.final_classification == "Refer"
        else (
            "Tier 2: In-App Reflex Monitor"
            if rr.final_classification == "Monitor"
            else "Tier 1: Routine Pass"
        )
    )
    workers = await get_suggested_workers(
        db,
        city=db_row.location_city,
        state=db_row.location_state,
        pincode=db_row.location_pincode,
        triage_tier=triage_tier,
        final_classification=rr.final_classification,
        flagged_domains=flagged,
    )
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
        domain_classifications=getattr(rr, "domain_classifications", None) or {},
        module=db_row.module,  # type: ignore[arg-type]
        triage_tier=triage_tier,
        child_name=db_row.child_name,
        parent_name=db_row.parent_name,
        parent_phone=db_row.parent_phone,
        relationship_to_child=db_row.relationship_to_child,
        location_pincode=db_row.location_pincode,
        location_city=db_row.location_city,
        location_state=db_row.location_state,
        location_address=db_row.location_address,
        suggested_workers=[WorkerSuggestion(**w) for w in workers],
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
            child_name=db_row.child_name,
            parent_name=db_row.parent_name,
            parent_phone=db_row.parent_phone,
            relationship_to_child=db_row.relationship_to_child,
            location_pincode=db_row.location_pincode,
            location_city=db_row.location_city,
            location_state=db_row.location_state,
            location_address=db_row.location_address,
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
        child_name=db_row.child_name,
        parent_name=db_row.parent_name,
        parent_phone=db_row.parent_phone,
        relationship_to_child=db_row.relationship_to_child,
        location_pincode=db_row.location_pincode,
        location_city=db_row.location_city,
        location_state=db_row.location_state,
        location_address=db_row.location_address,
    )


@router.get("/{session_id}/workers", response_model=list[WorkerSuggestion])
async def list_suggested_workers(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    db_row = await _load_owned_session(db, session_id, user.id, with_result=True)
    final_cls = "Typical"
    flagged = []
    triage_tier = "Tier 1: Routine Pass"
    if db_row.risk_result is not None:
        final_cls = db_row.risk_result.final_classification
        flagged = [
            k
            for k, v in (db_row.risk_result.domain_classifications or {}).items()
            if v in ("Monitor", "Refer")
        ]
        triage_tier = (
            "Tier 3: Direct Referral"
            if final_cls == "Refer"
            else (
                "Tier 2: In-App Reflex Monitor"
                if final_cls == "Monitor"
                else "Tier 1: Routine Pass"
            )
        )

    workers = await get_suggested_workers(
        db,
        city=db_row.location_city,
        state=db_row.location_state,
        pincode=db_row.location_pincode,
        triage_tier=triage_tier,
        final_classification=final_cls,
        flagged_domains=flagged,
    )
    return [WorkerSuggestion(**w) for w in workers]


@router.post("/{session_id}/contact_worker", response_model=WorkerContactResponse)
async def contact_worker(
    session_id: str,
    body: WorkerContactRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    db_row = await _load_owned_session(db, session_id, user.id)
    from app.db.models import CommunityWorker

    stmt = select(CommunityWorker).where(CommunityWorker.id == body.worker_id)
    res = await db.execute(stmt)
    worker = res.scalar_one_or_none()

    worker_name = worker.name if worker else "Community Health Worker"
    worker_phone = worker.phone if worker else "104"
    worker_role = worker.role if worker else "Healthcare Worker"

    log_entry = WorkerContactLog(
        id=str(uuid.uuid4()),
        session_id=session_id,
        worker_id=body.worker_id,
        worker_name=worker_name,
        worker_role=worker_role,
        parent_phone=db_row.parent_phone,
        contact_channel=body.contact_method,
        notes=body.notes,
    )
    db.add(log_entry)
    db.add(
        AuditLog(
            actor_id=user.id,
            action="worker.contact_initiated",
            target_id=session_id,
            detail=f"worker_id={body.worker_id} method={body.contact_method}",
        )
    )
    await db.commit()

    return WorkerContactResponse(
        status="success",
        worker_name=worker_name,
        contact_phone=worker_phone,
        message=f"Contact request logged for {worker_name}. You may reach out via {body.contact_method}.",
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
        raise HTTPException(
            status_code=400, detail="Intake is only for Module B sessions"
        )
    if db_row.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # Module B engine path
    if module_b_service.is_loaded:
        if body.chips and core.module_b_state is not None:
            eng_sess = EngineSession.from_dict(core.module_b_state)
            module_b_service.engine.apply_recall_choice(
                eng_sess, [to_engine_domain(c) for c in body.chips]
            )
        else:
            if not body.text.strip() and not body.chips:
                raise HTTPException(
                    status_code=422,
                    detail="Please describe what you've noticed, or select areas of concern.",
                )
            age_years = months_to_module_b_age(core.corrected_age_months)
            eng_sess = module_b_service.engine.start(
                body.text, age_years, form="parent", seed=body.seed
            )
            if body.chips:
                module_b_service.engine.apply_recall_choice(
                    eng_sess, [to_engine_domain(c) for c in body.chips]
                )

        hash_source = body.text.strip() or "|".join(body.chips)
        db_row.intake_text_hash = hashlib.sha256(hash_source.encode()).hexdigest()

        action = module_b_service.engine.next_action(eng_sess)
        if action.get("type") == "question":
            core.pending_item_id = str(action["item_id"])
            db_row.pending_item_id = core.pending_item_id

        core.module_b_state = eng_sess.to_dict()
        db_row.module_b_state = core.module_b_state

        detected = [
            to_api_domain(d)
            for d, p in eng_sess.prior.items()
            if p > 0.35 and d not in ("vision_hearing", "global_asd")
        ]
        core.detected_domains = detected
        db_row.state_json = core.to_dict()
        repo.save(session_id, core)
        await db.flush()

        action_resp = build_action_response(
            session_id=session_id, engine_session="", action=action
        )
        atype = action.get("type")

        return IntakeResponse(
            recall_help_needed=(atype == "recall_help"),
            recall_help_options=(
                list(action_resp.recall_options.keys())
                if action_resp.recall_options
                else []
            ),
            detected_domains=detected,
            rule_out_flagged=False,
            next_action=(
                "recall_help"
                if atype == "recall_help"
                else ("safety_notice" if atype == "safety_notice" else "question")
            ),
            action=action_resp,
            safety_message=action_resp.safety_message,
            helplines=action_resp.helplines,
            recall_message=action_resp.recall_message,
            recall_options=action_resp.recall_options,
            question=action_resp.question,
        )

    # Legacy fallback path
    # Chip path: merge domains from each selected recall chip (+ optional text)
    router_result: DomainRouterResult
    if body.chips:
        detected_set: set[str] = set()
        rule_out_flagged = False
        for chip in body.chips:
            chip_result = route_recall_chip(chip)
            detected_set.update(chip_result["detected_domains"])
            if chip_result["rule_out_flagged"]:
                rule_out_flagged = True
        if body.text.strip():
            text_result = route_text(body.text)
            detected_set.update(text_result["detected_domains"])
            if text_result["rule_out_flagged"]:
                rule_out_flagged = True
        router_result = DomainRouterResult(
            detected_domains=sorted(detected_set),
            rule_out_flagged=rule_out_flagged,
            recall_help_needed=False,
            recall_help_options=[],
            setting=body.setting or "unknown",
            token_count=0,
        )
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
        db.add(
            AuditLog(
                actor_id=user.id,
                action="screen.rule_out",
                target_id=session_id,
                detail="rule_out_flagged=true",
            )
        )
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
    core.microtask_telemetry["intake_setting"] = router_result.get(
        "setting", body.setting
    )
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


@router.post("/{session_id}/recall", response_model=ScreenActionResponse)
@router.post("/{session_id}/b/recall", response_model=ScreenActionResponse)
async def submit_recall_choice(
    session_id: str,
    body: RecallChoiceRequest,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """Module B: apply selected domain chips from recall help."""
    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    if not module_b_service.is_loaded or core.module_b_state is None:
        raise HTTPException(
            status_code=400, detail="Module B engine not active for this session"
        )

    eng_sess = EngineSession.from_dict(core.module_b_state)
    module_b_service.engine.apply_recall_choice(
        eng_sess, [to_engine_domain(d) for d in body.domains]
    )
    action = module_b_service.engine.next_action(eng_sess)

    if action.get("type") == "question":
        core.pending_item_id = str(action["item_id"])
        db_row.pending_item_id = core.pending_item_id

    core.module_b_state = eng_sess.to_dict()
    db_row.module_b_state = core.module_b_state
    db_row.state_json = core.to_dict()
    repo.save(session_id, core)
    await db.flush()

    return build_action_response(
        session_id=session_id, engine_session="", action=action
    )


@router.get("/{session_id}/next", response_model=ScreenActionResponse)
@router.post("/{session_id}/next", response_model=ScreenActionResponse)
@router.post("/{session_id}/b/next", response_model=ScreenActionResponse)
async def get_next_screen_action(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """Module B: advance to next action after an informational notice."""
    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.status == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    if not module_b_service.is_loaded or core.module_b_state is None:
        raise HTTPException(
            status_code=400, detail="Module B engine not active for this session"
        )

    eng_sess = EngineSession.from_dict(core.module_b_state)
    action = module_b_service.engine.next_action(eng_sess)

    if action.get("type") == "done":
        result = await _run_completion_b(
            core=core,
            db_row=db_row,
            final=None,
            db=db,
            actor_id=user.id,
            engine_session=eng_sess,
        )
        core.pending_item_id = None
        db_row.pending_item_id = None
        core.module_b_state = eng_sess.to_dict()
        db_row.module_b_state = core.module_b_state
        db_row.state_json = core.to_dict()
        repo.save(session_id, core)
        await db.flush()
        return ScreenActionResponse(
            type="complete",
            session_id=session_id,
            status="completed",
            result=result,
        )

    if action.get("type") == "question":
        core.pending_item_id = str(action["item_id"])
        db_row.pending_item_id = core.pending_item_id

    core.module_b_state = eng_sess.to_dict()
    db_row.module_b_state = core.module_b_state
    db_row.state_json = core.to_dict()
    repo.save(session_id, core)
    await db.flush()

    return build_action_response(
        session_id=session_id, engine_session="", action=action
    )


@router.post("/{session_id}/b/result", response_model=ResultPayload)
async def get_b_result(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_result(session_id, user, db)


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
        raise HTTPException(
            status_code=400, detail="Teacher form is only for Module B sessions"
        )

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
        raise HTTPException(
            status_code=400, detail="Teacher form is only for Module B sessions"
        )

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
        return (
            1.0,
            {},
            [
                "No overlapping home/school items were compared — consistency could not be scored."
            ],
        )

    # Per-domain absolute differences
    domain_diffs: dict[str, list[float]] = {}
    for iid in shared_ids:
        if iid not in MODULE_B_ITEM_BY_ID:
            continue
        domain = MODULE_B_ITEM_BY_ID[iid].domain
        diff = (
            abs(parent_answers[iid] - teacher_answers[iid]) / 2.0
        )  # normalise to [0,1]
        domain_diffs.setdefault(domain, []).append(diff)

    if not domain_diffs:
        return (
            1.0,
            {},
            [
                "Teacher answers did not match known school-age items — consistency could not be scored."
            ],
        )

    domain_mean: dict[str, float] = {
        d: sum(diffs) / len(diffs) for d, diffs in domain_diffs.items()
    }
    overall_score = 1.0 - (sum(domain_mean.values()) / len(domain_mean))
    flags: dict[str, bool] = {d: mean > 0.25 for d, mean in domain_mean.items()}
    caveats: list[str] = [
        f"Parent and teacher perspectives differ notably on {d.replace('_', ' ')}."
        for d, flagged in flags.items()
        if flagged
    ]
    return round(overall_score, 3), flags, caveats


@router.post("/{session_id}/reflex_branch", response_model=ScreenActionResponse)
async def create_reflex_branch_session(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
    repo: Annotated[SessionRepository, Depends(get_session_repo)],
):
    """
    Reflex-Branches an ambiguous/borderline Module A session directly into Module B.
    Creates a linked Module B micro-testing session for the child without requiring
    the caregiver to re-enter demographic information.
    """
    db_row = await _load_owned_session(db, session_id, user.id)
    if db_row.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Cannot reflex-branch an incomplete screening session",
        )

    if db_row.module != "A":
        raise HTTPException(
            status_code=400,
            detail="Reflex-branching is only applicable from Module A screening",
        )

    new_session_id = str(uuid.uuid4())
    core_b = CoreSession(
        child_id=db_row.child_ref,
        corrected_age_months=db_row.corrected_age_months,
        age_bracket=db_row.age_bracket,
        question_cap=15,
        module="B",
    )

    db_row_b = DbSession(
        id=new_session_id,
        child_ref=db_row.child_ref,
        parent_user_id=user.id,
        status="in_progress",
        corrected_age_months=db_row.corrected_age_months,
        age_bracket=db_row.age_bracket,
        question_cap=15,
        module="B",
        state_json=core_b.to_dict(),
    )
    db.add(db_row_b)
    db.add(
        AuditLog(
            actor_id=user.id,
            action="screen.reflex_branch",
            target_id=new_session_id,
            detail=f"source_session_id={session_id}",
        )
    )
    await db.flush()
    repo.save(new_session_id, core_b)

    return ScreenActionResponse(
        type="intake_required",
        session_id=new_session_id,
        status="in_progress",
    )


# ---------------------------------------------------------------------------
# Multi-Informant Teacher Triangulation (DSM-5 Criterion C Concordance)
# ---------------------------------------------------------------------------


@router.post(
    "/{session_id}/teacher_invite",
    response_model=TeacherInviteResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_teacher_invite(
    session_id: str,
    user: Annotated[User, Depends(require_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeacherInviteResponse:
    """Generate or retrieve a secure multi-informant teacher invite token for DSM-5 Criterion C concordance."""
    res = await db.execute(
        select(DbSession).where(
            DbSession.id == session_id, DbSession.parent_user_id == user.id
        )
    )
    db_row = res.scalar_one_or_none()
    if db_row is None:
        raise HTTPException(status_code=404, detail="Screening session not found")

    state = dict(db_row.state_json or {})
    invite = state.get("teacher_invite")
    if not invite or not invite.get("code"):
        code = f"TCH-{session_id[:8].upper()}"
        invite = {
            "code": code,
            "session_id": session_id,
            "created_at": datetime.now(UTC).isoformat(),
        }
        state["teacher_invite"] = invite
        db_row.state_json = state
        await db.flush()
    else:
        code = str(invite["code"])

    return TeacherInviteResponse(
        session_id=session_id,
        teacher_invite_code=code,
        invite_url=f"/teacher/screen/{code}",
        child_ref=db_row.child_ref,
    )


@router.get(
    "/teacher/{invite_code}/items",
    response_model=TeacherItemsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_teacher_assessment_items(
    invite_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeacherItemsResponse:
    """Fetch an expedited 8-domain classroom behavior rating battery for the school teacher."""
    code = invite_code.strip().upper()
    all_res = await db.execute(select(DbSession).where(DbSession.module == "B"))
    db_row = None
    for candidate in all_res.scalars().all():
        if (
            candidate.id == invite_code
            or (candidate.state_json or {}).get("teacher_invite", {}).get("code")
            == code
        ):
            db_row = candidate
            break

    if db_row is None:
        raise HTTPException(
            status_code=404, detail="Invalid teacher invite code or session not found"
        )

    age_y = months_to_module_b_age(db_row.corrected_age_months)
    band = "5-7" if age_y <= 7 else "8-10" if age_y <= 10 else "11-12"
    bank = module_b_service.engine.bank
    usable_teacher = bank.df[
        (bank.df.form == "teacher")
        & (bank.df.bands.apply(lambda b: band in b if isinstance(b, list) else False))
    ]

    selected_items: list[TeacherItemPayload] = []
    from app.core.module_b.router_b import DOMAINS

    for dom in DOMAINS:
        dom_pool = usable_teacher[usable_teacher.domain == dom]
        if not dom_pool.empty:
            item_row = dom_pool.iloc[0]
            selected_items.append(
                TeacherItemPayload(
                    item_id=str(item_row["item_id"]),
                    question_text=str(item_row["text"]),
                    domain=to_api_domain(dom),
                )
            )

    return TeacherItemsResponse(items=selected_items)


@router.post(
    "/teacher/{invite_code}/submit",
    response_model=TeacherAnswerResponse,
    status_code=status.HTTP_200_OK,
)
async def submit_teacher_assessment(
    invite_code: str,
    payload: TeacherAnswerRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeacherAnswerResponse:
    """Submit teacher classroom ratings and calculate multi-informant DSM-5 Criterion C concordance."""
    code = invite_code.strip().upper()
    all_res = await db.execute(
        select(DbSession)
        .options(selectinload(DbSession.risk_result))
        .where(DbSession.module == "B")
    )
    db_row = None
    for candidate in all_res.scalars().all():
        if (
            candidate.id == invite_code
            or (candidate.state_json or {}).get("teacher_invite", {}).get("code")
            == code
        ):
            db_row = candidate
            break

    if db_row is None:
        raise HTTPException(
            status_code=404, detail="Invalid teacher invite code or session not found"
        )

    parent_domains: dict[str, str] = {}
    if db_row.risk_result and db_row.risk_result.domain_classifications:
        parent_domains = dict(db_row.risk_result.domain_classifications)
    elif db_row.module_b_state and "domains" in db_row.module_b_state:
        parent_domains = {
            to_api_domain(k): v.get("state", "Typical")
            for k, v in db_row.module_b_state.get("domains", {}).items()
            if isinstance(v, dict)
        }

    bank = module_b_service.engine.bank
    teacher_scores: dict[str, float] = {}
    from app.core.module_b.engine_b import concern_of

    for item_id, ans_val in payload.answers.items():
        if item_id in bank.df.index:
            row = bank.row(item_id)
            c = concern_of(row, ans_val)
            dom_api = to_api_domain(str(row["domain"]))
            teacher_scores[dom_api] = c if c is not None else 0.5

    concordance: dict[str, str] = {}
    divergent_flags: dict[str, bool] = {}
    from app.core.module_b.domains import API_DOMAINS

    for dom in API_DOMAINS:
        p_state = parent_domains.get(dom, "Typical")
        p_concern = p_state in ("Refer", "Monitor")
        t_concern = teacher_scores.get(dom, 0.0) >= 0.50

        if p_concern and t_concern:
            concordance[dom] = "concordant_high"
            divergent_flags[dom] = False
        elif p_concern and not t_concern:
            concordance[dom] = "home_only"
            divergent_flags[dom] = True
        elif not p_concern and t_concern:
            concordance[dom] = "school_only"
            divergent_flags[dom] = True
        else:
            concordance[dom] = "concordant_typical"
            divergent_flags[dom] = False

    concordant_count = sum(1 for div in divergent_flags.values() if not div)
    consistency_score = round(concordant_count / max(1, len(divergent_flags)), 3)

    caveats: list[str] = []
    home_only_doms = [d for d, s in concordance.items() if s == "home_only"]
    school_only_doms = [d for d, s in concordance.items() if s == "school_only"]
    pervasive_doms = [d for d, s in concordance.items() if s == "concordant_high"]

    if pervasive_doms:
        caveats.append(
            f"DSM-5 Criterion C met for {', '.join(pervasive_doms)}: symptoms manifest pervasively across "
            "both home and classroom environments."
        )
    if home_only_doms:
        caveats.append(
            f"Situational home variance for {', '.join(home_only_doms)}: teacher reports normal classroom "
            "functioning. Suggests home routine or behavioral boundary focus."
        )
    if school_only_doms:
        caveats.append(
            f"Situational school variance for {', '.join(school_only_doms)}: symptoms emerge specifically in "
            "classroom. Assess school peer dynamics and curriculum pacing."
        )

    summary = (
        f"Cross-setting concordance: {int(consistency_score * 100)}% agreement. "
        + " ".join(caveats)
    )

    if db_row.risk_result:
        db_row.risk_result.consistency_score = consistency_score
        db_row.risk_result.consistency_flags = divergent_flags

    mod_b_state = dict(db_row.module_b_state or {})
    mod_b_state["consistency_score"] = consistency_score
    mod_b_state["consistency_flags"] = divergent_flags
    mod_b_state["concordance_classification"] = concordance
    mod_b_state["teacher_answers"] = payload.answers
    db_row.module_b_state = mod_b_state

    db.add(
        AuditLog(
            actor_id=db_row.parent_user_id,
            action="screen.teacher_concordance",
            target_id=db_row.id,
            detail=f"consistency_score={consistency_score} pervasive={len(pervasive_doms)}",
        )
    )
    await db.flush()

    return TeacherAnswerResponse(
        session_id=db_row.id,
        consistency_score=consistency_score,
        consistency_flags=divergent_flags,
        concordance_classification=concordance,
        caveats=caveats,
        summary=summary,
    )
