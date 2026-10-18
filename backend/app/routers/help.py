"""
Help Router: GET /api/help/nearby endpoint.
Returns nearest verified developmental centres with distance, age routing, and district guidance.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.help_service import find_nearby_centres, parse_effective_age
from app.db.session import get_db
from app.schemas.help import HelpNearbyResponse

router = APIRouter(prefix="/api/help", tags=["help"])

PIN_REGEX = re.compile(r"^\d{6}$")


@router.get("/nearby", response_model=HelpNearbyResponse)
async def get_nearby_help(
    pin: str | None = Query(default=None, description="6-digit Indian PIN code"),
    lat: float | None = Query(default=None, description="GPS Latitude"),
    lng: float | None = Query(default=None, description="GPS Longitude"),
    age: float | None = Query(
        default=None, description="Child's age (in years, or months if >18)"
    ),
    age_years: float | None = Query(default=None, description="Child's age in years"),
    age_months: float | None = Query(default=None, description="Child's age in months"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results to return"),
    db: AsyncSession = Depends(get_db),
):
    """
    Find nearest verified developmental centres (DEIC, RBSK, District Hospitals, Rehabilitation).
    Supports PIN or GPS coordinates. Applies strict age routing:
    - Under 6: DEICs and RBSK teams.
    - Ages 6 to 12: District Hospitals, Rehabilitation, School Resources (NOT DEICs).
    - If nothing found: returns national helplines and district health office guidance.
    """
    clean_pin: str | None = None
    if pin is not None:
        clean_pin = pin.strip()
        if not PIN_REGEX.match(clean_pin):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid PIN code '{clean_pin}': must be a 6-digit number",
            )

    if clean_pin is None and (lat is None or lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either pin or both lat and lng must be provided",
        )

    if (lat is not None and lng is None) or (lng is not None and lat is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both lat and lng must be provided together",
        )

    effective_age_years = parse_effective_age(
        age=age,
        age_years=age_years,
        age_months=age_months,
    )

    response = await find_nearby_centres(
        session=db,
        pin=clean_pin,
        lat=lat,
        lng=lng,
        age_years=effective_age_years,
        limit=limit,
    )

    return response
