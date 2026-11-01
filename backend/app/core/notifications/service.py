"""Notification scheduling, outbox delivery and the inbound bot menu."""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.notifications import templates
from app.core.notifications.ivr import sign_token
from app.core.notifications.providers import NotificationProvider, SendResult
from app.core.notifications.webpush import send_web_push
from app.db.models import (
    ChildRecord,
    NotificationConversation,
    NotificationDelivery,
    NotificationPreference,
    PushSubscription,
    Referral,
    Worker,
)

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
CHANNELS = ("push", "whatsapp", "sms", "ivr")
CHANNEL_TEMPLATE_KEY = {
    "push": "push",
    "whatsapp": "whatsapp",
    "sms": "sms",
    "ivr": "ivr",
}


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive timestamps; normalise before Python comparisons."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def normalize_phone(raw: str | None) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit() or ch == "+")
    return digits


def phone_hash(raw: str | None) -> str:
    return hashlib.sha256(normalize_phone(raw).encode("utf-8")).hexdigest()


async def get_preference(
    db: AsyncSession, subject_type: str, subject_id: str
) -> NotificationPreference | None:
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.subject_type == subject_type,
            NotificationPreference.subject_id == subject_id,
        )
    )
    return result.scalar_one_or_none()


async def queue_delivery(
    db: AsyncSession,
    *,
    channel: str,
    template: str,
    subject_type: str,
    subject_id: str,
    payload: dict[str, Any],
    idempotency_key: str,
    child_ref: str | None = None,
    scheduled_for: datetime | None = None,
) -> NotificationDelivery | None:
    """Insert one outbox row; returns None when the key was already queued."""
    existing = await db.execute(
        select(NotificationDelivery.id).where(
            NotificationDelivery.idempotency_key == idempotency_key
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None
    row = NotificationDelivery(
        channel=channel,
        template=template,
        subject_type=subject_type,
        subject_id=subject_id,
        child_ref=child_ref,
        payload=payload,
        idempotency_key=idempotency_key,
        scheduled_for=scheduled_for or datetime.now(UTC),
        status="queued",
    )
    db.add(row)
    await db.flush()
    return row


def _enabled_channels(pref: NotificationPreference | None) -> list[str]:
    if pref is None or not pref.enabled or not pref.consent_recorded_at:
        return []
    channels = pref.channels or {}
    return [c for c in CHANNELS if bool(channels.get(c))]


def _in_quiet_hours(pref: NotificationPreference, now: datetime) -> bool:
    if not pref.quiet_start or not pref.quiet_end:
        return False
    try:
        start = time.fromisoformat(pref.quiet_start)
        end = time.fromisoformat(pref.quiet_end)
    except ValueError:
        return False
    current = now.time()
    if start <= end:
        return start <= current < end
    return current >= start or current < end


async def _daily_cap_reached(
    db: AsyncSession, child_ref: str | None, now: datetime
) -> bool:
    if not child_ref:
        return False
    settings = get_settings()
    since = now - timedelta(days=1)
    count = await db.scalar(
        select(func.count(NotificationDelivery.id)).where(
            NotificationDelivery.child_ref == child_ref,
            NotificationDelivery.created_at >= since,
            NotificationDelivery.status.in_(("queued", "sent")),
        )
    )
    return int(count or 0) >= settings.notification_max_per_child_per_day


async def _queue_for_preference(
    db: AsyncSession,
    *,
    pref: NotificationPreference,
    template: str,
    child_ref: str | None,
    now: datetime,
    payload_builder: Any,
    key_prefix: str,
    scheduled_for: datetime | None = None,
) -> int:
    """Queue the enabled channels for one preference. Returns rows added."""
    if _in_quiet_hours(pref, now):
        return 0
    if await _daily_cap_reached(db, child_ref, now):
        return 0
    payload = payload_builder(pref.locale)
    added = 0
    for channel in _enabled_channels(pref):
        row = await queue_delivery(
            db,
            channel=channel,
            template=template,
            subject_type=pref.subject_type,
            subject_id=pref.subject_id,
            payload=payload,
            idempotency_key=f"{key_prefix}:{pref.subject_id}:{channel}",
            child_ref=child_ref,
            scheduled_for=scheduled_for or now,
        )
        if row is not None:
            added += 1
    return added


async def schedule_due_reminders(
    db: AsyncSession, *, now: datetime | None = None
) -> int:
    """Queue re-screen reminders and stalled-referral nudges. Idempotent."""
    now = now or datetime.now(UTC)
    settings = get_settings()
    scheduled = 0

    children = (
        (
            await db.execute(
                select(ChildRecord).where(
                    ChildRecord.opt_in.is_(True),
                    ChildRecord.consent_given.is_(True),
                    ChildRecord.follow_up_due_at.is_not(None),
                    ChildRecord.follow_up_due_at <= now + timedelta(days=7),
                )
            )
        )
        .scalars()
        .all()
    )

    for child in children:
        due = _as_utc(child.follow_up_due_at) if child.follow_up_due_at else None
        if due is None:
            continue
        workers = (
            (await db.execute(select(Worker).where(Worker.area == child.village_ward)))
            .scalars()
            .all()
        )
        for worker in workers:
            pref = await get_preference(db, "worker", worker.id)
            if pref is None:
                continue
            send_at = max(now, due - timedelta(days=pref.reminder_lead_days))
            scheduled += await _queue_for_preference(
                db,
                pref=pref,
                template="rescreen_reminder",
                child_ref=child.pseudonymous_id or child.id,
                now=now,
                payload_builder=lambda locale, ref=child.pseudonymous_id or child.id: templates.build(
                    "rescreen_reminder",
                    locale=locale,
                    child_ref=ref,
                    app_url=settings.public_app_url,
                ),
                key_prefix=f"rescreen:{child.id}:{due.date().isoformat()}",
                scheduled_for=send_at,
            )

    cutoff = now - timedelta(days=3)
    referrals = (
        (
            await db.execute(
                select(Referral).where(
                    Referral.status.in_(("created", "sent")),
                    Referral.updated_at <= cutoff,
                )
            )
        )
        .scalars()
        .all()
    )
    for referral in referrals:
        pref = await get_preference(db, "worker", referral.from_worker_id)
        if pref is None:
            continue
        child_ref = referral.child_id
        scheduled += await _queue_for_preference(
            db,
            pref=pref,
            template="referral_nudge",
            child_ref=child_ref,
            now=now,
            payload_builder=lambda locale, ref=child_ref, status=referral.status: templates.build(
                "referral_nudge",
                locale=locale,
                child_ref=ref,
                status=status,
                app_url=settings.public_app_url,
            ),
            key_prefix=f"referral:{referral.id}:{referral.status}",
            scheduled_for=now,
        )

    return scheduled


async def queue_activity_tip_for_subject(
    db: AsyncSession,
    *,
    subject_type: str,
    subject_id: str | None,
    child_ref: str,
    activity: str | None = None,
    now: datetime | None = None,
) -> int:
    if not subject_id:
        return 0
    now = now or datetime.now(UTC)
    pref = await get_preference(db, subject_type, subject_id)
    if pref is None:
        return 0
    settings = get_settings()
    return await _queue_for_preference(
        db,
        pref=pref,
        template="activity_tip",
        child_ref=child_ref,
        now=now,
        payload_builder=lambda locale: templates.build(
            "activity_tip",
            locale=locale,
            child_ref=child_ref,
            activity=activity,
            app_url=settings.public_app_url,
        ),
        key_prefix=f"tip:{child_ref}:{now.date().isoformat()}",
    )


async def queue_activity_tip(
    db: AsyncSession,
    *,
    worker_id: str,
    child_ref: str,
    activity: str | None = None,
    now: datetime | None = None,
) -> int:
    return await queue_activity_tip_for_subject(
        db,
        subject_type="worker",
        subject_id=worker_id,
        child_ref=child_ref,
        activity=activity,
        now=now,
    )


async def _deliver_push(
    db: AsyncSession,
    row: NotificationDelivery,
    payload: dict[str, Any],
) -> SendResult:
    stmt = select(PushSubscription).where(PushSubscription.revoked_at.is_(None))
    if row.subject_type == "worker":
        stmt = stmt.where(PushSubscription.worker_id == row.subject_id)
    else:
        stmt = stmt.where(PushSubscription.user_id == row.subject_id)
    subscriptions = (await db.execute(stmt)).scalars().all()
    if not subscriptions:
        return SendResult(ok=False, error="no push subscription")

    settings = get_settings()
    sent = 0
    last_error = None
    for sub in subscriptions:
        result = await send_web_push(
            {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            payload,
            settings,
        )
        if result.ok:
            sent += 1
            sub.last_seen_at = datetime.now(UTC)
        else:
            last_error = result.error
    if sent:
        return SendResult(ok=True, provider_id=f"webpush:{sent}")
    return SendResult(ok=False, error=last_error or "push failed")


async def deliver_pending(
    db: AsyncSession,
    provider: NotificationProvider,
    *,
    limit: int = 50,
    now: datetime | None = None,
) -> dict[str, int]:
    now = now or datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(NotificationDelivery)
                .where(
                    NotificationDelivery.status == "queued",
                    NotificationDelivery.attempts < MAX_ATTEMPTS,
                    NotificationDelivery.scheduled_for <= now,
                )
                .order_by(NotificationDelivery.scheduled_for)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    counts = {"delivered": 0, "failed": 0, "suppressed": 0}
    for row in rows:
        pref = await get_preference(db, row.subject_type, row.subject_id)
        if row.channel not in _enabled_channels(pref):
            row.status = "suppressed"
            row.error = "channel disabled or consent missing"
            counts["suppressed"] += 1
            continue

        assert pref is not None
        payload = row.payload or {}
        body_key = CHANNEL_TEMPLATE_KEY.get(row.channel, "sms")
        body = str(payload.get(body_key) or payload.get("body") or "")
        result: SendResult

        if row.channel == "push":
            result = await _deliver_push(db, row, payload.get("push") or payload)
        elif row.channel == "whatsapp":
            recipient = pref.whatsapp_number or pref.phone
            if not recipient:
                row.status = "suppressed"
                row.error = "no WhatsApp number"
                counts["suppressed"] += 1
                continue
            result = await provider.send_whatsapp(recipient, body)
        elif row.channel == "sms":
            recipient = pref.phone
            if not recipient:
                row.status = "suppressed"
                row.error = "no phone number"
                counts["suppressed"] += 1
                continue
            result = await provider.send_sms(recipient, body)
        else:  # ivr
            recipient = pref.phone
            if not recipient:
                row.status = "suppressed"
                row.error = "no phone number"
                counts["suppressed"] += 1
                continue
            token = sign_token(
                {
                    "subject_type": row.subject_type,
                    "subject_id": row.subject_id,
                    "template": row.template,
                    "child_ref": row.child_ref,
                    "script": str(payload.get("ivr") or body),
                },
                secret=get_settings().jwt_secret,
            )
            url = (
                f"{get_settings().public_app_url.rstrip('/')}"
                f"/api/voice/twiml/outbound/{token}"
            )
            result = await provider.send_voice(recipient, url)

        row.attempts += 1
        if result.ok:
            row.status = "sent"
            row.sent_at = now
            row.provider_message_id = result.provider_id
            row.error = None
            counts["delivered"] += 1
        else:
            row.status = "failed" if row.attempts >= MAX_ATTEMPTS else "queued"
            row.error = result.error
            counts["failed"] += 1

    await db.flush()
    return counts


async def set_enabled(
    db: AsyncSession, subject_type: str, subject_id: str, enabled: bool
) -> None:
    pref = await get_preference(db, subject_type, subject_id)
    if pref is not None:
        pref.enabled = enabled


async def handle_inbound(
    db: AsyncSession,
    *,
    phone: str,
    text: str,
) -> dict[str, str]:
    """Menu-driven WhatsApp/SMS bot. Returns the reply and new state."""
    hashed = phone_hash(phone)
    pref = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.phone_hash == hashed
            )
        )
    ).scalar_one_or_none()

    command = (text or "").strip().upper()
    if command in {"STOP", "UNSUBSCRIBE", "9"}:
        if pref is not None:
            pref.enabled = False
        return {
            "reply": "You have been unsubscribed from Nirixon reminders. Reply START to resume.",
            "state": "stopped",
        }
    if command in {"START", "UNSTOP"}:
        if pref is not None:
            pref.enabled = True
        return {"reply": "Nirixon reminders are back on.", "state": "menu"}
    if pref is None:
        return {
            "reply": "This number is not registered for Nirixon reminders. Please contact your ASHA or Anganwadi worker.",
            "state": "unknown",
        }

    if command == "1":
        reply = "Your next re-screen reminder is scheduled. Reply 3 for a home activity, or 9 to stop."
    elif command == "2":
        reply = (
            "Your referral is being confirmed by your health worker. Reply 9 to stop."
        )
    elif command == "3":
        greeting = templates.build(
            "activity_tip",
            locale=pref.locale,
            child_ref="the child",
            app_url=get_settings().public_app_url,
        )
        reply = greeting["body"]
    elif command in {"4", "0"}:
        reply = templates.build("safety_helpline", locale=pref.locale)["body"]
    else:
        reply = (
            "Nirixon: 1 re-screen status, 2 referral status, 3 home activity tip, "
            "4 helplines, 9 stop."
        )

    conversation = (
        await db.execute(
            select(NotificationConversation).where(
                NotificationConversation.phone_hash == hashed
            )
        )
    ).scalar_one_or_none()
    if conversation is None:
        conversation = NotificationConversation(
            phone_hash=hashed, state="menu", context={}
        )
        db.add(conversation)
    conversation.state = "menu"
    conversation.context = {"last_command": command}
    conversation.expires_at = datetime.now(UTC) + timedelta(hours=24)
    await db.flush()
    return {"reply": reply, "state": "menu"}
