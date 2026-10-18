"""
Unit and API integration tests for optional synchronized growth tracking.

Acceptance Checks Covered:
1. Unit tests for the plateau rule (flagged, normal, one visit, equal-age edge).
2. Test: deleting a child ID removes all of its visits.
3. Test: with the flag off, nothing is stored on the server.
4. Test: no personal fields exist in the schema.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from app.config import Settings
from app.core.growth import (
    check_consecutive_plateau,
    evaluate_growth_trajectory,
)
from app.db.models import GrowthVisit
from app.db.session import Base, get_db
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# 1. UNIT TESTS FOR THE PLATEAU RULE
# ---------------------------------------------------------------------------

class TestPlateauRuleUnit:
    """
    Acceptance check 1:
    Unit tests for the plateau rule (flagged, normal, one visit, equal-age edge).
    """

    def test_plateau_rule_flagged(self):
        """
        Flagged when developmental-age gain is strictly less than 0.5 x
        chronological-age gain across two consecutive visits.
        Example:
          Visit 1: chron=12.0m, dev=12.0m
          Visit 2: chron=18.0m, dev=14.0m
          delta_chron = 6.0m
          delta_dev = 2.0m
          Threshold: 0.5 * 6.0 = 3.0m
          2.0 < 3.0 -> FLAGGED
        """
        is_plateau, ratio = check_consecutive_plateau(
            prev_chronological_age=12.0,
            prev_developmental_age=12.0,
            curr_chronological_age=18.0,
            curr_developmental_age=14.0,
        )
        assert is_plateau is True
        assert ratio is not None
        assert ratio == pytest.approx(2.0 / 6.0, rel=1e-3)
        assert ratio < 0.5

    def test_plateau_rule_normal(self):
        """
        Normal pace when developmental-age gain >= 0.5 x chronological-age gain.
        Example:
          Visit 1: chron=12.0m, dev=12.0m
          Visit 2: chron=18.0m, dev=16.0m
          delta_chron = 6.0m
          delta_dev = 4.0m
          4.0 >= 3.0 -> NOT FLAGGED (normal velocity)
        """
        is_plateau, ratio = check_consecutive_plateau(
            prev_chronological_age=12.0,
            prev_developmental_age=12.0,
            curr_chronological_age=18.0,
            curr_developmental_age=16.0,
        )
        assert is_plateau is False
        assert ratio is not None
        assert ratio == pytest.approx(4.0 / 6.0, rel=1e-3)
        assert ratio >= 0.5

    def test_plateau_rule_one_visit(self):
        """
        Only one visit recorded: cannot compute velocity across visits.
        Trajectory evaluator must return is_plateau_detected=False without error.
        """
        single_visit = [
            {
                "chronological_age_months": 12.0,
                "developmental_age_months": 12.0,
                "visit_date": datetime(2025, 1, 15, tzinfo=UTC),
                "tier": "Typical",
            }
        ]
        result = evaluate_growth_trajectory(single_visit)
        assert result["is_plateau_detected"] is False
        assert result["total_visits"] == 1
        assert len(result["intervals"]) == 0
        assert "Only one visit recorded" in result["plateau_summary"]

    def test_plateau_rule_equal_age_edge(self):
        """
        Equal-age edge case: delta_chron <= 0.
        Two visits recorded at the same age (e.g. repeated same-day check-in).
        Must NOT raise ZeroDivisionError and must NOT flag a plateau.
        """
        is_plateau, ratio = check_consecutive_plateau(
            prev_chronological_age=18.0,
            prev_developmental_age=16.0,
            curr_chronological_age=18.0,
            curr_developmental_age=16.0,
        )
        assert is_plateau is False
        assert ratio is None

        # Also test with evaluate_growth_trajectory
        same_day_visits = [
            {
                "chronological_age_months": 18.0,
                "developmental_age_months": 16.0,
                "visit_date": datetime(2025, 6, 1, 10, 0, tzinfo=UTC),
                "tier": "Monitor",
            },
            {
                "chronological_age_months": 18.0,
                "developmental_age_months": 16.5,
                "visit_date": datetime(2025, 6, 1, 14, 0, tzinfo=UTC),
                "tier": "Monitor",
            },
        ]
        result = evaluate_growth_trajectory(same_day_visits)
        assert result["is_plateau_detected"] is False
        assert len(result["intervals"]) == 1
        assert result["intervals"][0]["gain_ratio"] is None


# ---------------------------------------------------------------------------
# 2. SCHEMA NO-PERSONAL-DATA VERIFICATION TEST
# ---------------------------------------------------------------------------

class TestSchemaPrivacyAudit:
    """
    Acceptance check 4:
    Test: no personal fields exist in the schema.
    """

    def test_no_personal_fields_in_growth_schema(self):
        """
        Inspect GrowthVisit ORM table and columns.
        Verify no identifiable personal data columns exist.
        """
        columns = {col.name for col in GrowthVisit.__table__.columns}

        # Expected allowed pseudonymous columns
        allowed_columns = {
            "id",
            "child_id",
            "age_bracket",
            "birth_year_month",
            "chronological_age_months",
            "developmental_age_months",
            "visit_date",
            "domain_scores",
            "tier",
            "created_at",
        }

        assert columns == allowed_columns, (
            f"GrowthVisit columns differ from allowed privacy-safe specification. "
            f"Found: {columns}"
        )

        forbidden_patterns = [
            "name",
            "child_name",
            "parent_name",
            "email",
            "phone",
            "mobile",
            "address",
            "pincode",
            "city",
            "state",
            "free_text",
            "text",
            "notes",
            "raw",
            "ip_address",
        ]

        for col_name in columns:
            for forbidden in forbidden_patterns:
                assert forbidden not in col_name.lower(), (
                    f"Forbidden personal data substring '{forbidden}' found in column '{col_name}'"
                )


# ---------------------------------------------------------------------------
# 3. DATABASE & API FIXTURES
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def growth_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    yield override_get_db, session_factory
    await engine.dispose()


# ---------------------------------------------------------------------------
# 4. API INTEGRATION TESTS: DELETION AND CONFIGURATION FLAG
# ---------------------------------------------------------------------------

class TestGrowthSyncApi:
    """
    Acceptance checks 2 & 3:
    - Test: deleting a child ID removes all of its visits.
    - Test: with the flag off, nothing is stored on the server.
    """

    @pytest.mark.asyncio
    async def test_delete_child_removes_all_visits(self, growth_db):
        """
        Acceptance check 2:
        Test: deleting a child ID removes all of its visits while preserving
        other children's visits.
        """
        override_get_db, session_factory = growth_db
        app = create_app(with_lifespan=False)
        app.dependency_overrides[get_db] = override_get_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            child_a = "child-pseudonym-aaa-111"
            child_b = "child-pseudonym-bbb-222"

            # 1. Seed 2 visits for child A
            v1_a = {
                "child_id": child_a,
                "age_bracket": "12-18m",
                "chronological_age_months": 12.0,
                "developmental_age_months": 12.0,
                "tier": "Typical",
                "domain_scores": {"motor": "Typical"},
            }
            v2_a = {
                "child_id": child_a,
                "age_bracket": "18-24m",
                "chronological_age_months": 18.0,
                "developmental_age_months": 17.0,
                "tier": "Typical",
                "domain_scores": {"motor": "Typical"},
            }
            # Seed 1 visit for child B
            v1_b = {
                "child_id": child_b,
                "age_bracket": "24-30m",
                "chronological_age_months": 24.0,
                "developmental_age_months": 20.0,
                "tier": "Monitor",
                "domain_scores": {"speech": "Monitor"},
            }

            r = await client.post("/api/growth/visits", json=v1_a)
            assert r.status_code == 201
            r = await client.post("/api/growth/visits", json=v2_a)
            assert r.status_code == 201
            r = await client.post("/api/growth/visits", json=v1_b)
            assert r.status_code == 201

            # Verify child A has 2 visits, child B has 1 visit
            r = await client.get(f"/api/growth/visits/{child_a}")
            assert r.status_code == 200
            assert len(r.json()) == 2

            r = await client.get(f"/api/growth/visits/{child_b}")
            assert r.status_code == 200
            assert len(r.json()) == 1

            # 2. Delete all data for child A
            r_del = await client.delete(f"/api/growth/data/{child_a}")
            assert r_del.status_code == 200
            del_data = r_del.json()
            assert del_data["child_id"] == child_a
            assert del_data["deleted_count"] == 2

            # 3. Verify child A now has 0 visits
            r_after = await client.get(f"/api/growth/visits/{child_a}")
            assert r_after.status_code == 200
            assert len(r_after.json()) == 0

            # 4. Verify child B is completely untouched
            r_b_after = await client.get(f"/api/growth/visits/{child_b}")
            assert r_b_after.status_code == 200
            assert len(r_b_after.json()) == 1

            # 5. Direct DB query check: 0 visits for child_a
            async with session_factory() as db:
                res_a = await db.execute(
                    select(GrowthVisit).where(GrowthVisit.child_id == child_a)
                )
                assert len(res_a.scalars().all()) == 0

                res_b = await db.execute(
                    select(GrowthVisit).where(GrowthVisit.child_id == child_b)
                )
                assert len(res_b.scalars().all()) == 1

    @pytest.mark.asyncio
    async def test_growth_sync_disabled_flag(self, growth_db):
        """
        Acceptance check 3:
        Test: with the flag off, nothing is stored on the server.
        """
        override_get_db, session_factory = growth_db
        app = create_app(with_lifespan=False)
        app.dependency_overrides[get_db] = override_get_db

        # Override settings with growth_sync_enabled = False
        disabled_settings = Settings(
            GROWTH_SYNC_ENABLED=False,
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
        )
        from app.config import get_settings
        app.dependency_overrides[get_settings] = lambda: disabled_settings

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Status endpoint reflects sync is disabled
            r_status = await client.get("/api/growth/status")
            assert r_status.status_code == 200
            assert r_status.json()["sync_enabled"] is False

            # 2. Attempting to save visit must be rejected with 403 Forbidden
            visit_payload = {
                "child_id": "child-no-sync-test",
                "age_bracket": "18-24m",
                "chronological_age_months": 18.0,
                "tier": "Typical",
                "domain_scores": {},
            }
            r_post = await client.post("/api/growth/visits", json=visit_payload)
            assert r_post.status_code == 403
            assert "disabled by configuration" in r_post.json()["detail"].lower()

            # 3. Direct DB check: verify zero rows exist in database
            async with session_factory() as db:
                res = await db.execute(select(GrowthVisit))
                all_visits = res.scalars().all()
                assert len(all_visits) == 0, (
                    f"Expected 0 visits stored when flag is off, but found {len(all_visits)}"
                )

    @pytest.mark.asyncio
    async def test_analysis_endpoint_plateau_detection(self, growth_db):
        """
        Integration test for /api/growth/analysis/{child_id}:
        Evaluates plateau detection end-to-end.
        """
        override_get_db, _ = growth_db
        app = create_app(with_lifespan=False)
        app.dependency_overrides[get_db] = override_get_db

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            child_id = "child-plateau-test"

            # Visit 1: 12m chron, 12m dev
            v1 = {
                "child_id": child_id,
                "age_bracket": "12-18m",
                "chronological_age_months": 12.0,
                "developmental_age_months": 12.0,
                "visit_date": (datetime.now(UTC) - timedelta(days=180)).isoformat(),
                "tier": "Typical",
            }
            # Visit 2: 18m chron, 14m dev (gain 2m over 6m chron -> 2/6 = 0.33 < 0.5 -> plateau)
            v2 = {
                "child_id": child_id,
                "age_bracket": "18-24m",
                "chronological_age_months": 18.0,
                "developmental_age_months": 14.0,
                "visit_date": datetime.now(UTC).isoformat(),
                "tier": "Monitor",
            }

            await client.post("/api/growth/visits", json=v1)
            await client.post("/api/growth/visits", json=v2)

            r_analysis = await client.get(f"/api/growth/analysis/{child_id}")
            assert r_analysis.status_code == 200
            data = r_analysis.json()

            assert data["total_visits"] == 2
            assert data["is_plateau_detected"] is True
            assert len(data["intervals"]) == 1
            assert data["intervals"][0]["is_plateau"] is True
            assert data["intervals"][0]["gain_ratio"] == pytest.approx(0.3333, abs=0.01)

            # Export test
            r_export = await client.get(f"/api/growth/export/{child_id}")
            assert r_export.status_code == 200
            exp = r_export.json()
            assert exp["child_id"] == child_id
            assert exp["total_visits"] == 2
            assert "zero personal names" in exp["privacy_disclaimer"].lower()
