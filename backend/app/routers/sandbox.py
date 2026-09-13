"""
Clinician what-if sandbox — Stage 4 stub.

TODO(Stage 4b+): implement clinician sandbox simulation endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.api_route("", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def sandbox_not_implemented(path: str = ""):
    # TODO(Stage 4b+): clinician what-if simulation
    raise HTTPException(status_code=501, detail="Sandbox not implemented")
