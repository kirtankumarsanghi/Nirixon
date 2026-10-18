"""Acceptance and unit tests for Live Elicitation (Module A) and Exploratory Touch Tasks."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import hash_password
from app.config import get_settings
from app.core.live_elicitation import (
    get_all_live_tasks,
    get_tasks_for_bracket,
)
from app.core.touch_config import (
    PROVISIONAL_TOUCH_CONFIG,
    compare_touch_metric_to_reference,
)
from app.db.models import Answer, User
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
async def env(tmp_path):
    db_path = tmp_path / "live_touch_test.db"
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

    session_factory = get_session_factory()
    async with session_factory() as session:
        user = User(
            id="parent-u1",
            email="parent@example.com",
            hashed_password=hash_password("changeme"),
            role="parent",
        )
        session.add(user)
        await session.commit()

    if not inference_service.is_loaded:
        inference_service.load(ARTIFACTS)

    app = create_app(with_lifespan=False)

    async def _override_db():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post(
            "/api/auth/login",
            json={"email": "parent@example.com", "password": "changeme"},
        )
        assert login_res.status_code == 200, login_res.text
        token = login_res.json()["access_token"]
        client.headers["Authorization"] = f"Bearer {token}"
        yield client, repo, session_factory


# ---------------------------------------------------------------------------
# Unit Tests: Live Elicitation Data & Touch Config
# ---------------------------------------------------------------------------


class TestLiveElicitationData:
    def test_task_definitions_exist_with_observations_and_three_options(self):
        tasks = get_all_live_tasks()
        assert len(tasks) >= 10, "Expected rich live elicitation task catalog"
        for t in tasks:
            assert t.task_id.startswith("live_")
            assert t.milestone_item_id, "Each task must link to a milestone item"
            assert t.instruction, "Task must have caregiver instructions"
            assert t.what_to_observe, "Task must have clear observation cues"
            assert len(t.response_options) == 3, "Task must have 3 response options"
            values = [opt.value for opt in t.response_options]
            assert set(values) == {0, 1, 2}, "Options must map to 0, 1, 2 milestone score values"

    def test_tasks_filtered_by_bracket(self):
        tasks_2mo = get_tasks_for_bracket("2mo")
        assert len(tasks_2mo) > 0
        assert any(t.milestone_item_id == "GM01" for t in tasks_2mo)


class TestTouchConfig:
    def test_touch_config_is_marked_provisional(self):
        assert PROVISIONAL_TOUCH_CONFIG["status"] == "provisional"
        assert "provisional" in PROVISIONAL_TOUCH_CONFIG["version"].lower()
        assert "not clinically validated" in PROVISIONAL_TOUCH_CONFIG["disclaimer"].lower()
        assert PROVISIONAL_TOUCH_CONFIG["min_age_months"] == 24.0

    def test_touch_comparison_helper(self):
        comp = compare_touch_metric_to_reference(
            task_type="tap",
            metric_name="reaction_time_ms",
            value=700.0,
            age_months=28.0,
        )
        assert comp["status"] == "typical"
        assert comp["provisional"] is True
        assert comp["bracket"] == "24-36m"


# ---------------------------------------------------------------------------
# Acceptance Check 1: Observed answer stored separately from recall & affects item
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observed_answer_stored_separately_and_affects_same_item(env):
    client, repo, session_factory = env

    # Start a 6-month screening session
    start_res = await client.post(
        "/api/screen/start",
        json={
            "corrected_age_months": 6.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert start_res.status_code == 200, start_res.text
    session_id = start_res.json()["session_id"]

    # 1. Answer mandatory items first
    await client.post(
        f"/api/screen/{session_id}/answer",
        json={"item_id": "regression_flag", "answer": 0, "source": "recall"},
    )
    await client.post(
        f"/api/screen/{session_id}/answer",
        json={"item_id": "family_history_flag", "answer": 0, "source": "recall"},
    )

    # 2. Check live tasks applicable for this session
    live_tasks_res = await client.get(f"/api/screen/{session_id}/live-tasks")
    assert live_tasks_res.status_code == 200
    live_tasks = live_tasks_res.json()["tasks"]
    assert len(live_tasks) > 0

    # Pick a milestone item from the live tasks (e.g. GM03 for 6mo)
    target_task = next(t for t in live_tasks if t["milestone_item_id"] == "GM03")
    assert target_task["already_answered"] is False

    # 3. Submit an observed answer using LiveTaskCard
    obs_res = await client.post(
        f"/api/screen/{session_id}/answer",
        json={
            "item_id": "GM03",
            "answer": 2,
            "source": "observed",
        },
    )
    assert obs_res.status_code == 200

    # 4. Submit a recall answer for a different item
    rec_res = await client.post(
        f"/api/screen/{session_id}/answer",
        json={
            "item_id": "FM02",
            "answer": 1,
            "source": "recall",
        },
    )
    assert rec_res.status_code == 200

    # Verify session in memory
    core = repo.get(session_id)
    assert core is not None

    # Both feed the core answers dictionary
    assert core.answers["GM03"] == 2
    assert core.answers["FM02"] == 1

    # But sources are stored separately!
    assert core.answer_sources["GM03"] == "observed"
    assert core.answer_sources["FM02"] == "recall"
    assert core.observed_answers["GM03"] == 2
    assert "GM03" not in core.recall_answers
    assert core.recall_answers["FM02"] == 1
    assert "FM02" not in core.observed_answers

    # Verify that the observed answer affects the item:
    # item_already_answered is now True for GM03, preventing the engine from asking it again by recall
    assert core.item_already_answered("GM03") is True

    # Attempting to submit GM03 again raises 400 "Item already answered"
    dup_res = await client.post(
        f"/api/screen/{session_id}/answer",
        json={"item_id": "GM03", "answer": 1, "source": "recall"},
    )
    assert dup_res.status_code == 400
    assert "already answered" in dup_res.json()["detail"].lower()

    # Verify database persistence: Answer rows have source column recorded
    async with session_factory() as db:
        from sqlalchemy import select
        db_answers = (
            await db.execute(select(Answer).where(Answer.session_id == session_id))
        ).scalars().all()
        by_item = {a.item_id: a for a in db_answers}

        assert by_item["GM03"].response_value == 2
        assert by_item["GM03"].source == "observed"

        assert by_item["FM02"].response_value == 1
        assert by_item["FM02"].source == "recall"


# ---------------------------------------------------------------------------
# Acceptance Check 2: Result is identical with and without touch data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_result_is_identical_with_and_without_touch_data(env):
    client, repo, _ = env

    async def run_session_answers(touch_submission: dict | None = None):
        # Age >= 24 months so touch tasks are eligible
        start = await client.post(
            "/api/screen/start",
            json={
                "corrected_age_months": 30.0,
                "question_cap": 10,
                "consent_given": True,
            },
        )
        assert start.status_code == 200
        sid = start.json()["session_id"]

        # If touch submission provided, submit it
        if touch_submission:
            touch_res = await client.post(
                f"/api/screen/{sid}/touch-telemetry",
                json=touch_submission,
            )
            assert touch_res.status_code == 200, touch_res.text
            assert touch_res.json()["status"] == "received"
            assert "exploratory" in touch_res.json()["exploratory_notice"].lower()

        # Step through questions until complete
        curr_action = start.json()
        while curr_action.get("type") == "question":
            q = curr_action["question"]
            item_id = q["item_id"]
            # Answer 0 for mandatory flags, 2 for all milestone questions
            val = 0 if item_id in ("regression_flag", "family_history_flag") else 2
            ans_res = await client.post(
                f"/api/screen/{sid}/answer",
                json={"item_id": item_id, "answer": val, "source": "recall"},
            )
            assert ans_res.status_code == 200, ans_res.text
            curr_action = ans_res.json()

        assert curr_action.get("type") == "complete"
        return curr_action["result"]

    # 1. Run Session 1 without any touch data
    result_without_touch = await run_session_answers(touch_submission=None)

    # 2. Run Session 2 with exploratory touch micro-task telemetry
    touch_payload = {
        "age_months": 30.0,
        "tasks": [
            {
                "task_type": "tap",
                "reaction_time_ms": 680.0,
                "spatial_error_px": 12.5,
            },
            {
                "task_type": "trace",
                "reaction_time_ms": 720.0,
                "path_accuracy_pct": 79.5,
                "jitter_px": 9.2,
                "completion_time_ms": 3200.0,
            },
            {
                "task_type": "drag",
                "reaction_time_ms": 590.0,
                "path_accuracy_pct": 84.0,
                "jitter_px": 11.0,
            },
        ],
    }
    result_with_touch = await run_session_answers(touch_submission=touch_payload)

    # 3. VERIFY IDENTICAL CLINICAL OUTCOMES
    assert result_without_touch["final_classification"] == result_with_touch["final_classification"]
    assert result_without_touch["ml_classification"] == result_with_touch["ml_classification"]
    assert result_without_touch["ml_score"] == pytest.approx(result_with_touch["ml_score"], abs=1e-5)
    assert result_without_touch["probabilities"] == pytest.approx(result_with_touch["probabilities"], abs=1e-5)
    assert result_without_touch["safety_override_triggered"] == result_with_touch["safety_override_triggered"]
    assert result_without_touch["override_rule"] == result_with_touch["override_rule"]
    assert result_without_touch["triage_tier"] == result_with_touch["triage_tier"]

    # Touch data is attached for clinician view only with exploratory notice
    assert len(result_with_touch["touch_telemetry"]) == 3
    assert result_with_touch["touch_telemetry_notice"] == "Exploratory, not used in the result."


# ---------------------------------------------------------------------------
# Additional Edge & Privacy Guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_touch_tasks_rejected_under_24_months(env):
    client, _, _ = env

    start = await client.post(
        "/api/screen/start",
        json={
            "corrected_age_months": 18.0,  # under 24 months
            "question_cap": 10,
            "consent_given": True,
        },
    )
    sid = start.json()["session_id"]

    res = await client.post(
        f"/api/screen/{sid}/touch-telemetry",
        json={
            "age_months": 24.0,  # body age doesn't override session age
            "tasks": [{"task_type": "tap", "reaction_time_ms": 500.0}],
        },
    )
    assert res.status_code == 400
    assert "24 months and older" in res.json()["detail"]


@pytest.mark.asyncio
async def test_touch_config_endpoint(env):
    client, _, _ = env
    res = await client.get("/api/screen/touch-config")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "provisional"
    assert "brackets" in body
    assert "24-36m" in body["brackets"]
