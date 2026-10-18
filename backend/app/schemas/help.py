"""
Schemas for Find Nearest Help (DEIC, RBSK, District Hospitals, Rehabilitation).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class HelpCentreItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    address: str
    district: str
    state: str
    pin: str
    latitude: float
    longitude: float
    phone: str
    type: str  # DEIC / RBSK team / district hospital / rehabilitation / school resource / other
    source_url: str
    last_verified_date: str
    distance_km: float = Field(default=0.0, description="Distance from user in km")
    is_sample: bool = Field(default=True, description="Whether this is sample data")


class HelplineItem(BaseModel):
    name: str
    number: str
    available: str
    description: str


class DistrictGuidance(BaseModel):
    title: str
    steps: list[str]


class HelpNearbyResponse(BaseModel):
    centres: list[HelpCentreItem]
    total: int
    pin: str | None = None
    child_age_years: float | None = None
    helplines: list[HelplineItem]
    district_guidance: DistrictGuidance
