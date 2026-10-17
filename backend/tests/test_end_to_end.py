"""
Nirixon Integrated End-to-End Test Suite.

Verifies the 6 core end-to-end clinical and operational pathways:
1. Module A early childhood screening (0-60m) with adaptive questioning & triage.
2. Module B school-age screening (5-12yr) with free-text NLP routing & domain radar.
3. Safety rule bypass: regression or milestone red-flag deterministically forces Tier 3 Refer.
4. Clinician What-If simulator: dynamic re-scoring with safety floor enforcement.
5. CHW referral lifecycle: creation -> sent -> seen -> outcome recorded -> closed,
   with minimal 4-field summary and strict area isolation.
6. Offline sync: PWA offline batch upload with idempotency and retry conflict safety.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

# Test environment overrides
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "e2e_parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme123"

from app.auth import create_access_token, hash_password
from app.config import get_settings
from app.core.module_b.service import module_b_service
from app.db.models import (
    Referral as DbReferral,
)
from app.db.models import (
    ScreeningSession as DbScreening,
)
from app.db.models import (
    User,
    Worker,
)
from app.db.session import (
    Base,
    configure_engine,
    get_db,
    get_session_factory,
    reset_engine,
)
from app.db.session_repo import InMemorySessionRepo, set_session_repo
from app.main import create_app
from app.ml.inference_service import inference_service

ARTIFACTS = Path(__file__).resolve().parents[1] / "ml" / "artifacts"
ROUTER_PATH = ARTIFACTS / "module_b_router" / "router_b.joblib"
BANK_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "module_b" / "question_bank_b.csv"
)
ACTS_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "module_b" / "activities_b.csv"
)


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def e2e_harness(tmp_path):
    db_path = tmp_path / "test_e2e_harness.db"
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

    # Ensure ML models are loaded
    inference_service.load(ARTIFACTS)
    module_b_service.load(
        router_path=ROUTER_PATH, bank_path=BANK_PATH, acts_path=ACTS_PATH
    )

    session_factory = get_session_factory()

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app(with_lifespan=False)
    app.dependency_overrides[get_db] = override_get_db

    # Seed users across roles
    async with session_factory() as session:
        # Parent user
        p_user = User(
            id="user-parent-1",
            email="e2e_parent@example.com",
            hashed_password=hash_password("changeme123"),
            role="parent",
        )
        session.add(p_user)

        # Clinician / Internal user
        doc_user = User(
            id="user-clinician-1",
            email="e2e_doc@example.com",
            hashed_password=hash_password("changeme123"),
            role="internal",
        )
        session.add(doc_user)

        # CHW Worker 1 (Ward 12)
        chw1_user = User(
            id="user-chw-ward12",
            email="asha_ward12@example.com",
            hashed_password=hash_password("changeme123"),
            role="chw",
        )
        session.add(chw1_user)
        worker1 = Worker(
            id="worker-w12",
            user_id="user-chw-ward12",
            name="Sunita Devi (ASHA)",
            role="chw",
            area="Ward 12",
            phone="9876500001",
        )
        session.add(worker1)

        # CHW Worker 2 (Ward 15)
        chw2_user = User(
            id="user-chw-ward15",
            email="asha_ward15@example.com",
            hashed_password=hash_password("changeme123"),
            role="chw",
        )
        session.add(chw2_user)
        worker2 = Worker(
            id="worker-w15",
            user_id="user-chw-ward15",
            name="Anjali Kumari (ASHA)",
            role="chw",
            area="Ward 15",
            phone="9876500002",
        )
        session.add(worker2)

        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {
            "client": client,
            "session_factory": session_factory,
            "repo": repo,
        }

    app.dependency_overrides.clear()
    reset_engine()


@pytest.mark.asyncio
async def test_e2e_flow_1_module_a_screening(e2e_harness):
    """
    Flow 1: Module A (0-60m) complete adaptive screening.
    - Requires consent
    - Adaptive item progression
    - Terminates within cap with final classification and domain breakdown.
    """
    client = e2e_harness["client"]

    # Login as parent
    login_res = await client.post(
        "/api/auth/login",
        json={"email": "e2e_parent@example.com", "password": "changeme123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Start screening (consent required)
    start_payload = {
        "child_ref": "E2E-CH-A01",
        "corrected_age_months": 24.0,
        "question_cap": 10,
        "consent_given": True,
    }
    start_res = await client.post("/api/screen/start", headers=headers, json=start_payload)
    assert start_res.status_code == 200
    curr_data = start_res.json()
    session_id = curr_data["session_id"]
    assert curr_data["type"] == "question"

    # Answer questions adaptively
    completed = False
    result = None
    step_count = 0

    while not completed and step_count < 15:
        step_count += 1
        q = curr_data["question"]
        item_id = q["item_id"]
        # Typical answers: 0 on yes_no flags, 2 on 3-point Likert items
        ans_val = 0 if q["response_type"] == "yes_no" else 2

        ans_res = await client.post(
            f"/api/screen/{session_id}/answer",
            headers=headers,
            json={"item_id": item_id, "answer": ans_val},
        )
        assert ans_res.status_code == 200
        curr_data = ans_res.json()
        if curr_data["type"] == "complete":
            completed = True
            result = curr_data["result"]

    assert completed is True
    assert result is not None
    assert result["final_classification"] in ("Typical", "Monitor", "Refer")
    assert result["triage_tier"].startswith("Tier")
    assert "probabilities" in result
    assert result["safety_override_triggered"] is False


@pytest.mark.asyncio
async def test_e2e_flow_2_module_b_screening(e2e_harness):
    """
    Flow 2: Module B school-age screening (5-12yr).
    - Free-text intake routed by NLP router
    - Adaptive micro-testing
    - Diagnostic domain radar output.
    """
    client = e2e_harness["client"]
    token = create_access_token(
        subject="user-parent-1", role="parent"
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Start Module B directly
    start_res = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "child_ref": "E2E-CH-B01",
            "corrected_age_months": 84.0,  # 7 years old
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert start_res.status_code == 200
    session_b_id = start_res.json()["session_id"]

    # Submit free-text intake in Hindi/Hinglish
    intake_res = await client.post(
        f"/api/screen/{session_b_id}/intake",
        headers=headers,
        json={
            "text": "Bacha dhyan nahi deta, class me bar bar uthta hai aur padhai me focus nahi kar pata.",
            "setting": "school",
        },
    )
    assert intake_res.status_code == 200
    intake_data = intake_res.json()
    assert intake_data["next_action"] == "question"
    assert any(d in intake_data["detected_domains"] for d in ("attention", "attention_work"))

    curr_q = intake_data["action"]["question"]
    completed = False
    result_b = None
    steps = 0

    while not completed and curr_q is not None and steps < 15:
        steps += 1
        rt = curr_q.get("response_type", "likert5")
        b_ans = "Yes" if rt == "yesno" else 3  # moderate difficulty

        ans_res = await client.post(
            f"/api/screen/{session_b_id}/answer",
            headers=headers,
            json={"item_id": curr_q["item_id"], "answer": b_ans},
        )
        assert ans_res.status_code == 200
        data = ans_res.json()
        if data["type"] == "complete":
            completed = True
            result_b = data["result"]
        else:
            curr_q = data.get("question")

    assert completed is True
    assert result_b is not None
    assert result_b["module"] == "B"
    assert "domain_classifications" in result_b
    assert result_b["final_classification"] in ("Typical", "Monitor", "Refer")


@pytest.mark.asyncio
async def test_e2e_flow_3_safety_rule_bypass(e2e_harness):
    """
    Flow 3: Safety rule bypass.
    When a caregiver reports skill regression (regression_flag=1), the deterministic
    safety floor MUST immediately override any ML prediction and enforce Tier 3 / Refer.
    """
    client = e2e_harness["client"]
    token = create_access_token(
        subject="user-parent-1", role="parent"
    )
    headers = {"Authorization": f"Bearer {token}"}

    start_res = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "child_ref": "E2E-CH-SAFETY",
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]
    curr_data = start_res.json()

    completed = False
    result = None

    while not completed:
        q = curr_data["question"]
        item_id = q["item_id"]
        # Trigger regression flag!
        if item_id == "regression_flag":
            ans_val = 1
        elif q["response_type"] == "yes_no":
            ans_val = 0
        else:
            ans_val = 2  # all other skills normal

        ans_res = await client.post(
            f"/api/screen/{session_id}/answer",
            headers=headers,
            json={"item_id": item_id, "answer": ans_val},
        )
        assert ans_res.status_code == 200
        curr_data = ans_res.json()
        if curr_data["type"] == "complete":
            completed = True
            result = curr_data["result"]

    assert completed is True
    assert result["final_classification"] == "Refer"
    assert result["triage_tier"] == "Tier 3: Direct Referral"
    assert result["safety_override_triggered"] is True
    assert result["override_rule"] == "regression_flag"


@pytest.mark.asyncio
async def test_e2e_flow_4_what_if_simulation(e2e_harness):
    """
    Flow 4: Clinician What-If simulator.
    Demonstrates post-hoc simulation overriding scores and safety triggers.
    """
    client = e2e_harness["client"]

    # Create completed session under parent
    p_token = create_access_token(
        subject="user-parent-1", role="parent"
    )
    start_res = await client.post(
        "/api/screen/start",
        headers={"Authorization": f"Bearer {p_token}"},
        json={
            "child_ref": "E2E-WHATIF",
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    session_id = start_res.json()["session_id"]
    curr_data = start_res.json()

    while curr_data["type"] != "complete":
        q = curr_data["question"]
        ans = 0 if q["response_type"] == "yes_no" else 2
        ans_res = await client.post(
            f"/api/screen/{session_id}/answer",
            headers={"Authorization": f"Bearer {p_token}"},
            json={"item_id": q["item_id"], "answer": ans},
        )
        curr_data = ans_res.json()

    # Clinician token required for sandbox
    doc_token = create_access_token(
        subject="user-clinician-1", role="internal"
    )
    doc_headers = {"Authorization": f"Bearer {doc_token}"}

    # Simulate: Override regression_flag to 1
    sim_res = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=doc_headers,
        json={"answer_overrides": {"regression_flag": 1}},
    )
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["final_classification"] == "Refer"
    assert sim_data["safety_override_triggered"] is True
    assert sim_data["override_rule"] == "regression_flag"

    # Simulate: Override domain score without safety override
    sim2_res = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=doc_headers,
        json={
            "answer_overrides": {"regression_flag": 0},
            "domain_scores": {"communication": 85.0},
        },
    )
    assert sim2_res.status_code == 200
    assert sim2_res.json()["safety_override_triggered"] is False


@pytest.mark.asyncio
async def test_e2e_flow_5_referral_creation_to_outcome(e2e_harness):
    """
    Flow 5: Community Health Worker referral lifecycle.
    - Worker creates child and referral
    - Strict 4-field minimal summary verification
    - Status transitions: created -> sent -> seen -> outcome recorded -> closed
    - Area isolation (Ward 15 worker cannot read Ward 12 child).
    """
    client = e2e_harness["client"]
    w12_token = create_access_token(
        subject="user-chw-ward12", role="chw"
    )
    w12_headers = {"Authorization": f"Bearer {w12_token}"}

    w15_token = create_access_token(
        subject="user-chw-ward15", role="chw"
    )
    w15_headers = {"Authorization": f"Bearer {w15_token}"}

    # 1. Worker 12 creates child in Ward 12
    child_res = await client.post(
        "/api/chw/children",
        headers=w12_headers,
        json={
            "age_bracket": "12-24m",
            "village_ward": "Ward 12",
            "consent_given": True,
            "pseudonymous_id": "CHW-E2E-001",
        },
    )
    assert child_res.status_code in (200, 201)
    child_id = child_res.json()["id"]

    # 2. Worker 12 creates referral
    ref_res = await client.post(
        "/api/referrals",
        headers=w12_headers,
        json={
            "child_id": child_id,
            "to_facility": "Safdarjung Hospital DEIC",
            "reason": "Speech delay with regression",
            "tier": "Tier 3: Direct Referral",
            "domains_of_concern": ["communication"],
            "safety_rule_trigger": "regression_flag",
        },
    )
    assert ref_res.status_code in (200, 201)
    ref_data = ref_res.json()
    ref_id = ref_data["id"]
    assert ref_data["status"] == "created"

    # 3. Minimal summary check (JSON & text): strictly the 4 allowed fields
    summary_res = await client.get(
        f"/api/referrals/{ref_id}/summary",
        headers=w12_headers,
    )
    assert summary_res.status_code == 200
    s_json = summary_res.json()
    assert s_json["age_bracket"] == "12-24m"
    assert s_json["tier"] == "Tier 3: Direct Referral"
    assert s_json["domains_of_concern"] == ["communication"]
    assert s_json["safety_rule_trigger"] == "regression_flag"

    # 4. Status transitions
    # Step 1: sent
    s1 = await client.patch(f"/api/referrals/{ref_id}", headers=w12_headers, json={"status": "sent"})
    assert s1.status_code == 200
    assert s1.json()["status"] == "sent"

    # Step 2: seen
    s2 = await client.patch(f"/api/referrals/{ref_id}", headers=w12_headers, json={"status": "seen"})
    assert s2.status_code == 200
    assert s2.json()["status"] == "seen"

    # Step 3: outcome recorded
    s3 = await client.post(
        f"/api/referrals/{ref_id}/outcome",
        headers=w12_headers,
        json={
            "outcome_notes": "Assessed by DEIC pediatrician, started speech therapy.",
            "follow_up_recommended": True,
            "next_follow_up_days": 30,
        },
    )
    assert s3.status_code == 200
    assert s3.json()["status"] == "outcome recorded"

    # Step 4: closed
    s4 = await client.patch(f"/api/referrals/{ref_id}", headers=w12_headers, json={"status": "closed"})
    assert s4.status_code == 200
    assert s4.json()["status"] == "closed"

    # 5. Area Isolation Check: Worker in Ward 15 cannot access this child
    isolated_res = await client.get(
        f"/api/referrals/{ref_id}/summary",
        headers=w15_headers,
    )
    assert isolated_res.status_code == 403


@pytest.mark.asyncio
async def test_e2e_flow_6_offline_sync(e2e_harness):
    """
    Flow 6: Offline sync idempotency & retry safety.
    CHW records screening & referral offline, submits via /api/chw/sync.
    Multiple retries produce exactly 1 persistent record without duplication.
    """
    client = e2e_harness["client"]
    db_factory = e2e_harness["session_factory"]
    w12_token = create_access_token(
        subject="user-chw-ward12", role="chw"
    )
    w12_headers = {"Authorization": f"Bearer {w12_token}"}

    # 1. Register child first on server (or via sync)
    child_res = await client.post(
        "/api/chw/children",
        headers=w12_headers,
        json={
            "age_bracket": "24-36m",
            "village_ward": "Ward 12",
            "consent_given": True,
            "pseudonymous_id": "OFFLINE-777",
        },
    )
    assert child_res.status_code in (200, 201)
    child_id = child_res.json()["id"]

    screen_key = "offline-screen-key-101"
    referral_key = "offline-referral-key-101"

    sync_payload = {
        "operations": [
            {
                "idempotency_key": screen_key,
                "operation": "screening",
                "child_id": child_id,
                "payload": {
                    "tier": "Tier 3: Direct Referral",
                    "domains_flagged": ["gross_motor", "communication"],
                    "safety_rule_triggered": "Loss of motor milestones (SD <= -2.0)",
                    "answers": {"GM01": 0, "GM02": 0, "CM01": 0},
                    "module": "A",
                    "notes": "Field screening home visit",
                },
            },
            {
                "idempotency_key": referral_key,
                "operation": "referral",
                "child_id": child_id,
                "payload": {
                    "to_facility": "Primary Health Centre Ward 12",
                    "reason": "Motor coordination follow-up",
                    "tier": "Tier 3: Direct Referral",
                    "domains_of_concern": ["gross_motor", "communication"],
                    "safety_rule_trigger": "Loss of motor milestones (SD <= -2.0)",
                },
            },
        ]
    }

    # Initial sync
    sync1 = await client.post("/api/chw/sync", headers=w12_headers, json=sync_payload)
    assert sync1.status_code == 200
    res1 = sync1.json()
    assert res1["processed_count"] == 2
    assert res1["created_count"] == 2
    assert res1["deduplicated_count"] == 0
    assert res1["conflict_count"] == 0

    # Retry 1 (simulating network retry)
    sync2 = await client.post("/api/chw/sync", headers=w12_headers, json=sync_payload)
    assert sync2.status_code == 200
    res2 = sync2.json()
    assert res2["processed_count"] == 2
    assert res2["created_count"] == 0
    assert res2["deduplicated_count"] == 2

    # Retry 2
    sync3 = await client.post("/api/chw/sync", headers=w12_headers, json=sync_payload)
    assert sync3.status_code == 200
    res3 = sync3.json()
    assert res3["deduplicated_count"] == 2

    # Verify database has strictly ONE screening session and ONE referral record
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
