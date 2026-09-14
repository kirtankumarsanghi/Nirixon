"""
Stage 4 — API integration tests.

Uses an isolated SQLite DB, InMemorySessionRepo, and real ML artifacts
when present (artifact-load-once and model-missing cases use mocks).
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Force test settings before importing app modules that cache settings
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from sqlalchemy import select  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.models import RiskResult, User  # noqa: E402
from app.db.session import (  # noqa: E402
    Base,
    configure_engine,
    get_db,
    get_session_factory,
    reset_engine,
)
from app.db.session_repo import InMemorySessionRepo, set_session_repo  # noqa: E402
from app.main import create_app  # noqa: E402
from app.ml.inference_service import (  # noqa: E402
    FeatureColumnMismatchError,
    InferenceService,
    build_feature_vector,
    inference_service,
)

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

    # Load real artifacts once for most tests
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {
            "client": client,
            "app": app,
            "repo": repo,
            "session_factory": session_factory,
            "engine": engine,
        }

    app.dependency_overrides.clear()
    set_session_repo(None)
    await engine.dispose()
    reset_engine()


async def _login(client: AsyncClient) -> str:
    r = await client.post(
        "/api/auth/login",
        json={"email": "parent@example.com", "password": "changeme"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _run_full_session(client: AsyncClient, token: str, *, regression: int = 0):
    r = await client.post(
        "/api/screen/start",
        headers=_auth(token),
        json={
            "child_ref": "child-1",
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert r.status_code == 200, r.text
    action = r.json()
    session_id = action["session_id"]

    while action["type"] == "question":
        item_id = action["question"]["item_id"]
        if item_id == "regression_flag":
            answer = regression
        elif item_id in ("family_history_flag",):
            answer = 0
        else:
            answer = 1
        r = await client.post(
            f"/api/screen/{session_id}/answer",
            headers=_auth(token),
            json={"item_id": item_id, "answer": answer},
        )
        assert r.status_code == 200, r.text
        action = r.json()

    return session_id, action


@pytest.mark.asyncio
async def test_full_session_lifecycle(api_env):
    client = api_env["client"]
    token = await _login(client)
    session_id, action = await _run_full_session(client, token, regression=0)

    assert action["type"] == "complete"
    assert action["result"] is not None
    assert action["result"]["final_classification"] in ("Typical", "Monitor", "Refer")
    assert action["result"]["safety_override_triggered"] is False

    r = await client.get(f"/api/screen/{session_id}/result", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["final_classification"] == action["result"]["final_classification"]

    r = await client.get(f"/api/screen/{session_id}", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_regression_override_persisted(api_env):
    client = api_env["client"]
    factory = api_env["session_factory"]
    token = await _login(client)
    session_id, action = await _run_full_session(client, token, regression=1)

    assert action["type"] == "complete"
    result = action["result"]
    assert result["final_classification"] == "Refer"
    assert result["safety_override_triggered"] is True
    assert result["override_rule"] == "regression_flag"

    async with factory() as session:
        row = (
            await session.execute(
                select(RiskResult).where(RiskResult.session_id == session_id)
            )
        ).scalar_one()
        assert row.final_classification == "Refer"
        assert row.safety_override_triggered is True
        assert row.override_rule == "regression_flag"


@pytest.mark.asyncio
async def test_column_mismatch_raises_clear_error():
    svc = InferenceService()
    svc.load(ARTIFACTS)
    with pytest.raises(FeatureColumnMismatchError, match="missing|extra"):
        svc.validate_feature_vector({"not_a_real_column": 1})


@pytest.mark.asyncio
async def test_model_not_loaded_returns_503(api_env, tmp_path):
    client = api_env["client"]
    # Unload artifacts
    inference_service._clear()
    inference_service.load_error = "model not trained — run train.py"

    token = await _login(client)
    r = await client.post(
        "/api/screen/start",
        headers=_auth(token),
        json={
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert r.status_code == 503
    assert "model not trained" in r.json()["detail"]

    r = await client.post(
        "/api/predict",
        headers=_auth(token),
        json={"features": {"corrected_age_months": 24}},
    )
    assert r.status_code == 503

    # Restore for other tests that share process (autouse fixture reloads via api_env)
    inference_service.load(ARTIFACTS)


@pytest.mark.asyncio
async def test_concurrent_sessions_isolated(api_env):
    client = api_env["client"]
    token = await _login(client)
    repo: InMemorySessionRepo = api_env["repo"]

    r1 = await client.post(
        "/api/screen/start",
        headers=_auth(token),
        json={
            "child_ref": "a",
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    r2 = await client.post(
        "/api/screen/start",
        headers=_auth(token),
        json={
            "child_ref": "b",
            "corrected_age_months": 36.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert r1.status_code == 200 and r2.status_code == 200
    s1, s2 = r1.json(), r2.json()
    id1, id2 = s1["session_id"], s2["session_id"]
    assert id1 != id2

    # Answer first question on each with different values
    q1 = s1["question"]["item_id"]
    q2 = s2["question"]["item_id"]
    a1 = await client.post(
        f"/api/screen/{id1}/answer",
        headers=_auth(token),
        json={"item_id": q1, "answer": 1},
    )
    a2 = await client.post(
        f"/api/screen/{id2}/answer",
        headers=_auth(token),
        json={"item_id": q2, "answer": 0},
    )
    assert a1.status_code == 200 and a2.status_code == 200

    core1 = repo.get(id1)
    core2 = repo.get(id2)
    assert core1 is not None and core2 is not None
    assert core1.corrected_age_months == 24.0
    assert core2.corrected_age_months == 36.0
    # Different answer values must not cross-contaminate
    if q1 in core1.mandatory_answered:
        assert core1.mandatory_answered[q1] == 1
    if q2 in core2.mandatory_answered:
        assert core2.mandatory_answered[q2] == 0


@pytest.mark.asyncio
async def test_artifacts_loaded_once_across_requests(api_env):
    client = api_env["client"]
    token = await _login(client)

    with patch.object(
        InferenceService, "load", wraps=inference_service.load
    ) as load_mock:
        # load should not be called again per-request
        for _ in range(3):
            r = await client.post(
                "/api/predict",
                headers=_auth(token),
                json={
                    "features": {
                        c: (24.0 if c == "corrected_age_months" else 0)
                        for c in inference_service.feature_columns
                    }
                },
            )
            assert r.status_code == 200, r.text
        assert load_mock.call_count == 0


@pytest.mark.asyncio
async def test_health_reports_components(api_env):
    client = api_env["client"]
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "db" in body and "artifacts" in body and "redis" in body


def test_build_feature_vector_prefers_real_answers():
    cols = ["corrected_age_months", "regression_flag", "GM01"]
    vec = build_feature_vector(
        corrected_age_months=18.0,
        real_answers={"regression_flag": 1, "GM01": 2},
        imputed_answers={"GM01": 0},
        feature_columns=cols,
    )
    assert vec["GM01"] == 2
    assert vec["regression_flag"] == 1
    assert vec["corrected_age_months"] == 18.0


def test_inmemory_repo_thread_safety_no_cross_talk():
    repo = InMemorySessionRepo()
    from app.core.session import ScreeningSession

    errors: list[str] = []

    def worker(sid: str, age: float):
        try:
            s = ScreeningSession(
                child_id=sid, corrected_age_months=age, question_cap=10
            )
            repo.save(sid, s)
            for i in range(50):
                cur = repo.get(sid)
                assert cur is not None
                cur.answers[f"X{i}"] = i % 3
                repo.save(sid, cur)
            final = repo.get(sid)
            assert final is not None
            assert final.corrected_age_months == age
            assert all(k.startswith("X") for k in final.answers)
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))

    t1 = threading.Thread(target=worker, args=("s1", 12.0))
    t2 = threading.Thread(target=worker, args=("s2", 48.0))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    assert not errors, errors
    assert repo.get("s1").corrected_age_months == 12.0
    assert repo.get("s2").corrected_age_months == 48.0


# ---------------------------------------------------------------------------
# Fix 1 — 429 must be a real JSON response under ASGI, not an unhandled exc
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def rate_limit_env(tmp_path):
    """Like api_env but with rate limiting enabled (2 requests/10s window)."""
    db_path = tmp_path / "test_rl.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    os.environ["ML_ARTIFACTS_DIR"] = str(ARTIFACTS)
    os.environ["RATE_LIMIT_ENABLED"] = "true"
    os.environ["RATE_LIMIT_REQUESTS"] = "2"
    os.environ["RATE_LIMIT_WINDOW_SECONDS"] = "60"
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

    from app.middleware.rate_limit import RateLimitMiddleware

    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db
    # Mount middleware with tight limit for test
    app.add_middleware(RateLimitMiddleware, requests=2, window=60)

    async with session_factory() as session:
        session.add(
            User(
                email="parent@example.com",
                hashed_password=hash_password("changeme"),
                role="parent",
            )
        )
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "session_factory": session_factory, "engine": engine}

    app.dependency_overrides.clear()
    set_session_repo(None)
    os.environ["RATE_LIMIT_ENABLED"] = "false"
    get_settings.cache_clear()
    await engine.dispose()
    reset_engine()


@pytest.mark.asyncio
async def test_rate_limit_returns_429_json_body(rate_limit_env):
    """
    Regression for Fix 1: raising HTTPException from BaseHTTPMiddleware.dispatch
    can surface as a 500 instead of a 429 under real ASGI handling.
    After the fix, the third request must return exactly 429 with a JSON body.
    """
    client = rate_limit_env["client"]
    token = await _login(client)
    headers = _auth(token)

    payload = {
        "corrected_age_months": 24.0,
        "question_cap": 10,
        "consent_given": True,
    }
    # First two requests should succeed (under the 2-request window)
    r1 = await client.post("/api/screen/start", headers=headers, json=payload)
    r2 = await client.post("/api/screen/start", headers=headers, json=payload)
    assert r1.status_code == 200, f"Expected 200, got {r1.status_code}: {r1.text}"
    assert r2.status_code == 200, f"Expected 200, got {r2.status_code}: {r2.text}"

    # Third request must hit the limit
    r3 = await client.post("/api/screen/start", headers=headers, json=payload)
    assert r3.status_code == 429, f"Expected 429, got {r3.status_code}: {r3.text}"
    body = r3.json()
    assert "detail" in body, "429 response must have a JSON body with 'detail' key"


@pytest.mark.asyncio
async def test_predict_column_mismatch_returns_500(api_env):
    """
    Fix 2: /api/predict must return 500 (not 400) on FeatureColumnMismatchError.
    A column mismatch is a server-side schema bug, not a correctable client error.
    """
    client = api_env["client"]
    token = await _login(client)

    r = await client.post(
        "/api/predict",
        headers=_auth(token),
        json={"features": {"not_a_real_column": 1}},
    )
    assert r.status_code == 500, (
        f"Expected 500 for column mismatch on /api/predict, got {r.status_code}: {r.text}"
    )


# ---------------------------------------------------------------------------
# Fix 3 — Audit log rows for login and override events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_writes_audit_log(api_env):
    """auth.login AuditLog row must be written on every successful login."""
    from app.db.models import AuditLog

    factory = api_env["session_factory"]
    client = api_env["client"]

    await _login(client)

    async with factory() as session:
        rows = (
            await session.execute(
                select(AuditLog).where(AuditLog.action == "auth.login")
            )
        ).scalars().all()
    assert len(rows) >= 1, "Expected at least one auth.login AuditLog row after login"
    assert rows[0].actor_id is not None


@pytest.mark.asyncio
async def test_override_writes_dedicated_audit_log(api_env):
    """
    Fix 3b: a deterministic override must produce its own override.applied
    AuditLog row — distinct from the screen.complete row — so clinical
    reviewers can query overrides directly without parsing detail blobs.
    """
    from app.db.models import AuditLog

    client = api_env["client"]
    factory = api_env["session_factory"]
    token = await _login(client)

    session_id, action = await _run_full_session(client, token, regression=1)
    assert action["result"]["safety_override_triggered"] is True

    async with factory() as session:
        override_rows = (
            await session.execute(
                select(AuditLog).where(
                    AuditLog.action == "override.applied",
                    AuditLog.target_id == session_id,
                )
            )
        ).scalars().all()
        complete_rows = (
            await session.execute(
                select(AuditLog).where(
                    AuditLog.action == "screen.complete",
                    AuditLog.target_id == session_id,
                )
            )
        ).scalars().all()

    assert len(override_rows) == 1, (
        "Expected exactly one override.applied AuditLog row for the overridden session"
    )
    assert override_rows[0].detail == "regression_flag"
    assert len(complete_rows) == 1, "screen.complete row must still exist as a separate entry"
