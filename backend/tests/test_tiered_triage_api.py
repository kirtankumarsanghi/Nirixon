"""Tests for Tiered Clinical Triage and Response Quality Guards integration."""
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
from app.core.triage_guard import (
    evaluate_live_tiered_triage,
    evaluate_response_guards,
)
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

    inference_service.load(ARTIFACTS)

    session_factory = get_session_factory()

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db

    async with session_factory() as session:
        session.add(
            User(
                email="parent@example.com",
                hashed_password=hash_password("changeme"),
                role="parent",
            )
        )
        await session.commit()

    yield app

    reset_engine()
    get_settings.cache_clear()


def test_triage_guard_units():
    # 1. Typical clean child (age 18m)
    typical_answers = {
        "GM01": 2,  # head control (2m)
        "GM02": 2,  # rolls (6m)
        "GM05": 2,  # walks alone (14m)
        "CM04": 2,  # 1-2 words (15m)
        "CM06": 0,  # 2-word phrases (24m - forward item)
    }
    flags, advisories = evaluate_response_guards(18.0, typical_answers)
    assert flags["acquiescence"] is False
    assert flags["inconsistency"] is False
    assert len(advisories) == 0

    # 2. Acquiescence distortion: parent marks 2 on milestones 6+ months ahead
    acquiescent_answers = {
        "GM01": 2,
        "GM06": 2,  # 30m milestone on an 18m child
        "CM06": 2,  # 24m milestone on an 18m child
        "CM07": 2,  # 36m milestone on an 18m child
    }
    flags_acq, advisories_acq = evaluate_response_guards(18.0, acquiescent_answers)
    assert flags_acq["acquiescence"] is True
    assert any("ceiling responses" in note for note in advisories_acq)

    # 3. Inconsistency violation: Guttman scale inversion
    inconsistent_answers = {
        "GM01": 0,  # 2m (fails)
        "GM05": 2,  # 14m (passes)
        "GM06": 2,  # 30m (passes)
        "FM01": 0,  # 4m (fails)
        "FM05": 2,  # 18m (passes)
    }
    flags_inc, advisories_inc = evaluate_response_guards(18.0, inconsistent_answers)
    assert flags_inc["inconsistency"] is True
    assert any("inverted milestone attainments" in note for note in advisories_inc)


def test_tiered_triage_allocation_units():
    # 1. Low risk -> Tier 1: Routine Pass
    tier_1, reflex_1, targets_1 = evaluate_live_tiered_triage(
        prob_refer=0.010,
        safety_override=False,
        domain_scores={"communication": 0.8, "gross_motor": 0.9},
    )
    assert tier_1 == "Tier 1: Routine Pass"
    assert reflex_1 is False

    # 2. Borderline risk (tau_monitor <= prob < tau_refer) -> Tier 2: Reflex-Branch
    tier_2, reflex_2, targets_2 = evaluate_live_tiered_triage(
        prob_refer=0.045,
        safety_override=False,
        domain_scores={"communication": 0.45, "gross_motor": 0.85},
    )
    assert tier_2 == "Tier 2: Reflex-Branch"
    assert reflex_2 is True
    assert "communication" in targets_2

    # 3. High risk (prob >= tau_refer) -> Tier 3: Direct Referral
    tier_3, reflex_3, targets_3 = evaluate_live_tiered_triage(
        prob_refer=0.250,
        safety_override=False,
        domain_scores={"communication": 0.2, "gross_motor": 0.2},
    )
    assert tier_3 == "Tier 3: Direct Referral"
    assert reflex_3 is False

    # 4. Safety override flag forces Tier 3
    tier_so, reflex_so, _ = evaluate_live_tiered_triage(
        prob_refer=0.005,
        safety_override=True,
    )
    assert tier_so == "Tier 3: Direct Referral"


@pytest.mark.asyncio
async def test_api_reflex_branch_endpoint(api_env):
    transport = ASGITransport(app=api_env)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Log in
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "parent@example.com", "password": "changeme"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Start a Module A screen (age 24m)
        start_resp = await client.post(
            "/api/screen/start",
            headers=headers,
            json={
                "corrected_age_months": 24.0,
                "question_cap": 10,
                "consent_given": True,
            },
        )
        assert start_resp.status_code == 200
        start_data = start_resp.json()
        session_id = start_data["session_id"]
        curr_q = start_data["question"]

        # Answer questions until session completes
        while curr_q is not None:
            ans_val = 1 if curr_q["response_type"] != "yes_no" else 0
            ans_resp = await client.post(
                f"/api/screen/{session_id}/answer",
                headers=headers,
                json={"item_id": curr_q["item_id"], "answer": ans_val},
            )
            assert ans_resp.status_code == 200
            ans_data = ans_resp.json()
            if ans_data["type"] == "complete":
                result = ans_data["result"]
                assert "triage_tier" in result
                assert result["triage_tier"] in (
                    "Tier 1: Routine Pass",
                    "Tier 2: Reflex-Branch",
                    "Tier 3: Direct Referral",
                )
                assert "guard_flags" in result
                assert "acquiescence" in result["guard_flags"]
                assert "inconsistency" in result["guard_flags"]
                break
            curr_q = ans_data.get("question")

        # Now test the reflex branch endpoint
        reflex_resp = await client.post(
            f"/api/screen/{session_id}/reflex_branch",
            headers=headers,
        )
        assert reflex_resp.status_code == 200
        reflex_data = reflex_resp.json()
        assert reflex_data["type"] == "intake_required"
        assert reflex_data["status"] == "in_progress"
        assert reflex_data["session_id"] != session_id
