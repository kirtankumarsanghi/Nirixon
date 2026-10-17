"""
Community Health Worker (ASHA / Anganwadi / ANM) referral system router.

Endpoints:
- Workers:
  - POST /api/chw/workers, POST /api/workers
  - GET  /api/chw/workers/me
  - GET  /api/chw/workers
- Children (opt-in pseudonymous records):
  - POST /api/chw/children, POST /api/children
  - GET  /api/chw/children, GET  /api/children
  - GET  /api/chw/children/{child_id}, GET  /api/children/{child_id}
  - DELETE /api/chw/children/{child_id}, DELETE /api/children/{child_id}
- Referrals (lifecycle & follow-up):
  - POST /api/referrals, POST /api/chw/referrals
  - GET  /api/referrals, GET  /api/chw/referrals
  - GET  /api/referrals/{id}
  - PATCH /api/referrals/{id}, PUT /api/referrals/{id}
  - POST /api/referrals/{id}/outcome
  - DELETE /api/referrals/{id}
  - GET  /api/referrals/{id}/summary (JSON, printable PDF, shareable text)
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.core.referral_service import (
    STATUS_CLOSED,
    STATUS_CREATED,
    STATUS_OUTCOME_RECORDED,
    STATUS_SEEN,
    STATUS_SENT,
    build_summary_dict,
    check_worker_area_access,
    generate_summary_pdf,
    generate_summary_text,
    normalize_status,
    validate_status_transition,
)
from app.db.models import (
    ChildRecord,
    ConflictLog,
    Referral,
    ScreeningSession,
    SyncOperation,
    User,
    Worker,
)
from app.db.session import get_db
from app.schemas.referral import (
    ChildContactResponse,
    ChildRecordCreate,
    ChildRecordResponse,
    CHWSyncBatchRequest,
    CHWSyncBatchResponse,
    CHWSyncItemResult,
    ConflictLogResponse,
    OneTouchReferralResponse,
    RecordChildOutcomeRequest,
    ReferralCreate,
    ReferralOutcomeRequest,
    ReferralResponse,
    ReferralSummary,
    ReferralUpdate,
    SeedChildrenRequest,
    SeedChildrenResponse,
    TierCountsResponse,
    WorkerCreate,
    WorkerResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["community-referrals"])
_bearer = HTTPBearer(auto_error=False)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


def _referral_to_response(ref: Referral) -> ReferralResponse:
    ts: dict[str, Any] = {
        "created_at": ref.created_at,
        "sent_at": ref.sent_at,
        "seen_at": ref.seen_at,
        "outcome_recorded_at": ref.outcome_recorded_at,
        "closed_at": ref.closed_at,
        "updated_at": ref.updated_at,
    }
    return ReferralResponse(
        id=ref.id,
        child_id=ref.child_id,
        from_worker_id=ref.from_worker_id,
        to_facility=ref.to_facility,
        reason=ref.reason,
        tier=ref.tier,
        status=ref.status,
        domains_of_concern=list(ref.domains_of_concern or []),
        safety_rule_trigger=ref.safety_rule_trigger,
        outcome_notes=ref.outcome_notes,
        created_at=ref.created_at,
        sent_at=ref.sent_at,
        seen_at=ref.seen_at,
        outcome_recorded_at=ref.outcome_recorded_at,
        closed_at=ref.closed_at,
        updated_at=ref.updated_at,
        timestamps=ts,
    )


async def get_current_worker(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
    x_worker_id: Annotated[str | None, Header(alias="X-Worker-ID")] = None,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Worker:
    """
    Resolve the current worker via Bearer JWT token or X-Worker-ID header.
    Enforces role check ('chw' or 'supervisor' or 'internal').
    """
    if credentials and credentials.credentials:
        try:
            payload = jwt.decode(
                credentials.credentials,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid auth token")
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid token") from exc

        # Find user
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Find worker linked to user
        stmt = select(Worker).where(
            or_(Worker.user_id == user.id, Worker.id == user.id, Worker.name == user.email)
        )
        w_res = await db.execute(stmt)
        worker = w_res.scalar_one_or_none()

        if worker:
            return worker

        # If user has chw or supervisor role, auto-provision worker profile if missing
        if user.role in ("chw", "supervisor", "internal"):
            default_area = "Ward 12" if user.role != "supervisor" else "all"
            new_worker = Worker(
                id=user.id,
                user_id=user.id,
                name=user.email.split("@")[0].replace(".", " ").title(),
                role="supervisor" if user.role == "supervisor" else "chw",
                area=default_area,
            )
            db.add(new_worker)
            await db.commit()
            await db.refresh(new_worker)
            return new_worker

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Community Health Worker or Supervisor role required",
        )

    # Header-based worker resolution (useful in tests or CLI integrations)
    if x_worker_id:
        res = await db.execute(select(Worker).where(Worker.id == x_worker_id.strip()))
        worker = res.scalar_one_or_none()
        if worker:
            return worker
        raise HTTPException(status_code=404, detail=f"Worker '{x_worker_id}' not found")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials (Bearer token or X-Worker-ID) required",
    )


# -----------------------------------------------------------------------------
# Worker Management Endpoints
# -----------------------------------------------------------------------------

@router.post(
    "/api/chw/workers",
    response_model=WorkerResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/api/workers",
    response_model=WorkerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_worker(
    body: WorkerCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new community health worker (ASHA / Anganwadi / ANM / Supervisor)."""
    worker = Worker(
        name=body.name.strip(),
        role=body.role.strip().lower(),
        area=body.area.strip(),
        phone=body.phone.strip() if body.phone else None,
        user_id=body.user_id,
    )
    db.add(worker)
    await db.commit()
    await db.refresh(worker)
    return worker


