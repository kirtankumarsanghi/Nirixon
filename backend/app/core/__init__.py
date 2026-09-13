"""
Stage 3 — __init__.py

Exports the public API for backend/app/core so Stage 4 can do:
    from app.core import get_next_action, ScreeningSession, ...
"""

from .session import ScreeningSession, NextQuestion, FinalResult, MANDATORY_IDS, ALLOWED_CAPS
from .orchestrator import get_next_action
from .mandatory_items import record_mandatory_answer
from .safety_floor import can_stop_early, MIN_REAL_ANSWERS

__all__ = [
    "ScreeningSession",
    "NextQuestion",
    "FinalResult",
    "MANDATORY_IDS",
    "ALLOWED_CAPS",
    "get_next_action",
    "record_mandatory_answer",
    "can_stop_early",
    "MIN_REAL_ANSWERS",
]
