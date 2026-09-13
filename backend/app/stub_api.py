"""
Stage 3 — Minimal FastAPI Stub for HTTP testing

A thin FastAPI application that wires directly to the Stage 3 core
functions so testing can happen end-to-end through real HTTP calls,
as confirmed in the design decisions, rather than through a pure
simulation harness.

This is NOT Stage 4 — it has no auth, no database, no full schema
validation, and no production error handling. Its only job is to let
the test suite in test_adaptive_logic.py make real HTTP requests to
the core adaptive loop.

Run:
    cd backend
    uvicorn app.stub_api:app --reload --port 8001

Endpoints:
    POST /session/start   — create a new session
    POST /session/answer  — submit an answer and get the next action
    GET  /session/{id}    — inspect current session state (for tests)
"""

from __future__ import annotations

import os
import sys

# Allow imports from app/core and data/generator without install
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "core"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../data/generator"))

import uuid
from typing import Literal

from fastapi import FastAPI, HTTPException
from mandatory_items import record_mandatory_answer
from orchestrator import get_next_action
from pydantic import BaseModel
from session import MANDATORY_IDS, ScreeningSession

app = FastAPI(title="Nirixon Stage 3 Stub API")

# In-memory store — sessions are lost on restart, which is fine for testing
_sessions: dict[str, ScreeningSession] = {}


# --- Request / Response schemas ---

class StartRequest(BaseModel):
    child_id: str = ""
    corrected_age_months: float
    question_cap: Literal[10, 15, 20] = 10


class AnswerRequest(BaseModel):
    session_id: str
    item_id: str
    answer: int  # 0/1/2 for milestone items; 0/1 for mandatory items


class ActionResponse(BaseModel):
    type: Literal["question", "complete"]
    session_id: str
    # question fields (None when complete)
    item_id: str | None = None
    question_text: str | None = None
    domain: str | None = None
    question_number: int | None = None
    question_cap: int | None = None
    # completion fields (None when still asking)
    stopping_reason: str | None = None
    real_answer_count: int | None = None
    imputed_count: int | None = None


# --- Endpoints ---

@app.post("/session/start", response_model=ActionResponse)
def start_session(req: StartRequest):
    session_id = str(uuid.uuid4())
    session = ScreeningSession(
        child_id=req.child_id or session_id,
        corrected_age_months=req.corrected_age_months,
        question_cap=req.question_cap,
    )
    _sessions[session_id] = session

    action = get_next_action(session)
    return _action_to_response(session_id, action)


@app.post("/session/answer", response_model=ActionResponse)
def submit_answer(req: AnswerRequest):
    session = _sessions.get(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.completed:
        raise HTTPException(status_code=400, detail="Session already completed")

    # Route answer to mandatory or milestone storage
    if req.item_id in MANDATORY_IDS:
        record_mandatory_answer(session, req.item_id, req.answer)
    else:
        if req.answer not in (0, 1, 2):
            raise HTTPException(status_code=422, detail="Milestone answer must be 0, 1, or 2")
        session.answers[req.item_id] = req.answer

    action = get_next_action(session)

    # Mark session complete if FinalResult returned
    from session import FinalResult
    if isinstance(action, FinalResult):
        session.completed = True

    return _action_to_response(req.session_id, action)


@app.get("/session/{session_id}")
def get_session(session_id: str):
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "child_id": session.child_id,
        "corrected_age_months": session.corrected_age_months,
        "question_cap": session.question_cap,
        "mandatory_answered": session.mandatory_answered,
        "answers": session.answers,
        "real_answer_count": session.real_answer_count,
        "adaptive_budget_remaining": session.adaptive_budget_remaining,
        "completed": session.completed,
    }


def _action_to_response(session_id: str, action) -> ActionResponse:
    from session import FinalResult, NextQuestion
    if isinstance(action, NextQuestion):
        return ActionResponse(
            type="question",
            session_id=session_id,
            item_id=action.item_id,
            question_text=action.question_text,
            domain=action.domain,
            question_number=action.question_number,
            question_cap=action.question_cap,
        )
    elif isinstance(action, FinalResult):
        return ActionResponse(
            type="complete",
            session_id=session_id,
            stopping_reason=action.stopping_reason,
            real_answer_count=len(action.real_answers),
            imputed_count=len(action.imputed_answers),
        )
    raise ValueError(f"Unknown action type: {type(action)}")
