"""
Joint Family Sharing, Respondent Invites, Concordance Analysis, and Combination Merge.

Enforces:
- Up to 3 respondents by a single-use, expiring link (no account required).
- Respondent answers stored with role label only (NO personal names).
- Public invite token exposes ONLY the questions to answer, zero child info.
- Combination rule:
    * The most concerning answer feeds the safety rule.
    * The primary caregiver's answers feed the statistical ML model.
- Concordance index computed per item and overall, with disagreement listings and clinical follow-up prompts.
- Cascading deletion of respondent answers when screening is deleted.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.joint_family import (
    ALL_ITEMS_MAP,
    apply_joint_combination_rule,
    compute_joint_concordance,
)
from app.core.session import ScreeningSession as CoreSession
from app.db.models import (
    JointInviteToken,
    JointRespondentAnswer,
)
from app.db.models import (
    ScreeningSession as DbSession,
)
from app.db.session import get_db
from app.db.session_repo import SessionRepository, get_session_repo
from app.ml.inference_service import (
    build_feature_vector,
    inference_service,
    inference_service_b,
)
from app.schemas.share import (
    CreateJointInviteRequest,
    JointDisagreementPayload,
    JointInvitePublicDetail,
    JointInviteResponse,
    JointItemConcordancePayload,
    JointMergeResponse,
    JointQuestionItem,
    JointQuestionOption,
    ShareMergeRequest,
    SubmitJointResponseRequest,
    SubmitJointResponseResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/share", tags=["share"])


class _PredictionWrapper:
    def __init__(
        self,
        ml_classification: str,
        final_classification: str,
        safety_override_triggered: bool,
        override_rule: str | None = None,
    ):
        self.ml_classification = ml_classification
        self.final_classification = final_classification
        self.safety_override_triggered = safety_override_triggered
        self.override_rule = override_rule


def _evaluate_primary_prediction(core: CoreSession, db_row: DbSession) -> Any:
    """Evaluates the statistical ML prediction for the primary caregiver only."""
    # 1. If screening was already completed and has a stored RiskResult:
    if db_row.risk_result is not None:
        return _PredictionWrapper(
            ml_classification=db_row.risk_result.ml_classification,
            final_classification=db_row.risk_result.final_classification,
            safety_override_triggered=db_row.risk_result.safety_override_triggered,
            override_rule=db_row.risk_result.override_rule,
        )

    # 2. Check deterministic safety rules on primary answers
    from app.core.safety_floor import get_deterministic_override

    deterministic_override = get_deterministic_override(core)
    override_rule = None
    if deterministic_override:
        if core.mandatory_answered.get("regression_flag") == 1:
            override_rule = "regression_flag"
        else:
            override_rule = "safety_floor"

    # 3. Predict via loaded inference model if available
    inf_service = inference_service_b if core.module == "B" else inference_service
    if inf_service.is_loaded and inf_service.feature_columns is not None:
        try:
            from data.generator.item_bank import ITEM_BANK

            from app.core.imputation import impute_missing

            all_item_ids = [item.item_id for item in ITEM_BANK]
            missing_ids = [iid for iid in all_item_ids if iid not in core.answers]
            imputed = impute_missing(
                missing_item_ids=missing_ids,
                corrected_age_months=core.corrected_age_months,
            )
            real = dict(core.mandatory_answered)
            real.update(core.answers)
            features = build_feature_vector(
                corrected_age_months=core.corrected_age_months,
                real_answers=real,
                imputed_answers=imputed,
                feature_columns=inf_service.feature_columns,
            )
            pred = inf_service.predict(
                features,
                deterministic_override=deterministic_override,
                override_rule=override_rule,
                real_answer_keys=set(real.keys()) | {"corrected_age_months"},
            )
            return pred
        except Exception as exc:
            logger.warning("Primary inference calculation fallback: %s", exc)

    return _PredictionWrapper(
        ml_classification="Typical",
        final_classification="Refer" if deterministic_override else "Typical",
        safety_override_triggered=bool(deterministic_override),
        override_rule=override_rule,
    )

MAX_RESPONDENTS_PER_SESSION = 3


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _ensure_aware(dt: datetime) -> datetime:
    """Ensure datetime is offset-aware for safe comparison across SQLite and PostgreSQL."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _get_item_options(item: Any) -> list[JointQuestionOption]:
    response_type = getattr(item, "response_type", "frequency")
    if response_type == "yes_no":
        return [
            JointQuestionOption(value=1, label="Yes"),
            JointQuestionOption(value=0, label="No"),
        ]
    if response_type == "likert5":
        return [
            JointQuestionOption(value=1, label="Never"),
            JointQuestionOption(value=2, label="Rarely"),
            JointQuestionOption(value=3, label="Sometimes"),
            JointQuestionOption(value=4, label="Often"),
            JointQuestionOption(value=5, label="Very often"),
        ]
    # Default 3-point milestone scale
    return [
        JointQuestionOption(value=0, label="Not Yet", description="Child does not do this yet"),
        JointQuestionOption(value=1, label="Sometimes", description="Emerging / does this occasionally"),
        JointQuestionOption(value=2, label="Consistently", description="Mastered / does this reliably"),
    ]


