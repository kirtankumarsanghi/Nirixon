"""
Clinician what-if sandbox — Stage 4.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_internal
from app.core.orchestrator import get_next_action
from app.core.safety_floor import get_deterministic_override
from app.core.session import FinalResult
from app.core.session import ScreeningSession as CoreSession
from app.core.triage_guard import ITEM_METADATA, evaluate_live_tiered_triage
from app.db.models import ScreeningSession as DbSession
from app.db.session import get_db
from app.db.session_repo import SessionRepository, get_session_repo
from app.ml.inference_service import (
    InferenceService,
    build_feature_vector,
    inference_service,
)
from app.routers.screen import _override_rule_name, _result_payload_from_prediction
from app.schemas.sandbox import SandboxSimulateRequest
from app.schemas.screen import ResultPayload

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
    Takes optional model_name, answer_overrides, domain_scores, and age override.
    """
    # 1. Validation of out-of-range inputs
    if body.corrected_age_months is not None:
        if body.corrected_age_months < 0 or body.corrected_age_months > 240:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Age {body.corrected_age_months} out of range [0, 240] months",
            )

    for item_id, ans in body.answer_overrides.items():
        if not isinstance(ans, int) or ans < 0 or ans > 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Answer override for '{item_id}' out of range: must be an integer between 0 and 3 (got {ans})",
            )

    for dom, val in body.domain_scores.items():
        if not isinstance(val, (int, float)) or val < 0.0 or val > 100.0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Domain score for '{dom}' out of range: must be between 0 and 100 (got {val})",
            )

    stmt = (
        select(DbSession)
        .where(DbSession.id == session_id)
        .options(selectinload(DbSession.answers))
    )
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()

    if db_row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if db_row.status != "completed":
        raise HTTPException(
            status_code=400, detail="Can only simulate completed sessions"
        )

    # Reconstruct core session state
    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # Apply what-if overrides
    if body.corrected_age_months is not None:
        core.corrected_age_months = body.corrected_age_months

    # Apply domain scores to items if specified
    if body.domain_scores:
        domain_aliases = {
            "gross_motor": "gross_motor",
            "gross motor": "gross_motor",
            "gm": "gross_motor",
            "fine_motor": "fine_motor",
            "fine motor": "fine_motor",
            "fm": "fine_motor",
            "communication": "communication",
            "comm": "communication",
            "c": "communication",
            "problem_solving": "problem_solving",
            "problem solving": "problem_solving",
            "cognitive": "problem_solving",
            "cg": "problem_solving",
            "personal_social": "personal_social",
            "personal social": "personal_social",
            "pr": "personal_social",
            "ps": "personal_social",
            "self_help": "adaptive",
            "adaptive": "adaptive",
            "sh": "adaptive",
        }
        for raw_dom, score_val in body.domain_scores.items():
            canonical_dom = domain_aliases.get(
                raw_dom.lower().strip(), raw_dom.lower().strip()
            )
            norm = score_val / 100.0 if score_val > 1.0 else score_val
            target_ans = 0 if norm >= 0.70 else (1 if norm >= 0.35 else 2)
            for item_id in list(core.answers.keys()):
                item_dom = ITEM_METADATA.get(item_id, {}).get("domain")
                if item_dom and domain_aliases.get(item_dom, item_dom) == canonical_dom:
                    core.answers[item_id] = target_ans

    # Apply explicit answer overrides (e.g. regression_flag)
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

    override = get_deterministic_override(core)
    if not isinstance(action, FinalResult):
        action = FinalResult(
            real_answers=core.all_answers(),
            imputed_answers={},
            deterministic_override=override,
            caveats=["Session not fully complete after what-if overrides"],
            stopping_reason="sandbox_incomplete",
        )
    elif override is not None:
        action.deterministic_override = override

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

    t0 = time.perf_counter()
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
    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)

    # Calculate domain scores and evaluate clinical triage tier
    domain_totals: dict[str, float] = {}
    domain_counts: dict[str, int] = {}
    for item_id, ans in action.real_answers.items():
        if item_id in ITEM_METADATA:
            dom = ITEM_METADATA[item_id]["domain"]
            domain_totals[dom] = domain_totals.get(dom, 0.0) + float(ans)
            domain_counts[dom] = domain_counts.get(dom, 0) + 1
    domain_scores_calc = {
        dom: (domain_totals[dom] / (2.0 * domain_counts[dom]))
        for dom in domain_totals
        if domain_counts.get(dom, 0) > 0
    }
    prob_refer = float(pred.probabilities.get("Refer", 0.0))
    triage_tier, reflex_rec, target_reflex_domains = evaluate_live_tiered_triage(
        prob_refer=prob_refer,
        safety_override=pred.safety_override_triggered,
        domain_scores=domain_scores_calc,
    )

    res = _result_payload_from_prediction(
        pred,
        model_name=target_model_name,
        stopping_reason=action.stopping_reason,
        caveats=list(action.caveats),
        real_answer_count=len(action.real_answers),
        imputed_count=len(action.imputed_answers),
        module=core.module,
        triage_tier=triage_tier,
        reflex_branch_recommended=reflex_rec,
        target_reflex_domains=target_reflex_domains,
        latency_ms=latency_ms,
    )
    res.child_name = db_row.child_name
    res.parent_name = db_row.parent_name
    res.parent_phone = db_row.parent_phone
    res.relationship_to_child = db_row.relationship_to_child
    res.location_pincode = db_row.location_pincode
    res.location_city = db_row.location_city
    res.location_state = db_row.location_state
    res.location_address = db_row.location_address
    return res
