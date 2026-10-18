"""
Stage 4 — FastAPI application entrypoint.

Loads ML artifacts once at startup via lifespan. Does NOT import stub_api.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from app.auth import hash_password
from app.config import get_settings
from app.db.models import User, Worker
from app.db.session import get_engine, get_session_factory, init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.ml.inference_service import inference_service, inference_service_b
from app.core.find_help.router import router as find_help_router
from app.routers import (
    audio,
    auth,
    evidence,
    growth,
    help,
    predict,
    referrals,
    sandbox,
    screen,
    share,
)

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

        # Seed clinician user for clinician sandbox / what-if simulations
        result_clinician = await session.execute(
            select(User).where(User.email == "clinician@example.com")
        )
        if result_clinician.scalar_one_or_none() is None:
            session.add(
                User(
                    email="clinician@example.com",
                    hashed_password=hash_password("changeme"),
                    role="internal",
                )
            )
            await session.commit()
            logger.info("Seeded clinician user clinician@example.com")

        # Seed CHW user & worker profile (Ward 12)
        res_chw = await session.execute(select(User).where(User.email == "chw@example.com"))
        if res_chw.scalar_one_or_none() is None:
            chw_user = User(
                email="chw@example.com",
                hashed_password=hash_password("changeme"),
                role="chw",
            )
            session.add(chw_user)
            await session.flush()
            session.add(
                Worker(
                    user_id=chw_user.id,
                    name="Sunita Devi (ASHA)",
                    role="chw",
                    area="Ward 12",
                    phone="9876500001",
                )
            )
            await session.commit()
            logger.info("Seeded CHW user chw@example.com for Ward 12")

        # Seed Supervisor user & worker profile (Ward 12)
        res_sup = await session.execute(select(User).where(User.email == "supervisor@example.com"))
        if res_sup.scalar_one_or_none() is None:
            sup_user = User(
                email="supervisor@example.com",
                hashed_password=hash_password("changeme"),
                role="supervisor",
            )
            session.add(sup_user)
            await session.flush()
            session.add(
                Worker(
                    user_id=sup_user.id,
                    name="Rekha Sharma (Supervisor)",
                    role="supervisor",
                    area="Ward 12",
                    phone="9876500002",
                )
            )
            await session.commit()
            logger.info("Seeded Supervisor user supervisor@example.com")

        # Seed second CHW in another area (Ward 15) for testing area isolation
        res_chw15 = await session.execute(select(User).where(User.email == "chw_ward15@example.com"))
        if res_chw15.scalar_one_or_none() is None:
            chw15_user = User(
                email="chw_ward15@example.com",
                hashed_password=hash_password("changeme"),
                role="chw",
            )
            session.add(chw15_user)
            await session.flush()
            session.add(
                Worker(
                    user_id=chw15_user.id,
                    name="Anjali Kumari (ASHA)",
                    role="chw",
                    area="Ward 15",
                    phone="9876500003",
                )
            )
            await session.commit()
            logger.info("Seeded CHW user chw_ward15@example.com for Ward 15")

        # Load help centres from data file if empty
        try:
            from app.core.help_service import ensure_help_centres_loaded

            await ensure_help_centres_loaded(session)
        except Exception:
            logger.exception("Failed to load help centres data at startup")


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
    except Exception as exc:
        logger.exception("DB init failed")
        _health["db_ok"] = False
        _health["db_error"] = str(exc)

    try:
        await _seed_user()
    except Exception:
        logger.exception("Seed user failed")

    # ML artifacts — load once; no mock fallback
    try:
        inference_service.load(settings.ml_artifacts_dir)
        _health["artifacts_loaded"] = True
        _health["artifacts_error"] = None
    except Exception as exc:  # noqa: BLE001
        logger.error("ML artifact load failed (Module A): %s", exc)
        _health["artifacts_loaded"] = False
        _health["artifacts_error"] = str(exc)
        # App still starts so /health can report failure; predict/screen return 503

    # Module B artifacts — non-fatal if not yet trained
    try:
        inference_service_b.load(settings.ml_artifacts_dir_b)
        _health["artifacts_b_loaded"] = True
        _health["artifacts_b_error"] = None
        logger.info("Module B artifacts loaded from %s", settings.ml_artifacts_dir_b)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Module B artifacts not loaded (run train.py --module B to enable): %s", exc
        )
        _health["artifacts_b_loaded"] = False
        _health["artifacts_b_error"] = str(exc)

    # Module B NLP + adaptive engine service (DomainRouter + Bank)
    try:
        from app.core.module_b.service import module_b_service

        module_b_service.load(
            router_path=settings.module_b_router_path,
            bank_path=settings.module_b_bank_path,
            acts_path=settings.module_b_acts_path,
        )
        _health["module_b_engine_loaded"] = True
        _health["module_b_engine_error"] = None
        logger.info("Module B engine loaded successfully")
    except Exception as exc:  # noqa: BLE001
        logger.error("Module B engine load failed: %s", exc)
        _health["module_b_engine_loaded"] = False
        _health["module_b_engine_error"] = str(exc)

    if settings.session_repo_backend == "redis" or settings.redis_url:
        redis_target = settings.redis_url or "redis://localhost:6379/0"
        try:
            import redis

            r = redis.Redis.from_url(
                redis_target, socket_timeout=2.0, socket_connect_timeout=2.0
            )
            ping_ok = bool(r.ping())
            _health["redis_ok"] = ping_ok
            _health["redis_error"] = None
            r.close()
            logger.info("Redis health check passed for %s (ping=%s)", redis_target, ping_ok)
        except Exception as exc:  # noqa: BLE001
            _health["redis_ok"] = False
            _health["redis_error"] = str(exc)
            logger.warning("Redis health check failed for %s: %s", redis_target, exc)
    else:
        _health["redis_ok"] = None
        _health["redis_error"] = None

    if settings.session_repo_backend == "redis":
        logger.info(
            "SESSION_REPO_BACKEND=redis — RedisSessionRepo active. "
            "Multi-worker Uvicorn clustering and multi-replica horizontal scaling enabled."
        )
    else:
        logger.warning(
            "SESSION_REPO_BACKEND=memory — InMemorySessionRepo is a "
            "single-process/single-worker constraint. Set SESSION_REPO_BACKEND=redis "
            "with REDIS_URL for multi-worker production deployments."
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
    app.include_router(growth.router)
    app.include_router(predict.router)
    app.include_router(sandbox.router)
    app.include_router(share.router)
    app.include_router(help.router)
    app.include_router(referrals.router)
    app.include_router(audio.router)
    app.include_router(evidence.router)
    # Public, read-only facility reference data (its own SQLite, no patient data).
    app.include_router(find_help_router)

    static_audio_dir = Path(__file__).resolve().parent.parent / "static" / "audio"
    if static_audio_dir.exists():
        app.mount("/audio", StaticFiles(directory=str(static_audio_dir)), name="audio")

    @app.get("/health")
    async def health():
        current_settings = get_settings()
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
                "module_a": {
                    "ok": inference_service.is_loaded,
                    "error": _health.get("artifacts_error"),
                },
                "module_b": {
                    "ok": inference_service_b.is_loaded,
                    "error": _health.get("artifacts_b_error"),
                    "note": (
                        None
                        if inference_service_b.is_loaded
                        else "Run 'python train.py --module B' to enable Module B screening"
                    ),
                },
                "module_b_engine": {
                    "ok": _health.get("module_b_engine_loaded", False),
                    "error": _health.get("module_b_engine_error"),
                },
            },
            "redis": {
                "configured": (
                    current_settings.redis_url is not None
                    or current_settings.session_repo_backend == "redis"
                ),
                "ok": _health.get("redis_ok"),
                "error": _health.get("redis_error"),
                "note": (
                    "RedisSessionRepo active for distributed multi-worker sessions"
                    if current_settings.session_repo_backend == "redis"
                    else "InMemorySessionRepo is active (single-worker only)"
                ),
            },
            "session_repo": current_settings.session_repo_backend,
        }

    @app.get("/live")
    async def live():
        """Basic liveness — process is up, independent of DB/artifacts."""
        return {"status": "alive"}

    return app


app = create_app()