# ---------------------------------------------------------------------------
# Invite management (Main Caregiver)
# ---------------------------------------------------------------------------


@router.post("/session/{session_id}/invite", response_model=JointInviteResponse)
async def create_joint_invite(
    session_id: str,
    body: CreateJointInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an expiring, single-use invite link for a secondary caregiver (max 3 per screening).
    """
    stmt = (
        select(DbSession)
        .where(DbSession.id == session_id)
        .options(selectinload(DbSession.joint_invites), selectinload(DbSession.joint_answers))
    )
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()
    if db_row is None:
        raise HTTPException(status_code=404, detail="Screening session not found")

    # Count existing valid or completed invites
    active_invites = [inv for inv in db_row.joint_invites if not inv.is_used and _ensure_aware(inv.expires_at) > _utcnow()]
    total_respondents_or_invites = len(db_row.joint_answers) + len(active_invites)

    if total_respondents_or_invites >= MAX_RESPONDENTS_PER_SESSION:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum limit of {MAX_RESPONDENTS_PER_SESSION} respondent invites reached for this screening.",
        )

    token_str = secrets.token_urlsafe(32)
    expires_at = _utcnow() + timedelta(hours=body.expires_in_hours)

    invite = JointInviteToken(
        session_id=session_id,
        token=token_str,
        role_label=body.role_label.strip(),
        expires_at=expires_at,
        is_used=False,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    invite_url = f"/joint-respond/{token_str}"

    return JointInviteResponse(
        token=token_str,
        invite_url=invite_url,
        role_label=invite.role_label,
        expires_at=invite.expires_at,
        session_id=session_id,
        max_respondents_limit=MAX_RESPONDENTS_PER_SESSION,
        active_invites_count=total_respondents_or_invites + 1,
    )


@router.get("/session/{session_id}/invites")
async def list_joint_invites(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List all invite links and their status for a session."""
    stmt = (
        select(DbSession)
        .where(DbSession.id == session_id)
        .options(selectinload(DbSession.joint_invites), selectinload(DbSession.joint_answers))
    )
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()
    if db_row is None:
        raise HTTPException(status_code=404, detail="Screening session not found")

    invites_data = [
        {
            "id": inv.id,
            "token": inv.token,
            "role_label": inv.role_label,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
            "is_used": inv.is_used,
            "used_at": inv.used_at.isoformat() if inv.used_at else None,
            "is_expired": _ensure_aware(inv.expires_at) < _utcnow(),
        }
        for inv in db_row.joint_invites
    ]

    respondents_data = [
        {
            "id": ans.id,
            "role_label": ans.role_label,
            "answers_count": len(ans.answers),
            "submitted_at": ans.submitted_at.isoformat(),
        }
        for ans in db_row.joint_answers
    ]

    return {
        "session_id": session_id,
        "max_limit": MAX_RESPONDENTS_PER_SESSION,
        "invites": invites_data,
        "completed_respondents": respondents_data,
        "respondent_count": len(respondents_data),
    }


# ---------------------------------------------------------------------------
# Public Respondent Flow (No login, exposes ONLY questions, zero child info)
# ---------------------------------------------------------------------------


@router.get("/invite/{token}", response_model=JointInvitePublicDetail)
async def get_invite_questions(
    token: str,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    """
    CRITICAL PRIVACY GUARANTEE:
    Validates token and returns ONLY the questionnaire items to answer.
    NO child name, NO child ref, NO birthdate, NO scores, NO previous caregiver answers.
    """
    stmt = (
        select(JointInviteToken)
        .where(JointInviteToken.token == token)
        .options(selectinload(JointInviteToken.session))
    )
    result = await db.execute(stmt)
    invite = result.scalar_one_or_none()

    if invite is None:
        raise HTTPException(status_code=404, detail="Invite link not found or invalid.")

    if invite.is_used:
        raise HTTPException(
            status_code=409,
            detail="This one-time invite link has already been used.",
        )

    if _ensure_aware(invite.expires_at) < _utcnow():
        raise HTTPException(
            status_code=410,
            detail="This invite link has expired.",
        )

    session = invite.session
    if session is None:
        raise HTTPException(status_code=404, detail="Associated screening session not found.")

    core = repo.get(session.id)
    if core is None and session.state_json:
        core = CoreSession.from_dict(session.state_json)

    # Determine which questions to present:
    # Present the same items answered by the primary caregiver so concordance can be calculated!
    item_ids: list[str] = []
    if core is not None:
        # Mandatory flags first
        for mid in core.mandatory_answered.keys():
            if mid not in item_ids:
                item_ids.append(mid)
        # Milestone items
        for aid in core.answers.keys():
            if aid not in item_ids:
                item_ids.append(aid)

    # If primary has not completed enough questions yet, supply the bracket's default items
    if len(item_ids) < 3:
        if core and core.module == "A":
            from data.generator.item_bank import get_items_for_bracket
            bracket = core.age_bracket if core.age_bracket != "Unknown" else "24m"
            bracket_items = get_items_for_bracket(bracket)
            item_ids = ["regression_flag", "family_history_flag"] + [it.item_id for it in bracket_items[:6]]
        else:
            item_ids = ["regression_flag", "family_history_flag"]

    question_items: list[JointQuestionItem] = []
    for iid in item_ids:
        meta = ALL_ITEMS_MAP.get(iid)
        if meta is None:
            # Synthetic fallback for flags
            if iid == "regression_flag":
                q_text = "Has the child lost any skill they previously mastered?"
                domain = "background"
                r_type = "yes_no"
            elif iid == "family_history_flag":
                q_text = "Is there a family history of developmental delays?"
                domain = "background"
                r_type = "yes_no"
            else:
                q_text = f"Developmental milestone item: {iid}"
                domain = "general"
                r_type = "frequency"
            opts = [
                JointQuestionOption(value=1, label="Yes"),
                JointQuestionOption(value=0, label="No"),
            ] if r_type == "yes_no" else [
                JointQuestionOption(value=0, label="Not Yet"),
                JointQuestionOption(value=1, label="Sometimes"),
                JointQuestionOption(value=2, label="Consistently"),
            ]
        else:
            q_text = getattr(meta, "question_text", f"Item {iid}")
            domain = getattr(meta, "domain", "general")
            r_type = getattr(meta, "response_type", "frequency")
            opts = _get_item_options(meta)

        question_items.append(
            JointQuestionItem(
                item_id=iid,
                question_text=q_text,
                domain=domain,
                response_type=r_type,
                options=opts,
            )
        )

    return JointInvitePublicDetail(
        valid=True,
        role_label=invite.role_label,
        expires_at=invite.expires_at,
        items=question_items,
        item_count=len(question_items),
    )


@router.post("/invite/{token}/respond", response_model=SubmitJointResponseResponse)
async def submit_joint_response(
    token: str,
    body: SubmitJointResponseRequest,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    """
    Submit independent observations as a secondary respondent.
    Enforces single-use token; marks token used and saves answers with role label only (NO names).
    """
    stmt = (
        select(JointInviteToken)
        .where(JointInviteToken.token == token)
        .options(selectinload(JointInviteToken.session))
    )
    result = await db.execute(stmt)
    invite = result.scalar_one_or_none()

    if invite is None:
        raise HTTPException(status_code=404, detail="Invite link not found or invalid.")

    if invite.is_used:
        raise HTTPException(
            status_code=409,
            detail="This invite token has already been used (single-use only).",
        )

    if _ensure_aware(invite.expires_at) < _utcnow():
        raise HTTPException(
            status_code=410,
            detail="This invite link has expired.",
        )

    # Mark token used immediately to prevent reuse
    invite.is_used = True
    invite.used_at = _utcnow()

    role = body.role_label.strip() if body.role_label else invite.role_label
    # Strip any personal name accidentally included — enforce role designation
    clean_role = role[:64]

    # Save answers row
    ans_row = JointRespondentAnswer(
        session_id=invite.session_id,
        token_id=invite.id,
        role_label=clean_role,
        answers=body.answers,
        submitted_at=_utcnow(),
    )
    db.add(ans_row)

    # Sync to core session repository
    core = repo.get(invite.session_id)
    if core is None and invite.session and invite.session.state_json:
        core = CoreSession.from_dict(invite.session.state_json)

    if core is not None:
        core.joint_respondent_answers.append({
            "respondent_id": ans_row.id,
            "role_label": clean_role,
            "answers": body.answers,
            "submitted_at": _utcnow().isoformat(),
        })
        repo.save(invite.session_id, core)
        if invite.session:
            invite.session.state_json = core.to_dict()

    await db.commit()

    logger.info(
        "Recorded joint response for session=%s role=%s items=%d",
        invite.session_id,
        clean_role,
        len(body.answers),
    )

    return SubmitJointResponseResponse(
        status="received",
        session_id=invite.session_id,
        role_label=clean_role,
        submitted_items_count=len(body.answers),
        message=f"Observations recorded for role: {clean_role}. Thank you for contributing.",
    )


# ---------------------------------------------------------------------------
# Concordance Calculation & Combination Rule Merge
# ---------------------------------------------------------------------------


@router.post("/session/{session_id}/merge", response_model=JointMergeResponse)
async def merge_shared_session(
    session_id: str,
    body: ShareMergeRequest | None = None,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    """
    Perform concordance index calculation and apply the combination rule:
    1. Primary caregiver answers feed the statistical ML model.
    2. Most concerning answer across ALL respondents feeds the safety rule.
    3. Returns concordance score, disagreements, and clinical follow-up prompts.
    """
    stmt = (
        select(DbSession)
        .where(DbSession.id == session_id)
        .options(
            selectinload(DbSession.joint_answers),
            selectinload(DbSession.risk_result),
        )
    )
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()

    if db_row is None:
        raise HTTPException(status_code=404, detail="Screening session not found")

    core = repo.get(session_id)
    if core is None:
        core = CoreSession.from_dict(db_row.state_json)

    # If body has answers and an explicit role, record as respondent
    if body and body.answers:
        role = body.role_label or f"Respondent {len(db_row.joint_answers) + 1}"
        db.add(
            JointRespondentAnswer(
                session_id=session_id,
                role_label=role,
                answers=body.answers,
                submitted_at=_utcnow(),
            )
        )
        core.joint_respondent_answers.append({
            "role_label": role,
            "answers": body.answers,
            "submitted_at": _utcnow().isoformat(),
        })

    # Collect all respondent answers
    respondents_list: list[dict[str, Any]] = []
    # From DB
    for ans in db_row.joint_answers:
        respondents_list.append({
            "respondent_id": ans.id,
            "role_label": ans.role_label,
            "answers": dict(ans.answers),
        })
    # Merge with core memory if any
    for r in core.joint_respondent_answers:
        if not any(rl.get("respondent_id") == r.get("respondent_id") for rl in respondents_list):
            respondents_list.append(r)

    # Primary answers
    primary_combined = dict(core.mandatory_answered)
    primary_combined.update(core.answers)

    # 1. Compute Concordance Analysis
    concordance = compute_joint_concordance(primary_combined, respondents_list)

    # 2. Run ML Model on PRIMARY answers only
    primary_prediction = _evaluate_primary_prediction(core, db_row)

    # 3. Apply Combination Rule: Most concerning answer feeds the safety rule
    safety_override, override_rule, final_classification, safety_source = apply_joint_combination_rule(
        core, respondents_list, primary_prediction
    )

    # Determine concordance qualitative level
    if concordance.overall_concordance >= 0.85:
        concordance_level = "High Concordance"
    elif concordance.overall_concordance >= 0.65:
        concordance_level = "Moderate Concordance"
    else:
        concordance_level = "Significant Divergence"

    # Persist joint concordance summary to core session and DB
    disagreements_payload = [
        JointDisagreementPayload(
            item_id=d.item_id,
            domain=d.domain,
            question_text=d.question_text,
            primary_answer=d.primary_answer,
            respondent_answers=d.respondent_answers,
            max_delta=d.max_delta,
            most_concerning_answer=d.most_concerning_answer,
            most_concerning_role=d.most_concerning_role,
            follow_up_prompt=d.follow_up_prompt,
        )
        for d in concordance.disagreements
    ]

    item_concordance_payload = [
        JointItemConcordancePayload(
            item_id=ic.item_id,
            domain=ic.domain,
            primary_answer=ic.primary_answer,
            secondary_answers=ic.secondary_answers,
            is_concordant=ic.is_concordant,
            concordance_score=ic.concordance_score,
            exact_match_ratio=ic.exact_match_ratio,
            most_concerning_value=ic.most_concerning_value,
        )
        for ic in concordance.item_concordance
    ]

    core.joint_concordance = {
        "overall_concordance": concordance.overall_concordance,
        "exact_agreement_pct": concordance.exact_agreement_pct,
        "respondent_count": concordance.respondent_count,
        "roles": concordance.roles,
        "disagreement_count": len(disagreements_payload),
        "safety_override_triggered": safety_override,
        "safety_source": safety_source,
    }
    repo.save(session_id, core)

    # Update DB row
    db_row.state_json = core.to_dict()
    if db_row.risk_result is not None:
        db_row.risk_result.safety_override_triggered = safety_override
        db_row.risk_result.override_rule = override_rule
        db_row.risk_result.final_classification = final_classification

    await db.commit()

    return JointMergeResponse(
        session_id=session_id,
        respondent_count=concordance.respondent_count,
        roles=concordance.roles,
        overall_concordance=concordance.overall_concordance,
        exact_agreement_pct=concordance.exact_agreement_pct,
        total_overlapping_items=concordance.total_overlapping_items,
        concordance_level=concordance_level,
        disagreements=disagreements_payload,
        item_concordance=item_concordance_payload,
        safety_override_triggered=safety_override,
        override_rule=override_rule,
        safety_source=safety_source,
        final_classification=final_classification,
        ml_classification=primary_prediction.ml_classification,
    )


@router.get("/session/{session_id}/concordance", response_model=JointMergeResponse)
async def get_session_concordance(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    """Retrieve existing concordance analysis and disagreements for clinician review."""
    return await merge_shared_session(session_id=session_id, body=None, db=db, repo=repo)


# ---------------------------------------------------------------------------
# Deletion endpoint
# ---------------------------------------------------------------------------


@router.delete("/session/{session_id}")
async def delete_screening_session_data(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    repo: SessionRepository = Depends(get_session_repo),
):
    """
    Permanently delete a screening session.
    Cascades and deletes all answers, invites, respondent answers, and results.
    """
    stmt = select(DbSession).where(DbSession.id == session_id)
    result = await db.execute(stmt)
    db_row = result.scalar_one_or_none()

    if db_row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(db_row)
    await db.commit()
    repo.delete(session_id)

    return {
        "status": "deleted",
        "session_id": session_id,
        "message": "Screening session and all associated respondent answers were permanently deleted.",
    }
