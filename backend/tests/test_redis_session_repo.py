"""
Unit and integration tests for RedisSessionRepo.

Tests:
1. SessionRepository abstract interface adherence.
2. Full CRUD round-trip fidelity with all ScreeningSession fields (Module A, Module B,
   telemetry, teacher answers, caregiver metadata).
3. Configurable namespace prefixing and TTL expiration.
4. Multi-worker Uvicorn clustering simulation: concurrent workers sharing the same
   Redis storage with instant cross-worker cache invalidation.
5. Deletion & cascading cache invalidation across replicas.
6. Corrupted payload resilience and ping health check.
7. Dependency injection behavior in get_session_repo() and /health endpoint.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from app.config import Settings
from app.core.session import ScreeningSession
from app.db.session_repo import (
    InMemorySessionRepo,
    RedisSessionRepo,
    SessionRepository,
    get_session_repo,
    set_session_repo,
)
from fastapi.testclient import TestClient


class FakeRedisStorage:
    """
    In-memory mock replicating the redis-py Redis client interface for deterministic testing
    without requiring an external daemon running during unit tests.
    """

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.ping_response: bool = True

    def get(self, name: str) -> str | None:
        return self.data.get(name)

    def set(self, name: str, value: str, ex: int | None = None) -> bool:
        self.data[name] = str(value)
        if ex is not None:
            self.ttls[name] = ex
        return True

    def delete(self, *names: str) -> int:
        deleted = 0
        for name in names:
            if name in self.data:
                del self.data[name]
                self.ttls.pop(name, None)
                deleted += 1
        return deleted

    def keys(self, pattern: str = "*") -> list[str]:
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            return [k for k in self.data if k.startswith(prefix)]
        return [k for k in self.data if k == pattern]

    def ping(self) -> bool:
        if not self.ping_response:
            raise ConnectionError("Simulated Redis connection failure")
        return True

    def close(self) -> None:
        pass


@pytest.fixture
def fake_redis() -> FakeRedisStorage:
    return FakeRedisStorage()


@pytest.fixture
def sample_session() -> ScreeningSession:
    sess = ScreeningSession(
        child_id="child-test-99",
        corrected_age_months=36.0,
        question_cap=15,
        age_bracket="36-48m",
        model_name="xgb_bracket_36_48m",
        module="A",
        child_name="Aarav Sharma",
        parent_name="Pooja Sharma",
        parent_phone="9876543210",
        location_pincode="110029",
        location_city="New Delhi",
        location_state="Delhi",
    )
    sess.record_answer("GM_01", 2, source="recall")
    sess.record_answer("FM_02", 1, source="observed")
    sess.mandatory_answered["regression_flag"] = 0
    sess.touch_telemetry = [{"task": "circle_trace", "jitter": 0.04, "latency_ms": 320}]
    return sess


def test_redis_session_repo_interface(fake_redis: FakeRedisStorage) -> None:
    repo = RedisSessionRepo(client=fake_redis)
    assert isinstance(repo, SessionRepository)


def test_redis_session_repo_save_and_get(
    fake_redis: FakeRedisStorage, sample_session: ScreeningSession
) -> None:
    repo = RedisSessionRepo(
        prefix="nirixon:test:",
        ttl_seconds=3600,
        client=fake_redis,
    )

    repo.save("sess-1", sample_session)

    # Verify Redis key and TTL formatting
    assert "nirixon:test:sess-1" in fake_redis.data
    assert fake_redis.ttls["nirixon:test:sess-1"] == 3600

    # Retrieve and verify round-trip fidelity
    retrieved = repo.get("sess-1")
    assert retrieved is not None
    assert retrieved.child_id == "child-test-99"
    assert retrieved.corrected_age_months == 36.0
    assert retrieved.age_bracket == "36-48m"
    assert retrieved.question_cap == 15
    assert retrieved.answers == {"GM_01": 2, "FM_02": 1}
    assert retrieved.observed_answers == {"FM_02": 1}
    assert retrieved.recall_answers == {"GM_01": 2}
    assert retrieved.mandatory_answered == {"regression_flag": 0}
    assert retrieved.child_name == "Aarav Sharma"
    assert retrieved.location_pincode == "110029"
    assert len(retrieved.touch_telemetry) == 1
    assert retrieved.touch_telemetry[0]["jitter"] == 0.04


def test_redis_session_repo_get_nonexistent(fake_redis: FakeRedisStorage) -> None:
    repo = RedisSessionRepo(client=fake_redis)
    assert repo.get("non-existent-session-id") is None


def test_redis_session_repo_delete(
    fake_redis: FakeRedisStorage, sample_session: ScreeningSession
) -> None:
    repo = RedisSessionRepo(client=fake_redis)
    repo.save("sess-del", sample_session)
    assert repo.get("sess-del") is not None

    repo.delete("sess-del")
    assert repo.get("sess-del") is None
    assert "nirixon:session:sess-del" not in fake_redis.data


def test_redis_session_repo_multi_worker_clustering(
    fake_redis: FakeRedisStorage, sample_session: ScreeningSession
) -> None:
    """
    Simulates two separate Uvicorn worker processes (Worker 1 and Worker 2)
    accessing the same distributed Redis storage.
    """
    worker_1_repo = RedisSessionRepo(client=fake_redis)
    worker_2_repo = RedisSessionRepo(client=fake_redis)

    # 1. Worker 1 initializes and saves session
    worker_1_repo.save("cluster-sess-1", sample_session)

    # 2. Worker 2 reads the session created by Worker 1
    session_at_worker_2 = worker_2_repo.get("cluster-sess-1")
    assert session_at_worker_2 is not None
    assert session_at_worker_2.answers["GM_01"] == 2

    # 3. Worker 2 records an answer and saves back to Redis
    session_at_worker_2.record_answer("COG_03", 0, source="recall")
    worker_2_repo.save("cluster-sess-1", session_at_worker_2)

    # 4. Worker 1 reads the session — immediate cache invalidation and fresh state
    updated_at_worker_1 = worker_1_repo.get("cluster-sess-1")
    assert updated_at_worker_1 is not None
    assert updated_at_worker_1.answers["COG_03"] == 0
    assert "COG_03" in updated_at_worker_1.recall_answers

    # 5. Worker 1 deletes the session (e.g., privacy erasure)
    worker_1_repo.delete("cluster-sess-1")

    # 6. Worker 2 immediately sees the deletion
    assert worker_2_repo.get("cluster-sess-1") is None


def test_redis_session_repo_clear(
    fake_redis: FakeRedisStorage, sample_session: ScreeningSession
) -> None:
    repo = RedisSessionRepo(prefix="nirixon:session:", client=fake_redis)
    repo.save("sess-1", sample_session)
    repo.save("sess-2", sample_session)

    # Add an unrelated key outside this prefix
    fake_redis.data["unrelated:key"] = "keep_me"

    repo.clear()

    assert repo.get("sess-1") is None
    assert repo.get("sess-2") is None
    assert "unrelated:key" in fake_redis.data


def test_redis_session_repo_corrupted_json_resilience(
    fake_redis: FakeRedisStorage,
) -> None:
    repo = RedisSessionRepo(prefix="nirixon:session:", client=fake_redis)
    # Inject bad JSON
    fake_redis.data["nirixon:session:corrupt-sess"] = "{not valid json at all"

    # Should handle gracefully and return None instead of crashing
    assert repo.get("corrupt-sess") is None


def test_redis_session_repo_ping(fake_redis: FakeRedisStorage) -> None:
    repo = RedisSessionRepo(client=fake_redis)
    assert repo.ping() is True

    fake_redis.ping_response = False
    assert repo.ping() is False


def test_get_session_repo_factory_redis() -> None:
    set_session_repo(None)
    custom_settings = Settings(
        SESSION_REPO_BACKEND="redis",
        REDIS_URL="redis://localhost:6379/1",
        SESSION_REDIS_PREFIX="custom:prefix:",
        SESSION_TTL_SECONDS=7200,
    )

    with patch("app.config.get_settings", return_value=custom_settings):
        with patch("redis.Redis.from_url") as mock_from_url:
            mock_client = MagicMock()
            mock_from_url.return_value = mock_client

            repo = get_session_repo()
            assert isinstance(repo, RedisSessionRepo)
            assert repo.prefix == "custom:prefix:"
            assert repo.ttl_seconds == 7200
            mock_from_url.assert_called_once_with(
                "redis://localhost:6379/1",
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
            )

    set_session_repo(None)


def test_get_session_repo_factory_memory() -> None:
    set_session_repo(None)
    custom_settings = Settings(
        SESSION_REPO_BACKEND="memory",
    )

    with patch("app.config.get_settings", return_value=custom_settings):
        repo = get_session_repo()
        assert isinstance(repo, InMemorySessionRepo)

    set_session_repo(None)


def test_health_endpoint_redis_reporting() -> None:
    from app.main import create_app

    test_app = create_app(with_lifespan=False)
    client = TestClient(test_app)

    with patch("app.main.get_settings") as mock_settings:
        mock_settings.return_value = Settings(
            SESSION_REPO_BACKEND="redis",
            REDIS_URL="redis://redis:6379/0",
        )
        with patch.dict("app.main._health", {"redis_ok": True, "redis_error": None}):
            resp = client.get("/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["session_repo"] == "redis"
            assert data["redis"]["configured"] is True
            assert data["redis"]["ok"] is True
            assert "RedisSessionRepo active" in data["redis"]["note"]
