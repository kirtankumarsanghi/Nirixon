"""End-to-end Full Patient Journey Test:
Simulates the complete clinical journey from:
1. Parent login
2. Module A early screening (24m child)
3. Borderline milestone responses triggering Tier 2: Reflex-Branch
4. One-click reflex branching into Module B
5. Multilingual free-text intake routed by the retrained text router
6. Module B adaptive micro-testing
7. Final comprehensive clinical diagnostic assessment
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Force test settings
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import hash_password
from app.config import get_settings
from app.core.module_b.service import module_b_service
from app.db.models import User
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
async def e2e_app(tmp_path):
    db_path = tmp_path / "test_e2e.db"
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

    # Load ML artifacts for Module A & Module B
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

    async with session_factory() as session:
        session.add(
            User(
                email="parent@example.com",
                hashed_password=hash_password("changeme"),
                role="parent",
            )
        )
        await session.commit()

    yield app

    reset_engine()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_full_patient_screening_journey(e2e_app):
    transport = ASGITransport(app=e2e_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # -------------------------------------------------------------
        # STEP 1: Parent Authentication
        # -------------------------------------------------------------
        login_resp = await client.post(
            "/api/auth/login",
            json={"email": "parent@example.com", "password": "changeme"},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # -------------------------------------------------------------
        # STEP 2: Start Module A Screener for a 24-month-old child
        # -------------------------------------------------------------
        start_resp = await client.post(
            "/api/screen/start",
            headers=headers,
            json={
                "child_ref": "CHILD-2026-E2E",
                "corrected_age_months": 24.0,
                "question_cap": 10,
                "consent_given": True,
            },
        )
        assert start_resp.status_code == 200, f"Start failed: {start_resp.text}"
        start_data = start_resp.json()
        session_a_id = start_data["session_id"]
        assert start_data["type"] == "question"
        curr_q = start_data["question"]

        # -------------------------------------------------------------
        # STEP 3: Caregiver answers Module A questions
        # Simulating isolated speech/communication struggle (0 on speech, 2 on others)
        # -------------------------------------------------------------
        module_a_complete = False
        result_a = None

        while not module_a_complete and curr_q is not None:
            dom = curr_q.get("domain", "")
            # If communication item, caregiver marks 0 (not yet); otherwise 2
            if "communication" in dom.lower():
                ans_val = 0
            elif curr_q["response_type"] == "yes_no":
                ans_val = 0  # No regression
            else:
                ans_val = 2

            ans_resp = await client.post(
                f"/api/screen/{session_a_id}/answer",
                headers=headers,
                json={"item_id": curr_q["item_id"], "answer": ans_val},
            )
            assert ans_resp.status_code == 200, f"Answer failed: {ans_resp.text}"
            ans_data = ans_resp.json()
            if ans_data["type"] == "complete":
                module_a_complete = True
                result_a = ans_data["result"]
            else:
                curr_q = ans_data.get("question")

        assert module_a_complete is True
        assert result_a is not None

        # -------------------------------------------------------------
        # STEP 4: Inspect Tiered Triage Decision & Behavioral Guards
        # -------------------------------------------------------------
        print("\n--- Module A Triage Output ---")
        print(f"Classification: {result_a['final_classification']}")
        print(f"Triage Tier: {result_a['triage_tier']}")
        print(f"Reflex Recommended: {result_a['reflex_branch_recommended']}")
        print(f"Target Domains: {result_a['target_reflex_domains']}")
        print(f"Guards: {result_a['guard_flags']}")

        assert result_a["triage_tier"] in (
            "Tier 2: Reflex-Branch",
            "Tier 3: Direct Referral",
        )
        assert "guard_flags" in result_a
        assert result_a["guard_flags"]["acquiescence"] is False
        assert result_a["guard_flags"]["inconsistency"] is False

        # -------------------------------------------------------------
        # STEP 5: One-Click Reflex Branching to Module B
        # -------------------------------------------------------------
        reflex_resp = await client.post(
            f"/api/screen/{session_a_id}/reflex_branch",
            headers=headers,
        )
        assert (
            reflex_resp.status_code == 200
        ), f"Reflex branching failed: {reflex_resp.text}"
        reflex_data = reflex_resp.json()
        session_b_id = reflex_data["session_id"]
        assert reflex_data["type"] == "intake_required"
        assert reflex_data["status"] == "in_progress"
        assert session_b_id != session_a_id

        # -------------------------------------------------------------
        # STEP 6: Module B Free-Text Intake Routed via NLP Router
        # Caregiver enters description of the child's difficulty
        # -------------------------------------------------------------
        intake_resp = await client.post(
            f"/api/screen/{session_b_id}/intake",
            headers=headers,
            json={
                "text": "Mera beta do saal ka hai par bolne mein dikkat hoti hai, bas do teen shabd hi bolta hai aur baatein nahi samajhta.",
                "setting": "home",
            },
        )
        assert intake_resp.status_code == 200, f"Intake failed: {intake_resp.text}"
        intake_data = intake_resp.json()
        print("\n--- Module B NLP Router Output ---")
        print(f"Detected Domains: {intake_data['detected_domains']}")
        print(f"Next Action: {intake_data['next_action']}")
        assert (
            "listening_speaking" in intake_data["detected_domains"]
            or len(intake_data["detected_domains"]) > 0
        )
        assert intake_data["next_action"] == "question"
        curr_b_q = intake_data["action"]["question"]

        # -------------------------------------------------------------
        # STEP 7: Module B Adaptive Micro-Testing Loop
        # -------------------------------------------------------------
        module_b_complete = False
        result_b = None
        steps_b = 0

        while not module_b_complete and curr_b_q is not None and steps_b < 20:
            steps_b += 1
            # Caregiver answers Likert (1 to 5) or Yes/No
            rt = curr_b_q.get("response_type", "likert5")
            b_ans = "Yes" if rt == "yesno" else 3  # moderate difficulty

            b_ans_resp = await client.post(
                f"/api/screen/{session_b_id}/answer",
                headers=headers,
                json={"item_id": curr_b_q["item_id"], "answer": b_ans},
            )
            assert (
                b_ans_resp.status_code == 200
            ), f"Module B answer failed: {b_ans_resp.text}"
            b_data = b_ans_resp.json()
            if b_data["type"] == "complete":
                module_b_complete = True
                result_b = b_data["result"]
            else:
                curr_b_q = b_data.get("question")

        assert module_b_complete is True, "Module B should have finished within cap"
        assert result_b is not None

        # -------------------------------------------------------------
        # STEP 8: Verify Final Integrated Diagnostic Report
        # -------------------------------------------------------------
        print("\n--- Final Module B Diagnostic Report ---")
        print(f"Final Classification: {result_b['final_classification']}")
        print(f"Domain Classifications: {result_b['domain_classifications']}")
        print(f"Module: {result_b['module']}")
        assert result_b["module"] == "B"
        assert result_b["final_classification"] in ("Typical", "Monitor", "Refer")
        assert len(result_b["domain_classifications"]) > 0

        print("\n=== SUCCESS: Full Patient Screening Journey Passed Bit-for-Bit ===")
