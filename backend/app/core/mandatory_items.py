"""
Stage 3 — Mandatory Items

Guarantees `regression_flag` and `family_history_flag` are:
  1. Asked first, before any adaptive item
  2. Asked exactly once — never re-queued
  3. Excluded from the domain-quota rotation (they are context flags,
     not developmental milestone items)
  4. Their answers are stored in `session.mandatory_answered`, never
     in `session.answers`, so imputation and domain-quota logic can
     never accidentally touch them

Why these two specifically?
  - `regression_flag` is the near-automatic Refer trigger per the
    design doc — the model needs it to function correctly, and asking
    it mid-session after the caregiver has already answered other
    questions is confusing.
  - `family_history_flag` is the only contextual risk modifier the
    model uses; collecting it early means every subsequent question's
    information gain is computed in the right context.
"""

from __future__ import annotations

from .session import MANDATORY_IDS, NextQuestion, ScreeningSession

# Question text for each mandatory item, kept here as the authoritative
# copy so Stage 4's API never needs to hard-code strings.
MANDATORY_QUESTION_TEXTS: dict[str, str] = {
    "regression_flag": (
        "Has your child lost a skill they used to have — for example, "
        "stopped saying a word they said before, or stopped doing something "
        "they could do a few weeks or months ago?"
    ),
    "family_history_flag": (
        "Has anyone in your child's immediate family (a parent or sibling) "
        "been diagnosed with a developmental delay, autism, or a similar condition?"
    ),
}

# Domain label for display purposes — mandatory items aren't milestone items
# but Stage 4 needs something to render in the UI header
MANDATORY_DOMAIN_LABEL = "background"


def next_mandatory_question(session: ScreeningSession) -> NextQuestion | None:
    """
    Returns the next unanswered mandatory question, or None if both are done.
    Order is fixed: regression_flag first (higher immediate clinical weight),
    family_history_flag second.
    """
    for item_id in MANDATORY_IDS:
        if item_id not in session.mandatory_answered:
            return NextQuestion(
                item_id=item_id,
                question_text=MANDATORY_QUESTION_TEXTS[item_id],
                domain=MANDATORY_DOMAIN_LABEL,
                question_number=list(MANDATORY_IDS).index(item_id) + 1,
                question_cap=session.question_cap,
            )
    return None


def record_mandatory_answer(session: ScreeningSession, item_id: str, answer: int) -> None:
    """
    Validates and stores a mandatory answer. Raises if the item_id is not
    a mandatory item or has already been answered.
    """
    if item_id not in MANDATORY_IDS:
        raise ValueError(f"{item_id!r} is not a mandatory item. Use session.answers for milestone items.")
    if item_id in session.mandatory_answered:
        raise ValueError(f"{item_id!r} has already been answered and cannot be repeated.")
    if answer not in (0, 1):
        raise ValueError(f"Mandatory item answers must be 0 (No) or 1 (Yes), got {answer}.")
    session.mandatory_answered[item_id] = answer
