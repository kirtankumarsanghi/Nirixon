"""API tests for the separate EPDS wellbeing module."""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.auth import create_access_token
from app.db.models import User
from app.db.session import Base, get_db
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest_asyncio.fixture
async def maternal_env():
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

    async with session_factory() as session:
        user = User(email="wellbeing@example.com", hashed_password="x", role="parent")
        session.add(user)
        await session.commit()
        user_id = user.id

    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db
    token = create_access_token(subject=user_id, role="parent")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, token
    await engine.dispose()


@pytest.mark.asyncio
async def test_questions_and_scoring(maternal_env):
    client, token = maternal_env
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/maternal/questions")
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["questions"]) == 10
    assert payload["review_status"] == "pending"

    answers = [{"item_id": f"epds_{index}", "value": 0} for index in range(1, 11)]
    res = await client.post(
        "/api/maternal/score",
        json={"answers": answers, "consent_given": True},
        headers=headers,
    )
    assert res.status_code == 200
    result = res.json()
    assert result["total_score"] == 0
    assert result["classification"] == "Typical"
    assert result["safety_flag"] is False

    history = await client.get("/api/maternal/history", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1


@pytest.mark.asyncio
async def test_self_harm_item_is_urgent(maternal_env):
    client, token = maternal_env
    headers = {"Authorization": f"Bearer {token}"}
    answers = [{"item_id": f"epds_{index}", "value": 0} for index in range(1, 10)]
    answers.append({"item_id": "epds_10", "value": 1})

    res = await client.post(
        "/api/maternal/score",
        json={"answers": answers, "consent_given": True},
        headers=headers,
    )
    assert res.status_code == 200
    result = res.json()
    assert result["safety_flag"] is True
    assert result["classification"] == "Refer"
    assert any("14416" in line["number"] for line in result["helplines"])


@pytest.mark.asyncio
async def test_consent_is_required(maternal_env):
    client, token = maternal_env
    headers = {"Authorization": f"Bearer {token}"}
    answers = [{"item_id": f"epds_{index}", "value": 0} for index in range(1, 11)]
    res = await client.post(
        "/api/maternal/score",
        json={"answers": answers, "consent_given": False},
        headers=headers,
    )
    assert res.status_code == 422
