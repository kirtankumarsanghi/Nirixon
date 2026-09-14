import pytest
from httpx import ASGITransport, AsyncClient

# Need similar setup to test_api.py, but just focusing on sandbox logic
# Let's import the api_env from test_api.py directly for easy test setup
from tests.test_api import api_env, _login, _auth, _run_full_session

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
        json={"answer_overrides": {}}
    )
    # The current require_internal just checks role=="internal" or "clinician", parent will be rejected
    assert r.status_code in (401, 403), f"Expected 401/403 for parent role, got {r.status_code}"

@pytest.mark.asyncio
async def test_sandbox_simulate_re_evaluates_answers(api_env):
    client = api_env["client"]
    factory = api_env["session_factory"]
    
    # Promote parent to clinician to bypass require_internal for test
    from app.db.models import User
    from sqlalchemy import select
    async with factory() as session:
        user = (await session.execute(select(User).where(User.email == "parent@example.com"))).scalar_one()
        user.role = "internal"
        await session.commit()

    token = await _login(client)
    
    # Get a base completed session with all 1s (Typical)
    session_id, action = await _run_full_session(client, token, regression=0)
    
    # Sandbox: change regression_flag to 1 (which triggers a safety override -> Refer)
    r = await client.post(
        f"/api/sandbox/{session_id}/simulate",
        headers=_auth(token),
        json={
            "answer_overrides": {"regression_flag": 1}
        }
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
        user = (await session.execute(select(User).where(User.email == "parent@example.com"))).scalar_one()
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
        json={"answer_overrides": {}}
    )
    assert r.status_code == 400
    assert "Can only simulate completed sessions" in r.json()["detail"]
