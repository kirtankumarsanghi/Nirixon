"""
Stage 4 — Session repository for orchestrator ScreeningSession state.

InMemorySessionRepo is for local/dev single-worker only. Multi-worker or
multi-instance deploys are a deploy blocker until RedisSessionRepo lands.
The repository only persists/retrieves — orchestrator.py owns transitions.
"""

from __future__ import annotations

import copy
import threading
from abc import ABC, abstractmethod

from app.core.session import ScreeningSession


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


# Module singleton used by DI unless overridden in tests
_session_repo: SessionRepository | None = None


def get_session_repo() -> SessionRepository:
    global _session_repo
    if _session_repo is None:
        from app.config import get_settings

        settings = get_settings()
        if settings.session_repo_backend == "redis":
            raise NotImplementedError(
                "RedisSessionRepo is not implemented yet. "
                "Set SESSION_REPO_BACKEND=memory for single-worker local use."
            )
        _session_repo = InMemorySessionRepo()
    return _session_repo


def set_session_repo(repo: SessionRepository | None) -> None:
    """Test/helper hook to swap the process-wide repository."""
    global _session_repo
    _session_repo = repo
