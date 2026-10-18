"""
Unit & integration tests for Find Nearest Help (GET /api/help/nearby).
Acceptance checks:
- PIN with results
- PIN with none
- Invalid PIN (422)
- Age 4 returns DEICs and RBSK teams
- Age 9 returns none for DEIC-only areas
- Never show a centre without a source
- Shows last_verified_date
"""

import pytest
from app.db.models import HelpCentre
from app.db.session import get_session_factory
from app.main import create_app
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def app():
    return create_app(with_lifespan=False)


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
async def seed_help_centres():
    """Ensure test database contains predictable help centres."""
    factory = get_session_factory()
    async with factory() as session:
        # Clear existing help centres
        from sqlalchemy import delete

        await session.execute(delete(HelpCentre))

        centres = [
            # Safdarjung DEIC (Only DEIC in 110029)
            HelpCentre(
                id="test-deic-delhi-1",
                name="Safdarjung Hospital DEIC",
                address="Ring Road, Safdarjung Enclave",
                district="South Delhi",
                state="Delhi",
                pin="110029",
                latitude=28.5684,
                longitude=77.2062,
                phone="+91-11-26165060",
                type="DEIC",
                source_url="https://delhihealth.gov.in/deic-safdarjung",
                last_verified_date="2026-03-15",
                is_sample=True,
            ),
            # RBSK team in 110001
            HelpCentre(
                id="test-rbsk-delhi-1",
                name="Central Delhi RBSK Team",
                address="Lady Hardinge Medical College, Connaught Place",
                district="New Delhi",
                state="Delhi",
                pin="110001",
                latitude=28.6315,
                longitude=77.2167,
                phone="+91-11-23363366",
                type="RBSK team",
                source_url="https://rbsk.gov.in/delhi-teams",
                last_verified_date="2026-03-01",
                is_sample=True,
            ),
            # District hospital in 110054
            HelpCentre(
                id="test-dh-delhi-1",
                name="Aruna Asaf Ali District Hospital",
                address="5 Rajpur Road, Civil Lines",
                district="Central Delhi",
                state="Delhi",
                pin="110054",
                latitude=28.6738,
                longitude=77.2215,
                phone="+91-11-23965532",
                type="district hospital",
                source_url="https://delhihealth.gov.in/aaah",
                last_verified_date="2026-02-28",
                is_sample=True,
            ),
            # Bengaluru DEIC (Only DEIC in 560029)
            HelpCentre(
                id="test-deic-blr-1",
                name="IGICH Bengaluru DEIC",
                address="South Hospital Complex, Dharmaram",
                district="Bengaluru Urban",
                state="Karnataka",
                pin="560029",
                latitude=12.9345,
                longitude=77.5998,
                phone="+91-80-26566624",
                type="DEIC",
                source_url="https://igich.karnataka.gov.in/deic",
                last_verified_date="2026-03-12",
                is_sample=True,
            ),
            # Centre without source URL - MUST NEVER BE SHOWN
            HelpCentre(
                id="test-nosource-1",
                name="Unverified Private Clinic",
                address="123 Unknown St",
                district="South Delhi",
                state="Delhi",
                pin="110029",
                latitude=28.5684,
                longitude=77.2062,
                phone="+91-9999999999",
                type="other",
                source_url="",  # Empty source!
                last_verified_date="2026-01-01",
                is_sample=True,
            ),
        ]
        session.add_all(centres)
        await session.commit()


@pytest.mark.asyncio
async def test_pin_with_results(client):
    """Acceptance Check: Valid PIN returns matching centres with distance and last-verified date."""
    r = await client.get("/api/help/nearby?pin=110029")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0
    assert len(data["centres"]) > 0

    first = data["centres"][0]
    assert first["pin"] == "110029"
    assert first["distance_km"] == 0.0
    assert first["source_url"] != ""
    assert first["last_verified_date"] == "2026-03-15"
    assert first["is_sample"] is True


@pytest.mark.asyncio
async def test_pin_with_none(client):
    """Acceptance Check: Non-existent PIN returns empty list with helplines and district guidance."""
    r = await client.get("/api/help/nearby?pin=999999")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert len(data["centres"]) == 0
    assert len(data["helplines"]) >= 3
    # Check helplines include 1098 and Tele-MANAS
    numbers = [h["number"] for h in data["helplines"]]
    assert "1098" in numbers
    assert "14416" in numbers
    # District office guidance is present
    assert "District Health Office" in data["district_guidance"]["title"]
    assert len(data["district_guidance"]["steps"]) > 0


@pytest.mark.asyncio
async def test_invalid_pin(client):
    """Acceptance Check: Invalid PIN returns clear 422 error without crashing."""
    # Test letters
    r1 = await client.get("/api/help/nearby?pin=abcdef")
    assert r1.status_code == 422
    assert "6-digit number" in r1.json()["detail"]

    # Test short PIN
    r2 = await client.get("/api/help/nearby?pin=1100")
    assert r2.status_code == 422

    # Test long PIN
    r3 = await client.get("/api/help/nearby?pin=11002999")
    assert r3.status_code == 422


@pytest.mark.asyncio
async def test_age_4_returns_deics(client):
    """Acceptance Check: Age 4 returns DEICs and RBSK teams (under 6 routing)."""
    r = await client.get("/api/help/nearby?pin=110029&age=4")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0

    types = [c["type"] for c in data["centres"]]
    # Age 4 must return DEIC or RBSK team
    assert "DEIC" in types
    for t in types:
        assert t in ("DEIC", "RBSK team")


@pytest.mark.asyncio
async def test_age_9_returns_none_in_deic_only_area(client):
    """Acceptance Check: Age 9 returns none in an area with only DEICs (ages 6 to 12 routing excludes DEICs)."""
    # PIN 560029 only has an IGICH DEIC in our database
    r = await client.get("/api/help/nearby?pin=560029&age=9")
    assert r.status_code == 200
    data = r.json()
    # DEIC is filtered out for age 9, resulting in 0 centres found
    assert data["total"] == 0
    assert len(data["centres"]) == 0
    # Guidance and helplines are returned
    assert len(data["helplines"]) > 0
    assert "steps" in data["district_guidance"]


@pytest.mark.asyncio
async def test_never_show_centre_without_source(client):
    """Requirement: Never show a centre without a source URL."""
    r = await client.get("/api/help/nearby?pin=110029")
    assert r.status_code == 200
    data = r.json()
    for centre in data["centres"]:
        assert centre.get("source_url"), f"Centre {centre['name']} missing source_url"
        assert centre["source_url"].strip() != ""
        assert centre["name"] != "Unverified Private Clinic"
