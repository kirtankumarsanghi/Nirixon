"""
Tests for Community Health Worker (ASHA / Anganwadi / ANM) Referral System.

Acceptance Checks Enforced:
1. A worker cannot read another area's children (area isolation -> 403 Forbidden).
2. Status transitions are enforced:
   created -> sent -> seen -> outcome recorded -> closed (invalid jumps rejected with 400).
3. The referral summary contains ONLY the listed fields:
   age_bracket, tier, domains_of_concern, safety_rule_trigger (in JSON, PDF, and shareable text).
4. Opt-in with consent recorded and removable (right to erasure).
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Test configuration
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import create_access_token, hash_password
from app.config import get_settings
from app.db.models import ChildRecord, User, Worker
from app.db.session import (
    Base,
    configure_engine,
    get_db,
    get_session_factory,
    reset_engine,
)
from app.db.session_repo import InMemorySessionRepo, set_session_repo
from app.main import create_app

ARTIFACTS = Path(__file__).resolve().parents[1] / "ml" / "artifacts"


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def referral_env(tmp_path):
    db_path = tmp_path / "test_referrals.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    os.environ["ML_ARTIFACTS_DIR"] = str(ARTIFACTS)
    get_settings.cache_clear()
    reset_engine()
    engine = configure_engine(url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    repo = InMemorySessionRepo()
    set_session_repo(repo)

    factory = get_session_factory()
    async with factory() as db:
        # Worker 1 in Ward 12
        u1 = User(
            id="user-chw-ward12",
            email="asha_ward12@example.com",
            hashed_password=hash_password("changeme"),
            role="chw",
        )
        db.add(u1)
        w1 = Worker(
            id="worker-w12",
            user_id="user-chw-ward12",
            name="Sunita Devi (ASHA)",
            role="chw",
            area="Ward 12",
            phone="9876500001",
        )
        db.add(w1)

        # Worker 2 in Ward 15
        u2 = User(
            id="user-chw-ward15",
            email="asha_ward15@example.com",
            hashed_password=hash_password("changeme"),
            role="chw",
        )
        db.add(u2)
        w2 = Worker(
            id="worker-w15",
            user_id="user-chw-ward15",
            name="Anjali Kumari (ASHA)",
            role="chw",
            area="Ward 15",
            phone="9876500002",
        )
        db.add(w2)

        # Supervisor
        u_sup = User(
            id="user-supervisor",
            email="supervisor@example.com",
            hashed_password=hash_password("changeme"),
            role="supervisor",
        )
        db.add(u_sup)
        w_sup = Worker(
            id="worker-sup",
            user_id="user-supervisor",
            name="Rekha Sharma (Supervisor)",
            role="supervisor",
            area="all",
            phone="9876500003",
        )
        db.add(w_sup)

        # Child 1 in Ward 12
        c1 = ChildRecord(
            id="child-row-1",
            pseudonymous_id="child-ward12-001",
            age_bracket="18-24m",
            village_ward="Ward 12",
            consent_given=True,
            opt_in=True,
        )
        db.add(c1)

        # Child 2 in Ward 15
        c2 = ChildRecord(
            id="child-row-2",
            pseudonymous_id="child-ward15-002",
            age_bracket="24-30m",
            village_ward="Ward 15",
            consent_given=True,
            opt_in=True,
        )
        db.add(c2)

        await db.commit()

    app = create_app(with_lifespan=False)

    async def _override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, factory

    app.dependency_overrides.clear()
    reset_engine()


def _auth_header(user_id: str, role: str) -> dict[str, str]:
    token = create_access_token(subject=user_id, role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_worker_cannot_read_another_areas_children(referral_env):
    """
    Acceptance check 1: A worker cannot read another area's children.
    Worker 1 (Ward 12) must only see Ward 12 children, and must receive
    403 Forbidden when attempting to access Ward 15 children.
    """
    client, _ = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")
    h15 = _auth_header("user-chw-ward15", "chw")

    # 1. Listing children: Worker 1 in Ward 12 sees only Child 1
    resp1 = await client.get("/api/chw/children", headers=h12)
    assert resp1.status_code == 200, resp1.text
    children_w12 = resp1.json()
    assert len(children_w12) == 1
    assert children_w12[0]["pseudonymous_id"] == "child-ward12-001"
    assert children_w12[0]["village_ward"] == "Ward 12"

    # Worker 2 in Ward 15 sees only Child 2
    resp2 = await client.get("/api/chw/children", headers=h15)
    assert resp2.status_code == 200, resp2.text
    children_w15 = resp2.json()
    assert len(children_w15) == 1
    assert children_w15[0]["pseudonymous_id"] == "child-ward15-002"
    assert children_w15[0]["village_ward"] == "Ward 15"

    # 2. Direct read by ID: Worker 1 can read Child 1
    r_own = await client.get("/api/chw/children/child-ward12-001", headers=h12)
    assert r_own.status_code == 200
    assert r_own.json()["pseudonymous_id"] == "child-ward12-001"

    # 3. Direct read by ID: Worker 1 CANNOT read Child 2 (Ward 15) -> 403 Forbidden
    r_foreign = await client.get("/api/chw/children/child-ward15-002", headers=h12)
    assert r_foreign.status_code == 403, (
        f"Expected 403 Forbidden for cross-area access, got {r_foreign.status_code}: {r_foreign.text}"
    )

    # Worker 2 CANNOT read Child 1 (Ward 12) -> 403 Forbidden
    r_foreign2 = await client.get("/api/chw/children/child-ward12-001", headers=h15)
    assert r_foreign2.status_code == 403

    # 4. Worker 1 cannot create a referral for Child 2 in Ward 15
    ref_payload = {
        "child_id": "child-ward15-002",
        "to_facility": "Safdarjung Hospital DEIC",
        "reason": "Gross motor delay",
        "tier": "Tier 3: Direct Referral",
        "domains_of_concern": ["motor"],
    }
    r_cross_refer = await client.post("/api/referrals", json=ref_payload, headers=h12)
    assert r_cross_refer.status_code == 403, (
        f"Expected 403 Forbidden when referring child from another area, got {r_cross_refer.status_code}"
    )


@pytest.mark.asyncio
async def test_status_transitions_are_enforced(referral_env):
    """
    Acceptance check 2: Status transitions are strictly enforced:
    created -> sent -> seen -> outcome recorded -> closed.
    Invalid transitions and out-of-order calls are rejected with HTTP 400.
    """
    client, _ = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")

    # 1. Create referral: initial status must be 'created'
    create_resp = await client.post(
        "/api/referrals",
        json={
            "child_id": "child-ward12-001",
            "to_facility": "CHC Rampur Pediatric Wing",
            "reason": "Speech and language delay flagged during check-in",
            "tier": "Tier 3: Direct Referral",
            "domains_of_concern": ["communication", "cognitive"],
            "safety_rule_trigger": "Language score <= -2.0 SD",
        },
        headers=h12,
    )
    assert create_resp.status_code == 201, create_resp.text
    ref_data = create_resp.json()
    ref_id = ref_data["id"]
    assert ref_data["status"] == "created"
    assert "timestamps" in ref_data

    # 2. INVALID TRANSITION: created -> seen (must be sent first!) -> 400
    jump_seen = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "seen"},
        headers=h12,
    )
    assert jump_seen.status_code == 400, (
        f"Expected 400 for skipping 'sent', got {jump_seen.status_code}: {jump_seen.text}"
    )

    # 3. INVALID TRANSITION: created -> outcome recorded -> 400
    jump_outcome = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "outcome recorded"},
        headers=h12,
    )
    assert jump_outcome.status_code == 400

    # 4. Attempt to record outcome while still in 'created' -> 400
    bad_outcome_call = await client.post(
        f"/api/referrals/{ref_id}/outcome",
        json={"outcome_notes": "Premature outcome attempt"},
        headers=h12,
    )
    assert bad_outcome_call.status_code == 400

    # 5. VALID TRANSITION: created -> sent -> 200
    to_sent = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "sent"},
        headers=h12,
    )
    assert to_sent.status_code == 200
    assert to_sent.json()["status"] == "sent"
    assert to_sent.json()["sent_at"] is not None

    # 6. INVALID TRANSITION: sent -> created (cannot revert back!) -> 400
    revert_created = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "created"},
        headers=h12,
    )
    assert revert_created.status_code == 400

    # 7. VALID TRANSITION: sent -> seen -> 200
    to_seen = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "seen"},
        headers=h12,
    )
    assert to_seen.status_code == 200
    assert to_seen.json()["status"] == "seen"
    assert to_seen.json()["seen_at"] is not None

    # 8. VALID OUTCOME RECORDING: seen -> outcome recorded -> 200
    outcome_resp = await client.post(
        f"/api/referrals/{ref_id}/outcome",
        json={
            "outcome_notes": "Child examined by pediatrician Dr. Sen. Speech therapy scheduled 2x weekly.",
        },
        headers=h12,
    )
    assert outcome_resp.status_code == 200, outcome_resp.text
    out_data = outcome_resp.json()
    assert out_data["status"] == "outcome recorded"
    assert out_data["outcome_notes"] == "Child examined by pediatrician Dr. Sen. Speech therapy scheduled 2x weekly."
    assert out_data["outcome_recorded_at"] is not None

    # 9. INVALID TRANSITION: outcome recorded -> seen -> 400
    back_to_seen = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "seen"},
        headers=h12,
    )
    assert back_to_seen.status_code == 400

    # 10. VALID TRANSITION: outcome recorded -> closed -> 200
    to_closed = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "closed"},
        headers=h12,
    )
    assert to_closed.status_code == 200
    assert to_closed.json()["status"] == "closed"
    assert to_closed.json()["closed_at"] is not None

    # 11. INVALID TRANSITION: closed -> anything (terminal state) -> 400
    reopen = await client.patch(
        f"/api/referrals/{ref_id}",
        json={"status": "sent"},
        headers=h12,
    )
    assert reopen.status_code == 400


@pytest.mark.asyncio
async def test_summary_contains_only_listed_fields(referral_env):
    """
    Acceptance check 3: The referral summary contains ONLY the listed fields:
    (age bracket, tier, domains of concern, safety rule trigger) as printable PDF
    or shareable text, with the minimum data needed.
    """
    client, _ = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")

    # Create referral with domain concerns & safety rule trigger
    create_resp = await client.post(
        "/api/referrals",
        json={
            "child_id": "child-ward12-001",
            "to_facility": "AIIMS Pediatric Developmental Clinic",
            "reason": "Severe gross motor milestone loss",
            "tier": "Tier 3: Direct Referral",
            "domains_of_concern": ["gross_motor", "fine_motor"],
            "safety_rule_trigger": "Motor SD <= -2.0",
        },
        headers=h12,
    )
    assert create_resp.status_code == 201
    ref_id = create_resp.json()["id"]

    # 1. Test JSON Summary: Verify EXACT key set
    sum_resp = await client.get(f"/api/referrals/{ref_id}/summary", headers=h12)
    assert sum_resp.status_code == 200, sum_resp.text
    summary_data = sum_resp.json()

    # CRITICAL ACCEPTANCE CHECK: Must contain ONLY the listed fields
    expected_fields = {"age_bracket", "tier", "domains_of_concern", "safety_rule_trigger"}
    actual_fields = set(summary_data.keys())
    assert actual_fields == expected_fields, (
        f"Summary contains unlisted fields! Expected {expected_fields}, got {actual_fields}"
    )

    # Verify content correctness
    assert summary_data["age_bracket"] == "18-24m"
    assert summary_data["tier"] == "Tier 3: Direct Referral"
    assert summary_data["domains_of_concern"] == ["gross_motor", "fine_motor"]
    assert summary_data["safety_rule_trigger"] == "Motor SD <= -2.0"

    # 2. Test Shareable Text Summary
    text_resp = await client.get(
        f"/api/referrals/{ref_id}/summary",
        params={"format": "text"},
        headers=h12,
    )
    assert text_resp.status_code == 200
    assert "text/plain" in text_resp.headers["content-type"]
    text_body = text_resp.text
    assert "Age Bracket: 18-24m" in text_body
    assert "Tier: Tier 3: Direct Referral" in text_body
    assert "gross_motor" in text_body
    assert "Motor SD <= -2.0" in text_body
    # Ensure zero child names or IDs are leaked in text
    assert "child-row-1" not in text_body

    # 3. Test Printable PDF Summary
    pdf_resp = await client.get(
        f"/api/referrals/{ref_id}/summary",
        params={"format": "pdf"},
        headers=h12,
    )
    assert pdf_resp.status_code == 200
    assert "application/pdf" in pdf_resp.headers["content-type"]
    pdf_bytes = pdf_resp.content
    assert pdf_bytes.startswith(b"%PDF-1.4"), "PDF must have standard PDF-1.4 header"
    assert b"%%EOF" in pdf_bytes, "PDF must end with %%EOF marker"
    assert len(pdf_bytes) > 200, "PDF must have non-empty stream contents"


@pytest.mark.asyncio
async def test_opt_in_consent_and_removable(referral_env):
    """
    Test opt-in consent requirement, timestamping, and permanent removability.
    """
    client, _ = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")

    # 1. Attempt to register without consent -> 400 Bad Request
    no_consent = await client.post(
        "/api/chw/children",
        json={
            "pseudonymous_id": "child-no-consent",
            "age_bracket": "12-18m",
            "village_ward": "Ward 12",
            "consent_given": False,
        },
        headers=h12,
    )
    assert no_consent.status_code == 400
    assert "consent" in no_consent.text.lower()

    # 2. Register with consent -> 201 Created with consent timestamp
    with_consent = await client.post(
        "/api/chw/children",
        json={
            "pseudonymous_id": "child-consent-ok",
            "age_bracket": "12-18m",
            "village_ward": "Ward 12",
            "consent_given": True,
        },
        headers=h12,
    )
    assert with_consent.status_code == 201
    c_data = with_consent.json()
    assert c_data["consent_given"] is True
    assert c_data["consent_recorded_at"] is not None

    # Create referral for this child
    ref_resp = await client.post(
        "/api/referrals",
        json={
            "child_id": "child-consent-ok",
            "to_facility": "Sub-district Hospital",
            "reason": "Milestone check",
            "tier": "Tier 2",
        },
        headers=h12,
    )
    assert ref_resp.status_code == 201
    ref_id = ref_resp.json()["id"]

    # 3. Test Removability: Delete child record permanently purges child and referral
    del_resp = await client.delete("/api/chw/children/child-consent-ok", headers=h12)
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True

    # Child no longer accessible
    get_child = await client.get("/api/chw/children/child-consent-ok", headers=h12)
    assert get_child.status_code == 404

    # Referral no longer accessible
    get_ref = await client.get(f"/api/referrals/{ref_id}", headers=h12)
    assert get_ref.status_code == 404


@pytest.mark.asyncio
async def test_supervisor_access_and_cross_area_summary_forbidden(referral_env):
    """
    Test that:
    1. A supervisor with area='all' can read children across all areas.
    2. A worker cannot request a referral summary for another area's child (403).
    3. Direct text and PDF summary endpoints work.
    4. Individual referral deletion works.
    """
    client, _ = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")
    h15 = _auth_header("user-chw-ward15", "chw")
    h_sup = _auth_header("user-supervisor", "supervisor")

    # 1. Supervisor can see children in both areas
    sup_children = await client.get("/api/chw/children", headers=h_sup)
    assert sup_children.status_code == 200
    ids = [c["pseudonymous_id"] for c in sup_children.json()]
    assert "child-ward12-001" in ids
    assert "child-ward15-002" in ids

    # 2. Worker 1 creates referral in Ward 12
    ref_w12 = await client.post(
        "/api/referrals",
        json={
            "child_id": "child-ward12-001",
            "to_facility": "DEIC Central",
            "reason": "Fine motor delay",
            "tier": "Tier 3: Direct Referral",
            "domains_of_concern": ["fine_motor"],
            "safety_rule_trigger": "Grip reflex absent",
        },
        headers=h12,
    )
    assert ref_w12.status_code == 201
    ref12_id = ref_w12.json()["id"]

    # 3. Worker 2 (Ward 15) tries to access summary of Ward 12 referral -> 403 Forbidden
    cross_sum = await client.get(f"/api/referrals/{ref12_id}/summary", headers=h15)
    assert cross_sum.status_code == 403

    # 4. Worker 1 accesses dedicated text summary endpoint
    txt_res = await client.get(f"/api/referrals/{ref12_id}/summary/text", headers=h12)
    assert txt_res.status_code == 200
    assert "Age Bracket: 18-24m" in txt_res.text
    assert "fine_motor" in txt_res.text

    # 5. Worker 1 accesses dedicated PDF summary endpoint
    pdf_res = await client.get(f"/api/referrals/{ref12_id}/summary/pdf", headers=h12)
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF-1.4")

    # 6. Delete referral individually
    del_res = await client.delete(f"/api/referrals/{ref12_id}", headers=h12)
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Check 404 after deletion
    check_del = await client.get(f"/api/referrals/{ref12_id}", headers=h12)
    assert check_del.status_code == 404


async def _insert_children(db_factory, area: str, count: int) -> None:
    """Insert dashboard child fixtures directly into the DB (no seed endpoint)."""
    now = datetime.now(UTC)
    age_brackets = ["0-6m", "6-12m", "12-24m", "24-36m", "36-48m", "48-60m"]
    sub_wards = [f"{area} - Sector {s}" for s in ("A", "B", "C", "D")]
    async with db_factory() as db:
        for i in range(count):
            mod = i % 10
            bracket = age_brackets[i % len(age_brackets)]
            sub_ward = sub_wards[i % len(sub_wards)]
            if mod in (0, 1, 2, 3):
                tier, domains, safety = "Tier 1: Typical", [], None
                last_screened = now - timedelta(days=10 + (i % 50))
                last_contacted = now - timedelta(days=5 + (i % 20))
                follow_up = now + timedelta(days=60 + (i % 30))
                contacts = 2 + (i % 4)
            elif mod in (4, 5, 6):
                tier = "Tier 2: In-App Reflex Monitor"
                domains = ["social_emotional"] if i % 2 == 0 else ["fine_motor", "communication"]
                safety = None
                last_screened = now - timedelta(days=14 + (i % 40))
                last_contacted = now - timedelta(days=3 + (i % 15))
                follow_up = (
                    now - timedelta(days=3 + (i % 10))
                    if i % 3 == 0
                    else now + timedelta(days=14 + (i % 20))
                )
                contacts = 3 + (i % 5)
            elif mod in (7, 8):
                tier = "Tier 3: Direct Referral"
                domains = ["gross_motor", "communication"] if i % 2 == 0 else ["motor", "cognitive"]
                safety = (
                    "Loss of motor milestones (SD <= -2.0)"
                    if i % 2 == 0
                    else "Severe developmental divergence flagged"
                )
                last_screened = now - timedelta(days=5 + (i % 25))
                last_contacted = now - timedelta(days=2 + (i % 10))
                follow_up = (
                    now - timedelta(days=4 + (i % 12))
                    if i % 2 == 0
                    else now + timedelta(days=7 + (i % 14))
                )
                contacts = 4 + (i % 6)
            else:
                tier, domains, safety = "Unscreened", [], None
                last_screened = last_contacted = follow_up = None
                contacts = 0

            db.add(
                ChildRecord(
                    pseudonymous_id=f"{area.replace(' ', '').lower()}-{i + 1:03d}",
                    age_bracket=bracket,
                    village_ward=sub_ward,
                    consent_given=True,
                    consent_recorded_at=now - timedelta(days=60),
                    opt_in=True,
                    current_tier=tier,
                    last_screened_at=last_screened,
                    last_contacted_at=last_contacted,
                    follow_up_due_at=follow_up,
                    contact_count=contacts,
                    domains_flagged=domains,
                    safety_rule_triggered=safety,
                    created_at=now - timedelta(days=60 - (i % 30)),
                )
            )
        await db.commit()


@pytest.mark.asyncio
async def test_low_literacy_worker_dashboard_filter_actions(referral_env):
    """
    Acceptance check for the low-literacy worker dashboard:
    1. Load 200 children with realistic tiers, age groups, and overdue visits.
    2. List 200 children and verify tier counts per tier.
    3. Verify mobile-first filters (tier, overdue follow-up, age group, search).
    4. Quick action: mark 'contacted' (updates timestamp and contact count).
    5. Quick action: one-touch referral (uses 6a minimal summary).
    6. Quick action: record outcome (updates referral and child follow-up).
    """
    client, db_factory = referral_env
    h12 = _auth_header("user-chw-ward12", "chw")

    # 1. Insert 200 children in Ward 12 directly (dashboard fixtures)
    await _insert_children(db_factory, "Ward 12", 200)

    # 2. Get Tier counts
    counts_res = await client.get("/api/chw/tier-counts", headers=h12)
    assert counts_res.status_code == 200
    counts = counts_res.json()
    assert counts["total_children"] >= 200
    assert counts["tier1_typical"] > 0
    assert counts["tier2_monitor"] > 0
    assert counts["tier3_referral"] > 0
    assert counts["unscreened"] > 0
    assert counts["overdue_follow_up"] > 0

    # 3. List children: verify full list loads (at least 200)
    list_res = await client.get("/api/chw/children?limit=500", headers=h12)
    assert list_res.status_code == 200
    children = list_res.json()
    assert len(children) >= 200

    # Verify is_overdue field is present on children
    overdue_children = [c for c in children if c["is_overdue"]]
    assert len(overdue_children) > 0

    # 4. Filter by Tier 3
    t3_res = await client.get("/api/chw/children?tier=Tier%203", headers=h12)
    assert t3_res.status_code == 200
    t3_list = t3_res.json()
    assert len(t3_list) > 0
    for c in t3_list:
        assert "Tier 3" in c["current_tier"]

    # 5. Filter by overdue_only
    overdue_res = await client.get("/api/chw/children?overdue_only=true", headers=h12)
    assert overdue_res.status_code == 200
    od_list = overdue_res.json()
    assert len(od_list) > 0
    for c in od_list:
        assert c["is_overdue"] is True

    # 6. Filter by age_group
    age_res = await client.get("/api/chw/children?age_group=12-24m", headers=h12)
    assert age_res.status_code == 200
    age_list = age_res.json()
    assert len(age_list) > 0
    for c in age_list:
        assert c["age_bracket"] == "12-24m"

    # 7. Search filter
    search_res = await client.get("/api/chw/children?search=001", headers=h12)
    assert search_res.status_code == 200
    s_list = search_res.json()
    assert len(s_list) > 0
    assert all("001" in c["pseudonymous_id"] or "001" in c["village_ward"] for c in s_list)

    # Pick a child to test quick actions
    target_child = children[0]
    cid = target_child["id"]
    prev_contacts = target_child["contact_count"]

    # Quick Action: Mark contacted
    contact_res = await client.post(f"/api/chw/children/{cid}/contact", headers=h12)
    assert contact_res.status_code == 200
    c_data = contact_res.json()
    assert c_data["contact_count"] == prev_contacts + 1
    assert c_data["last_contacted_at"] is not None

    # Quick Action: One-touch referral (uses 6a minimal summary)
    ref_res = await client.post(f"/api/chw/children/{cid}/one-touch-referral", headers=h12)
    assert ref_res.status_code == 200
    one_touch = ref_res.json()
    assert "referral" in one_touch
    assert "summary" in one_touch

    # Requirement 6a check: summary contains ONLY the 4 fields
    summary = one_touch["summary"]
    assert set(summary.keys()) == {
        "age_bracket",
        "tier",
        "domains_of_concern",
        "safety_rule_trigger",
    }
    assert summary["age_bracket"] == target_child["age_bracket"]
    assert len(summary["domains_of_concern"]) > 0

    # Quick Action: Record outcome
    outcome_res = await client.post(
        f"/api/chw/children/{cid}/outcome",
        json={
            "outcome_notes": "Child examined at DEIC. Speech therapy exercises given to mother.",
            "new_tier": "Tier 2: In-App Reflex Monitor",
            "next_follow_up_days": 14,
            "close_referral": True,
        },
        headers=h12,
    )
    assert outcome_res.status_code == 200
    outcome_data = outcome_res.json()
    assert outcome_data["status"] == "closed"
    assert "Speech therapy" in outcome_data["outcome_notes"]


@pytest.mark.asyncio
async def test_offline_idempotent_sync_and_conflict_handling(referral_env):
    """
    Acceptance Check:
    Complete a screening and a referral offline, reconnect, and confirm
    EXACTLY ONE record of each after two sync retries.
    Also verifies conflict detection and conflict logging.
    """
    client, db_factory = referral_env

    # 1. Create worker
    w_res = await client.post(
        "/api/chw/workers",
        json={
            "name": "Kavita Sharma (ASHA)",
            "role": "chw",
            "area": "Ward 12",
            "phone": "9876500099",
        },
    )
    assert w_res.status_code in (200, 201)
    headers = _auth_header("user-chw-ward12", "chw")

    # 2. Register child
    c_res = await client.post(
        "/api/chw/children",
        json={
            "age_bracket": "18-24m",
            "village_ward": "Ward 12 - Sector A",
            "consent_given": True,
        },
        headers=headers,
    )
    assert c_res.status_code in (200, 201)
    child = c_res.json()
    child_id = child["id"]

    # 3. Simulate offline actions performed while disconnected
    screen_key = "offline-screen-batch-001"
    referral_key = "offline-referral-batch-001"

    offline_screening_op = {
        "idempotency_key": screen_key,
        "operation": "screening",
        "child_id": child_id,
        "payload": {
            "tier": "Tier 3: Direct Referral",
            "domains_flagged": ["gross_motor", "communication"],
            "safety_rule_triggered": "Loss of motor milestones (SD <= -2.0)",
            "answers": {"GM01": 0, "GM02": 0, "CM01": 0},
            "module": "A",
            "notes": "Completed in field during home visit",
        },
    }

    offline_referral_op = {
        "idempotency_key": referral_key,
        "operation": "referral",
        "child_id": child_id,
        "payload": {
            "to_facility": "Safdarjung Hospital DEIC",
            "reason": "Severe gross motor milestone lag",
            "tier": "Tier 3: Direct Referral",
            "domains_of_concern": ["gross_motor", "communication"],
            "safety_rule_trigger": "Loss of motor milestones (SD <= -2.0)",
        },
    }

    sync_batch = {
        "operations": [offline_screening_op, offline_referral_op]
    }

    # 4. RECONNECT: Initial sync
    sync_res_1 = await client.post("/api/chw/sync", json=sync_batch, headers=headers)
    assert sync_res_1.status_code == 200
    data_1 = sync_res_1.json()

    assert data_1["processed_count"] == 2
    assert data_1["created_count"] == 2
    assert data_1["deduplicated_count"] == 0
    assert data_1["conflict_count"] == 0
    assert len(data_1["results"]) == 2
    assert data_1["results"][0]["status"] == "created"
    assert data_1["results"][1]["status"] == "created"

    # Verify DB has exactly ONE screening session and exactly ONE referral
    from app.db.models import Referral as DbReferral
    from app.db.models import ScreeningSession as DbScreening
    from sqlalchemy import select

    async with db_factory() as session:
        screen_rows = (
            await session.execute(
                select(DbScreening).where(DbScreening.idempotency_key == screen_key)
            )
        ).scalars().all()
        assert len(screen_rows) == 1, f"Expected exactly 1 screening session, got {len(screen_rows)}"

        ref_rows = (
            await session.execute(
                select(DbReferral).where(DbReferral.idempotency_key == referral_key)
            )
        ).scalars().all()
        assert len(ref_rows) == 1, f"Expected exactly 1 referral record, got {len(ref_rows)}"

    # 5. RETRY 1: First sync retry with identical idempotency keys
    sync_res_2 = await client.post("/api/chw/sync", json=sync_batch, headers=headers)
    assert sync_res_2.status_code == 200
    data_2 = sync_res_2.json()

    assert data_2["processed_count"] == 2
    assert data_2["created_count"] == 0
    assert data_2["deduplicated_count"] == 2
    assert data_2["conflict_count"] == 0
    assert data_2["results"][0]["status"] == "deduplicated"
    assert data_2["results"][1]["status"] == "deduplicated"

    # Confirm STILL exactly ONE record of each in database
    async with db_factory() as session:
        screen_rows_retry1 = (
            await session.execute(
                select(DbScreening).where(DbScreening.idempotency_key == screen_key)
            )
        ).scalars().all()
        assert len(screen_rows_retry1) == 1, "Expected still exactly 1 screening after retry 1"

        ref_rows_retry1 = (
            await session.execute(
                select(DbReferral).where(DbReferral.idempotency_key == referral_key)
            )
        ).scalars().all()
        assert len(ref_rows_retry1) == 1, "Expected still exactly 1 referral after retry 1"

    # 6. RETRY 2: Second sync retry with identical idempotency keys
    sync_res_3 = await client.post("/api/chw/sync", json=sync_batch, headers=headers)
    assert sync_res_3.status_code == 200
    data_3 = sync_res_3.json()

    assert data_3["processed_count"] == 2
    assert data_3["created_count"] == 0
    assert data_3["deduplicated_count"] == 2
    assert data_3["conflict_count"] == 0
    assert data_3["results"][0]["status"] == "deduplicated"
    assert data_3["results"][1]["status"] == "deduplicated"

    # Confirm STILL exactly ONE record of each in database after two retries
    async with db_factory() as session:
        screen_rows_retry2 = (
            await session.execute(
                select(DbScreening).where(DbScreening.idempotency_key == screen_key)
            )
        ).scalars().all()
        assert len(screen_rows_retry2) == 1, "Expected exactly 1 screening after retry 2"

        ref_rows_retry2 = (
            await session.execute(
                select(DbReferral).where(DbReferral.idempotency_key == referral_key)
            )
        ).scalars().all()
        assert len(ref_rows_retry2) == 1, "Expected exactly 1 referral after retry 2"

    # 7. CONFLICT HANDLING & CONFLICT LOG TEST:
    conflict_batch = {
        "operations": [
            {
                "idempotency_key": "offline-conflict-test-001",
                "operation": "referral",
                "child_id": "non-existent-child-uuid",
                "payload": {
                    "to_facility": "DEIC",
                    "reason": "Test conflict non existent",
                    "tier": "Tier 3",
                },
            }
        ]
    }
    conflict_res = await client.post("/api/chw/sync", json=conflict_batch, headers=headers)
    assert conflict_res.status_code == 200
    conf_data = conflict_res.json()
    assert conf_data["conflict_count"] == 1
    assert conf_data["results"][0]["status"] == "conflict"

    # Verify conflict log endpoint returns recorded conflict
    conflicts_list_res = await client.get("/api/chw/conflicts", headers=headers)
    assert conflicts_list_res.status_code == 200
    conflicts = conflicts_list_res.json()
    assert len(conflicts) >= 1
    assert any(c["entity_id"] == "non-existent-child-uuid" for c in conflicts)


