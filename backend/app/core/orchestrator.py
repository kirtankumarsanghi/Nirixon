"""
Stage 3 — Orchestrator

Single entry point for the adaptive screening loop. Stage 4's
`/screen/next` endpoint calls `get_next_action()` exclusively — it
never calls mandatory_items.py, adaptive_tree.py, safety_floor.py,
or imputation.py directly.

Decision sequence on each call:
  1. If mandatory items are not fully answered → return next mandatory question
  2. If safety floor not met → return next adaptive question (no early stop allowed)
  3. If budget exhausted (adaptive_budget_remaining == 0) → stop, return FinalResult
  4. If question cap reached (real_answer_count >= question_cap) → stop, return FinalResult
  5. Otherwise → return next adaptive question selected by information gain

`FinalResult` carries both real answers and imputed answers as separate
dicts. The caller (Stage 4's endpoint) passes the combined feature vector
to the Stage 2 model — but the imputed dict is logged separately and
NEVER presented to the caregiver as an answer they gave.
"""

from __future__ import annotations

import os
from typing import Literal

from .adaptive_tree import build_next_question_response
from .adaptive_tree import next_question as pick_next_item
from .confound_caveat import evaluate_motor_confounds
from .imputation import impute_missing
from .mandatory_items import next_mandatory_question
from .safety_floor import (
    MIN_DOMAINS_COVERED_B,
    MIN_REAL_ANSWERS_B,
    can_stop_early,
    get_deterministic_override,
    stopping_blocked_reason,
)
from .sanity_item import check_sanity
from .session import FinalResult, NextQuestion, ScreeningSession

DATA_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "../../data/processed/screening_data_items.csv"
    )
)


def get_next_action(
    session: ScreeningSession,
    data_path: str = DATA_PATH,
) -> NextQuestion | FinalResult:
    """
    Given the current session state, returns either the next question
    to ask the caregiver, or a FinalResult telling Stage 4 to proceed
    to prediction.

    This function is pure with respect to session state — it does NOT
    mutate `session`. The caller (Stage 4 endpoint) is responsible for
    recording answers into `session` before calling this again.

    Dispatches to _get_next_action_b() for Module B sessions. Module A
    logic is unchanged.
    """
    if session.module == "B":
        return _get_next_action_b(session)

    # --- Module A (unchanged) ---
    # Check honeypot item to catch bots/scrapers
    if not check_sanity(session):
        raise ValueError("Invalid session: sanity check failed")

    # Step 1 — Mandatory items first, always
    mandatory_q = next_mandatory_question(session)
    if mandatory_q is not None:
        return mandatory_q

    # Step 2 — Check stopping conditions (only after mandatory items done)
    floor_reason = stopping_blocked_reason(session)
    floor_met = floor_reason is None

    cap_reached = session.real_answer_count >= session.question_cap
    budget_exhausted = session.adaptive_budget_remaining == 0

    if floor_met and (cap_reached or budget_exhausted):
        stopping_reason: Literal["cap_reached", "budget_exhausted"] = (
            "cap_reached" if cap_reached else "budget_exhausted"
        )
        return _build_final_result(session, stopping_reason, data_path)

    # Step 3 — Ask next adaptive question
    item_id = pick_next_item(session, data_path=data_path)

    if item_id is None:
        # All items exhausted — stop even if floor would have allowed more
        return _build_final_result(session, "budget_exhausted", data_path)

    return build_next_question_response(session, item_id)


def _build_final_result(
    session: ScreeningSession,
    stopping_reason: Literal["cap_reached", "budget_exhausted"],
    data_path: str,
) -> FinalResult:
    """
    Module A: Assembles real answers and imputes the remaining items, then
    returns a FinalResult for Stage 4 to pass to the Stage 2 model.
    """

    from data.generator.item_bank import ITEM_BANK

    all_item_ids = [item.item_id for item in ITEM_BANK]

    # Combine real answers: mandatory + milestone
    real_answers: dict[str, int] = {}
    real_answers.update(session.mandatory_answered)
    real_answers.update(session.answers)

    # Identify what still needs to be imputed
    missing_item_ids = [iid for iid in all_item_ids if iid not in session.answers]

    imputed_answers = impute_missing(
        missing_item_ids=missing_item_ids,
        corrected_age_months=session.corrected_age_months,
        data_path=data_path,
    )

    override = get_deterministic_override(session)
    caveats = evaluate_motor_confounds(session, ITEM_BANK)

    return FinalResult(
        session=session,
        real_answers=real_answers,
        imputed_answers=imputed_answers,
        stopping_reason=stopping_reason,
        deterministic_override=override,
        caveats=caveats,
    )


def _get_next_action_b(
    session: ScreeningSession,
) -> NextQuestion | FinalResult:
    """
    Module B adaptive loop.

    No mandatory items (regression_flag / family_history_flag are Module A
    specific). No imputation — all Module B answers are real caregiver responses.
    Stopping floor uses Module B constants.
    """
    # Step 1 — Check stopping floor with Module B thresholds.
    # Domain floor is capped by how many domains the intake actually opened.
    detected_n = len(session.detected_domains) if session.detected_domains else MIN_DOMAINS_COVERED_B
    domain_floor = min(MIN_DOMAINS_COVERED_B, max(1, detected_n))
    floor_met = can_stop_early(
        session,
        min_real_answers=MIN_REAL_ANSWERS_B,
        min_domains=domain_floor,
    )

    cap_reached = session.real_answer_count >= session.question_cap
    budget_exhausted = session.adaptive_budget_remaining == 0

    if floor_met and (cap_reached or budget_exhausted):
        stopping_reason: Literal["cap_reached", "budget_exhausted"] = (
            "cap_reached" if cap_reached else "budget_exhausted"
        )
        return _build_final_result_b(session, stopping_reason)

    # Step 2 — Pick next item (dispatches to _next_question_b in adaptive_tree)
    item_id = pick_next_item(session)

    if item_id is None:
        return _build_final_result_b(session, "budget_exhausted")

    return build_next_question_response(session, item_id)


def _build_final_result_b(
    session: ScreeningSession,
    stopping_reason: Literal["cap_reached", "budget_exhausted"],
) -> FinalResult:
    """
    Module B: no imputation — FinalResult carries only real answers.
    The feature vector for inference is assembled per-domain from answers.
    """
    from data.generator.item_bank_b import MODULE_B_ITEM_BANK

    real_answers: dict[str, int] = dict(session.answers)

    override = get_deterministic_override(session)
    # Module B has no motor confound caveats (that concept is Module A-specific).
    # Per-domain caveats (e.g. "teacher and parent differ on attention") are
    # added post-hoc by the inference service when it computes consistency_score.
    caveats: list[str] = []

    return FinalResult(
        session=session,
        real_answers=real_answers,
        imputed_answers={},  # Module B never imputes
        stopping_reason=stopping_reason,
        deterministic_override=override,
        caveats=caveats,
    )
