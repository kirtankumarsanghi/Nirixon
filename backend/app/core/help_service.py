"""
Help Service: Find Nearest Help (DEIC, RBSK, District Hospitals, Rehabilitation).
Handles data file loading, distance calculation, age routing, and district guidance.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import HelpCentre
from app.schemas.help import (
    DistrictGuidance,
    HelpCentreItem,
    HelplineItem,
    HelpNearbyResponse,
)

logger = logging.getLogger(__name__)

# Standard national helplines for child health and developmental delays
OFFICIAL_HELPLINES = [
    HelplineItem(
        name="RBSK / Childline",
        number="1098",
        available="24/7 (Toll-Free)",
        description="National emergency helpline for child healthcare, protection, and early intervention support.",
    ),
    HelplineItem(
        name="Tele-MANAS (Mental Health & Neurodevelopment)",
        number="14416",
        available="24/7 (Toll-Free 1800-891-4416)",
        description="National mental health and developmental delay tele-consultation service by Ministry of Health & Family Welfare.",
    ),
    HelplineItem(
        name="Kiran Mental Health Helpline",
        number="1800-599-0019",
        available="24/7 (Toll-Free)",
        description="National 24/7 mental health and psychosocial support helpline across 13 Indian languages.",
    ),
    HelplineItem(
        name="National Health Mission (NHM) Helpline",
        number="104",
        available="24/7",
        description="State health helpline for locating nearest public health centres, ASHA workers, and DEIC referral transport.",
    ),
]

HELPLINE_NUMBERS: dict[str, str] = {
    "childline": "1098",
    "tele_manas": "14416",
    "kiran": "1800-599-0019",
    "nhm": "104",
}

OFFICIAL_DISTRICT_GUIDANCE = DistrictGuidance(
    title="District Health Office (CMO) Guidance",
    steps=[
        "Visit the Chief Medical Officer (CMO) or Civil Surgeon office at your nearest District Civil Hospital.",
        "Request the District Early Intervention Centre (DEIC) or Rashtriya Bal Swasthya Karyakram (RBSK) nodal officer.",
        "Under the National Health Mission, all diagnostic screenings (pediatrician, audiologist, speech therapist, psychologist) and therapy sessions are free for children.",
        "Your local ASHA or Anganwadi worker can provide referral slips and help organize transport assistance under RBSK.",
    ],
)

# Reference coordinates for major Indian PIN zones for approximate distance calculations
PIN_CENTROIDS: dict[str, tuple[float, float]] = {
    "110029": (28.5684, 77.2062),  # Safdarjung, South Delhi
    "110054": (28.6738, 77.2215),  # Civil Lines, North Delhi
    "110001": (28.6315, 77.2167),  # Connaught Place, New Delhi
    "110016": (28.5494, 77.1994),  # Hauz Khas, Delhi
    "110085": (28.7188, 77.1126),  # Rohini, Delhi
    "400012": (19.0024, 72.8427),  # Parel, Mumbai
    "400001": (18.9322, 72.8347),  # Fort, Mumbai
    "560029": (12.9345, 77.5998),  # Dharmaram, Bengaluru
    "560001": (12.9716, 77.5946),  # Central Bengaluru
    "302004": (26.8928, 75.8152),  # Jaipur
    "226003": (26.8708, 80.9150),  # Lucknow
    "700001": (22.5726, 88.3639),  # Kolkata
    "600001": (13.0827, 80.2707),  # Chennai
    "500001": (17.3850, 78.4867),  # Hyderabad
    "800001": (25.5941, 85.1376),  # Patna
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Haversine distance in kilometers between two GPS points."""
    radius_earth_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(radius_earth_km * c, 1)


def get_data_file_path() -> tuple[Path, bool]:
    """
    Returns (path, is_sample).
    Prefers user-provided backend/data/help_centres.json, falls back to help_centres.sample.json.
    """
    base_dir = Path(__file__).resolve().parent.parent.parent / "data"
    prod_path = base_dir / "help_centres.json"
    if prod_path.exists():
        return prod_path, False

    sample_path = base_dir / "help_centres.sample.json"
    return sample_path, True


