"""
Acceptance and unit tests for Joint Family Sharing, Concordance Calculation, and Combination Merge.

Acceptance checks verified:
1. Token expiry: expired token returns 410 Gone.
2. Reuse blocked: single-use token returns 409 Conflict on second submission.
3. Concordance maths with known inputs: verified mathematically for exact agreement, MAD, scale normalization, and item/overall scores.
4. Safety rule triggered by a secondary respondent: primary caregiver's answers feed the ML model, but secondary respondent's regression flag triggers safety floor Refer override.
5. Privacy-by-design: token exposes only items to answer, zero child details.
6. Respondent limit: max 3 respondents per screening session.
7. Cascading deletion: deleting a screening session permanently deletes all associated respondent answers and invite tokens.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long!!"
os.environ["SESSION_REPO_BACKEND"] = "memory"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_USER_EMAIL"] = "parent@example.com"
os.environ["SEED_USER_PASSWORD"] = "changeme"

from app.auth import hash_password
from app.config import get_settings
from app.core.joint_family import (
    compute_joint_concordance,
    get_most_concerning_value,
)
from app.core.session import ScreeningSession as CoreSession
from app.db.models import (
    JointInviteToken,
    JointRespondentAnswer,
    User,
)
from app.db.models import (
    ScreeningSession as DbSession,
)
from app.db.session import (
    Base,
    configure_engine,
    get_session_factory,
    reset_engine,
)
from app.db.session_repo import InMemorySessionRepo, set_session_repo
from app.main import create_app
from app.ml.inference_service import inference_service

ARTIFACTS = Path(__file__).resolve().parents[1] / "ml" / "artifacts"


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def env(tmp_path):
    db_path = tmp_path / "share_merge_test.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url
    os.environ["ML_ARTIFACTS_DIR"] = str(ARTIFACTS)
    get_settings.cache_clear()
    reset_engine()
    engine = configure_engine(url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    repo = InMemorySessionRepo()
    set_session_repo(repo)

    if not inference_service.is_loaded:
        inference_service.load(ARTIFACTS)

    app = create_app()

    # Seed parent user
    factory = get_session_factory()
    async with factory() as session:
        user = User(
            id="parent-user-123",
            email="parent@example.com",
            hashed_password=hash_password("changeme"),
            role="parent",
        )
        session.add(user)
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield {
            "client": client,
            "engine": engine,
            "repo": repo,
            "factory": factory,
        }

    await engine.dispose()
    reset_engine()


# ---------------------------------------------------------------------------
# Unit Tests: Concordance Maths with Known Inputs
# ---------------------------------------------------------------------------


def test_concordance_maths_perfect_agreement():
    """When primary and secondary caregivers provide identical ratings, concordance is 1.0 and exact match is 100%."""
    primary_answers = {
        "regression_flag": 0,
        "comm_24m_1": 2,
        "gm_24m_1": 2,
    }
    respondent_submissions = [
        {
            "role_label": "Grandmother",
            "answers": {
                "regression_flag": 0,
                "comm_24m_1": 2,
                "gm_24m_1": 2,
            },
        },
        {
            "role_label": "Father",
            "answers": {
                "regression_flag": 0,
                "comm_24m_1": 2,
                "gm_24m_1": 2,
            },
        },
    ]

    analysis = compute_joint_concordance(primary_answers, respondent_submissions)

    assert analysis.overall_concordance == 1.0
    assert analysis.exact_agreement_pct == 100.0
    assert analysis.total_overlapping_items == 3
    assert analysis.respondent_count == 2
    assert len(analysis.disagreements) == 0


def test_concordance_maths_known_mad_and_scaling():
    """
    Mathematical verification of Normalized Concordance:
    - Item concordance = 1.0 - (MAD / scale_range)
    - Milestone scale_range = 2.0 (values 0, 1, 2)
    - Binary flag scale_range = 1.0 (values 0, 1)
    """
    # 1. Milestone item: primary = 2, secondary = 0 -> MAD = 2.0, score = 1.0 - 2.0/2.0 = 0.0
    analysis_extreme = compute_joint_concordance(
        primary_answers={"comm_24m_1": 2},
        respondent_submissions=[{"role_label": "Father", "answers": {"comm_24m_1": 0}}],
    )
    assert analysis_extreme.overall_concordance == 0.0
    assert analysis_extreme.exact_agreement_pct == 0.0
    assert len(analysis_extreme.disagreements) == 1
    d0 = analysis_extreme.disagreements[0]
    assert d0.item_id == "comm_24m_1"
    assert d0.primary_answer == 2
    assert d0.max_delta == 2
    assert d0.most_concerning_answer == 0
    assert d0.most_concerning_role == "Father"

    # 2. Milestone item: primary = 2, secondary = 1 -> MAD = 1.0, score = 1.0 - 1.0/2.0 = 0.5
    analysis_mid = compute_joint_concordance(
        primary_answers={"comm_24m_1": 2},
        respondent_submissions=[{"role_label": "Father", "answers": {"comm_24m_1": 1}}],
    )
    assert analysis_mid.overall_concordance == 0.5
    assert analysis_mid.exact_agreement_pct == 0.0
    assert len(analysis_mid.disagreements) == 1
    assert analysis_mid.disagreements[0].max_delta == 1

    # 3. Binary flag (regression_flag): primary = 0, secondary = 1 -> MAD = 1.0, scale = 1.0, score = 0.0
    analysis_flag = compute_joint_concordance(
        primary_answers={"regression_flag": 0},
        respondent_submissions=[
            {"role_label": "Babysitter", "answers": {"regression_flag": 1}}
        ],
    )
    assert analysis_flag.overall_concordance == 0.0
    assert analysis_flag.exact_agreement_pct == 0.0
    d_flag = analysis_flag.disagreements[0]
    assert d_flag.most_concerning_answer == 1
    assert d_flag.most_concerning_role == "Babysitter"
    assert "CRITICAL SAFETY INQUIRY" in d_flag.follow_up_prompt

    # 4. Multi-respondent average: primary = 2, resp1 = 2, resp2 = 0
    # MAD = (|2 - 2| + |2 - 0|) / 2 = 1.0 -> item score = 1.0 - 1.0/2.0 = 0.5
    # Exact match ratio = 1 / 2 = 50.0%
    analysis_multi = compute_joint_concordance(
        primary_answers={"comm_24m_1": 2},
        respondent_submissions=[
            {"role_label": "Grandmother", "answers": {"comm_24m_1": 2}},
            {"role_label": "Father", "answers": {"comm_24m_1": 0}},
        ],
    )
    assert analysis_multi.overall_concordance == 0.5
    assert analysis_multi.exact_agreement_pct == 50.0
    assert len(analysis_multi.disagreements) == 1

    # 5. Multi-item weighted overall test:
    # Item 1: score = 1.0, exact = 100%
    # Item 2: score = 0.5, exact = 0%
    # Overall = (1.0 + 0.5) / 2 = 0.75, exact = (1.0 + 0.0) / 2 * 100 = 50.0%
    analysis_multi_item = compute_joint_concordance(
        primary_answers={"comm_24m_1": 2, "gm_24m_1": 2},
        respondent_submissions=[
            {"role_label": "Father", "answers": {"comm_24m_1": 2, "gm_24m_1": 1}},
        ],
    )
    assert analysis_multi_item.overall_concordance == 0.75
    assert analysis_multi_item.exact_agreement_pct == 50.0
    assert len(analysis_multi_item.disagreements) == 1
    assert analysis_multi_item.disagreements[0].item_id == "gm_24m_1"


def test_most_concerning_value_logic():
    """Verify developmental direction: lower is more concerning for milestones, higher for regression."""
    # Milestone: 0 (Not yet) is more concerning than 1 or 2
    conc_val, idx = get_most_concerning_value("comm_24m_1", [2, 1, 0])
    assert conc_val == 0
    assert idx == 2

    # Regression: 1 (lost skill) is more concerning than 0
    conc_val_reg, idx_reg = get_most_concerning_value("regression_flag", [0, 1])
    assert conc_val_reg == 1
    assert idx_reg == 1


# ---------------------------------------------------------------------------
# Integration Tests: Token Expiry, Reuse Blocked, Privacy, Safety Override
# ---------------------------------------------------------------------------


async def _create_test_session(factory, repo, session_id="test-joint-sess-1"):
    """Helper to populate a test screening session with typical primary answers."""
    core = CoreSession(
        child_id="child-123",
        corrected_age_months=24.0,
        age_bracket="24m",
        question_cap=10,
        module="A",
    )
    # Primary caregiver answers: healthy development (no regression, mastered skills)
    core.mandatory_answered = {"regression_flag": 0, "family_history_flag": 0}
    core.answers = {"comm_24m_1": 2, "comm_24m_2": 2, "gm_24m_1": 2}
    repo.save(session_id, core)

    async with factory() as db:
        db_sess = DbSession(
            id=session_id,
            parent_user_id="parent-user-123",
            corrected_age_months=24.0,
            age_bracket="24m",
            question_cap=10,
            module="A",
            child_name="Aarav Sharma",
            parent_name="Pooja Sharma",
            parent_phone="9876543210",
            location_city="Jaipur",
            state_json=core.to_dict(),
        )
        db.add(db_sess)
        await db.commit()
    return session_id


@pytest.mark.asyncio
async def test_invite_creation_and_max_limit_enforced(env):
    """Main caregiver can invite up to 3 respondents; the 4th invite is rejected."""
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-limit-test")

    # Create 3 valid invites
    for role in ["Grandmother", "Father", "Teacher"]:
        res = await client.post(
            f"/api/share/session/{session_id}/invite",
            json={"role_label": role, "expires_in_hours": 48},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["role_label"] == role
        assert data["token"]
        assert "/joint-respond/" in data["invite_url"]

    # 4th invite must be rejected with HTTP 400
    res_4 = await client.post(
        f"/api/share/session/{session_id}/invite",
        json={"role_label": "Babysitter", "expires_in_hours": 48},
    )
    assert res_4.status_code == 400
    assert "Maximum limit of 3 respondent invites reached" in res_4.json()["detail"]


@pytest.mark.asyncio
async def test_token_privacy_guarantee(env):
    """Token details expose ONLY the questions to answer, zero identifiable child data."""
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-privacy-test")

    res = await client.post(
        f"/api/share/session/{session_id}/invite",
        json={"role_label": "Grandmother", "expires_in_hours": 24},
    )
    token = res.json()["token"]

    # Public respondent queries questions with token
    get_res = await client.get(f"/api/share/invite/{token}")
    assert get_res.status_code == 200
    data = get_res.json()

    assert data["valid"] is True
    assert data["role_label"] == "Grandmother"
    assert data["item_count"] > 0
    assert len(data["items"]) == data["item_count"]

    # Strict check: NO personal data in response
    serialized = str(data)
    assert "Aarav" not in serialized
    assert "Sharma" not in serialized
    assert "Pooja" not in serialized
    assert "9876543210" not in serialized
    assert "Jaipur" not in serialized
    assert "parent-user-123" not in serialized


@pytest.mark.asyncio
async def test_token_expiry(env):
    """Expired tokens are rejected with HTTP 410 on both GET detail and POST respond."""
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-expiry-test")

    # Create invite with negative hours (already expired)
    async with factory() as db:
        token = JointInviteToken(
            session_id=session_id,
            token="expired-token-xyz123",
            role_label="Uncle",
            expires_at=datetime.now(UTC) - timedelta(hours=2),
            is_used=False,
        )
        db.add(token)
        await db.commit()

    # GET detail should fail with 410
    get_res = await client.get("/api/share/invite/expired-token-xyz123")
    assert get_res.status_code == 410
    assert "expired" in get_res.json()["detail"].lower()

    # POST response should fail with 410
    post_res = await client.post(
        "/api/share/invite/expired-token-xyz123/respond",
        json={"answers": {"regression_flag": 0}},
    )
    assert post_res.status_code == 410
    assert "expired" in post_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_token_reuse_blocked(env):
    """A one-time token can only be used once; subsequent attempts are blocked with 409 Conflict."""
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-reuse-test")

    res = await client.post(
        f"/api/share/session/{session_id}/invite",
        json={"role_label": "Father", "expires_in_hours": 24},
    )
    token = res.json()["token"]

    # 1. First submission succeeds
    resp1 = await client.post(
        f"/api/share/invite/{token}/respond",
        json={
            "role_label": "Father",
            "answers": {"regression_flag": 0, "comm_24m_1": 2},
        },
    )
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "received"

    # 2. Second submission with the same token must fail with 409 Conflict
    resp2 = await client.post(
        f"/api/share/invite/{token}/respond",
        json={
            "role_label": "Father",
            "answers": {"regression_flag": 0, "comm_24m_1": 2},
        },
    )
    assert resp2.status_code == 409
    assert "already been used" in resp2.json()["detail"].lower()

    # 3. GET detail on used token must also return 409 Conflict
    get_res = await client.get(f"/api/share/invite/{token}")
    assert get_res.status_code == 409
    assert "already been used" in get_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_safety_rule_triggered_by_secondary_respondent(env):
    """
    CRITICAL ACCEPTANCE TEST:
    - Primary caregiver reports: regression_flag = 0 and milestone mastery (Typical).
    - Secondary respondent (Father) reports: regression_flag = 1 (skill loss observed).
    - Combination Rule Result:
        * Primary caregiver's answers feed the statistical ML model (ml_classification = Typical).
        * Secondary respondent's answer triggers the safety floor rule (final_classification = Refer).
        * safety_source explicitly indicates the secondary respondent's role.
        * Disagreement list highlights the discrepancy with a critical safety follow-up prompt.
    """
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-safety-test")

    # Invite Father
    res_inv = await client.post(
        f"/api/share/session/{session_id}/invite",
        json={"role_label": "Father", "expires_in_hours": 48},
    )
    token = res_inv.json()["token"]

    # Father submits answers observing regression
    resp_sub = await client.post(
        f"/api/share/invite/{token}/respond",
        json={
            "role_label": "Father",
            "answers": {
                "regression_flag": 1,  # Lost skills!
                "family_history_flag": 0,
                "comm_24m_1": 1,
                "comm_24m_2": 2,
                "gm_24m_1": 2,
            },
        },
    )
    assert resp_sub.status_code == 200

    # Execute merge combination
    merge_res = await client.post(f"/api/share/session/{session_id}/merge")
    assert merge_res.status_code == 200
    merge_data = merge_res.json()

    # Verify Combination Rule
    assert (
        merge_data["ml_classification"] == "Typical"
    ), "ML model must reflect primary answers only"
    assert (
        merge_data["safety_override_triggered"] is True
    ), "Safety override must be triggered"
    assert merge_data["override_rule"] == "regression_flag"
    assert (
        merge_data["final_classification"] == "Refer"
    ), "Final triage must be escalated to Refer"
    assert "secondary_respondent (Father)" in merge_data["safety_source"]

    # Verify Disagreement & Clinician Follow-up
    disagreements = merge_data["disagreements"]
    reg_disagreement = next(
        (d for d in disagreements if d["item_id"] == "regression_flag"), None
    )
    assert reg_disagreement is not None
    assert reg_disagreement["primary_answer"] == 0
    assert reg_disagreement["most_concerning_answer"] == 1
    assert reg_disagreement["most_concerning_role"] == "Father"
    assert "CRITICAL SAFETY INQUIRY" in reg_disagreement["follow_up_prompt"]


@pytest.mark.asyncio
async def test_cascading_deletion_of_respondent_answers(env):
    """Deleting a screening session deletes all associated respondent answers and invite tokens."""
    client = env["client"]
    factory = env["factory"]
    repo = env["repo"]
    session_id = await _create_test_session(factory, repo, "sess-cascade-test")

    # Create invite and submit answer
    res_inv = await client.post(
        f"/api/share/session/{session_id}/invite",
        json={"role_label": "Grandmother", "expires_in_hours": 24},
    )
    token = res_inv.json()["token"]

    await client.post(
        f"/api/share/invite/{token}/respond",
        json={
            "role_label": "Grandmother",
            "answers": {"regression_flag": 0, "comm_24m_1": 2},
        },
    )

    # Verify tokens and answers exist in DB before deletion
    async with factory() as db:
        tokens_before = (
            (
                await db.execute(
                    select(JointInviteToken).where(
                        JointInviteToken.session_id == session_id
                    )
                )
            )
            .scalars()
            .all()
        )
        answers_before = (
            (
                await db.execute(
                    select(JointRespondentAnswer).where(
                        JointRespondentAnswer.session_id == session_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(tokens_before) == 1
        assert len(answers_before) == 1

    # Call DELETE endpoint
    del_res = await client.delete(f"/api/share/session/{session_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify session and respondent answers are permanently deleted from DB
    async with factory() as db:
        session_after = (
            await db.execute(select(DbSession).where(DbSession.id == session_id))
        ).scalar_one_or_none()
        tokens_after = (
            (
                await db.execute(
                    select(JointInviteToken).where(
                        JointInviteToken.session_id == session_id
                    )
                )
            )
            .scalars()
            .all()
        )
        answers_after = (
            (
                await db.execute(
                    select(JointRespondentAnswer).where(
                        JointRespondentAnswer.session_id == session_id
                    )
                )
            )
            .scalars()
            .all()
        )

        assert session_after is None
        assert len(tokens_after) == 0
        assert len(answers_after) == 0
