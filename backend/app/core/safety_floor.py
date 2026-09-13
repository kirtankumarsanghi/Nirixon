"""
Stage 3 — Safety Floor

Two responsibilities:

  1. **Stopping guard** — enforces that early stopping is only allowed
     when a minimum number of real answers have been collected *and* the
     answers span enough developmental domains to give the model a
     meaningful signal. Guards against:
       - Stopping after only 2-3 questions (safety floor on count)
       - Stopping with 8 questions all from gross_motor alone
         (domain coverage floor)

  2. **Deterministic ML override** — post-processes the Stage 4 prediction
     after the ML model has run. If a clinical rule mandates a specific
     outcome, this function overrides whatever the model returned.
     Currently enforced rules (in priority order — highest severity wins):
       - regression_flag == 1 → force "Refer"

Why separate from the model?
  The Stage 2 model is a statistical tool. Clinical rules express hard
  constraints the model may not have learned reliably on 5,000 rows
  (e.g. regression_flag is a near-certain Refer in the clinical literature,
  but a synthetic dataset may not perfectly reflect that). The override
  guarantees safety-critical behavior independent of model calibration.

What counts toward the stopping floor?
  - Both mandatory items (regression_flag, family_history_flag) — always
  - Real caregiver answers to milestone items — always
  - Imputed item values — NEVER
"""

from __future__ import annotations

# ------------------------------------------------------------------
# Wire in item_bank so we know which domain each item belongs to.
# Safety floor needs domain coverage — importing here keeps the
# dependency chain clean (no circular import through adaptive_tree).
# ------------------------------------------------------------------
from data.generator.item_bank import DOMAINS, ITEM_BANK

from .session import MANDATORY_IDS, ScreeningSession

ITEM_DOMAIN_MAP: dict[str, str] = {item.item_id: item.domain for item in ITEM_BANK}

# Minimum total real answers (mandatory + milestone) before any early stop.
# Changing this changes the clinical defensibility bar, not just performance.
MIN_REAL_ANSWERS: int = 6  # 2 mandatory + at least 4 milestone items

# Minimum number of distinct developmental domains that must have at least
# one real (non-imputed) milestone answer before stopping is allowed.
# 4 of 6 means the ML feature vector has real signal in the majority of
# domains — not just a single-domain picture.
MIN_DOMAINS_COVERED: int = 4


# ------------------------------------------------------------------
# Helper
# ------------------------------------------------------------------


def _domains_with_real_answer(session: ScreeningSession) -> set[str]:
    """
    Returns the set of developmental domains for which the session has
    at least one real (non-imputed) answer.

    Counts both `session.answers` and `session.mandatory_answered` against
    ITEM_DOMAIN_MAP so mandatory coverage and adaptive coverage share one
    counter. Today's mandatory flags (regression_flag, family_history_flag)
    are context flags and are not in ITEM_DOMAIN_MAP, so they still do not
    inflate domain coverage — but any future mandatory item that *does*
    touch a developmental domain is counted exactly once here, not again
    by adaptive_tree.
    """
    covered: set[str] = set()
    for item_id in session.answers:
        domain = ITEM_DOMAIN_MAP.get(item_id)
        if domain is not None:
            covered.add(domain)
    for item_id in session.mandatory_answered:
        domain = ITEM_DOMAIN_MAP.get(item_id)
        if domain is not None:
            covered.add(domain)
    return covered


# ------------------------------------------------------------------
# Stopping guard
# ------------------------------------------------------------------


def can_stop_early(
    session: ScreeningSession,
    min_real_answers: int = MIN_REAL_ANSWERS,
    min_domains: int = MIN_DOMAINS_COVERED,
) -> bool:
    """
    Returns True only if ALL three conditions are met:
      1. Both mandatory items have been answered
      2. Total real answer count >= min_real_answers
      3. At least min_domains distinct domains have a real answer

    Does NOT check model confidence — that's the orchestrator's job.
    """
    if not session.all_mandatory_answered():
        return False
    if session.real_answer_count < min_real_answers:
        return False
    return len(_domains_with_real_answer(session)) >= min_domains


def stopping_blocked_reason(
    session: ScreeningSession,
    min_real_answers: int = MIN_REAL_ANSWERS,
    min_domains: int = MIN_DOMAINS_COVERED,
) -> str | None:
    """
    Returns a human-readable reason string if stopping is currently blocked,
    or None if stopping is permitted. Used for logging and test assertions.
    """
    if not session.all_mandatory_answered():
        missing = [
            mid for mid in MANDATORY_IDS if mid not in session.mandatory_answered
        ]
        return f"Mandatory items not yet answered: {missing}"

    if session.real_answer_count < min_real_answers:
        needed = min_real_answers - session.real_answer_count
        return (
            f"Safety floor not met: need {needed} more real answer(s) "
            f"(have {session.real_answer_count}, floor is {min_real_answers})"
        )

    covered = _domains_with_real_answer(session)
    if len(covered) < min_domains:
        missing_domains = sorted(set(DOMAINS) - covered)
        return (
            f"Domain coverage insufficient: {len(covered)}/{min_domains} domains covered "
            f"(missing real answers in: {missing_domains})"
        )

    return None


# ------------------------------------------------------------------
# Deterministic ML override
# ------------------------------------------------------------------


def get_deterministic_override(session: ScreeningSession) -> str | None:
    """
    Returns a forced prediction label if clinical rules mandate one,
    or None if the ML model's prediction should be used as-is.

    Rules (evaluated in priority order — highest severity wins):
      1. regression_flag == 1 → "Refer"
         Any skill regression is an automatic Refer per the design doc.
         The ML model may not have learned this perfectly on synthetic data;
         the override guarantees it regardless of model confidence.

    Stage 4 MUST call this function after ML inference and, if it returns
    a non-None value, substitute that value for the model's prediction in
    the API response. The ML model's raw output should still be logged for
    monitoring purposes.
    """
    if session.mandatory_answered.get("regression_flag") == 1:
        return "Refer"

    # Future rules would go here, in order from most to least severe.
    # Examples (not yet implemented):
    #   family_history_flag == 1 AND score < threshold → "Monitor"
    #   extremely low score on >=3 domains → "Refer"

    return None
