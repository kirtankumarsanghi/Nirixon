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

import sys
import os

_CORE_PATH = os.path.dirname(os.path.abspath(__file__))
_GENERATOR_PATH = os.path.abspath(os.path.join(_CORE_PATH, "../../data/generator"))
for _p in (_CORE_PATH, _GENERATOR_PATH):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from .session import ScreeningSession, NextQuestion, FinalResult, MANDATORY_IDS
from .mandatory_items import next_mandatory_question
from .safety_floor import can_stop_early, stopping_blocked_reason, get_deterministic_override
from .adaptive_tree import next_question as pick_next_item, build_next_question_response
from .imputation import impute_missing
from .sanity_item import check_sanity
from .confound_caveat import evaluate_motor_confounds


DATA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/processed/screening_data_items.csv"))


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
    """

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
        stopping_reason = "cap_reached" if cap_reached else "budget_exhausted"
        return _build_final_result(session, stopping_reason, data_path)

    # Step 3 — Ask next adaptive question
    item_id = pick_next_item(session, data_path=data_path)

    if item_id is None:
        # All items exhausted — stop even if floor would have allowed more
        return _build_final_result(session, "budget_exhausted", data_path)

    return build_next_question_response(session, item_id)


def _build_final_result(
    session: ScreeningSession,
    stopping_reason: str,
    data_path: str,
) -> FinalResult:
    """
    Assembles real answers and imputes the remaining items, then returns
    a FinalResult for Stage 4 to pass to the Stage 2 model.
    """
    from item_bank import ITEM_BANK
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../data/generator"))

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
