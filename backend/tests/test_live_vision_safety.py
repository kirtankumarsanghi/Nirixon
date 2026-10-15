"""Live verification of Vision ruleout, Bad input, and Safety flow."""

import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000"


def req(path, data=None, token=None, method="POST"):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    encoded_data = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def get_q(resp):
    if not resp:
        return None
    if isinstance(resp, dict):
        if resp.get("question"):
            return resp["question"]
        act = resp.get("action")
        if isinstance(act, dict) and "question" in act and act["question"]:
            return act["question"]
    return None


def main():
    # 1. Login
    status, auth = req(
        "/api/auth/login", {"email": "parent@example.com", "password": "changeme"}
    )
    assert status == 200, f"Login failed: {status}"
    token = auth["access_token"]
    print(f"1. Logged in successfully as parent (role: {auth['role']})")

    # 2. Vision Case Live
    print("\n2. Testing Vision Note live:")
    status, start_vis = req(
        "/api/screen/start",
        {
            "child_ref": "vis-child",
            "corrected_age_months": 108.0,
            "question_cap": 20,
            "consent_given": True,
        },
        token=token,
    )
    sess_vis = start_vis["session_id"]
    vis_text = "ye bachcha board pe likha dekhne ke liye aage aa jata hai"
    status, intake_vis = req(
        f"/api/screen/{sess_vis}/intake", {"text": vis_text, "chips": []}, token=token
    )
    q_vis = get_q(intake_vis)
    print(
        f"   First question: [{q_vis['item_id']}] ({q_vis.get('track')}): {q_vis['question_text']}"
    )

    # Keep answering until first rule-out question appears
    cur_q = q_vis
    found_ro = None
    for _ in range(10):
        track = cur_q.get("track")
        if track == "vision_hearing" or cur_q["item_id"].startswith("ro_"):
            found_ro = cur_q
            break
        status, ans_resp = req(
            f"/api/screen/{sess_vis}/answer",
            {"item_id": cur_q["item_id"], "answer": 1},
            token=token,
        )
        cur_q = get_q(ans_resp)
        if not cur_q:
            break

    assert found_ro is not None, "No ruleout question encountered"
    print(
        f"   First ruleout question: [{found_ro['item_id']}] ({found_ro.get('track')}): {found_ro['question_text']}"
    )
    concept = found_ro["item_id"].split(".")[0]
    assert concept in (
        "vh_tilt",
        "vh_board",
        "vh_squint",
        "vh_close",
        "vh_headache",
        "vh_bump",
        "vh_eye_test",
    ), f"Expected vision concept, got {concept}"
    print(
        f"   -> Vision ruleout confirmed: concept '{concept}' is a VISION rule-out question, NOT hearing!"
    )

    # 3. Bad Input Live
    print("\n3. Testing Bad Input live:")
    # 3a. Out of range answer (7) on likert
    status_bad1, err_bad1 = req(
        f"/api/screen/{sess_vis}/answer",
        {"item_id": cur_q["item_id"], "answer": 7},
        token=token,
    )
    print(
        f"   Out-of-range answer (7) -> status: {status_bad1}, detail: {err_bad1.get('detail')}"
    )
    assert status_bad1 == 422, f"Expected 422, got {status_bad1}"

    # 3b. Wrong/unexpected item_id
    status_bad2, err_bad2 = req(
        f"/api/screen/{sess_vis}/answer",
        {"item_id": "totally_wrong_id", "answer": 1},
        token=token,
    )
    print(
        f"   Wrong item_id -> status: {status_bad2}, detail: {err_bad2.get('detail')}"
    )
    assert status_bad2 == 422, f"Expected 422, got {status_bad2}"

    # 3c. Unknown session_id
    status_bad3, err_bad3 = req(
        "/api/screen/unknown-session-12345/answer",
        {"item_id": cur_q["item_id"], "answer": 1},
        token=token,
    )
    print(
        f"   Unknown session_id -> status: {status_bad3}, detail: {err_bad3.get('detail')}"
    )
    assert status_bad3 in (404, 400), f"Expected 4xx, got {status_bad3}"

    # 4. Safety Flow Questions & Notice
    print("\n4. Testing Safety Flow Questions and Final Summary live:")
    status, start_saf = req(
        "/api/screen/start",
        {
            "child_ref": "saf-child",
            "corrected_age_months": 108.0,
            "question_cap": 20,
            "consent_given": True,
        },
        token=token,
    )
    sess_saf = start_saf["session_id"]
    saf_text = "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana"
    status, intake_saf = req(
        f"/api/screen/{sess_saf}/intake", {"text": saf_text, "chips": []}, token=token
    )
    first_msg = (intake_saf.get("safety_message") or "") + (
        (intake_saf.get("action") or {}).get("safety_message") or ""
    )
    print(f"   Safety message shown first: {'1800-599-0019' in first_msg}")
    assert "1800-599-0019" in first_msg

    cur_q_saf = get_q(intake_saf)
    safety_questions = []
    while cur_q_saf:
        if (
            cur_q_saf.get("track") == "safety"
            or "saf" in cur_q_saf["item_id"]
            or "harm" in cur_q_saf["question_text"].lower()
        ):
            safety_questions.append(cur_q_saf)
        ans_val = "No" if cur_q_saf.get("response_type") == "yesno" else 1
        status, ans_resp = req(
            f"/api/screen/{sess_saf}/answer",
            {"item_id": cur_q_saf["item_id"], "answer": ans_val},
            token=token,
        )
        if ans_resp.get("type") == "complete":
            res_saf = ans_resp["result"]
            print(f"   Safety questions encountered: {len(safety_questions)}")
            for sq in safety_questions:
                print(
                    f"     - [{sq['item_id']}] ({sq.get('track')}): {sq['question_text']}"
                )
            print(f"   Final safety flag: {res_saf.get('safety')}")
            print(f"   Final summary lead: {res_saf['summary'][:160]!r}")
            assert "1800-599-0019" in res_saf["summary"]
            assert "Nothing in the answers suggests" not in res_saf["summary"]
            print(
                "   -> Confirmed: Helplines lead final summary even though all answers were No/Never!"
            )
            break
        cur_q_saf = get_q(ans_resp)

    print(
        "\n>>> ALL VISION, BAD INPUT, AND SAFETY LIVE CHECKS PASSED WITH 200/422! <<<"
    )


if __name__ == "__main__":
    main()
