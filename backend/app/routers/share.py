"""
Caregiver/clinician share flows — Stage 4 stub.

TODO(Stage 5+): wire share_models / share_merge and real share endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/share", tags=["share"])


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@router.api_route("", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def share_not_implemented(path: str = ""):
    # TODO(Stage 5+): share session / merge shared answers
    raise HTTPException(status_code=501, detail="Share not implemented")
