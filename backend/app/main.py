"""
Stage 4 — FastAPI application entrypoint.

Loads ML artifacts once at startup via lifespan. Does NOT import stub_api.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.auth import hash_password
from app.config import get_settings
from app.db.models import User
from app.db.session import get_engine, get_session_factory, init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.ml.inference_service import inference_service
from app.routers import auth, predict, sandbox, screen, share

logger = logging.getLogger(__name__)

_health: dict[str, Any] = {
    "artifacts_loaded": False,
    "artifacts_error": None,
    "db_ok": False,
    "redis_ok": None,  # None = not configured
}


async def _seed_user() -> None:
    settings = get_settings()
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(User).where(User.email == settings.seed_user_email)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(
                User(
                    email=settings.seed_user_email,
                    hashed_password=hash_password(settings.seed_user_password),
                    role="parent",
                )
            )
            await session.commit()
            logger.info("Seeded parent user %s", settings.seed_user_email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(level=logging.INFO)

    # DB
    try:
        await init_db()
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        _health["db_ok"] = True
    except Exception as exc:  # noqa: BLE001
        logger.exception("DB init failed")
        _health["db_ok"] = False
        _health["db_error"] = str(exc)

    try:
        await _seed_user()
    except Exception:  # noqa: BLE001
        logger.exception("Seed user failed")

    # ML artifacts — load once; no mock fallback
    try:
        inference_service.load(settings.ml_artifacts_dir)
        _health["artifacts_loaded"] = True
        _health["artifacts_error"] = None
    except Exception as exc:  # noqa: BLE001
        logger.error("ML artifact load failed: %s", exc)
        _health["artifacts_loaded"] = False
        _health["artifacts_error"] = str(exc)
        # App still starts so /health can report failure; predict/screen return 503

    if settings.redis_url:
        _health["redis_ok"] = False  # RedisSessionRepo not implemented
        logger.warning(
            "REDIS_URL is set but RedisSessionRepo is not implemented yet. "
            "SESSION_REPO_BACKEND=memory is single-worker only."
        )
    else:
        _health["redis_ok"] = None

    if settings.session_repo_backend == "memory":
        logger.warning(
            "SESSION_REPO_BACKEND=memory — InMemorySessionRepo is a "
            "single-process/single-worker constraint. Do not run multiple "
            "Uvicorn workers or replicas until RedisSessionRepo lands."
        )

    yield

    engine = get_engine()
    await engine.dispose()


def create_app(*, with_lifespan: bool = True) -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan if with_lifespan else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware)

    app.include_router(auth.router)
    app.include_router(screen.router)
    app.include_router(predict.router)
    app.include_router(sandbox.router)
    app.include_router(share.router)

    @app.get("/health")
    async def health():
        db_ok = False
        try:
            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception as exc:  # noqa: BLE001
            _health["db_error"] = str(exc)

        _health["db_ok"] = db_ok
        _health["artifacts_loaded"] = inference_service.is_loaded
        if not inference_service.is_loaded:
            _health["artifacts_error"] = (
                inference_service.load_error or "model not trained — run train.py"
            )

        status = "ok" if db_ok and inference_service.is_loaded else "degraded"
        return {
            "status": status,
            "db": {"ok": db_ok, "error": _health.get("db_error")},
            "artifacts": {
                "ok": inference_service.is_loaded,
                "error": _health.get("artifacts_error"),
            },
            "redis": {
                "configured": settings.redis_url is not None,
                "ok": _health.get("redis_ok"),
                "note": (
                    "RedisSessionRepo not implemented; "
                    "InMemorySessionRepo is single-worker only"
                ),
            },
            "session_repo": settings.session_repo_backend,
        }

    @app.get("/live")
    async def live():
        """Basic liveness — process is up, independent of DB/artifacts."""
        return {"status": "alive"}

    return app


app = create_app()