async def ensure_help_centres_loaded(session: AsyncSession) -> int:
    """
    Checks if help_centres table has entries.
    If empty, imports records from the designated data file.
    """
    count_stmt = select(HelpCentre.id).limit(1)
    existing = (await session.execute(count_stmt)).scalar_one_or_none()
    if existing is not None:
        return 0

    data_file, is_sample = get_data_file_path()
    if not data_file.exists():
        logger.warning("No help centres data file found at %s", data_file)
        return 0

    try:
        content = json.loads(data_file.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.error("Failed to parse help centres data file %s: %s", data_file, exc)
        return 0

    raw_items = content.get("centres", []) if isinstance(content, dict) else content
    if not isinstance(raw_items, list):
        return 0

    loaded = 0
    for item in raw_items:
        source_url = (item.get("source_url") or "").strip()
        # Rule: Never store/show a centre without a source
        if not source_url:
            continue

        centre = HelpCentre(
            name=str(item.get("name", "")).strip(),
            address=str(item.get("address", "")).strip(),
            district=str(item.get("district", "")).strip(),
            state=str(item.get("state", "")).strip(),
            pin=str(item.get("pin", "")).strip(),
            latitude=float(item.get("latitude", 0.0)),
            longitude=float(item.get("longitude", 0.0)),
            phone=str(item.get("phone", "")).strip(),
            type=str(item.get("type", "other")).strip(),
            source_url=source_url,
            last_verified_date=str(
                item.get("last_verified_date", "2026-01-01")
            ).strip(),
            is_sample=is_sample,
        )
        session.add(centre)
        loaded += 1

    if loaded > 0:
        await session.commit()
        logger.info(
            "Imported %d help centres from %s (is_sample=%s)",
            loaded,
            data_file.name,
            is_sample,
        )

    return loaded


def parse_effective_age(
    age: float | None = None,
    age_years: float | None = None,
    age_months: float | None = None,
) -> float | None:
    """Converts various age parameters into effective age in years."""
    if age_years is not None:
        return float(age_years)
    if age_months is not None:
        return float(age_months) / 12.0
    if age is not None:
        # If age > 18, assume passed in months; else assume years
        return float(age) / 12.0 if age > 18.0 else float(age)
    return None


def is_eligible_for_age(centre_type: str, age_years: float | None) -> bool:
    """
    Applies age routing rules:
    - Under 6: DEICs and RBSK teams.
    - Ages 6 to 12: district hospital, rehabilitation and school resources, NOT DEICs.
    - Ages > 12: district hospital, rehabilitation, school resources, NOT DEICs.
    """
    if age_years is None:
        return True

    norm_type = centre_type.lower().strip()
    is_deic = norm_type == "deic"
    is_rbsk = "rbsk" in norm_type

    if age_years < 6.0:
        # Under 6: show DEICs and RBSK teams
        return is_deic or is_rbsk

    if 6.0 <= age_years <= 12.0:
        # Ages 6 to 12: show district hospital, rehabilitation and school resources, NOT DEICs
        if is_deic:
            return False
        return True

    # Ages > 12: non-DEIC resources
    return not is_deic


async def find_nearby_centres(
    session: AsyncSession,
    pin: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    age_years: float | None = None,
    limit: int = 10,
) -> HelpNearbyResponse:
    """
    Finds nearest help centres based on PIN or (lat, lng), filtered by age routing and source presence.
    """
    # Ensure database is populated from data file if empty
    await ensure_help_centres_loaded(session)

    # 1. Fetch all candidate centres that have a verified source URL
    stmt = select(HelpCentre).where(
        HelpCentre.source_url.is_not(None),
        HelpCentre.source_url != "",
    )
    result = await session.execute(stmt)
    all_centres = list(result.scalars().all())

    # 2. Determine user reference coordinates
    ref_lat: float | None = lat
    ref_lng: float | None = lng
    exact_pin_matched = False

    if pin:
        pin = pin.strip()
        # Find if any centre has this exact PIN
        matching_pin_centres = [c for c in all_centres if c.pin == pin]
        if matching_pin_centres:
            ref_lat = matching_pin_centres[0].latitude
            ref_lng = matching_pin_centres[0].longitude
            exact_pin_matched = True
        elif pin in PIN_CENTROIDS:
            ref_lat, ref_lng = PIN_CENTROIDS[pin]

    # 3. Filter by age routing and calculate distance
    scored_items: list[tuple[float, HelpCentre]] = []

    for centre in all_centres:
        # Apply age routing
        if not is_eligible_for_age(centre.type, age_years):
            continue

        if pin and exact_pin_matched:
            # If user queried by PIN and centre is in that same PIN, distance is 0.0
            if centre.pin == pin:
                scored_items.append((0.0, centre))
                continue
            # Otherwise, if we have coordinates, check if nearby (within 35 km)
            if ref_lat is not None and ref_lng is not None:
                dist = haversine_km(ref_lat, ref_lng, centre.latitude, centre.longitude)
                if dist <= 35.0:
                    scored_items.append((dist, centre))
        elif ref_lat is not None and ref_lng is not None:
            dist = haversine_km(ref_lat, ref_lng, centre.latitude, centre.longitude)
            # Accept within 80 km if queried by coords or known PIN centroid
            if dist <= 80.0:
                scored_items.append((dist, centre))

    # Sort by distance
    scored_items.sort(key=lambda x: x[0])
    top_items = scored_items[:limit]

    centre_items: list[HelpCentreItem] = [
        HelpCentreItem(
            id=c.id,
            name=c.name,
            address=c.address,
            district=c.district,
            state=c.state,
            pin=c.pin,
            latitude=c.latitude,
            longitude=c.longitude,
            phone=c.phone,
            type=c.type,
            source_url=c.source_url or "",
            last_verified_date=c.last_verified_date,
            distance_km=dist,
            is_sample=c.is_sample,
        )
        for dist, c in top_items
    ]

    return HelpNearbyResponse(
        centres=centre_items,
        total=len(centre_items),
        pin=pin,
        child_age_years=age_years,
        helplines=OFFICIAL_HELPLINES,
        district_guidance=OFFICIAL_DISTRICT_GUIDANCE,
    )
