"""Notification outbox, preferences, scheduling, bot and IVR tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from app.auth import create_access_token
from app.core.notifications.ivr import sign_token, verify_token
from app.core.notifications.providers import OutboxProvider
from app.core.notifications.service import (
    deliver_pending,
    handle_inbound,
    phone_hash,
    queue_activity_tip,
    schedule_due_reminders,
)
from app.core.notifications.templates import build
from app.db.models import (
    ChildRecord,
    NotificationDelivery,
    NotificationPreference,
    PushSubscription,
    User,
    Worker,
)
from app.db.session import Base, get_db
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest_asyncio.fixture
async def notify_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    yield override_get_db, session_factory
    await engine.dispose()


async def _seed_user_worker(session_factory):
    async with session_factory() as session:
        user = User(
            email="chw-notify@example.com",
            hashed_password="x",
            role="chw",
        )
        session.add(user)
        await session.flush()
        worker = Worker(
            name="Notify Worker", role="chw", area="Ward 12", user_id=user.id
        )
        session.add(worker)
        await session.commit()
        return user, worker


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe(notify_db):
    override_get_db, session_factory = notify_db
    user, _ = await _seed_user_worker(session_factory)
    token = create_access_token(subject=user.id, role="chw")
    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        body = {
            "endpoint": "https://push.example/abc",
            "keys": {"p256dh": "pkey", "auth": "authkey"},
            "role": "chw",
        }
        r = await client.post(
            "/api/notifications/subscribe", json=body, headers=_auth(token)
        )
        assert r.status_code == 204

        async with session_factory() as session:
            sub = (
                await session.execute(
                    select(PushSubscription).where(
                        PushSubscription.endpoint == body["endpoint"]
                    )
                )
            ).scalar_one()
            assert sub.revoked_at is None
            assert sub.worker_id is not None

        r = await client.post(
            "/api/notifications/unsubscribe",
            json={"endpoint": body["endpoint"]},
            headers=_auth(token),
        )
        assert r.status_code == 204

        async with session_factory() as session:
            sub = (
                await session.execute(
                    select(PushSubscription).where(
                        PushSubscription.endpoint == body["endpoint"]
                    )
                )
            ).scalar_one()
            assert sub.revoked_at is not None


@pytest.mark.asyncio
async def test_preferences_require_phone_and_record_consent(notify_db):
    override_get_db, session_factory = notify_db
    user, _ = await _seed_user_worker(session_factory)
    token = create_access_token(subject=user.id, role="chw")
    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        invalid = {
            "channels": {"whatsapp": True, "sms": False, "ivr": False, "push": False},
            "enabled": True,
            "consent_given": True,
        }
        r = await client.put(
            "/api/notifications/preferences", json=invalid, headers=_auth(token)
        )
        assert r.status_code == 422

        valid = {
            **invalid,
            "phone": "+919800000001",
            "reminder_lead_days": 2,
        }
        r = await client.put(
            "/api/notifications/preferences", json=valid, headers=_auth(token)
        )
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert data["consent_recorded_at"] is not None
        assert data["channels"]["whatsapp"] is True


@pytest.mark.asyncio
async def test_scheduler_and_outbox_are_idempotent(notify_db):
    _, session_factory = notify_db
    user, worker = await _seed_user_worker(session_factory)
    async with session_factory() as session:
        session.add(
            NotificationPreference(
                subject_type="worker",
                subject_id=worker.id,
                channels={"sms": True, "push": False, "whatsapp": False, "ivr": False},
                phone="+919800000002",
                phone_hash=phone_hash("+919800000002"),
                enabled=True,
                consent_recorded_at=datetime.now(UTC),
            )
        )
        child = ChildRecord(
            pseudonymous_id="child-demo-1",
            age_bracket="24-36m",
            village_ward="Ward 12",
            current_tier="Tier 2: Reflex-Branch",
            follow_up_due_at=datetime.now(UTC) - timedelta(days=1),
            opt_in=True,
            consent_given=True,
        )
        session.add(child)
        await session.commit()

    async with session_factory() as session:
        first = await schedule_due_reminders(session)
        await session.commit()
        assert first >= 1

        counts = await deliver_pending(session, OutboxProvider())
        await session.commit()
        assert counts["delivered"] >= 1

        second = await schedule_due_reminders(session)
        await session.commit()
        assert second == 0  # idempotency key + daily cap

        rows = (await session.execute(select(NotificationDelivery))).scalars().all()
        assert rows
        assert all(row.child_ref == "child-demo-1" for row in rows)


@pytest.mark.asyncio
async def test_activity_tip_and_bot_opt_out(notify_db):
    _, session_factory = notify_db
    _user, worker = await _seed_user_worker(session_factory)
    phone = "+919800000003"
    async with session_factory() as session:
        session.add(
            NotificationPreference(
                subject_type="worker",
                subject_id=worker.id,
                channels={"sms": True, "push": False, "whatsapp": False, "ivr": False},
                phone=phone,
                phone_hash=phone_hash(phone),
                enabled=True,
                consent_recorded_at=datetime.now(UTC),
            )
        )
        await session.commit()

    async with session_factory() as session:
        queued = await queue_activity_tip(
            session,
            worker_id=worker.id,
            child_ref="child-demo-2",
            activity="shared reading",
        )
        await session.commit()
        assert queued == 1

        reply = await handle_inbound(session, phone=phone, text="9")
        await session.commit()
        assert "unsubscribed" in reply["reply"].lower()
        pref = (
            await session.execute(
                select(NotificationPreference).where(
                    NotificationPreference.subject_id == worker.id
                )
            )
        ).scalar_one()
        assert pref.enabled is False


def test_ivr_token_roundtrip_and_expiry():
    payload = {"subject_id": "w1", "template": "rescreen_reminder"}
    token = sign_token(payload, secret="secret", ttl_seconds=60)
    decoded = verify_token(token, secret="secret")
    assert decoded is not None
    assert decoded["subject_id"] == "w1"

    assert verify_token(token, secret="wrong") is None

    expired = sign_token(payload, secret="secret", ttl_seconds=-1)
    assert verify_token(expired, secret="secret") is None


def test_templates_contain_no_pii():
    msg = build(
        "rescreen_reminder",
        locale="en",
        child_ref="child-abc",
        app_url="https://app.example",
    )
    joined = " ".join(str(v) for v in msg.values())
    assert "child-abc" in joined
    assert "@" not in joined
    assert "+91" not in joined
