"""
Stage 3 — __init__.py

Exports the public API for backend/app/core so Stage 4 can do:
    from app.core import get_next_action, ScreeningSession, ...
"""

from .mandatory_items import record_mandatory_answer
from .orchestrator import get_next_action
from .safety_floor import MIN_REAL_ANSWERS, can_stop_early
from .session import (
    ALLOWED_CAPS,
    MANDATORY_IDS,
    FinalResult,
    NextQuestion,
    ScreeningSession,
)

__all__ = [
    "ALLOWED_CAPS",
    "MANDATORY_IDS",
    "MIN_REAL_ANSWERS",
    "FinalResult",
    "NextQuestion",
    "ScreeningSession",
    "can_stop_early",
    "get_next_action",
    "record_mandatory_answer",
]
