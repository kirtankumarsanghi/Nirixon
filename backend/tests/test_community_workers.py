"""Tests for Child/Caregiver profile intake and Community Worker matching service."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Force test settings before importing app
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import hash_password
from app.config import get_settings
from app.core.worker_service import get_suggested_workers, seed_community_workers
from app.db.models import User
from app.db.session import (
    Base,
    configure_engine,
    get_db,
    get_session_factory,
    reset_engine,
)
from app.db.session_repo import InMemorySessionRepo, set_session_repo
from app.main import create_app
from app.ml.inference_service import inference_service

ARTIFACTS = Path(__file__).resolve().parents[1] / "ml" / "artifacts"


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def api_env(tmp_path):
    db_path = tmp_path / "test.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    os.environ["ML_ARTIFACTS_DIR"] = str(ARTIFACTS)
    get_settings.cache_clear()
    reset_engine()
    engine = configure_engine(url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    repo = InMemorySessionRepo()
    set_session_repo(repo)

    factory = get_session_factory()
    async with factory() as db:
        user = User(
            id="parent-user-1",
            email="parent@example.com",
            hashed_password=hash_password("changeme"),
            role="parent",
        )
        db.add(user)
        await db.commit()
        await seed_community_workers(db)

    app = create_app(with_lifespan=False)

    async def _override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "parent@example.com", "password": "changeme"},
        )
        assert login_resp.status_code == 200, login_resp.text
        token = login_resp.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"
        yield client, factory, repo

    app.dependency_overrides.clear()
    reset_engine()


@pytest.mark.asyncio
async def test_worker_matching_engine_delhi(api_env):
    """Test get_suggested_workers returns Delhi DEIC & ASHA for Delhi pincode."""
    _, factory, _ = api_env
    async with factory() as db:
        workers = await get_suggested_workers(
            db,
            city="New Delhi",
            pincode="110016",
            state="Delhi",
            triage_tier="Tier 3: Direct Referral",
            final_classification="Refer",
        )
        assert len(workers) >= 2
        # Should include Safdarjung DEIC or Kalawati hospital
        roles = [w["role"] for w in workers]
        assert any(
            "DEIC" in r or "Pediatrician" in r or "Speech" in r for r in roles
        ), f"Expected specialized referral center in {roles}"


@pytest.mark.asyncio
async def test_worker_matching_engine_dynamic_synthesis(api_env):
    """Test get_suggested_workers synthesizes verified RBSK/ASHA/Anganwadi for an arbitrary city."""
    _, factory, _ = api_env
    async with factory() as db:
        workers = await get_suggested_workers(
            db,
            city="Ranchi",
            pincode="834001",
            state="Jharkhand",
            triage_tier="Tier 2: In-App Reflex Monitor",
            final_classification="Monitor",
        )
        assert len(workers) >= 2
        names = [w["name"] for w in workers]
        assert any("Ranchi" in n for n in names)
        assert any(
            w.get("phone") == "104" or "91" in w.get("phone", "") for w in workers
        )


@pytest.mark.asyncio
async def test_start_screen_with_profile_and_location(api_env):
    """Test starting screening with child name, phone, and location, verifying persistence."""
    client, factory, _ = api_env

    # Try to load inference service if artifacts exist
    inference_service.load(ARTIFACTS)

    payload = {
        "child_ref": "child-aarav-1",
        "corrected_age_months": 24.0,
        "question_cap": 10,
        "consent_given": True,
        "child_name": "Aarav Sharma",
        "parent_name": "Pooja Sharma",
        "parent_phone": "9876543210",
        "relationship_to_child": "Mother",
        "location_pincode": "110016",
        "location_city": "New Delhi",
        "location_state": "Delhi",
        "location_address": "Green Park Main, South Delhi",
    }
    resp = await client.post("/api/screen/start", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    session_id = data["session_id"]

    # Verify session state returns profile fields
    sess_resp = await client.get(f"/api/screen/{session_id}")
    assert sess_resp.status_code == 200
    sess_data = sess_resp.json()
    assert sess_data["child_name"] == "Aarav Sharma"
    assert sess_data["parent_name"] == "Pooja Sharma"
    assert sess_data["parent_phone"] == "9876543210"
    assert sess_data["relationship_to_child"] == "Mother"
    assert sess_data["location_city"] == "New Delhi"
    assert sess_data["location_pincode"] == "110016"

    # Test /workers endpoint returns suggestions for this session
    workers_resp = await client.get(f"/api/screen/{session_id}/workers")
    assert workers_resp.status_code == 200
    workers = workers_resp.json()
    assert len(workers) >= 1

    # Test contacting a worker
    first_worker_id = workers[0]["id"]
    contact_resp = await client.post(
        f"/api/screen/{session_id}/contact_worker",
        json={
            "worker_id": first_worker_id,
            "contact_method": "call",
            "notes": "Requesting 24-month developmental milestones check",
        },
    )
    assert contact_resp.status_code == 200
    cdata = contact_resp.json()
    assert cdata["status"] == "success"
    assert "contact_phone" in cdata
