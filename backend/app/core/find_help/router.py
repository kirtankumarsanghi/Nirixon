"""FastAPI route: GET /api/facilities?pin=302031&age_group=0-5&result=refer&limit=10

Mount with:  app.include_router(find_help_router)
Reference DB path comes from env NIRIXON_REFERENCE_DB
(default: backend/data/find_help/reference.sqlite).
Public, read-only reference data: no auth needed, no patient data involved.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from .service import AGE_GROUPS, FACILITY_TYPES, RESULTS, connect_readonly, find_facilities

router = APIRouter(prefix="/api/facilities", tags=["find-help"])

# backend/app/core/find_help/ -> backend/
_DEFAULT_DB = Path(__file__).resolve().parents[3] / "data" / "find_help" / "reference.sqlite"


def _db_path() -> str:
    """Env var wins (ops + tests), then app settings (.env), then the built-in default."""
    env = os.environ.get("NIRIXON_REFERENCE_DB")
    if env:
        return env
    try:
        from app.config import get_settings

        return get_settings().find_help_db
    except Exception:  # standalone use outside the app
        return str(_DEFAULT_DB)


@router.get("")
def facilities(
    pin: Annotated[str, Query(pattern=r"^[1-9][0-9]{5}$", description="6-digit Indian PIN code")],
    type: Annotated[list[str] | None, Query(description="Filter by facility type; repeatable")] = None,
    limit: Annotated[int, Query(ge=1, le=30)] = 10,
    age_group: Annotated[str | None, Query(description="Screening module: 0-5 or 6-12. Ranks developmental services first")] = None,
    result: Annotated[str | None, Query(description="Screening result: typical | monitor | refer")] = None,
):
    if type:
        bad = [t for t in type if t not in FACILITY_TYPES]
        if bad:
            raise HTTPException(422, f"Unknown type(s): {bad}. Allowed: {list(FACILITY_TYPES)}")
    if age_group is not None and age_group not in AGE_GROUPS:
        raise HTTPException(422, f"Unknown age_group. Allowed: {list(AGE_GROUPS)}")
    if result is not None and result not in RESULTS:
        raise HTTPException(422, f"Unknown result. Allowed: {list(RESULTS)}")
    path = _db_path()
    if not os.path.exists(path):
        raise HTTPException(503, "Reference database not built. Run scripts/import_reference_data.py")
    conn = connect_readonly(path)
    try:
        return find_facilities(conn, pin, type, limit, age_group, result)
    finally:
        conn.close()
