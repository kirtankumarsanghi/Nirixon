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
from app.core.module_b.age import months_to_module_b_age
from app.core.module_b.domains import to_engine_domain
from app.core.module_b.engine_b import Session as EngineSession
from app.core.module_b.screen_bridge import build_result_payload
from app.core.module_b.service import module_b_service
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
from app.routers.screen import (
    _nutrition_for,
    _override_rule_name,
    _result_payload_from_prediction,
    _session_summary,
)
from app.schemas.nutrition import NutritionEvaluation
from app.schemas.sandbox import SandboxSimulateRequest
from app.schemas.screen import ResultPayload, SessionSummary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


def _get_inference() -> InferenceService:
    return inference_service


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sandbox_sessions(
    user=Depends(require_internal),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """Completed sessions available to the clinician sandbox, newest first.

    Unlike the parent history endpoint this is intentionally cross-family:
    clinicians use it to pick a real completed check-in and re-score it.
    """
    stmt = (
        select(DbSession)
        .options(selectinload(DbSession.risk_result))
        .where(DbSession.status == "completed")
        .order_by(DbSession.completed_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_session_summary(row) for row in rows]


def _module_b_target_value(row, norm: float) -> int:
    """Turn a 0..1 developmental score into a 1..5 Likert answer.

    ``norm`` is proficiency (higher is better). Symptom items move toward 5
    when proficiency is low; reverse-scored strength items move the other way.
    """
    concern = 1.0 - max(0.0, min(1.0, norm))
    step = round(4.0 * concern)
    # Symptom items: high concern -> high frequency (5). Reverse-scored
    # strength items: high concern -> low frequency (1).
    return 5 - step if int(row["reverse_scored"]) == 1 else 1 + step


def _simulate_module_b(
    *,
    core: CoreSession,
    db_row: DbSession,
    body: SandboxSimulateRequest,
    latency_ms: float,
) -> ResultPayload:
    """Replay a completed Module B session with what-if overrides."""
    if not (module_b_service.is_loaded and core.module_b_state):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Module B engine is not loaded; cannot simulate this session",
        )

    engine = module_b_service.engine
    base = EngineSession.from_dict(core.module_b_state)
    age = (
        months_to_module_b_age(body.corrected_age_months)
        if body.corrected_age_months is not None
        else base.age
    )
    fresh = EngineSession(
        age=age,
        form=base.form,
        seed=base.seed,
        prior=dict(base.prior),
        context_flags=list(base.context_flags),
        safety=base.safety,
        referral_notes=list(base.referral_notes),
        sense_hint=base.sense_hint,
    )

    effective: dict[str, int] = dict(body.answer_overrides)

    # Domain-level sliders: translate proficiency into per-item Likert values.
    for raw_dom, score in body.domain_scores.items():
        canonical = to_engine_domain(raw_dom.strip().lower().replace(" ", "_"))
        norm = score / 100.0 if score > 1.0 else score
        matched = 0
        for answer in base.answers:
            if answer.get("track") != canonical:
                continue
            try:
                row = engine.bank.row(answer["item_id"])
            except KeyError:
                continue
            if str(row["response_type"]) != "likert5":
                continue
            effective[str(answer["item_id"])] = _module_b_target_value(row, norm)
            matched += 1
        if matched == 0:
            # The real sandbox UI sends every domain slider, including areas
            # this partial session never scored. Ignore those rather than
            # rejecting the whole scenario.
            logger.debug("sandbox: no scored Module B items for domain %s", raw_dom)

    # ``regression_flag`` is a safety toggle, not a Module B bank item.
    regression_reported = bool(
        effective.pop(
            "regression_flag", core.mandatory_answered.get("regression_flag", 0)
        )
    )

    # Validate explicit answer overrides before replaying anything.
    for item_id, value in effective.items():
        try:
            engine.bank.row(item_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown Module B item '{item_id}'",
            ) from exc
        if value < 0 or value > 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Answer override for '{item_id}' must be between 0 and 5",
            )

    # Replay the original path so boosts, rule-outs and safety flags are
    # recomputed consistently instead of mutating the stored result.
    seen: set[str] = set()
    for answer in base.answers:
        item_id = str(answer["item_id"])
        engine.answer(fresh, item_id, effective.get(item_id, answer["raw"]))
        seen.add(item_id)
    for item_id, value in base.context_answers.items():
        fresh.context_answers[item_id] = effective.get(item_id, value)
        seen.add(item_id)
    for item_id, value in effective.items():
        if item_id in seen:
            continue
        row = engine.bank.row(item_id)
        if str(row["item_type"]) == "context":
            fresh.context_answers[item_id] = value
        else:
            engine.answer(fresh, item_id, value)

    raw = engine.result(fresh)
    payload = build_result_payload(raw)

    ro_flagged = bool(raw.get("ruleout_flags"))
    final_cls = "Refer" if ro_flagged else payload.final_classification
    payload.final_classification = final_cls
    payload.ml_classification = final_cls
    payload.safety_override_triggered = payload.safety_override_triggered or ro_flagged
    if ro_flagged:
        payload.override_rule = payload.override_rule or "rule_out_item"
    if ro_flagged or payload.safety_override_triggered:
        payload.triage_tier = "Tier 3: Direct Referral"
        payload.reflex_branch_recommended = False

    nutrition = _nutrition_for(core)
    payload.measurements = dict(core.measurements)
    payload.nutrition = NutritionEvaluation(**nutrition)
    if nutrition["severity"] == "refer":
        payload.final_classification = "Refer"
        payload.ml_classification = "Refer"
        payload.safety_override_triggered = True
        payload.override_rule = payload.override_rule or "nutrition_flag"
        payload.triage_tier = "Tier 3: Direct Referral"
        payload.reflex_branch_recommended = False

    if regression_reported:
        payload.final_classification = "Refer"
        payload.ml_classification = "Refer"
        payload.safety_override_triggered = True
        payload.override_rule = payload.override_rule or "regression_flag"
        payload.triage_tier = "Tier 3: Direct Referral"
        payload.reflex_branch_recommended = False
        if "lost a skill" not in (payload.summary or "").lower():
            payload.summary = (
                "A lost skill was reported. The safety rule refers directly. "
                + (payload.summary or "")
            ).strip()

    payload.real_answer_count = len(fresh.answers)
    payload.imputed_count = 0
    payload.model_name = "module_b_engine"
    payload.latency_ms = latency_ms
    payload.child_name = db_row.child_name
    payload.parent_name = db_row.parent_name
    payload.parent_phone = db_row.parent_phone
    payload.relationship_to_child = db_row.relationship_to_child
    payload.location_pincode = db_row.location_pincode
    payload.location_city = db_row.location_city
    payload.location_state = db_row.location_state
    payload.location_address = db_row.location_address
    return payload


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
        if not isinstance(ans, int) or ans < 0 or ans > 5:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Answer override for '{item_id}' out of range: must be an integer between 0 and 5 (got {ans})",
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

    # Module B is engine-scored, not the Module A ML model. Replay its stored
    # answer path with the overrides so rule-outs, safety and domain states are
    # recomputed by the same engine that produced the original result.
    if core.module == "B":
        if body.model_name and body.model_name != "module_b_engine":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Module B sessions are scored by module_b_engine",
            )
        t0 = time.perf_counter()
        simulated = _simulate_module_b(
            core=core, db_row=db_row, body=body, latency_ms=0.0
        )
        simulated.latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        return simulated

    for item_id, ans in body.answer_overrides.items():
        if ans > 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Answer override for '{item_id}' out of range for Module A: "
                    f"must be between 0 and 3 (got {ans})"
                ),
            )

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
            # Module A answers: 2 = consistently present (good), 1 = sometimes,
            # 0 = not yet. Higher proficiency therefore maps to 2.
            target_ans = 2 if norm >= 0.70 else (1 if norm >= 0.35 else 0)
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
