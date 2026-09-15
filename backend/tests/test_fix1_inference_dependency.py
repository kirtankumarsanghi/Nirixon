"""
Fix 1 verification tests — _get_inference_for_session dependency.

Confirms that the correct InferenceService instance is returned based on
the session's module field, and that _get_inference_for_session is wired
as the dependency for /answer (not the broken plain-function default).
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("JWT_SECRET", "test-secret-at-least-32-bytes-long!!")
os.environ.setdefault("SESSION_REPO_BACKEND", "memory")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("SEED_USER_EMAIL", "parent@example.com")
os.environ.setdefault("SEED_USER_PASSWORD", "changeme")

from app.auth import hash_password  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.models import ScreeningSession as DbSession, User  # noqa: E402
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
    InferenceService,
    inference_service,
    inference_service_b,
)
from app.routers.screen import _get_inference_for_session  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def db_env(tmp_path):
    """Minimal DB setup without loading any ML artifacts."""
    db_path = tmp_path / "test_fix1.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
    reset_engine()
    engine = configure_engine(url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    repo = InMemorySessionRepo()
    set_session_repo(repo)

    session_factory = get_session_factory()

    async def override_get_db():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    # Create a parent user
    async with session_factory() as session:
        session.add(
            User(
                id="user-1",
                email="parent@example.com",
                hashed_password=hash_password("changeme"),
                role="parent",
            )
        )
        await session.commit()

    # Seed a Module A and a Module B session row directly
    async with session_factory() as session:
        session.add(
            DbSession(
                id="sess-module-a",
                child_ref="sess-module-a",
                parent_user_id="user-1",
                status="in_progress",
                corrected_age_months=24.0,
                age_bracket="24 months",
                question_cap=10,
                module="A",
                state_json={},
            )
        )
        session.add(
            DbSession(
                id="sess-module-b",
                child_ref="sess-module-b",
                parent_user_id="user-1",
                status="in_progress",
                corrected_age_months=84.0,
                age_bracket="Unknown",
                question_cap=10,
                module="B",
                state_json={},
            )
        )
        await session.commit()

    yield override_get_db, session_factory


@pytest.mark.asyncio
async def test_get_inference_for_session_returns_module_a_service(db_env):
    """Module A session → dependency must return inference_service (not _b)."""
    override_get_db, session_factory = db_env

    # Build a mock request context: db session + user object
    mock_user = MagicMock()
    mock_user.id = "user-1"

    async with session_factory() as db:
        result = await _get_inference_for_session(
            session_id="sess-module-a",
            user=mock_user,
            db=db,
        )

    assert result is inference_service, (
        f"Expected inference_service (Module A), got {result!r}. "
        "The dependency is returning the wrong service for Module A sessions."
    )
    assert result is not inference_service_b, (
        "Dependency returned inference_service_b for a Module A session — cross-module contamination."
    )


@pytest.mark.asyncio
async def test_get_inference_for_session_returns_module_b_service(db_env):
    """Module B session → dependency must return inference_service_b (not the A service)."""
    override_get_db, session_factory = db_env

    mock_user = MagicMock()
    mock_user.id = "user-1"

    async with session_factory() as db:
        result = await _get_inference_for_session(
            session_id="sess-module-b",
            user=mock_user,
            db=db,
        )

    assert result is inference_service_b, (
        f"Expected inference_service_b (Module B), got {result!r}. "
        "The dependency is returning the wrong service for Module B sessions — "
        "this is the cross-module model contamination bug."
    )
    assert result is not inference_service, (
        "Dependency returned inference_service (Module A) for a Module B session."
    )


@pytest.mark.asyncio
async def test_answer_endpoint_uses_correct_inference_dependency():
    """
    Confirm that the /answer endpoint's `inference` parameter is wired to
    _get_inference_for_session (the async dependency), not to the old broken
    _get_inference plain function.
    """
    import inspect
    from fastapi import Depends
    from app.routers.screen import submit_answer

    # Walk FastAPI's dependency tree to find what `inference` resolves to
    sig = inspect.signature(submit_answer)
    inference_param = sig.parameters.get("inference")
    assert inference_param is not None, "submit_answer has no 'inference' parameter"

    # Checking string representation because extracting metadata from Annotated can be finicky across Python versions
    annotation_str = str(inference_param.annotation)
    assert "_get_inference_for_session" in annotation_str, (
        f"/answer's inference dependency is {annotation_str!r}, "
        f"expected '_get_inference_for_session'. "
        f"The cross-module contamination bug is still present."
    )
