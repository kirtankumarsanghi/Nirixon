"""Module B engine/router singleton — load once at app startup."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.core.safety_floor import MIN_DOMAINS_COVERED_B, MIN_REAL_ANSWERS_B

from .engine_b import Engine
from .router_b import DomainRouter

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_ROUTER_PATH = (
    _BACKEND_ROOT / "ml" / "artifacts" / "module_b_router" / "router_b.joblib"
)
_DEFAULT_BANK_PATH = _BACKEND_ROOT / "data" / "module_b" / "question_bank_b.csv"
_DEFAULT_ACTS_PATH = _BACKEND_ROOT / "data" / "module_b" / "activities_b.csv"


class ModuleBService:
    """Holds the trained router + question bank for the life of the process."""

    def __init__(self) -> None:
        self._engine: Engine | None = None
        self._load_error: str | None = None

    @property
    def is_loaded(self) -> bool:
        return self._engine is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def engine(self) -> Engine:
        if self._engine is None:
            raise RuntimeError(self._load_error or "Module B engine not loaded")
        return self._engine

    def load(
        self,
        *,
        router_path: str | Path | None = None,
        bank_path: str | Path | None = None,
        acts_path: str | Path | None = None,
    ) -> None:
        """Load router + bank once. Raises on failure so lifespan can record it."""
        router_path = Path(router_path or _DEFAULT_ROUTER_PATH)
        bank_path = Path(bank_path or _DEFAULT_BANK_PATH)
        acts_path = Path(acts_path or _DEFAULT_ACTS_PATH)

        try:
            router = DomainRouter.load(str(router_path))
            from .engine_b import Bank

            bank = Bank(bank_path=str(bank_path), act_path=str(acts_path))
            self._engine = Engine(
                router=router,
                bank=bank,
                cfg={
                    "min_real_answers": MIN_REAL_ANSWERS_B,
                    "min_domains_covered": MIN_DOMAINS_COVERED_B,
                    "max_questions": 20,
                },
            )
            self._load_error = None
            logger.info(
                "Module B engine loaded (router=%s, items=%s)",
                router_path,
                len(bank.df),
            )
        except Exception as exc:
            self._engine = None
            self._load_error = str(exc)
            logger.exception("Module B engine load failed")
            raise

    def health(self) -> dict[str, Any]:
        if not self.is_loaded:
            return {"ok": False, "error": self._load_error, "items": 0}
        return {"ok": True, "items": len(self.engine.bank.df)}


module_b_service = ModuleBService()
