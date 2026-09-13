"""
Stage 3 — Session State

Plain, stateless data shape the entire adaptive loop operates on.
Not a database model — just a typed dict that travels in and out of
every core function. Stage 4's FastAPI endpoints will serialize/
deserialize this to/from JSON.

Design choices:
- `answers` maps item_id -> int (0/1/2), containing ONLY items the
  caregiver has actually answered. Imputed values live in a separate
  dict and are NEVER merged into `answers`.
- `mandatory_answered` tracks the two mandatory flags separately so the
  mandatory-first logic never has to scan `answers` for their presence.
- `question_cap` is carried on the session so the orchestrator can vary
  it per caregiver without a global config change. Allowed values: 10/15/20.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ALLOWED_CAPS = {10, 15, 20}
MANDATORY_IDS = ("regression_flag", "family_history_flag")


@dataclass
class ScreeningSession:
    child_id: str
    corrected_age_months: float
    question_cap: Literal[10, 15, 20]

    # item_id -> 0/1/2 — REAL caregiver answers only, never imputed values
    answers: dict[str, int] = field(default_factory=dict)

    # tracks which mandatory items are done; keys are always MANDATORY_IDS
    mandatory_answered: dict[str, int] = field(default_factory=dict)

    # set True once the orchestrator decides to stop asking
    completed: bool = False

    def __post_init__(self) -> None:
        if self.question_cap not in ALLOWED_CAPS:
            raise ValueError(
                f"question_cap must be one of {ALLOWED_CAPS}, got {self.question_cap}"
            )

    @property
    def real_answer_count(self) -> int:
        """Total real (non-imputed) answers including mandatory items."""
        return len(self.mandatory_answered) + len(self.answers)

    @property
    def adaptive_budget_used(self) -> int:
        """Non-mandatory answers used so far (counts against the adaptive budget)."""
        return len(self.answers)

    @property
    def adaptive_budget_remaining(self) -> int:
        """
        Adaptive budget = question_cap minus the 2 mandatory items.
        Mandatory items are always asked regardless of cap, so the real
        adaptive window is 8 (cap=10), 13 (cap=15), or 18 (cap=20).
        """
        mandatory_slots = len(MANDATORY_IDS)
        return max(0, self.question_cap - mandatory_slots - len(self.answers))

    def all_mandatory_answered(self) -> bool:
        return all(mid in self.mandatory_answered for mid in MANDATORY_IDS)

    def item_already_answered(self, item_id: str) -> bool:
        return item_id in self.answers or item_id in self.mandatory_answered

    # ------------------------------------------------------------------
    # Serialization — Stage 4 MUST persist these dicts to Redis/DB so
    # sessions survive across HTTP requests, worker restarts, and scale-out.
    # A plain module-level dict (the naïve shortcut) will silently break
    # under multiple Uvicorn workers. See Stage 4 implementation notes.
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialize to a JSON-safe dict for Stage 4 to persist."""
        return {
            "child_id": self.child_id,
            "corrected_age_months": self.corrected_age_months,
            "question_cap": self.question_cap,
            "answers": dict(self.answers),
            "mandatory_answered": dict(self.mandatory_answered),
            "completed": self.completed,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ScreeningSession:
        """Reconstruct from a persisted dict. Inverse of to_dict()."""
        session = cls(
            child_id=data["child_id"],
            corrected_age_months=data["corrected_age_months"],
            question_cap=data["question_cap"],
        )
        session.answers = dict(data.get("answers", {}))
        session.mandatory_answered = dict(data.get("mandatory_answered", {}))
        session.completed = data.get("completed", False)
        return session


@dataclass
class NextQuestion:
    item_id: str
    question_text: str
    domain: str
    question_number: int  # 1-indexed, for display ("Question 3 of up to 10")
    question_cap: int


@dataclass
class FinalResult:
    """Passed to Stage 4 to trigger the Stage 2 model prediction."""

    session: ScreeningSession
    real_answers: dict[str, int]  # mandatory + adaptive answers
    imputed_answers: dict[str, int]  # imputed-only, clearly separated
    stopping_reason: Literal["cap_reached", "budget_exhausted"]

    # If set, Stage 4 MUST substitute this for whatever the ML model returns.
    # None means use ML prediction as-is. Populated by safety_floor.py rules.
    deterministic_override: str | None = None

    # A list of warnings/caveats generated during the session (e.g., motor confounds)
    # that should be surfaced to the clinician alongside the final prediction.
    caveats: list[str] = field(default_factory=list)
