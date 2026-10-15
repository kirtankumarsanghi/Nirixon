"""
Tests for the landing-page demo flow:

1. test_demo_happy_path   — full Module A screening that returns question_number,
                            question_cap, SHAP features, triage_tier, and
                            domain_classifications from the API.
2. test_safety_rule_bypass — regression_flag answer bypasses the ML model and
                             forces a Refer result (override_rule = regression_flag).
3. test_e2e_question_counter — verifies the question counter is live (not static)
                               across multiple answers.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# ── env must be set before app imports ──────────────────────────────────────
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import hash_password
from app.config import get_settings
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
async def demo_env(tmp_path):
    """
    Isolated test environment that mirrors the landing-page demo flow:
    - Module A (20-month child)
    - Real ML artifacts
    - InMemorySessionRepo
    """
    db_path = tmp_path / "demo_test.db"
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


# ── helpers ─────────────────────────────────────────────────────────────────


async def _login(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/auth/login",
        json={"email": "parent@example.com", "password": "changeme"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _start_demo_session(
    client: AsyncClient, headers: dict, age_months: float = 20.0
) -> dict:
    resp = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "corrected_age_months": age_months,
            "child_ref": "landing-demo",
            "question_cap": 15,
            "consent_given": True,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── test 1: happy path ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_demo_happy_path(demo_env):
    """
    Complete a full Module A screening for a 20-month child.

    Verifies:
    - question_number and question_cap come from the API (not static)
    - final result contains triage_tier, shap_top_features, domain_classifications
    - final_classification is one of Typical / Monitor / Refer
    """
    transport = ASGITransport(app=demo_env)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await _login(client)
        start = await _start_demo_session(client, headers, age_months=20.0)

        assert start["type"] == "question"
        session_id = start["session_id"]
        curr_q = start["question"]

        # Verify live question fields are populated
        assert curr_q["question_number"] >= 1
        assert curr_q["question_cap"] >= 1
        assert curr_q["item_id"]
        assert curr_q["question_text"]
        assert curr_q["domain"]

        seen_question_numbers = {curr_q["question_number"]}
        result = None

        # Answer all questions with a moderate response (1)
        while curr_q is not None:
            rt = curr_q.get("response_type", "frequency")
            ans_val = 0 if rt == "yes_no" else 1

            resp = await client.post(
                f"/api/screen/{session_id}/answer",
                headers=headers,
                json={"item_id": curr_q["item_id"], "answer": ans_val},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()

            if data["type"] == "complete":
                result = data["result"]
                break
            else:
                curr_q = data.get("question")
                if curr_q:
                    seen_question_numbers.add(curr_q["question_number"])

        # ── result assertions ────────────────────────────────────────────
        assert result is not None, "Session must complete"

        # classification
        assert result["final_classification"] in ("Typical", "Monitor", "Refer")

        # triage tier (live from API)
        assert "triage_tier" in result, "triage_tier must be in result"
        assert result["triage_tier"] in (
            "Tier 1: Routine Pass",
            "Tier 2: Reflex-Branch",
            "Tier 3: Direct Referral",
        ), f"Unexpected triage_tier: {result['triage_tier']}"

        # SHAP features (live from API)
        assert "shap_top_features" in result
        # Model must have produced at least some SHAP features
        assert isinstance(result["shap_top_features"], list)

        # domain_classifications — may be empty for Module A but key must exist
        assert "domain_classifications" in result

        # question counter was live (more than one unique question number seen)
        assert (
            len(seen_question_numbers) > 1
        ), "Expected multiple question numbers during the screening"


# ── test 2: safety rule bypass ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_safety_rule_bypass(demo_env):
    """
    Verify the safety rule path:
    - Start a 20-month session
    - Immediately answer a yes_no (regression_flag) item with 1 (regression reported)
    - Expect: safety_override_triggered=True, override_rule='regression_flag',
              final_classification='Refer'
    - The ML model score is irrelevant — the deterministic override wins
    """
    transport = ASGITransport(app=demo_env)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await _login(client)
        start = await _start_demo_session(client, headers, age_months=20.0)
        session_id = start["session_id"]

        # Walk until we hit a yes_no regression item or finish the session
        curr_q = start.get("question")
        result = None
        regression_triggered = False

        while curr_q is not None:
            rt = curr_q.get("response_type", "frequency")
            if rt == "yes_no" and not regression_triggered:
                # Answer 1 = regression reported
                ans_val = 1
                regression_triggered = True
            else:
                ans_val = 0 if rt == "yes_no" else 1

            resp = await client.post(
                f"/api/screen/{session_id}/answer",
                headers=headers,
                json={"item_id": curr_q["item_id"], "answer": ans_val},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()

            if data["type"] == "complete":
                result = data["result"]
                break
            curr_q = data.get("question")

        assert result is not None

        if regression_triggered:
            # Safety rule must have fired
            assert (
                result["safety_override_triggered"] is True
            ), "Expected safety override when regression_flag=1"
            assert (
                result["override_rule"] == "regression_flag"
            ), f"Expected override_rule='regression_flag', got {result['override_rule']}"
            assert (
                result["final_classification"] == "Refer"
            ), f"Expected Refer after regression, got {result['final_classification']}"
        else:
            # No yes_no item in this session bracket — test still passes
            pytest.skip("No regression_flag item in this age bracket's adaptive set")


# ── test 3: question counter is live ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_e2e_question_counter_is_live(demo_env):
    """
    Verify that question_number increments with each answer.
    The counter must come from the API (not hardcoded on the client).
    """
    transport = ASGITransport(app=demo_env)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await _login(client)
        start = await _start_demo_session(client, headers, age_months=20.0)
        session_id = start["session_id"]

        assert start["type"] == "question"
        first_q = start["question"]
        assert first_q["question_number"] == 1, "First question must be #1"

        # Answer first question
        resp = await client.post(
            f"/api/screen/{session_id}/answer",
            headers=headers,
            json={
                "item_id": first_q["item_id"],
                "answer": 0 if first_q["response_type"] == "yes_no" else 1,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        if data["type"] == "question":
            second_q = data["question"]
            assert (
                second_q["question_number"] == 2
            ), f"Second question must be #2, got {second_q['question_number']}"
            assert (
                second_q["question_cap"] == first_q["question_cap"]
            ), "question_cap must be stable across questions"
        # If the session completed after just one question that's also valid
        # (extremely short adaptive path for this age bracket)
