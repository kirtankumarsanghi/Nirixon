"""Module B end-to-end API integration tests.

Tests the full lifecycle through real FastAPI endpoints:
  POST /api/screen/start -> POST /{id}/intake -> POST /{id}/answer -> completion / result.

Tests required by STEP 5:
  1. Hinglish attention note: "Mera beta homework ke time ek jagah baith hi nahi pata aur notebook bhool jata hai", age 9 ->
     first 3 questions are in domain `attention`; high attention answers flag attention as Refer.
  2. Reading note: "She reads very slowly, mixes up b and d and cries when asked to read aloud", age 8 ->
     first questions are reading; reading flagged.
  3. First 5 questions of (1) and (2) differ.
  4. Vague note "he is weak in studies" -> recall_help action; after chips are tapped the flow continues.
  5. Safety note "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana" ->
     helpline in first response AND in final summary even if later answers are "fine".
  6. Vision note "ye bachcha board pe likha dekhne ke liye aage aa jata hai" ->
     first rule-out question is a vision question, not hearing.
  7. Session never exceeds 20 questions and respects MIN_REAL_ANSWERS_B / MIN_DOMAINS_COVERED_B.
  8. Bad input: wrong item_id or out-of-range value -> 422; unknown/corrupt session -> 4xx, not 500.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.module_b.engine_b import HEARING_CONCEPTS, VISION_CONCEPTS
from app.core.module_b.service import module_b_service
from app.core.safety_floor import MIN_DOMAINS_COVERED_B, MIN_REAL_ANSWERS_B
from tests.test_api import _auth, _login

pytest_plugins = ("tests.test_api",)

module_b_service.load()


async def _drive_session(
    client: AsyncClient,
    token: str,
    *,
    text: str,
    months: float,
    answer_fn,
    seed: int = 1,
    max_steps: int = 40,
):
    headers = _auth(token)
    r = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "corrected_age_months": months,
            "consent_given": True,
            "question_cap": 20,
            "module": "B",
        },
    )
    assert r.status_code == 200, r.text
    session_id = r.json()["session_id"]

    r = await client.post(
        f"/api/screen/{session_id}/intake",
        headers=headers,
        json={"text": text, "seed": seed},
    )
    assert r.status_code == 200, r.text
    intake_data = r.json()
    first_resp = intake_data
    act = intake_data.get("action") or {}
    path: list[tuple[str, str, str]] = []

    for _ in range(max_steps):
        atype = act.get("type")
        if atype == "question":
            q = act["question"]
            path.append(
                (
                    q.get("track") or q.get("domain", ""),
                    q.get("item_id", ""),
                    q.get("question_text", ""),
                )
            )
            val = answer_fn(q)
            r = await client.post(
                f"/api/screen/{session_id}/answer",
                headers=headers,
                json={"item_id": q["item_id"], "answer": val},
            )
            assert r.status_code == 200, r.text
            act = r.json()
        elif atype == "recall_help":
            r = await client.post(
                f"/api/screen/{session_id}/recall",
                headers=headers,
                json={"domains": ["attention"]},
            )
            assert r.status_code == 200, r.text
            act = r.json()
        elif atype == "safety_notice":
            r = await client.post(
                f"/api/screen/{session_id}/next",
                headers=headers,
            )
            assert r.status_code == 200, r.text
            act = r.json()
        elif atype in ("complete", "done"):
            break
        else:
            break

    if act.get("type") == "complete" and act.get("result"):
        result = act["result"]
    else:
        r = await client.get(f"/api/screen/{session_id}/result", headers=headers)
        assert r.status_code == 200, r.text
        result = r.json()

    return session_id, first_resp, path, result


def _likert_high_for(api_target: str):
    def fn(q: dict) -> int | str:
        track = q.get("track") or q.get("domain")
        rt = q.get("response_type")
        if track == api_target:
            if rt in ("yesno", "yes_no"):
                return "Yes"
            return 5
        if rt in ("yesno", "yes_no"):
            return "No"
        return 1

    return fn


def _fine(q: dict) -> int | str:
    rt = q.get("response_type")
    return "No" if rt in ("yesno", "yes_no") else 1


@pytest.mark.asyncio
async def test_hinglish_attention_note(api_env):
    client = api_env["client"]
    token = await _login(client)

    note = "Mera beta homework ke time ek jagah baith hi nahi pata aur notebook bhool jata hai"
    _, _, path, result = await _drive_session(
        client,
        token,
        text=note,
        months=108,  # age 9
        answer_fn=_likert_high_for("attention"),
    )

    assert len(path) >= 3
    # The first 3 questions are in the attention domain (my key attention)
    first_3_domains = [t for t, _, _ in path[:3]]
    assert first_3_domains == ["attention", "attention", "attention"]

    # Result flags attention as Refer
    assert result["domain_classifications"].get("attention") == "Refer"
    assert "attention" in result["flagged_domains"]
    assert result["final_classification"] == "Refer"
    assert "not a diagnosis" in result["summary"].lower()


@pytest.mark.asyncio
async def test_reading_note(api_env):
    client = api_env["client"]
    token = await _login(client)

    note = "She reads very slowly, mixes up b and d and cries when asked to read aloud"
    _, _, path, result = await _drive_session(
        client,
        token,
        text=note,
        months=96,  # age 8
        answer_fn=_likert_high_for("reading"),
    )

    assert len(path) >= 2
    # First questions are reading
    assert path[0][0] == "reading"
    assert path[1][0] == "reading"
    assert result["domain_classifications"].get("reading") in ("Refer", "Monitor")
    assert "reading" in result["flagged_domains"]


@pytest.mark.asyncio
async def test_first_5_questions_differ(api_env):
    client = api_env["client"]
    token = await _login(client)

    note1 = "Mera beta homework ke time ek jagah baith hi nahi pata aur notebook bhool jata hai"
    _, _, path1, _ = await _drive_session(
        client,
        token,
        text=note1,
        months=108,
        answer_fn=_likert_high_for("attention"),
    )

    note2 = "She reads very slowly, mixes up b and d and cries when asked to read aloud"
    _, _, path2, _ = await _drive_session(
        client,
        token,
        text=note2,
        months=96,
        answer_fn=_likert_high_for("reading"),
    )

    # Proof that questions follow the text: the first 5 questions differ
    q_texts_1 = [q_text for _, _, q_text in path1[:5]]
    q_texts_2 = [q_text for _, _, q_text in path2[:5]]
    assert q_texts_1 != q_texts_2


@pytest.mark.asyncio
async def test_vague_note_recall_help(api_env):
    client = api_env["client"]
    token = await _login(client)
    headers = _auth(token)

    r = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "corrected_age_months": 96,
            "consent_given": True,
            "question_cap": 20,
            "module": "B",
        },
    )
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    r = await client.post(
        f"/api/screen/{session_id}/intake",
        headers=headers,
        json={"text": "he is weak in studies"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["recall_help_needed"] is True
    assert data["next_action"] == "recall_help"
    assert data["action"]["type"] == "recall_help"
    assert "attention" in data["action"]["recall_options"]

    # Tap chips: recall endpoint
    r = await client.post(
        f"/api/screen/{session_id}/recall",
        headers=headers,
        json={"domains": ["attention"]},
    )
    assert r.status_code == 200
    act = r.json()
    assert act["type"] == "question"
    assert act["question"]["domain"] == "attention"


@pytest.mark.asyncio
async def test_safety_note(api_env):
    client = api_env["client"]
    token = await _login(client)

    note = "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana"
    _, first_resp, _, result = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=_fine,
    )

    # Helpline in the first response
    act = first_resp.get("action") or {}
    first_msg = (first_resp.get("safety_message") or "") + (
        act.get("safety_message") or ""
    )
    assert "1800-599-0019" in first_msg or "1098" in first_msg

    # Helpline in the final summary even if every later answer is "fine"
    summary = result.get("summary") or ""
    assert "1800-599-0019" in summary
    assert "Nothing in the answers suggests" not in summary


@pytest.mark.asyncio
async def test_vision_note_first_ruleout(api_env):
    client = api_env["client"]
    token = await _login(client)

    note = "ye bachcha board pe likha dekhne ke liye aage aa jata hai"
    _, _, path, _ = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=_fine,
    )

    ruleout_items = [
        item_id for track, item_id, _ in path if "vision" in track or "rule" in track
    ]
    # Check that rule-out was encountered and the first rule-out question is a vision question
    assert ruleout_items, "Expected rule-out question in path"
    first_item_id = ruleout_items[0]
    row = module_b_service.engine.bank.row(first_item_id)
    concept = str(row["concept_id"])
    assert concept in VISION_CONCEPTS, f"Expected vision concept, got {concept}"
    assert concept not in HEARING_CONCEPTS


@pytest.mark.asyncio
async def test_session_caps_and_floor(api_env):
    client = api_env["client"]
    token = await _login(client)

    note = "He cannot sit through homework and forgets everything"
    _, _, path, _ = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=_likert_high_for("attention"),
    )

    # A session never exceeds 20 questions
    assert len(path) <= 20
    # Respects MIN_REAL_ANSWERS_B
    assert len(path) >= MIN_REAL_ANSWERS_B
    # Respects MIN_DOMAINS_COVERED_B
    asked_domains = {
        track
        for track, _, _ in path
        if track not in ("safety", "rule_out", "vision_hearing")
    }
    assert len(asked_domains) >= MIN_DOMAINS_COVERED_B


@pytest.mark.asyncio
async def test_bad_input_and_invalid_session(api_env):
    client = api_env["client"]
    token = await _login(client)
    headers = _auth(token)

    r = await client.post(
        "/api/screen/start",
        headers=headers,
        json={
            "corrected_age_months": 108,
            "consent_given": True,
            "question_cap": 20,
            "module": "B",
        },
    )
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    r = await client.post(
        f"/api/screen/{session_id}/intake",
        headers=headers,
        json={"text": "He has trouble concentrating on schoolwork"},
    )
    assert r.status_code == 200
    act = r.json()["action"]
    valid_item_id = act["question"]["item_id"]

    # Bad item_id: wrong item_id not matching pending_item_id -> 422
    r_bad_id = await client.post(
        f"/api/screen/{session_id}/answer",
        headers=headers,
        json={"item_id": "WRONG_ID_999", "answer": 3},
    )
    assert r_bad_id.status_code == 422

    # Out-of-range value (likert 1-5 expected) -> 422
    r_bad_val = await client.post(
        f"/api/screen/{session_id}/answer",
        headers=headers,
        json={"item_id": valid_item_id, "answer": 99},
    )
    assert r_bad_val.status_code == 422

    # Unknown session -> 404
    r_bad_sess = await client.post(
        "/api/screen/00000000-0000-0000-0000-000000000000/answer",
        headers=headers,
        json={"item_id": valid_item_id, "answer": 3},
    )
    assert r_bad_sess.status_code == 404
