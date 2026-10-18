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
- `module` distinguishes Module A (ages 0–5) from Module B (ages 5–12).
  Adaptive engine, safety floor, and orchestrator dispatch on this field.
- `detected_domains` is populated by the NLP domain router (Module B only)
  and used to filter the item pool in adaptive_tree.py.
- `teacher_answers` stores the school-context item subset for the
  cross-context consistency score (Module B only).
- `microtask_telemetry` stores numeric-only task telemetry (reaction times,
  accuracy ratios) for the optional micro-tasks (Module B only). No
  audio/video is ever stored here — numeric scalars only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ALLOWED_CAPS = {10, 15, 20}
MANDATORY_IDS = ("regression_flag", "family_history_flag")


@dataclass
class ScreeningSession:
    child_id: str
    corrected_age_months: float
    question_cap: Literal[10, 15, 20]
    age_bracket: str = "Unknown"
    model_name: str | None = None

    # "A" = early-childhood screener (0–60 months)
    # "B" = school-age screener (60–144 months)
    module: Literal["A", "B"] = "A"

    # item_id -> 0/1/2 — REAL caregiver answers only, never imputed values
    answers: dict[str, int] = field(default_factory=dict)

    # Source tracking: item_id -> "recall" | "observed"
    answer_sources: dict[str, str] = field(default_factory=dict)
    # Answers obtained via direct live elicitation observation
    observed_answers: dict[str, int] = field(default_factory=dict)
    # Answers obtained via retrospective recall questionnaire
    recall_answers: dict[str, int] = field(default_factory=dict)

    # tracks which mandatory items are done; keys are always MANDATORY_IDS
    mandatory_answered: dict[str, int] = field(default_factory=dict)

    # Module B: functioning domains detected by the NLP router.
    # Populated from IntakeRequest; used by adaptive_tree to filter item pool.
    detected_domains: list[str] = field(default_factory=list)

    # Module B: teacher/mentor item responses (Vanderbilt/SDQ teacher form).
    # Used to compute the cross-context consistency score.
    # Stored as item_id -> 0/1/2, NEVER merged into `answers`.
    teacher_answers: dict[str, int] = field(default_factory=dict)

    # Module B & exploratory numeric micro-task telemetry.
    microtask_telemetry: dict[str, Any] = field(default_factory=dict)

    # Exploratory touch micro-task telemetry (>= 24 months, not used in result)
    touch_telemetry: list[dict[str, Any]] = field(default_factory=list)

    # Joint family respondent answers (secondary caregivers, up to 3)
    joint_respondent_answers: list[dict[str, Any]] = field(default_factory=list)
    joint_concordance: dict[str, Any] | None = None

    # Module B: pending item ID last presented to user for validation
    pending_item_id: str | None = None

    # Module B: serialized engine session state
    module_b_state: dict[str, Any] | None = None

    # Caregiver, Child & Location Profile
    child_name: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    relationship_to_child: str | None = "Parent"
    location_pincode: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_address: str | None = None

    # set True once the orchestrator decides to stop asking
    completed: bool = False

    def __post_init__(self) -> None:
        if self.question_cap not in ALLOWED_CAPS:
            raise ValueError(
                f"question_cap must be one of {ALLOWED_CAPS}, got {self.question_cap}"
            )
        if self.age_bracket == "Unknown":
            from data.generator.age_brackets import map_to_bracket_label

            self.age_bracket = map_to_bracket_label(self.corrected_age_months)

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
        Remaining adaptive question slots.

        Module A: question_cap minus the 2 mandatory items, minus answers so far.
        Module B: no mandatory items — budget is question_cap minus answers.
        """
        mandatory_slots = 0 if self.module == "B" else len(MANDATORY_IDS)
        return max(0, self.question_cap - mandatory_slots - len(self.answers))

    def all_mandatory_answered(self) -> bool:
        if self.module == "B":
            return True
        return all(mid in self.mandatory_answered for mid in MANDATORY_IDS)

    def item_already_answered(self, item_id: str) -> bool:
        return item_id in self.answers or item_id in self.mandatory_answered

    def record_answer(self, item_id: str, value: int, source: str = "recall") -> None:
        """Record an answer from either retrospective recall or live observation.

        Both sources feed `answers[item_id]` so the adaptive tree and model
        receive the milestone answer identically, while provenance is stored
        separately in `answer_sources`, `observed_answers`, and `recall_answers`.
        """
        self.answers[item_id] = value
        self.answer_sources[item_id] = source
        if source == "observed":
            self.observed_answers[item_id] = value
        else:
            self.recall_answers[item_id] = value

    # ------------------------------------------------------------------
    # Serialization — Stage 4 MUST persist these dicts to Redis/DB so
    # sessions survive across HTTP requests, worker restarts, and scale-out.
    # A plain module-level dict (the naïve shortcut) will silently break
    # under multiple Uvicorn workers. See Stage 4 implementation notes.
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """Serialize for storage or transmission."""
        return {
            "child_id": self.child_id,
            "corrected_age_months": self.corrected_age_months,
            "age_bracket": self.age_bracket,
            "question_cap": self.question_cap,
            "model_name": self.model_name,
            "module": self.module,
            "answers": self.answers.copy(),
            "answer_sources": self.answer_sources.copy(),
            "observed_answers": self.observed_answers.copy(),
            "recall_answers": self.recall_answers.copy(),
            "mandatory_answered": self.mandatory_answered.copy(),
            "detected_domains": list(self.detected_domains),
            "teacher_answers": self.teacher_answers.copy(),
            "microtask_telemetry": dict(self.microtask_telemetry),
            "touch_telemetry": [dict(t) for t in self.touch_telemetry],
            "joint_respondent_answers": [dict(j) for j in self.joint_respondent_answers],
            "joint_concordance": (
                dict(self.joint_concordance) if self.joint_concordance else None
            ),
            "child_name": self.child_name,
            "parent_name": self.parent_name,
            "parent_phone": self.parent_phone,
            "relationship_to_child": self.relationship_to_child,
            "location_pincode": self.location_pincode,
            "location_city": self.location_city,
            "location_state": self.location_state,
            "location_address": self.location_address,
            "completed": self.completed,
            "pending_item_id": self.pending_item_id,
            "module_b_state": (
                self.module_b_state.copy() if self.module_b_state else None
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ScreeningSession:
        """Deserialize from storage or transmission.

        All new fields (module, detected_domains, teacher_answers,
        microtask_telemetry, pending_item_id, module_b_state, profile fields) default
        gracefully so old DB rows continue to deserialize correctly.
        """
        age_bracket = data.get("age_bracket", "Unknown")
        return cls(
            child_id=data["child_id"],
            corrected_age_months=float(data["corrected_age_months"]),
            age_bracket=age_bracket,
            question_cap=data["question_cap"],
            model_name=data.get("model_name"),
            module=data.get("module", "A"),
            answers=data.get("answers", {}).copy(),
            answer_sources=data.get("answer_sources", {}).copy(),
            observed_answers=data.get("observed_answers", {}).copy(),
            recall_answers=data.get("recall_answers", {}).copy(),
            mandatory_answered=data.get("mandatory_answered", {}).copy(),
            detected_domains=list(data.get("detected_domains", [])),
            teacher_answers=data.get("teacher_answers", {}).copy(),
            microtask_telemetry=dict(data.get("microtask_telemetry", {})),
            touch_telemetry=list(data.get("touch_telemetry", [])),
            joint_respondent_answers=list(data.get("joint_respondent_answers", [])),
            joint_concordance=data.get("joint_concordance"),
            child_name=data.get("child_name"),
            parent_name=data.get("parent_name"),
            parent_phone=data.get("parent_phone"),
            relationship_to_child=data.get("relationship_to_child", "Parent"),
            location_pincode=data.get("location_pincode"),
            location_city=data.get("location_city"),
            location_state=data.get("location_state"),
            location_address=data.get("location_address"),
            completed=bool(data.get("completed", False)),
            pending_item_id=data.get("pending_item_id"),
            module_b_state=data.get("module_b_state"),
        )


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
