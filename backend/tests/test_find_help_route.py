"""The Find Help route must be mounted on the real app, and validate its input.

Behaviour lives in tests/test_find_help.py; this only checks the wiring in app.main.
"""

from __future__ import annotations

import pytest
from tests.test_api import _login

pytest_plugins = ("tests.test_api",)


@pytest.mark.asyncio
async def test_facilities_route_mounted_and_validated(api_env):
    client = api_env["client"]
    token = await _login(client)
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/facilities", params={"pin": "302031"}, headers=headers)
    # 200 once backend/scripts/find_help/import_reference_data.py has been run;
    # 503 when the reference DB is missing from this checkout.
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        body = r.json()
        assert body["pin"] == "302031"
        assert body["resolved"]["state"] == "Rajasthan"
        assert body["helplines"], "helplines are always returned"

    # Public reference data: no auth required.
    assert (
        await client.get("/api/facilities", params={"pin": "302031"})
    ).status_code in (200, 503)

    assert (
        await client.get("/api/facilities", params={"pin": "12345"})
    ).status_code == 422
    assert (
        await client.get("/api/facilities", params={"pin": "012345"})
    ).status_code == 422
    assert (
        await client.get(
            "/api/facilities", params={"pin": "302031", "age_group": "13-18"}
        )
    ).status_code == 422
