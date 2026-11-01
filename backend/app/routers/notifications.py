"""Push subscription, preference, outbox, bot webhook and IVR status endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_internal
from app.config import get_settings
from app.core.notifications import templates
from app.core.notifications.providers import get_notification_provider
from app.core.notifications.service import (
    deliver_pending,
    handle_inbound,
    phone_hash,
    schedule_due_reminders,
)
from app.db.models import (
    NotificationDelivery,
    NotificationPreference,
    PushSubscription,
    User,
    Worker,
)
from app.db.session import get_db
from app.schemas.notifications import (
    NotificationDeliveryResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    PushSubscriptionCreate,
    PushUnsubscribe,
    SweepResponse,
    TestNotificationRequest,
    VapidKeyResponse,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_DEFAULT_CHANNELS = {"push": False, "whatsapp": False, "sms": False, "ivr": False}


async def _resolve_subject(db: AsyncSession, user: User) -> tuple[str, str]:
    if user.role in ("chw", "supervisor", "internal"):
        worker = (
            await db.execute(select(Worker).where(Worker.user_id == user.id))
        ).scalar_one_or_none()
        if worker is not None:
            return "worker", worker.id
    return "user", user.id


async def _current_preference(
    db: AsyncSession, subject_type: str, subject_id: str
) -> NotificationPreference | None:
    return (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.subject_type == subject_type,
                NotificationPreference.subject_id == subject_id,
            )
        )
    ).scalar_one_or_none()


@router.get("/vapid-public-key", response_model=VapidKeyResponse)
async def vapid_public_key() -> VapidKeyResponse:
    settings = get_settings()
    return VapidKeyResponse(
        public_key=settings.vapid_public_key,
        enabled=bool(settings.vapid_public_key and settings.vapid_private_key),
    )


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    body: PushSubscriptionCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    subject_type, subject_id = await _resolve_subject(db, user)
    if subject_type == "worker" and body.worker_id:
        subject_id = body.worker_id
    existing = (
        await db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = PushSubscription(
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            role=body.role or user.role,
        )
        db.add(existing)
    existing.p256dh = body.keys.p256dh
    existing.auth = body.keys.auth
    existing.revoked_at = None
    existing.last_seen_at = datetime.now(UTC)
    if subject_type == "worker":
        existing.worker_id = subject_id
        existing.user_id = user.id
    else:
        existing.user_id = user.id
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribe,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    subject_type, subject_id = await _resolve_subject(db, user)
    stmt = select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    if subject_type == "worker":
        stmt = stmt.where(PushSubscription.worker_id == subject_id)
    else:
        stmt = stmt.where(PushSubscription.user_id == user.id)
    sub = (await db.execute(stmt)).scalar_one_or_none()
    if sub is not None:
        sub.revoked_at = datetime.now(UTC)
        await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/preferences", response_model=NotificationPreferenceResponse)
async def get_preferences(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPreferenceResponse:
    subject_type, subject_id = await _resolve_subject(db, user)
    pref = await _current_preference(db, subject_type, subject_id)
    if pref is None:
        return NotificationPreferenceResponse(
            id="",
            subject_type=subject_type,
            subject_id=subject_id,
            channels=dict(_DEFAULT_CHANNELS),
            enabled=False,
        )
    return NotificationPreferenceResponse.model_validate(pref)


@router.put("/preferences", response_model=NotificationPreferenceResponse)
async def update_preferences(
    body: NotificationPreferenceUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPreferenceResponse:
    subject_type, subject_id = await _resolve_subject(db, user)
    channels = body.channels.model_dump()
    if (channels["whatsapp"] or channels["sms"] or channels["ivr"]) and not (
        body.phone or body.whatsapp_number
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A phone number is required for WhatsApp, SMS or IVR reminders",
        )

    pref = await _current_preference(db, subject_type, subject_id)
    if pref is None:
        pref = NotificationPreference(subject_type=subject_type, subject_id=subject_id)
        db.add(pref)

    pref.channels = channels
    pref.phone = body.phone
    pref.whatsapp_number = body.whatsapp_number
    pref.phone_hash = phone_hash(body.whatsapp_number or body.phone)
    pref.locale = body.locale
    pref.quiet_start = body.quiet_start
    pref.quiet_end = body.quiet_end
    pref.reminder_lead_days = body.reminder_lead_days
    pref.enabled = body.enabled and body.consent_given
    if body.consent_given and pref.consent_recorded_at is None:
        pref.consent_recorded_at = datetime.now(UTC)
    await db.flush()
    return NotificationPreferenceResponse.model_validate(pref)


@router.get("/", response_model=list[NotificationDeliveryResponse])
async def list_deliveries(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[NotificationDeliveryResponse]:
    subject_type, subject_id = await _resolve_subject(db, user)
    rows = (
        (
            await db.execute(
                select(NotificationDelivery)
                .where(
                    NotificationDelivery.subject_type == subject_type,
                    NotificationDelivery.subject_id == subject_id,
                )
                .order_by(NotificationDelivery.created_at.desc())
                .limit(max(1, min(limit, 200)))
            )
        )
        .scalars()
        .all()
    )
    return [NotificationDeliveryResponse.model_validate(r) for r in rows]


@router.post("/test", response_model=SweepResponse)
async def send_test(
    body: TestNotificationRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SweepResponse:
    subject_type, subject_id = await _resolve_subject(db, user)
    settings = get_settings()
    payload = templates.build(
        body.template,
        locale="en",
        child_ref="demo-child",
        activity="shared reading for ten minutes",
        app_url=settings.public_app_url,
    )
    delivery = NotificationDelivery(
        channel=body.channel,
        template=body.template,
        subject_type=subject_type,
        subject_id=subject_id,
        child_ref="demo-child",
        payload=payload,
        idempotency_key=f"test:{subject_id}:{uuid.uuid4()}",
        scheduled_for=datetime.now(UTC),
        status="queued",
    )
    db.add(delivery)
    await db.flush()
    counts = await deliver_pending(db, get_notification_provider(settings), limit=10)
    return SweepResponse(
        scheduled=1,
        delivered=counts["delivered"],
        failed=counts["failed"],
        suppressed=counts["suppressed"],
    )


@router.post("/run-sweep", response_model=SweepResponse)
async def run_sweep(
    _: Annotated[User, Depends(require_internal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SweepResponse:
    scheduled = await schedule_due_reminders(db)
    counts = await deliver_pending(
        db, get_notification_provider(get_settings()), limit=200
    )
    return SweepResponse(
        scheduled=scheduled,
        delivered=counts["delivered"],
        failed=counts["failed"],
        suppressed=counts["suppressed"],
    )


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    form = await request.form()
    settings = get_settings()

    if settings.twilio_auth_token:
        try:
            from twilio.request_validator import RequestValidator
        except Exception:  # noqa: BLE001 - SDK absent means no validation
            RequestValidator = None  # type: ignore[assignment]
        if RequestValidator is not None:
            validator = RequestValidator(settings.twilio_auth_token)
            signature = request.headers.get("X-Twilio-Signature", "")
            if not validator.validate(str(request.url), dict(form), signature):
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    sender = str(form.get("From") or "")
    text = str(form.get("Body") or "")
    result = await handle_inbound(db, phone=sender, text=text)
    provider = get_notification_provider(settings)
    reply = result["reply"]
    if sender.startswith("whatsapp:"):
        await provider.send_whatsapp(sender, reply)
    elif sender:
        await provider.send_sms(sender, reply)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/status", status_code=status.HTTP_204_NO_CONTENT)
async def delivery_status(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    form = await request.form()
    sid = str(form.get("MessageSid") or form.get("CallSid") or "")
    state = str(form.get("MessageStatus") or form.get("CallStatus") or "").lower()
    if sid:
        row = (
            await db.execute(
                select(NotificationDelivery).where(
                    NotificationDelivery.provider_message_id == sid
                )
            )
        ).scalar_one_or_none()
        if row is not None and state in {"failed", "undelivered", "busy", "no-answer"}:
            row.status = "failed"
            row.error = f"provider status: {state}"
            await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
