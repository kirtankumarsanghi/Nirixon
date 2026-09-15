"""
Stage 4 — Application settings.

CORS and session-repo choice are config-driven so production never inherits
dev defaults by accident.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Nirixon API"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = False

    # Database
    database_url: str = Field(
        default=f"sqlite+aiosqlite:///{_BACKEND_ROOT / 'nirixon_dev.db'}",
        alias="DATABASE_URL",
    )

    # JWT
    jwt_secret: str = Field(default="dev-only-change-me", alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=60 * 24, alias="JWT_EXPIRE_MINUTES")

    # CORS — comma-separated origins; never use "*" in production
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        alias="CORS_ORIGINS",
    )

    # Session repository: "memory" (InMemorySessionRepo) | "redis" (not yet)
    # IMPORTANT: InMemorySessionRepo is single-process / single-worker only.
    # Multi-worker or multi-instance deploys MUST wait for RedisSessionRepo.
    session_repo_backend: str = Field(default="memory", alias="SESSION_REPO_BACKEND")

    # Redis (reserved for RedisSessionRepo — not implemented in Stage 4)
    redis_url: str | None = Field(default=None, alias="REDIS_URL")

    # ML artifacts
    ml_artifacts_dir: str = Field(
        default=str(_BACKEND_ROOT / "ml" / "artifacts"),
        alias="ML_ARTIFACTS_DIR",
    )
    ml_artifacts_dir_b: str = Field(
        default=str(_BACKEND_ROOT / "ml" / "artifacts" / "module_b"),
        alias="ML_ARTIFACTS_DIR_B",
    )

    # Rate limiting
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=60, alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(
        default=60, alias="RATE_LIMIT_WINDOW_SECONDS"
    )

    # Seed user for local/dev login (no registration flow yet)
    seed_user_email: str = Field(default="parent@example.com", alias="SEED_USER_EMAIL")
    seed_user_password: str = Field(default="changeme", alias="SEED_USER_PASSWORD")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