@router.get("/api/chw/workers/me", response_model=WorkerResponse)
async def get_me(
    worker: Worker = Depends(get_current_worker),
):
    """Get the currently authenticated worker's profile and assigned area."""
    return worker


@router.get("/api/chw/workers", response_model=list[WorkerResponse])
async def list_workers(
    db: AsyncSession = Depends(get_db),
    worker: Worker = Depends(get_current_worker),
):
    """List workers. Supervisors see all; CHWs see workers in their area."""
    if worker.role == "supervisor" or worker.area.strip().lower() in ("all", "*"):
        stmt = select(Worker).order_by(Worker.name.asc())
    else:
        stmt = select(Worker).where(Worker.area == worker.area).order_by(Worker.name.asc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


# -----------------------------------------------------------------------------
# Child Record Endpoints (Area-Isolated, Opt-in with Consent Recorded)
# -----------------------------------------------------------------------------

@router.post(
    "/api/chw/children",
    response_model=ChildRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/api/children",
    response_model=ChildRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_child_record(
    body: ChildRecordCreate,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Register an opt-in pseudonymous child record in the worker's area.
    Consent is required and recorded with a timestamp. Zero identifiable names/PII stored.
    """
    if not body.consent_given or not body.opt_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Caregiver opt-in consent is strictly required to create a child referral record.",
        )

    # Determine village/ward area: default to worker's area if not specified
    assigned_area = (body.village_ward or worker.area).strip()

    # If CHW explicitly passes an area, it must be within their own area
    if worker.role != "supervisor" and worker.area.strip().lower() not in ("all", "*"):
        w_area = worker.area.strip().lower()
        c_area = assigned_area.lower()
        matches = (
            w_area == c_area
            or c_area.startswith(f"{w_area} - ")
            or c_area.startswith(f"{w_area} / ")
            or c_area.startswith(f"{w_area}: ")
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Worker from area '{worker.area}' cannot register a child in area '{assigned_area}'.",
            )

    pseudo_id = body.pseudonymous_id.strip() if body.pseudonymous_id else f"child-{_utcnow().strftime('%Y%m%d%H%M%S')}"

    # Check for existing pseudonymous_id
    existing_res = await db.execute(select(ChildRecord).where(ChildRecord.pseudonymous_id == pseudo_id))
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Child record with pseudonymous ID '{pseudo_id}' already exists.",
        )

    child = ChildRecord(
        pseudonymous_id=pseudo_id,
        age_bracket=body.age_bracket.strip(),
        village_ward=assigned_area,
        consent_given=True,
        consent_recorded_at=_utcnow(),
        opt_in=True,
    )
    db.add(child)
    await db.commit()
    await db.refresh(child)
    return child


@router.get(
    "/api/chw/children",
    response_model=list[ChildRecordResponse],
)
@router.get(
    "/api/children",
    response_model=list[ChildRecordResponse],
)
async def list_children(
    tier: str | None = Query(None, description="Filter by tier ('Tier 1', 'Tier 2', 'Tier 3', 'Unscreened')"),
    village_ward: str | None = Query(None, description="Filter by specific village or ward"),
    age_group: str | None = Query(None, description="Filter by age bracket (e.g. '18-24m')"),
    overdue_only: bool = Query(False, description="Filter only children with overdue follow-up"),
    search: str | None = Query(None, description="Search by child ID or village"),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    List children with mobile-first filters.
    ACCEPTANCE CHECK: A worker sees only children in their own area.
    """
    if worker.role == "supervisor" and worker.area.strip().lower() in ("all", "*"):
        conditions = [ChildRecord.opt_in.is_(True)]
    else:
        worker_area = worker.area.strip()
        conditions = [
            ChildRecord.opt_in.is_(True),
            or_(
                ChildRecord.village_ward == worker_area,
                ChildRecord.village_ward.like(f"{worker_area} - %"),
                ChildRecord.village_ward.like(f"{worker_area} / %"),
                ChildRecord.village_ward.like(f"{worker_area}: %"),
            ),
        ]

    if village_ward and village_ward.strip() and village_ward.strip().lower() != "all":
        conditions.append(ChildRecord.village_ward == village_ward.strip())

    if tier and tier.strip() and tier.strip().lower() != "all":
        t = tier.strip()
        if "1" in t:
            conditions.append(ChildRecord.current_tier.like("Tier 1%"))
        elif "2" in t:
            conditions.append(ChildRecord.current_tier.like("Tier 2%"))
        elif "3" in t:
            conditions.append(ChildRecord.current_tier.like("Tier 3%"))
        elif "unscreened" in t.lower():
            conditions.append(or_(ChildRecord.current_tier == "Unscreened", ChildRecord.current_tier.is_(None)))

    if age_group and age_group.strip() and age_group.strip().lower() != "all":
        conditions.append(ChildRecord.age_bracket == age_group.strip())

    if overdue_only:
        conditions.append(ChildRecord.follow_up_due_at.is_not(None))
        conditions.append(ChildRecord.follow_up_due_at < _utcnow())

    if search and search.strip():
        term = f"%{search.strip()}%"
        conditions.append(
            or_(
                ChildRecord.pseudonymous_id.ilike(term),
                ChildRecord.village_ward.ilike(term),
            )
        )

    stmt = (
        select(ChildRecord)
        .where(*conditions)
        .order_by(ChildRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.get(
    "/api/chw/children/{child_id}",
    response_model=ChildRecordResponse,
)
@router.get(
    "/api/children/{child_id}",
    response_model=ChildRecordResponse,
)
async def get_child_record(
    child_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific child record.
    ACCEPTANCE CHECK: A worker cannot read another area's children (returns 403 Forbidden).
    """
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == child_id.strip(), ChildRecord.pseudonymous_id == child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child or not child.opt_in:
        raise HTTPException(status_code=404, detail="Child record not found")

    check_worker_area_access(worker, child)
    return child


@router.delete(
    "/api/chw/children/{child_id}",
    status_code=status.HTTP_200_OK,
)
@router.delete(
    "/api/children/{child_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_child_record(
    child_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a child record and all associated referrals.
    Enforces caregiver right to erasure / removability.
    """
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == child_id.strip(), ChildRecord.pseudonymous_id == child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child:
        raise HTTPException(status_code=404, detail="Child record not found")

    check_worker_area_access(worker, child)

    # Permanently delete associated referrals then child
    await db.execute(delete(Referral).where(Referral.child_id == child.id))
    await db.delete(child)
    await db.commit()

    return {
        "deleted": True,
        "child_id": child.id,
        "pseudonymous_id": child.pseudonymous_id,
        "message": "Child record and all associated referrals have been permanently removed.",
    }


# -----------------------------------------------------------------------------
# Referral Endpoints (Lifecycle, Status Transitions & Outcome Follow-Up)
# -----------------------------------------------------------------------------

@router.post(
    "/api/referrals",
    response_model=ReferralResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/api/chw/referrals",
    response_model=ReferralResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_referral(
    body: ReferralCreate,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new referral for a child to a specialized clinical facility.
    Initial status is always 'created'.
    Enforces area isolation: worker can only refer children within their own area.
    """
    # Lookup child by ID or pseudonymous ID
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == body.child_id.strip(), ChildRecord.pseudonymous_id == body.child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child or not child.opt_in:
        raise HTTPException(status_code=404, detail="Child record not found or opt-in revoked")

    # Enforce area access
    check_worker_area_access(worker, child)

    # Validate consent
    if not child.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create referral: Caregiver opt-in consent is not recorded.",
        )

    # Deduplicate if idempotency_key is provided
    if body.idempotency_key:
        stmt_dedup = select(Referral).options(selectinload(Referral.child)).where(
            Referral.idempotency_key == body.idempotency_key.strip()
        )
        res_dedup = await db.execute(stmt_dedup)
        existing_ref = res_dedup.scalar_one_or_none()
        if existing_ref:
            return _referral_to_response(existing_ref)

    referral = Referral(
        child_id=child.id,
        from_worker_id=worker.id,
        to_facility=body.to_facility.strip(),
        reason=body.reason.strip(),
        tier=body.tier.strip(),
        status=STATUS_CREATED,
        domains_of_concern=body.domains_of_concern,
        safety_rule_trigger=body.safety_rule_trigger,
        idempotency_key=body.idempotency_key.strip() if body.idempotency_key else None,
        created_at=_utcnow(),
    )
    db.add(referral)
    await db.commit()
    await db.refresh(referral)

    return _referral_to_response(referral)


@router.get(
    "/api/referrals",
    response_model=list[ReferralResponse],
)
@router.get(
    "/api/chw/referrals",
    response_model=list[ReferralResponse],
)
async def list_referrals(
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    List referrals visible to the worker.
    Scoped strictly to referrals for children in the worker's assigned area.
    """
    stmt = select(Referral).options(selectinload(Referral.child))

    if worker.role != "supervisor" or worker.area.strip().lower() not in ("all", "*"):
        stmt = stmt.join(ChildRecord).where(ChildRecord.village_ward == worker.area)

    stmt = stmt.order_by(Referral.created_at.desc())
    res = await db.execute(stmt)
    referrals = list(res.scalars().all())

    return [_referral_to_response(r) for r in referrals]


@router.get(
    "/api/referrals/{referral_id}",
    response_model=ReferralResponse,
)
async def get_referral(
    referral_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """Get a single referral by ID. Enforces area isolation."""
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)
    return _referral_to_response(referral)


@router.patch(
    "/api/referrals/{referral_id}",
    response_model=ReferralResponse,
)
@router.put(
    "/api/referrals/{referral_id}",
    response_model=ReferralResponse,
)
async def update_referral(
    referral_id: str,
    body: ReferralUpdate,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Update referral status and/or metadata.
    ACCEPTANCE CHECK: Status transitions are strictly enforced:
    created -> sent -> seen -> outcome recorded -> closed.
    """
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)

    now = _utcnow()

    # Enforce status transition if status is being updated
    if body.status is not None:
        new_status = validate_status_transition(referral.status, body.status)
        referral.status = new_status

        # Set transition timestamps
        if new_status == STATUS_SENT and not referral.sent_at:
            referral.sent_at = now
        elif new_status == STATUS_SEEN and not referral.seen_at:
            referral.seen_at = now
        elif new_status == STATUS_OUTCOME_RECORDED and not referral.outcome_recorded_at:
            referral.outcome_recorded_at = now
        elif new_status == STATUS_CLOSED and not referral.closed_at:
            referral.closed_at = now

    if body.to_facility is not None:
        referral.to_facility = body.to_facility.strip()
    if body.reason is not None:
        referral.reason = body.reason.strip()
    if body.tier is not None:
        referral.tier = body.tier.strip()
    if body.domains_of_concern is not None:
        referral.domains_of_concern = body.domains_of_concern
    if body.safety_rule_trigger is not None:
        referral.safety_rule_trigger = body.safety_rule_trigger
    if body.outcome_notes is not None:
        referral.outcome_notes = body.outcome_notes

    referral.updated_at = now
    await db.commit()
    await db.refresh(referral)

    return _referral_to_response(referral)


@router.post(
    "/api/referrals/{referral_id}/outcome",
    response_model=ReferralResponse,
)
@router.post(
    "/api/chw/referrals/{referral_id}/outcome",
    response_model=ReferralResponse,
)
async def record_referral_outcome(
    referral_id: str,
    body: ReferralOutcomeRequest,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Record post-referral follow-up outcome.
    ACCEPTANCE CHECK: Enforces that child must have been seen before recording outcome.
    Validates status transition: seen -> outcome recorded (-> closed if close_referral=True).
    """
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)

    curr_status = normalize_status(referral.status)
    target_status = STATUS_CLOSED if body.close_referral else STATUS_OUTCOME_RECORDED

    # If referral is closed, forbid modification
    if curr_status == STATUS_CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record outcome on a closed referral.",
        )

    # If referral has not been seen yet, enforce valid transition
    if curr_status in (STATUS_CREATED, STATUS_SENT):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Referral must be in 'seen' status to record outcome. "
                f"Current status is '{referral.status}'. Status transitions are strictly enforced."
            ),
        )

    # Validate transition from current to target
    validate_status_transition(curr_status, target_status)

    now = _utcnow()
    referral.outcome_notes = body.outcome_notes.strip()
    referral.outcome_recorded_at = now
    referral.status = target_status
    if target_status == STATUS_CLOSED:
        referral.closed_at = now
    referral.updated_at = now

    await db.commit()
    await db.refresh(referral)

    return _referral_to_response(referral)


@router.delete(
    "/api/referrals/{referral_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_referral(
    referral_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a referral record.
    Enforces caregiver/patient right to erasure.
    """
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)

    await db.delete(referral)
    await db.commit()

    return {
        "deleted": True,
        "referral_id": referral.id,
        "message": "Referral record permanently removed.",
    }


# -----------------------------------------------------------------------------
# Referral Summary Endpoints (Printable PDF, Shareable Text, Minimal JSON)
# -----------------------------------------------------------------------------

@router.get(
    "/api/referrals/{referral_id}/summary",
    response_model=ReferralSummary,
)
async def get_referral_summary(
    referral_id: str,
    format: str = Query(default="json", description="Output format: 'json', 'pdf', or 'text'"),
    accept: str | None = Header(default=None),
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a one-page referral summary as printable PDF or shareable text,
    with the minimum data needed.

    ACCEPTANCE CHECK:
    The summary contains ONLY the listed fields:
    - age_bracket
    - tier
    - domains_of_concern
    - safety_rule_trigger
    """
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)

    fmt = format.strip().lower()
    is_pdf = fmt == "pdf" or (accept and "application/pdf" in accept)
    is_text = fmt == "text" or (accept and "text/plain" in accept)

    if is_pdf:
        pdf_bytes = generate_summary_pdf(referral)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename=referral_summary_{referral.id}.pdf"},
        )

    if is_text:
        text_content = generate_summary_text(referral)
        return Response(
            content=text_content,
            media_type="text/plain; charset=utf-8",
        )

    # Minimal JSON summary: contains ONLY the 4 listed fields
    summary_dict = build_summary_dict(referral)
    return ReferralSummary(**summary_dict)


@router.get("/api/referrals/{referral_id}/summary/pdf")
async def get_referral_summary_pdf(
    referral_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """Download one-page printable referral summary PDF."""
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)
    pdf_bytes = generate_summary_pdf(referral)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=referral_summary_{referral.id}.pdf"},
    )


@router.get("/api/referrals/{referral_id}/summary/text")
async def get_referral_summary_text(
    referral_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """Download one-page shareable referral summary as plain text."""
    stmt = select(Referral).options(selectinload(Referral.child)).where(Referral.id == referral_id.strip())
    res = await db.execute(stmt)
    referral = res.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    check_worker_area_access(worker, referral.child)
    text_content = generate_summary_text(referral)
    return Response(
        content=text_content,
        media_type="text/plain; charset=utf-8",
    )


# =========================================================================
# LOW-LITERACY WORKER DASHBOARD ENDPOINTS
# =========================================================================

@router.post(
    "/api/chw/seed-children",
    response_model=SeedChildrenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def seed_children(
    body: SeedChildrenRequest = SeedChildrenRequest(),
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Seed 200 realistic children for the community health worker dashboard.
    Populates diverse tiers (Tier 1 Typical, Tier 2 Monitor, Tier 3 Refer, Unscreened),
    age groups (0-6m to 48-60m), overdue home visits, and initial referrals.
    """
    target_area = (body.area or worker.area).strip()

    if worker.role != "supervisor" and worker.area.strip().lower() not in ("all", "*"):
        target_area = worker.area.strip()

    now = _utcnow()

    if body.clean_first:
        await db.execute(
            delete(ChildRecord).where(
                ChildRecord.pseudonymous_id.like("child-seed-%"),
                or_(
                    ChildRecord.village_ward == target_area,
                    ChildRecord.village_ward.like(f"{target_area} - %"),
                ),
            )
        )
        await db.commit()

    age_brackets = ["0-6m", "6-12m", "12-24m", "24-36m", "36-48m", "48-60m"]
    sub_wards = [
        f"{target_area} - Sector A",
        f"{target_area} - Sector B",
        f"{target_area} - Sector C",
        f"{target_area} - Sector D",
    ]

    tier_counts = {
        "Tier 1: Typical": 0,
        "Tier 2: In-App Reflex Monitor": 0,
        "Tier 3: Direct Referral": 0,
        "Unscreened": 0,
    }

    count = max(1, min(body.count, 1000))
    seeded_records: list[ChildRecord] = []

    for i in range(count):
        pseudo_id = f"child-seed-{target_area.replace(' ', '').lower()}-{i+1:03d}"
        bracket = age_brackets[i % len(age_brackets)]
        sub_ward = sub_wards[i % len(sub_wards)]

        mod = i % 10
        if mod in (0, 1, 2, 3):
            tier = "Tier 1: Typical"
            domains = []
            safety = None
            last_screened = now - timedelta(days=10 + (i % 50))
            last_contacted = now - timedelta(days=5 + (i % 20))
            follow_up = now + timedelta(days=60 + (i % 30))
            contacts = 2 + (i % 4)
        elif mod in (4, 5, 6):
            tier = "Tier 2: In-App Reflex Monitor"
            domains = ["social_emotional"] if i % 2 == 0 else ["fine_motor", "communication"]
            safety = None
            last_screened = now - timedelta(days=14 + (i % 40))
            last_contacted = now - timedelta(days=3 + (i % 15))
            if i % 3 == 0:
                follow_up = now - timedelta(days=3 + (i % 10))  # Overdue
            else:
                follow_up = now + timedelta(days=14 + (i % 20))
            contacts = 3 + (i % 5)
        elif mod in (7, 8):
            tier = "Tier 3: Direct Referral"
            domains = ["gross_motor", "communication"] if i % 2 == 0 else ["motor", "cognitive"]
            safety = "Loss of motor milestones (SD <= -2.0)" if i % 2 == 0 else "Severe developmental divergence flagged"
            last_screened = now - timedelta(days=5 + (i % 25))
            last_contacted = now - timedelta(days=2 + (i % 10))
            if i % 2 == 0:
                follow_up = now - timedelta(days=4 + (i % 12))  # Overdue
            else:
                follow_up = now + timedelta(days=7 + (i % 14))
            contacts = 4 + (i % 6)
        else:
            tier = "Unscreened"
            domains = []
            safety = None
            last_screened = None
            last_contacted = None
            follow_up = None
            contacts = 0

        tier_counts[tier] = tier_counts.get(tier, 0) + 1

        child = ChildRecord(
            pseudonymous_id=pseudo_id,
            age_bracket=bracket,
            village_ward=sub_ward,
            consent_given=True,
            consent_recorded_at=now - timedelta(days=60),
            opt_in=True,
            current_tier=tier,
            last_screened_at=last_screened,
            last_contacted_at=last_contacted,
            follow_up_due_at=follow_up,
            contact_count=contacts,
            domains_flagged=domains,
            safety_rule_triggered=safety,
            created_at=now - timedelta(days=60 - (i % 30)),
        )
        seeded_records.append(child)

    db.add_all(seeded_records)
    await db.commit()

    tier3_children = [c for c in seeded_records if c.current_tier == "Tier 3: Direct Referral"]
    for idx, c in enumerate(tier3_children[:15]):
        stat = STATUS_SENT if idx % 3 == 0 else (STATUS_SEEN if idx % 3 == 1 else STATUS_CREATED)
        ref = Referral(
            child_id=c.id,
            from_worker_id=worker.id,
            to_facility="Safdarjung Hospital DEIC" if idx % 2 == 0 else "RBSK Mobile Health Team",
            reason="Severe developmental milestone lag detected during community screening",
            tier=c.current_tier,
            status=stat,
            domains_of_concern=list(c.domains_flagged),
            safety_rule_trigger=c.safety_rule_triggered,
            created_at=c.last_screened_at or now,
            sent_at=(c.last_screened_at or now) if stat != STATUS_CREATED else None,
            seen_at=now - timedelta(days=2) if stat == STATUS_SEEN else None,
        )
        db.add(ref)

    await db.commit()

    return SeedChildrenResponse(
        message=f"Successfully seeded {len(seeded_records)} children in {target_area}.",
        seeded_count=len(seeded_records),
        area=target_area,
        tier_counts=tier_counts,
    )


@router.get(
    "/api/chw/tier-counts",
    response_model=TierCountsResponse,
)
async def get_tier_counts(
    village_ward: str | None = Query(None),
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate child counts per triage tier and overdue follow-up counts for worker dashboard."""
    if worker.role == "supervisor" and worker.area.strip().lower() in ("all", "*"):
        conditions = [ChildRecord.opt_in.is_(True)]
    else:
        worker_area = worker.area.strip()
        conditions = [
            ChildRecord.opt_in.is_(True),
            or_(
                ChildRecord.village_ward == worker_area,
                ChildRecord.village_ward.like(f"{worker_area} - %"),
                ChildRecord.village_ward.like(f"{worker_area} / %"),
                ChildRecord.village_ward.like(f"{worker_area}: %"),
            ),
        ]

    if village_ward and village_ward.strip() and village_ward.strip().lower() != "all":
        conditions.append(ChildRecord.village_ward == village_ward.strip())

    stmt = select(ChildRecord).where(*conditions)
    res = await db.execute(stmt)
    records = list(res.scalars().all())

    now = _utcnow()
    t1 = sum(1 for c in records if (c.current_tier or "").startswith("Tier 1"))
    t2 = sum(1 for c in records if (c.current_tier or "").startswith("Tier 2"))
    t3 = sum(1 for c in records if (c.current_tier or "").startswith("Tier 3"))
    unscreened = sum(1 for c in records if not c.current_tier or c.current_tier == "Unscreened")

    def _is_overdue(dt: datetime | None) -> bool:
        if not dt:
            return False
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt < now

    overdue = sum(1 for c in records if _is_overdue(c.follow_up_due_at))

    return TierCountsResponse(
        total_children=len(records),
        tier1_typical=t1,
        tier2_monitor=t2,
        tier3_referral=t3,
        unscreened=unscreened,
        overdue_follow_up=overdue,
    )


@router.post(
    "/api/chw/children/{child_id}/contact",
    response_model=ChildContactResponse,
)
async def mark_child_contacted(
    child_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Quick Action: Mark child as contacted/visited today.
    Increments contact count and updates last_contacted_at timestamp.
    """
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == child_id.strip(), ChildRecord.pseudonymous_id == child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child or not child.opt_in:
        raise HTTPException(status_code=404, detail="Child record not found")

    check_worker_area_access(worker, child)

    now = _utcnow()
    child.last_contacted_at = now
    child.contact_count = (child.contact_count or 0) + 1

    if child.follow_up_due_at:
        dt = child.follow_up_due_at.replace(tzinfo=UTC) if child.follow_up_due_at.tzinfo is None else child.follow_up_due_at
        if dt < now:
            child.follow_up_due_at = now + timedelta(days=14)

    await db.commit()
    await db.refresh(child)

    return ChildContactResponse(
        message=f"Contact recorded for child {child.pseudonymous_id}.",
        child_id=child.id,
        last_contacted_at=child.last_contacted_at,
        contact_count=child.contact_count,
    )


@router.post(
    "/api/chw/children/{child_id}/one-touch-referral",
    response_model=OneTouchReferralResponse,
)
async def one_touch_referral(
    child_id: str,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Quick Action: One-touch referral using requirement 6a minimal summary.
    Creates or reuses referral and immediately provides the 4-field minimal summary.
    """
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == child_id.strip(), ChildRecord.pseudonymous_id == child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child or not child.opt_in:
        raise HTTPException(status_code=404, detail="Child record not found")

    check_worker_area_access(worker, child)

    ref_stmt = (
        select(Referral)
        .options(selectinload(Referral.child))
        .where(Referral.child_id == child.id, Referral.status != STATUS_CLOSED)
        .order_by(Referral.created_at.desc())
    )
    existing_ref = (await db.execute(ref_stmt)).scalar_one_or_none()

    if existing_ref:
        referral = existing_ref
    else:
        tier_val = child.current_tier if "Tier" in (child.current_tier or "") else "Tier 3: Direct Referral"
        domains = list(child.domains_flagged or ["gross_motor", "communication"])
        safety = child.safety_rule_triggered or "Clinical delay flagged during CHW village check"
        referral = Referral(
            child_id=child.id,
            from_worker_id=worker.id,
            to_facility="District Early Intervention Centre (DEIC)",
            reason=f"1-Touch referral from {worker.name} ({worker.role.upper()}): developmental triage alert",
            tier=tier_val,
            status=STATUS_CREATED,
            domains_of_concern=domains,
            safety_rule_trigger=safety,
        )
        child.current_tier = "Tier 3: Direct Referral"
        child.follow_up_due_at = _utcnow() + timedelta(days=7)
        db.add(referral)
        await db.commit()
        await db.refresh(referral)

        ref_reloaded = (await db.execute(ref_stmt)).scalar_one_or_none()
        if ref_reloaded:
            referral = ref_reloaded

    summary_dict = build_summary_dict(referral)
    summary = ReferralSummary(**summary_dict)

    return OneTouchReferralResponse(
        message=f"One-touch referral active for child {child.pseudonymous_id}.",
        referral=_referral_to_response(referral),
        summary=summary,
    )


@router.post(
    "/api/chw/children/{child_id}/outcome",
    response_model=ReferralResponse,
)
async def record_child_outcome(
    child_id: str,
    body: RecordChildOutcomeRequest,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Quick Action: Record outcome notes for post-referral follow-up.
    Updates referral status to 'outcome recorded' (or 'closed') and updates child follow-up.
    """
    stmt = select(ChildRecord).where(
        or_(ChildRecord.id == child_id.strip(), ChildRecord.pseudonymous_id == child_id.strip())
    )
    res = await db.execute(stmt)
    child = res.scalar_one_or_none()

    if not child or not child.opt_in:
        raise HTTPException(status_code=404, detail="Child record not found")

    check_worker_area_access(worker, child)

    ref_stmt = (
        select(Referral)
        .where(Referral.child_id == child.id)
        .order_by(Referral.created_at.desc())
    )
    referral = (await db.execute(ref_stmt)).scalar_one_or_none()

    now = _utcnow()
    if not referral:
        referral = Referral(
            child_id=child.id,
            from_worker_id=worker.id,
            to_facility="District Early Intervention Centre (DEIC)",
            reason="CHW village developmental check-in",
            tier=child.current_tier,
            status=STATUS_OUTCOME_RECORDED,
            outcome_notes=body.outcome_notes,
            outcome_recorded_at=now,
        )
        db.add(referral)
    else:
        referral.outcome_notes = body.outcome_notes
        referral.outcome_recorded_at = now
        referral.status = STATUS_OUTCOME_RECORDED

    if body.close_referral:
        referral.status = STATUS_CLOSED
        referral.closed_at = now

    if body.new_tier:
        child.current_tier = body.new_tier
    if body.next_follow_up_days:
        child.follow_up_due_at = now + timedelta(days=body.next_follow_up_days)

    await db.commit()
    await db.refresh(referral)
    return _referral_to_response(referral)


# ---------------------------------------------------------------------------
# Offline Synchronization & Conflict Handling Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/api/chw/sync",
    response_model=CHWSyncBatchResponse,
)
async def sync_chw_batch(
    body: CHWSyncBatchRequest,
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Idempotent batch synchronization endpoint for frontline offline-first operations.
    Supports screening sessions, referrals, child contacts, and clinical outcomes.
    Enforces idempotency keys, detects and logs conflicts, and guarantees exactly-once processing.
    """
    results: list[CHWSyncItemResult] = []
    created_count = 0
    deduplicated_count = 0
    conflict_count = 0

    for item in body.operations:
        key = item.idempotency_key.strip()
        op = item.operation.lower().strip()

        # Check idempotency registry first
        stmt = select(SyncOperation).where(SyncOperation.idempotency_key == key)
        res = await db.execute(stmt)
        existing_op = res.scalar_one_or_none()

        if existing_op:
            deduplicated_count += 1
            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="deduplicated",
                    entity_id=existing_op.entity_id,
                    message=f"Operation already processed with status {existing_op.status} (deduplicated).",
                )
            )
            continue

        # Lookup child
        stmt_child = select(ChildRecord).where(
            or_(ChildRecord.id == item.child_id.strip(), ChildRecord.pseudonymous_id == item.child_id.strip())
        )
        res_child = await db.execute(stmt_child)
        child = res_child.scalar_one_or_none()

        if not child:
            # Child does not exist on server (could have been revoked/deleted)
            conflict_count += 1
            c_log = ConflictLog(
                id=_uuid(),
                worker_id=worker.id,
                entity_type=op,
                entity_id=item.child_id,
                operation=op,
                client_payload=item.payload,
                server_state={"status": "not_found"},
                resolution="rejected",
                reason=f"Child record {item.child_id} not found on server or consent was revoked.",
                created_at=_utcnow(),
            )
            db.add(c_log)
            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="conflict",
                    entity_id=None,
                    message="Child record not found on server or opt-in was revoked.",
                    conflict_detail={"resolution": "rejected", "reason": "Child deleted or not found."},
                )
            )
            continue

        # Enforce area access
        try:
            check_worker_area_access(worker, child)
        except HTTPException as exc:
            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="error",
                    entity_id=child.id,
                    message=f"Area access forbidden: {exc.detail}",
                )
            )
            continue

        # Handle Operation: SCREENING
        if op == "screening":
            # Check if screening with this idempotency key exists
            stmt_s = select(ScreeningSession).where(ScreeningSession.idempotency_key == key)
            res_s = await db.execute(stmt_s)
            existing_s = res_s.scalar_one_or_none()

            if existing_s:
                deduplicated_count += 1
                results.append(
                    CHWSyncItemResult(
                        idempotency_key=key,
                        operation=op,
                        status="deduplicated",
                        entity_id=existing_s.id,
                        message="Screening session already exists with this idempotency key.",
                    )
                )
                continue

            tier = item.payload.get("tier", "Tier 1: Typical")
            domains = item.payload.get("domains_flagged", [])
            safety = item.payload.get("safety_rule_triggered", None)

            # Derive corrected_age_months and age_bracket
            corr_age = item.payload.get("corrected_age_months")
            if corr_age is None:
                bracket_str = child.age_bracket or "24-36m"
                if "-" in bracket_str:
                    try:
                        parts = bracket_str.replace("m", "").split("-")
                        corr_age = (float(parts[0]) + float(parts[1])) / 2.0
                    except Exception:
                        corr_age = 24.0
                else:
                    corr_age = 24.0

            bracket = item.payload.get("age_bracket", child.age_bracket or "24-36m")

            # Create ScreeningSession
            session_id = _uuid()
            session = ScreeningSession(
                id=session_id,
                idempotency_key=key,
                child_record_id=child.id,
                child_ref=child.pseudonymous_id,
                parent_user_id=worker.user_id,
                module=item.payload.get("module", "A"),
                status="completed",
                corrected_age_months=float(corr_age),
                age_bracket=bracket,
                started_at=item.client_timestamp or _utcnow(),
                completed_at=item.client_timestamp or _utcnow(),
                state_json=item.payload,
            )
            db.add(session)

            # Update child tracking state
            child.current_tier = tier
            child.last_screened_at = item.client_timestamp or _utcnow()
            child.domains_flagged = domains
            child.safety_rule_triggered = safety

            # Recalculate follow-up due date based on tier
            now_dt = _utcnow()
            if tier.startswith("Tier 3"):
                child.follow_up_due_at = now_dt + timedelta(days=7)
            elif tier.startswith("Tier 2"):
                child.follow_up_due_at = now_dt + timedelta(days=14)
            else:
                child.follow_up_due_at = now_dt + timedelta(days=60)

            # Record sync operation
            sync_op = SyncOperation(
                id=_uuid(),
                idempotency_key=key,
                worker_id=worker.id,
                operation_type="screening",
                entity_id=session_id,
                status="created",
                created_at=_utcnow(),
            )
            db.add(sync_op)
            created_count += 1

            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="created",
                    entity_id=session_id,
                    message="Screening session recorded and child tier updated.",
                )
            )

        # Handle Operation: REFERRAL
        elif op == "referral":
            # Check if referral with idempotency key exists
            stmt_r = select(Referral).where(Referral.idempotency_key == key)
            res_r = await db.execute(stmt_r)
            existing_r = res_r.scalar_one_or_none()

            if existing_r:
                deduplicated_count += 1
                results.append(
                    CHWSyncItemResult(
                        idempotency_key=key,
                        operation=op,
                        status="deduplicated",
                        entity_id=existing_r.id,
                        message="Referral already exists with this idempotency key.",
                    )
                )
                continue

            if not child.consent_given:
                conflict_count += 1
                c_log = ConflictLog(
                    id=_uuid(),
                    worker_id=worker.id,
                    entity_type="referral",
                    entity_id=child.id,
                    operation="referral",
                    client_payload=item.payload,
                    server_state={"consent_given": False},
                    resolution="rejected",
                    reason="Child consent is not recorded on server.",
                    created_at=_utcnow(),
                )
                db.add(c_log)
                results.append(
                    CHWSyncItemResult(
                        idempotency_key=key,
                        operation=op,
                        status="conflict",
                        entity_id=child.id,
                        message="Child consent is not recorded on server.",
                        conflict_detail={"resolution": "rejected"},
                    )
                )
                continue

            to_facility = item.payload.get("to_facility", "District Early Intervention Centre (DEIC)").strip()
            reason = item.payload.get("reason", "Developmental delay flagged in screening").strip()
            ref_tier = item.payload.get("tier", child.current_tier).strip()

            referral_id = _uuid()
            referral = Referral(
                id=referral_id,
                idempotency_key=key,
                child_id=child.id,
                from_worker_id=worker.id,
                to_facility=to_facility,
                reason=reason,
                tier=ref_tier,
                status=STATUS_CREATED,
                domains_of_concern=item.payload.get("domains_of_concern", child.domains_flagged or []),
                safety_rule_trigger=item.payload.get("safety_rule_trigger", child.safety_rule_triggered),
                created_at=item.client_timestamp or _utcnow(),
            )
            db.add(referral)

            sync_op = SyncOperation(
                id=_uuid(),
                idempotency_key=key,
                worker_id=worker.id,
                operation_type="referral",
                entity_id=referral_id,
                status="created",
                created_at=_utcnow(),
            )
            db.add(sync_op)
            created_count += 1

            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="created",
                    entity_id=referral_id,
                    message="Referral created successfully.",
                )
            )

        # Handle Operation: CONTACT
        elif op == "contact":
            child.contact_count = (child.contact_count or 0) + 1
            child.last_contacted_at = item.client_timestamp or _utcnow()
            if child.follow_up_due_at and child.follow_up_due_at < _utcnow():
                child.follow_up_due_at = _utcnow() + timedelta(days=14)

            sync_op = SyncOperation(
                id=_uuid(),
                idempotency_key=key,
                worker_id=worker.id,
                operation_type="contact",
                entity_id=child.id,
                status="updated",
                created_at=_utcnow(),
            )
            db.add(sync_op)
            created_count += 1
            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="updated",
                    entity_id=child.id,
                    message="Contact timestamp and count recorded.",
                )
            )

        # Handle Operation: OUTCOME
        elif op == "outcome":
            # Lookup active referral for child
            stmt_ref = (
                select(Referral)
                .where(Referral.child_id == child.id)
                .order_by(Referral.created_at.desc())
            )
            res_ref = await db.execute(stmt_ref)
            latest_ref = res_ref.scalars().first()

            if not latest_ref:
                # Conflict: outcome recorded without a referral
                conflict_count += 1
                c_log = ConflictLog(
                    id=_uuid(),
                    worker_id=worker.id,
                    entity_type="outcome",
                    entity_id=child.id,
                    operation="outcome",
                    client_payload=item.payload,
                    server_state={"has_referral": False},
                    resolution="client_applied",
                    reason="Outcome recorded without an active referral on server. Applied directly to child tier.",
                    created_at=_utcnow(),
                )
                db.add(c_log)
                if item.payload.get("new_tier"):
                    child.current_tier = item.payload["new_tier"]

                sync_op = SyncOperation(
                    id=_uuid(),
                    idempotency_key=key,
                    worker_id=worker.id,
                    operation_type="outcome",
                    entity_id=child.id,
                    status="conflict",
                    created_at=_utcnow(),
                )
                db.add(sync_op)
                results.append(
                    CHWSyncItemResult(
                        idempotency_key=key,
                        operation=op,
                        status="conflict",
                        entity_id=child.id,
                        message="Outcome recorded directly on child; no active referral was linked.",
                        conflict_detail={"resolution": "client_applied"},
                    )
                )
            else:
                latest_ref.outcome_notes = item.payload.get("outcome_notes", "Clinical follow-up completed.")
                latest_ref.status = STATUS_OUTCOME_RECORDED
                latest_ref.outcome_recorded_at = item.client_timestamp or _utcnow()
                if item.payload.get("close_referral"):
                    latest_ref.status = STATUS_CLOSED
                    latest_ref.closed_at = _utcnow()

                if item.payload.get("new_tier"):
                    child.current_tier = item.payload["new_tier"]

                sync_op = SyncOperation(
                    id=_uuid(),
                    idempotency_key=key,
                    worker_id=worker.id,
                    operation_type="outcome",
                    entity_id=latest_ref.id,
                    status="updated",
                    created_at=_utcnow(),
                )
                db.add(sync_op)
                created_count += 1
                results.append(
                    CHWSyncItemResult(
                        idempotency_key=key,
                        operation=op,
                        status="updated",
                        entity_id=latest_ref.id,
                        message="Outcome recorded on referral and child tier updated.",
                    )
                )

        else:
            results.append(
                CHWSyncItemResult(
                    idempotency_key=key,
                    operation=op,
                    status="error",
                    entity_id=None,
                    message=f"Unknown operation type: {op}",
                )
            )

    await db.commit()

    return CHWSyncBatchResponse(
        processed_count=len(body.operations),
        created_count=created_count,
        deduplicated_count=deduplicated_count,
        conflict_count=conflict_count,
        results=results,
        server_timestamp=_utcnow(),
    )


@router.get(
    "/api/chw/conflicts",
    response_model=list[ConflictLogResponse],
)
async def list_conflicts(
    worker: Worker = Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    """List recent synchronization conflict logs for the worker."""
    stmt = (
        select(ConflictLog)
        .where(
            or_(
                ConflictLog.worker_id == worker.id,
                ConflictLog.worker_id.is_(None),
            )
        )
        .order_by(ConflictLog.created_at.desc())
        .limit(100)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())

