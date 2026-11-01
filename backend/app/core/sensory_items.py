"""Module A sensory quick screen (vision and hearing).

Kept outside ``ITEM_BANK`` deliberately: these are rule-out flags, not
developmental milestone items, so they must not enter the ML feature vector,
imputation, or domain quotas (the same pattern as mandatory flags).

A positive answer forces a direct referral through the deterministic safety
floor; it never suppresses or dilutes the developmental score.
"""

from __future__ import annotations

from .session import NextQuestion, ScreeningSession

SENSORY_IDS = ("vision_flag", "hearing_flag")
SENSORY_DOMAIN_LABEL = "sensory"

SENSORY_QUESTION_TEXTS: dict[str, str] = {
    "vision_flag": (
        "Does your child seem to have trouble seeing — for example, squinting, "
        "holding things very close, or not noticing people or objects across a room?"
    ),
    "hearing_flag": (
        "Does your child seem to have trouble hearing — for example, not turning "
        "to their name, asking you to repeat things, or needing the TV much louder "
        "than the rest of the family?"
    ),
}


def next_sensory_question(session: ScreeningSession) -> NextQuestion | None:
    """Ask the two sensory flags once, after the mandatory background flags."""
    if session.module != "A":
        return None
    for item_id in SENSORY_IDS:
        if item_id not in session.sensory_answered:
            return NextQuestion(
                item_id=item_id,
                question_text=SENSORY_QUESTION_TEXTS[item_id],
                domain=SENSORY_DOMAIN_LABEL,
                question_number=len(session.sensory_answered) + 1,
                question_cap=session.question_cap,
            )
    return None


def record_sensory_answer(session: ScreeningSession, item_id: str, answer: int) -> None:
    if item_id not in SENSORY_IDS:
        raise ValueError(f"{item_id!r} is not a sensory item")
    if item_id in session.sensory_answered:
        raise ValueError(f"{item_id!r} has already been answered")
    if answer not in (0, 1):
        raise ValueError("Sensory answers must be 0 (No) or 1 (Yes)")
    session.sensory_answered[item_id] = answer


def sensory_override(session: ScreeningSession) -> str | None:
    """Any positive sensory answer forces a referral."""
    if session.module != "A":
        return None
    if any(session.sensory_answered.get(item_id) == 1 for item_id in SENSORY_IDS):
        return "Refer"
    return None
