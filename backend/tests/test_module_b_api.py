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
from app.core.module_b.engine_b import HEARING_CONCEPTS, VISION_CONCEPTS
from app.core.module_b.service import module_b_service
from app.core.safety_floor import MIN_DOMAINS_COVERED_B, MIN_REAL_ANSWERS_B
from httpx import AsyncClient
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


@pytest.mark.asyncio
async def test_privacy_no_parent_text_or_evidence_saved(api_env):
    """Parent text and router evidence snippets must NOT be persisted in the DB."""
    client = api_env["client"]
    token = await _login(client)
    headers = _auth(token)
    session_factory = api_env["session_factory"]

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

    secret_raw_text = "Mera beta homework ke time ek jagah baith hi nahi pata aur notebook bhool jata hai"
    r = await client.post(
        f"/api/screen/{session_id}/intake",
        headers=headers,
        json={"text": secret_raw_text},
    )
    assert r.status_code == 200

    from app.db.models import ScreeningSession as DbSession
    from sqlalchemy import select

    async with session_factory() as db:
        res = await db.execute(select(DbSession).where(DbSession.id == session_id))
        row = res.scalar_one()

        state = row.module_b_state or {}
        # text must be empty
        assert state.get("text") == "", f"Expected empty text, got {state.get('text')}"
        # router_evidence must be empty or absent
        evidence = state.get("router_evidence") or {}
        assert evidence == {}, f"Expected empty router_evidence, got {evidence}"
        # raw sensitive substrings must not exist in serialized states
        import json

        state_str = json.dumps(state)
        assert "baith hi nahi" not in state_str
        assert "notebook bhool" not in state_str


@pytest.mark.asyncio
async def test_module_b_triage_tier_and_comorbidity(api_env):
    """Verify triage_tier contract and clinical comorbidity advisory in Module B."""
    client = api_env["client"]
    token = await _login(client)

    note = (
        "He cannot focus or sit still, and also reads very slowly and mixes up b and d."
    )

    def dual_high(q: dict) -> int | str:
        track = q.get("track") or q.get("domain")
        rt = q.get("response_type")
        if track in ("attention", "reading"):
            return "Yes" if rt in ("yesno", "yes_no") else 5
        return "No" if rt in ("yesno", "yes_no") else 1

    _, _, _, result = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=dual_high,
    )

    assert result["triage_tier"] == "Tier 3: Direct Referral"
    assert result["reflex_branch_recommended"] is False
    # Check comorbidity advisory
    advs = result.get("guard_advisories", [])
    assert any("Comorbidity" in a for a in advs)
    assert any(
        "Multidisciplinary" in a.lower() or "multidisciplinary" in a for a in advs
    )


@pytest.mark.asyncio
async def test_module_b_straight_lining_guard(api_env):
    """Verify that answering with identical Likert options flags straight-lining."""
    client = api_env["client"]
    token = await _login(client)

    note = "No problems at all, everything is fine."

    _, _, _, result = await _drive_session(
        client,
        token,
        text=note,
        months=96,
        answer_fn=lambda q: (
            "No" if q.get("response_type") in ("yesno", "yes_no") else 1
        ),
    )

    assert result["triage_tier"] == "Tier 1: Routine Pass"
    assert result["guard_flags"].get("straight_lining") is True
    assert any(
        "straight-lining" in a.lower() for a in result.get("guard_advisories", [])
    )


@pytest.mark.asyncio
async def test_module_b_bayesian_cat_fisher_info(api_env):
    """Verify that Bayesian CAT estimates latent theta, standard error SE, and Fisher Information."""
    client = api_env["client"]
    token = await _login(client)

    note = "He cannot sit still and forgets everything."
    _, _, _, result = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=_likert_high_for("attention"),
    )

    domain_details = result.get("domain_details", {})
    assert "attention" in domain_details
    att_track = domain_details["attention"]
    assert "irt_theta" in att_track
    assert "irt_se" in att_track
    assert "fisher_information" in att_track
    assert isinstance(att_track["irt_theta"], (int, float))
    assert isinstance(att_track["irt_se"], (int, float))
    assert att_track["irt_se"] <= 1.0


@pytest.mark.asyncio
async def test_module_b_differential_masking(api_env):
    """Verify differential masking gate distinguishes Auditory sequential delays from primary ADHD."""
    client = api_env["client"]
    token = await _login(client)

    # Auditory delay complaint
    note = "He cannot follow spoken instructions in class and needs everything repeated, but sits quietly and plays puzzles fine."

    def aud_only(q: dict) -> int | str:
        track = q.get("track") or q.get("domain")
        rt = q.get("response_type")
        if track in ("listening_speaking",):
            return "Yes" if rt in ("yesno", "yes_no") else 5
        # normal attention
        return "No" if rt in ("yesno", "yes_no") else 1

    _, _, _, result = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=aud_only,
    )

    diff = result.get("differential_masking", {})
    assert diff.get("capd_vs_adhd") is True
    assert any("auditory processing" in c.lower() for c in result.get("caveats", []))


@pytest.mark.asyncio
async def test_module_b_multi_informant_teacher_concordance(api_env):
    """Verify DSM-5 Criterion C multi-informant teacher invite, item fetch, and concordance scoring."""
    client = api_env["client"]
    token = await _login(client)
    headers = _auth(token)

    # 1. Complete parent session
    note = "He cannot focus and forgets homework."
    session_id, _, _, _parent_result = await _drive_session(
        client,
        token,
        text=note,
        months=108,
        answer_fn=_likert_high_for("attention"),
    )

    # 2. Generate teacher invite
    r_invite = await client.post(
        f"/api/screen/{session_id}/teacher_invite",
        headers=headers,
    )
    assert r_invite.status_code == 200, r_invite.text
    invite_data = r_invite.json()
    invite_code = invite_data["teacher_invite_code"]
    assert invite_code.startswith("TCH-")

    # 3. Fetch teacher items (public / teacher view, no auth header needed)
    r_items = await client.get(f"/api/screen/teacher/{invite_code}/items")
    assert r_items.status_code == 200, r_items.text
    items_data = r_items.json()
    assert len(items_data["items"]) >= 6

    # 4. Teacher submits classroom observations (attention high, other areas typical)
    teacher_answers = {}
    for item in items_data["items"]:
        iid = item["item_id"]
        # Concordant high on attention, typical on others
        teacher_answers[iid] = 5 if item["domain"] == "attention" else 1

    r_submit = await client.post(
        f"/api/screen/teacher/{invite_code}/submit",
        json={"answers": teacher_answers},
    )
    assert r_submit.status_code == 200, r_submit.text
    submit_data = r_submit.json()

    assert submit_data["consistency_score"] >= 0.70
    concordance = submit_data["concordance_classification"]
    assert concordance.get("attention") == "concordant_high"
    assert any("DSM-5 Criterion C met" in c for c in submit_data["caveats"])
