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
    debug: bool = Field(default=False, alias="NIRIXON_DEBUG")

    # Database
    database_url: str = Field(
        default=f"sqlite+aiosqlite:///{_BACKEND_ROOT / 'nirixon_dev.db'}",
        alias="DATABASE_URL",
    )

    # JWT
    jwt_secret: str = Field(
        default="dev-only-change-me-nirixon-jwt-secret-key-32b", alias="JWT_SECRET"
    )
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=60 * 24, alias="JWT_EXPIRE_MINUTES")

    # CORS — comma-separated origins; never use "*" in production
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175",
        alias="CORS_ORIGINS",
    )

    # Session repository: "memory" (InMemorySessionRepo) | "redis" (RedisSessionRepo)
    session_repo_backend: str = Field(default="memory", alias="SESSION_REPO_BACKEND")

    # Redis connection URL (e.g., "redis://localhost:6379/0" or "redis://redis:6379/0")
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    session_redis_prefix: str = Field(
        default="nirixon:session:", alias="SESSION_REDIS_PREFIX"
    )
    session_ttl_seconds: int = Field(
        default=86400, alias="SESSION_TTL_SECONDS"
    )

    # ML artifacts
    ml_artifacts_dir: str = Field(
        default=str(_BACKEND_ROOT / "ml" / "artifacts"),
        alias="ML_ARTIFACTS_DIR",
    )
    ml_artifacts_dir_b: str = Field(
        default=str(_BACKEND_ROOT / "ml" / "artifacts" / "module_b"),
        alias="ML_ARTIFACTS_DIR_B",
    )
    module_b_data_dir: str = Field(
        default=str(_BACKEND_ROOT / "data" / "module_b"),
        alias="MODULE_B_DATA_DIR",
    )
    module_b_artifact_dir: str = Field(
        default=str(_BACKEND_ROOT / "ml" / "artifacts" / "module_b_router"),
        alias="MODULE_B_ARTIFACT_DIR",
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

    # Growth sync tracking (opt-in; can be disabled entirely by configuration)
    growth_sync_enabled: bool = Field(default=True, alias="GROWTH_SYNC_ENABLED")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def module_b_bank_path(self) -> Path:
        return Path(self.module_b_data_dir) / "question_bank_b.csv"

    @property
    def module_b_acts_path(self) -> Path:
        return Path(self.module_b_data_dir) / "activities_b.csv"

    @property
    def module_b_router_path(self) -> Path:
        return Path(self.module_b_artifact_dir) / "router_b.joblib"


@lru_cache
def get_settings() -> Settings:
    return Settings()
