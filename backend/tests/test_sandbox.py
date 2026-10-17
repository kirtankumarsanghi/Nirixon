import pytest

pytest_plugins = ["tests.test_api"]
from tests.test_api import _auth, _login, _run_full_session


@pytest.mark.asyncio
async def test_sandbox_simulate_requires_internal(api_env):
    client = api_env["client"]
    token = await _login(client)

    # Run a session as parent to get a completed session
    session_id, action = await _run_full_session(client, token, regression=0)
    assert action["type"] == "complete"

    # Try to simulate it as the parent - should fail (403 or similar, actually depends on `require_internal` logic)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"answer_overrides": {}},
    )
    # The current require_internal just checks role=="internal" or "clinician", parent will be rejected
    assert r.status_code in (
        401,
        403,
    ), f"Expected 401/403 for parent role, got {r.status_code}"


@pytest.mark.asyncio
async def test_sandbox_simulate_re_evaluates_answers(api_env):
    client = api_env["client"]
    factory = api_env["session_factory"]

    # Promote parent to clinician to bypass require_internal for test
    from app.db.models import User
    from sqlalchemy import select

    async with factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "parent@example.com")
            )
        ).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)

    # Get a base completed session with all 1s (Typical)
    session_id, _action = await _run_full_session(client, token, regression=0)

    # Sandbox: change regression_flag to 1 (which triggers a safety override -> Refer)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"answer_overrides": {"regression_flag": 1}},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["final_classification"] == "Refer"
    assert data["safety_override_triggered"] is True
    assert data["override_rule"] == "regression_flag"


@pytest.mark.asyncio
async def test_sandbox_simulate_on_incomplete_session_fails(api_env):
    client = api_env["client"]
    factory = api_env["session_factory"]

    # Promote parent to clinician
    from app.db.models import User
    from sqlalchemy import select

    async with factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "parent@example.com")
            )
        ).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)

    # Start a session but don't finish
    r = await client.post(
        "/api/screen/start",
        headers=_auth(token),
        json={
            "child_ref": "sandbox-1",
            "corrected_age_months": 24.0,
            "question_cap": 10,
            "consent_given": True,
        },
    )
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    # Sandbox simulate should fail with 400
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"answer_overrides": {}},
    )
    assert r.status_code == 400
    assert "Can only simulate completed sessions" in r.json()["detail"]


@pytest.mark.asyncio
async def test_sandbox_simulate_safety_rule_overrides_model_output(api_env):
    """
    Acceptance check:
    A simulated value that triggers the safety rule returns Refer regardless of model output.
    """
    client = api_env["client"]
    factory = api_env["session_factory"]

    # Promote parent to clinician
    from app.db.models import User
    from sqlalchemy import select

    async with factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "parent@example.com")
            )
        ).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)

    # Completed session with all 0s (Typical on-track milestones)
    session_id, action = await _run_full_session(client, token, regression=0)
    assert action["type"] == "complete"
    assert action["result"]["final_classification"] in ("Typical", "Monitor")
    assert action["result"]["safety_override_triggered"] is False

    # Simulate with regression_flag = 1 (triggers safety rule)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"answer_overrides": {"regression_flag": 1}},
    )
    assert r.status_code == 200
    data = r.json()

    # Safety rule MUST override the model output to Refer
    assert data["final_classification"] == "Refer"
    assert data["safety_override_triggered"] is True
    assert data["override_rule"] == "regression_flag"


@pytest.mark.asyncio
async def test_sandbox_simulate_invalid_inputs_return_clear_422(api_env):
    """
    Acceptance check:
    Invalid input returns a clear error without crashing.
    """
    client = api_env["client"]
    factory = api_env["session_factory"]

    from app.db.models import User
    from sqlalchemy import select

    async with factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "parent@example.com")
            )
        ).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)
    session_id, action = await _run_full_session(client, token, regression=0)
    assert action["type"] == "complete"

    # 1. Age out of range
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"corrected_age_months": 999.0},
    )
    assert r.status_code == 422
    assert "out of range" in r.json()["detail"].lower()

    # 2. Answer value out of range (must be 0..3)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"answer_overrides": {"c_36_1": 99}},
    )
    assert r.status_code == 422
    assert "out of range" in r.json()["detail"].lower()

    # 3. Domain score out of range (must be 0..100)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={"domain_scores": {"gross_motor": 150.0}},
    )
    assert r.status_code == 422
    assert "out of range" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_sandbox_simulate_domain_scores_and_latency(api_env):
    """
    Test domain scores slider adjustment, triage tier, and latency return.
    """
    client = api_env["client"]
    factory = api_env["session_factory"]

    from app.db.models import User
    from sqlalchemy import select

    async with factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "parent@example.com")
            )
        ).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)
    session_id, action = await _run_full_session(client, token, regression=0)
    assert action["type"] == "complete"

    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={
            "domain_scores": {
                "gross_motor": 85.0,
                "communication": 90.0,
            }
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "final_classification" in data
    assert "probabilities" in data
    assert data["latency_ms"] is not None
    assert isinstance(data["latency_ms"], float)
    assert data["triage_tier"] is not None
