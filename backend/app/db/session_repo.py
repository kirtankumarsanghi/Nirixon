"""
Session repository for orchestrator ScreeningSession state.

Supports:
1. InMemorySessionRepo: for local/dev single-worker only.
2. RedisSessionRepo: distributed session store for multi-worker Uvicorn
   clustering and multi-replica horizontal scale-out.
"""

from __future__ import annotations

import copy
import json
import logging
import threading
from abc import ABC, abstractmethod
from typing import Any

from app.core.session import ScreeningSession

logger = logging.getLogger(__name__)


class SessionRepository(ABC):
    @abstractmethod
    def get(self, session_id: str) -> ScreeningSession | None: ...

    @abstractmethod
    def save(self, session_id: str, session: ScreeningSession) -> None: ...

    @abstractmethod
    def delete(self, session_id: str) -> None: ...


class InMemorySessionRepo(SessionRepository):
    """
    Process-local store. NOT safe across Uvicorn workers or replicas.

    Each save stores a deep-copied to_dict() snapshot so callers cannot
    mutate shared state through a returned reference.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._store: dict[str, dict] = {}

    def get(self, session_id: str) -> ScreeningSession | None:
        with self._lock:
            data = self._store.get(session_id)
            if data is None:
                return None
            return ScreeningSession.from_dict(copy.deepcopy(data))

    def save(self, session_id: str, session: ScreeningSession) -> None:
        with self._lock:
            self._store[session_id] = copy.deepcopy(session.to_dict())

    def delete(self, session_id: str) -> None:
        with self._lock:
            self._store.pop(session_id, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


class RedisSessionRepo(SessionRepository):
    """
    Distributed session repository backed by Redis.
    Safe across multiple Uvicorn workers and container replicas.

    Features:
    - Thread-safe connection pooling via redis-py.
    - Serializes sessions to JSON snapshots via ScreeningSession.to_dict().
    - Deserializes via ScreeningSession.from_dict(), completely isolated from worker memory.
    - Automatic TTL (Time-To-Live) enforcement (default 86400s / 24h).
    - Namespace key prefixing (default 'nirixon:session:').
    - Multi-worker persistent cache invalidation: updates and deletions are immediately
      visible to all Uvicorn worker processes and replicas.
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        prefix: str = "nirixon:session:",
        ttl_seconds: int = 86400,
        client: Any | None = None,
    ) -> None:
        self.redis_url = redis_url
        self.prefix = prefix
        self.ttl_seconds = ttl_seconds
        if client is not None:
            self._client = client
        else:
            import redis

            self._client = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
            )

    def _key(self, session_id: str) -> str:
        return f"{self.prefix}{session_id}"

    def get(self, session_id: str) -> ScreeningSession | None:
        key = self._key(session_id)
        try:
            raw = self._client.get(key)
        except Exception as exc:
            logger.error("RedisSessionRepo.get failed for %s: %s", session_id, exc)
            raise
        if raw is None:
            return None
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            data = json.loads(raw)
            return ScreeningSession.from_dict(data)
        except Exception as exc:
            logger.error(
                "Failed to deserialize session %s from Redis: %s", session_id, exc
            )
            return None

    def save(self, session_id: str, session: ScreeningSession) -> None:
        key = self._key(session_id)
        try:
            payload = json.dumps(session.to_dict())
            if self.ttl_seconds and self.ttl_seconds > 0:
                self._client.set(key, payload, ex=self.ttl_seconds)
            else:
                self._client.set(key, payload)
        except Exception as exc:
            logger.error("RedisSessionRepo.save failed for %s: %s", session_id, exc)
            raise

    def delete(self, session_id: str) -> None:
        key = self._key(session_id)
        try:
            self._client.delete(key)
        except Exception as exc:
            logger.error("RedisSessionRepo.delete failed for %s: %s", session_id, exc)
            raise

    def clear(self) -> None:
        """Deletes all session keys matching the prefix."""
        try:
            pattern = f"{self.prefix}*"
            keys = self._client.keys(pattern)
            if keys:
                self._client.delete(*keys)
        except Exception as exc:
            logger.error("RedisSessionRepo.clear failed: %s", exc)
            raise

    def ping(self) -> bool:
        """Checks connection health with Redis."""
        try:
            return bool(self._client.ping())
        except Exception:
            return False

    def close(self) -> None:
        """Closes the Redis client connection pool."""
        try:
            self._client.close()
        except Exception:
            pass


# Module singleton used by DI unless overridden in tests
_session_repo: SessionRepository | None = None


def get_session_repo() -> SessionRepository:
    global _session_repo
    if _session_repo is None:
        from app.config import get_settings

        settings = get_settings()
        if settings.session_repo_backend == "redis":
            redis_url = settings.redis_url or "redis://localhost:6379/0"
            _session_repo = RedisSessionRepo(
                redis_url=redis_url,
                prefix=settings.session_redis_prefix,
                ttl_seconds=settings.session_ttl_seconds,
            )
        else:
            _session_repo = InMemorySessionRepo()
    return _session_repo


def set_session_repo(repo: SessionRepository | None) -> None:
    """Test/helper hook to swap the process-wide repository."""
    global _session_repo
    _session_repo = repo
