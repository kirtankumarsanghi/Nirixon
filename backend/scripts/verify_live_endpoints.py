"""
Complete Live Endpoint Verification Suite for Nirixon Backend.

Exercises 100% of registered API endpoints against a live TestClient instance
with actual SQLite database, real machine learning artifacts (Module A and B),
real NLP router, and audio narration repository.
"""

import os
import sys
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "dev-only-change-me-nirixon-jwt-secret-key-32b")

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import get_settings
from app.main import create_app
from fastapi.testclient import TestClient


def run_live_verification():
    print("=" * 80)
    print("NIRIXON BACKEND — COMPLETE LIVE ENDPOINT VERIFICATION")
    print("=" * 80)

    app = create_app()
    passed = 0
    failed = 0
    failures = []

    def verify(name, condition, msg=""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  [PASS] {name}")
        else:
            failed += 1
            failures.append(f"{name}: {msg}")
            print(f"  [FAIL] {name} - {msg}")

    with TestClient(app) as client:
        # ---------------------------------------------------------
        # 1. CORE HEALTH & LIVENESS
        # ---------------------------------------------------------
        print("\n--- 1. Core Health & Liveness Endpoints ---")
        r = client.get("/health")
        verify("GET /health", r.status_code == 200 and r.json().get("status") == "ok", r.text)

        r = client.get("/live")
        verify("GET /live", r.status_code == 200 and r.json().get("status") == "alive", r.text)

        # ---------------------------------------------------------
        # 2. AUTHENTICATION (ALL ROLES)
        # ---------------------------------------------------------
        print("\n--- 2. Authentication Endpoints ---")
        settings = get_settings()

        # Parent login
        r_parent = client.post(
            "/api/auth/login",
            json={"email": settings.seed_user_email, "password": settings.seed_user_password},
        )
        verify("POST /api/auth/login (parent)", r_parent.status_code == 200 and "access_token" in r_parent.json(), r_parent.text)
        parent_token = r_parent.json().get("access_token")
        parent_headers = {"Authorization": f"Bearer {parent_token}"}

        # CHW login
        r_chw = client.post(
            "/api/auth/login",
            json={"email": "chw@example.com", "password": "changeme"},
        )
        verify("POST /api/auth/login (chw)", r_chw.status_code == 200 and "access_token" in r_chw.json(), r_chw.text)
        chw_token = r_chw.json().get("access_token")
        chw_headers = {"Authorization": f"Bearer {chw_token}"}

        # Clinician login
        r_clinician = client.post(
            "/api/auth/login",
            json={"email": "clinician@example.com", "password": "changeme"},
        )
        verify("POST /api/auth/login (clinician)", r_clinician.status_code == 200 and "access_token" in r_clinician.json(), r_clinician.text)
        clinician_token = r_clinician.json().get("access_token")
        clinician_headers = {"Authorization": f"Bearer {clinician_token}"}

        # Supervisor login
        r_sup = client.post(
            "/api/auth/login",
            json={"email": "supervisor@example.com", "password": "changeme"},
        )
        verify("POST /api/auth/login (supervisor)", r_sup.status_code == 200 and "access_token" in r_sup.json(), r_sup.text)
        sup_token = r_sup.json().get("access_token")
        sup_headers = {"Authorization": f"Bearer {sup_token}"}

        # ---------------------------------------------------------
        # 3. AUDIO NARRATION ENDPOINTS
        # ---------------------------------------------------------
        print("\n--- 3. Audio Narration Endpoints ---")
        r = client.get("/api/audio/manifest")
        verify("GET /api/audio/manifest", r.status_code == 200 and "items" in r.json(), r.text)

        r = client.get("/api/audio/manifest?include_unreviewed=true", headers=sup_headers)
        verify("GET /api/audio/manifest?include_unreviewed=true", r.status_code == 200, r.text)

        r = client.get("/api/audio/item/GM_01?language=en")
        verify("GET /api/audio/item/{item_id} (en)", r.status_code == 200 and r.json().get("item_id") == "GM_01", r.text)

        r = client.get("/api/audio/item/GM_01?language=hi")
        verify("GET /api/audio/item/{item_id} (hi)", r.status_code == 200 and r.json().get("item_id") == "GM_01", r.text)

        r = client.get("/api/audio/item/NON_EXISTENT_ITEM")
        verify("GET /api/audio/item/{item_id} (fallback)", r.status_code == 200 and r.json().get("fallback_to_text") is True, r.text)

        r = client.get("/api/audio/report")
        verify("GET /api/audio/report", r.status_code == 200 and "coverage_percentage" in r.json(), r.text)

        r = client.get("/audio/narration/en/regression_flag.wav")
        verify("GET /audio/{file} (static mount)", r.status_code == 200 and len(r.content) > 0, f"Status: {r.status_code}")

        # ---------------------------------------------------------
        # 4. HELP CENTRES & GEO ROUTING
        # ---------------------------------------------------------
        print("\n--- 4. Help Centres & Geo Routing Endpoints ---")
        # Near AIIMS Delhi PIN 110029, under 6 years -> DEIC/RBSK
        r = client.get("/api/help/nearby?pin=110029&age_months=24")
        verify("GET /api/help/nearby (PIN + Under 6)", r.status_code == 200 and len(r.json().get("centres", [])) > 0, r.text)

        # GPS lat/lng search
        r = client.get("/api/help/nearby?lat=28.5672&lng=77.2100&age_years=8")
        verify("GET /api/help/nearby (GPS + Over 6 routing)", r.status_code == 200 and r.json().get("centres") is not None, r.text)

        # Fallback to national helplines when PIN has no nearby centre
        r = client.get("/api/help/nearby?pin=799999")
        verify("GET /api/help/nearby (Fallback Helplines)", r.status_code == 200 and len(r.json().get("helplines", [])) > 0, r.text)

        # ---------------------------------------------------------
        # 5. GROWTH TRACKING & TRAJECTORY ANALYSIS
        # ---------------------------------------------------------
        print("\n--- 5. Growth Tracking Endpoints ---")
        r = client.get("/api/growth/status")
        verify("GET /api/growth/status", r.status_code == 200 and r.json().get("sync_enabled") is True, r.text)

        child_growth_id = "test-growth-child-001"
        # Save Visit 1
        r = client.post(
            "/api/growth/visits",
            json={
                "child_id": child_growth_id,
                "age_bracket": "12-24m",
                "chronological_age_months": 14.0,
                "developmental_age_months": 13.5,
                "domain_scores": {"gross_motor": 80.0, "communication": 75.0},
                "tier": "Tier 1: Typical",
            },
        )
        verify("POST /api/growth/visits (visit 1)", r.status_code == 201, r.text)

        # Save Visit 2
        r = client.post(
            "/api/growth/visits",
            json={
                "child_id": child_growth_id,
                "age_bracket": "12-24m",
                "chronological_age_months": 18.0,
                "developmental_age_months": 14.0,
                "domain_scores": {"gross_motor": 65.0, "communication": 60.0},
                "tier": "Tier 2: In-App Reflex Monitor",
            },
        )
        verify("POST /api/growth/visits (visit 2)", r.status_code == 201, r.text)

        # List Visits
        r = client.get(f"/api/growth/visits/{child_growth_id}")
        verify("GET /api/growth/visits/{child_id}", r.status_code == 200 and len(r.json()) == 2, r.text)

        # Compute Analysis & Plateau Rule
        r = client.get(f"/api/growth/analysis/{child_growth_id}")
        verify("GET /api/growth/analysis/{child_id}", r.status_code == 200 and "is_plateau_detected" in r.json(), r.text)

        # Export Visit Data
        r = client.get(f"/api/growth/export/{child_growth_id}")
        verify("GET /api/growth/export/{child_id}", r.status_code == 200 and r.json().get("total_visits") == 2, r.text)

        # Delete / Right to Erasure
        r = client.delete(f"/api/growth/data/{child_growth_id}")
        verify("DELETE /api/growth/data/{child_id}", r.status_code == 200 and r.json().get("deleted_count") == 2, r.text)

        # ---------------------------------------------------------
        # 6. STANDALONE PREDICTION ENDPOINT
        # ---------------------------------------------------------
        print("\n--- 6. Standalone Prediction Endpoint ---")
        from app.ml.inference_service import build_feature_vector, inference_service
        feat_vector = build_feature_vector(
            corrected_age_months=24.0,
            real_answers={"GM_01": 2, "CG_01": 2, "FM_01": 2, "CM_01": 2, "SE_01": 2},
            imputed_answers={},
            feature_columns=inference_service.feature_columns,
        )
        r = client.post(
            "/api/predict",
            headers=parent_headers,
            json={
                "features": feat_vector,
            },
        )
        verify("POST /api/predict", r.status_code == 200 and "final_classification" in r.json(), r.text)

        # ---------------------------------------------------------
        # 7. SCREENING LIFECYCLE (MODULE A)
        # ---------------------------------------------------------
        print("\n--- 7. Screening Lifecycle (Module A) ---")
        # Touch config & Live tasks
        r = client.get("/api/screen/touch-config")
        verify("GET /api/screen/touch-config", r.status_code == 200 and "brackets" in r.json(), r.text)

        r = client.get("/api/screen/live-tasks/24-36m")
        verify("GET /api/screen/live-tasks/{bracket}", r.status_code == 200 and len(r.json()) > 0, r.text)

        # Start Module A Session
        r = client.post(
            "/api/screen/start",
            headers=parent_headers,
            json={
                "child_ref": "Live-Test-A",
                "corrected_age_months": 28.0,
                "consent_given": True,
                "module": "A",
            },
        )
        verify("POST /api/screen/start (Module A)", r.status_code == 200 and r.json().get("type") in ("question", "result"), r.text)
        session_a_id = r.json().get("session_id")

        # Get Session State
        r = client.get(f"/api/screen/{session_a_id}", headers=parent_headers)
        verify("GET /api/screen/{session_id}", r.status_code == 200 and r.json().get("session_id") == session_a_id, r.text)

        # Initial Question from start
        first_q = r.json().get("question")
        q_item_id = first_q.get("item_id") if first_q else "regression_flag"

        # Submit Answer
        r = client.post(
            f"/api/screen/{session_a_id}/answer",
            headers=parent_headers,
            json={"item_id": q_item_id, "answer": 0},
        )
        verify("POST /api/screen/{session_id}/answer", r.status_code == 200 and "type" in r.json(), r.text)
        action_a = r.json()

        # Test live tasks for session
        r = client.get(f"/api/screen/{session_a_id}/live-tasks", headers=parent_headers)
        verify("GET /api/screen/{session_id}/live-tasks", r.status_code == 200 and "tasks" in r.json(), r.text)

        # Test touch telemetry (child is 28 months, >= 24 months; task_type is tap/trace/drag)
        r = client.post(
            f"/api/screen/{session_a_id}/touch-telemetry",
            headers=parent_headers,
            json={
                "age_months": 28.0,
                "tasks": [
                    {
                        "task_type": "tap",
                        "reaction_time_ms": 650.0,
                        "path_accuracy_pct": 88.0,
                        "jitter_px": 12.5,
                    }
                ]
            },
        )
        verify("POST /api/screen/{session_id}/touch-telemetry", r.status_code == 200 and r.json().get("recorded_metrics_count") == 1, r.text)

        # Answer Module A until completion
        while action_a.get("type") == "question":
            q = action_a.get("question")
            if not q:
                break
            ans_val = 0
            r_ans = client.post(
                f"/api/screen/{session_a_id}/answer",
                headers=parent_headers,
                json={"item_id": q["item_id"], "answer": ans_val},
            )
            action_a = r_ans.json()

        verify("Module A completion reached", action_a.get("type") in ("complete", "result"), str(action_a)[:100])

        # Result verification
        r_res = client.get(f"/api/screen/{session_a_id}/result", headers=parent_headers)
        verify("GET /api/screen/{session_id}/result", r_res.status_code == 200 and "triage_tier" in r_res.json(), r_res.text)

        # Suggested workers
        r_w = client.get(f"/api/screen/{session_a_id}/workers", headers=parent_headers)
        verify("GET /api/screen/{session_id}/workers", r_w.status_code == 200, r_w.text)

        # Contact worker
        r_cw = client.post(
            f"/api/screen/{session_a_id}/contact_worker",
            headers=parent_headers,
            json={"worker_id": "seed-chw-001", "contact_method": "call"},
        )
        verify("POST /api/screen/{session_id}/contact_worker", r_cw.status_code == 200 and r_cw.json().get("status") == "success", r_cw.text)

        # ---------------------------------------------------------
        # 8. SCREENING LIFECYCLE (MODULE B: 5-12 YEARS)
        # ---------------------------------------------------------
        print("\n--- 8. Screening Lifecycle (Module B) ---")
        # Start Module B Session (child age 7 years / 84 months)
        r = client.post(
            "/api/screen/start",
            headers=parent_headers,
            json={
                "child_ref": "Live-Test-B",
                "corrected_age_months": 84.0,
                "consent_given": True,
                "module": "B",
                "question_cap": 10,
            },
        )
        verify("POST /api/screen/start (Module B)", r.status_code == 200, r.text)
        session_b_id = r.json().get("session_id")

        # Submit Intake (free-text NLP routing)
        r = client.post(
            f"/api/screen/{session_b_id}/intake",
            headers=parent_headers,
            json={"text": "He has trouble sitting still and cannot focus in school.", "setting": "both"},
        )
        verify("POST /api/screen/{session_id}/intake", r.status_code == 200 and "detected_domains" in r.json(), r.text)
        intake_resp = r.json()

        # Advance Module B questions
        b_q = intake_resp.get("question")
        if b_q:
            r_ans_b = client.post(
                f"/api/screen/{session_b_id}/answer",
                headers=parent_headers,
                json={"item_id": b_q["item_id"], "answer": 1},
            )
            verify("POST /api/screen/{session_id}/answer (Module B)", r_ans_b.status_code == 200, r_ans_b.text)

        # Module B Next Action
        r_b_next = client.post(f"/api/screen/{session_b_id}/b/next", headers=parent_headers)
        verify("POST /api/screen/{session_id}/b/next", r_b_next.status_code in (200, 400), r_b_next.text)

        # Teacher Invite for DSM-5 Criterion C Concordance
        r_tch_inv = client.post(f"/api/screen/{session_b_id}/teacher_invite", headers=parent_headers)
        verify("POST /api/screen/{session_id}/teacher_invite", r_tch_inv.status_code == 200 and "teacher_invite_code" in r_tch_inv.json(), r_tch_inv.text)
        invite_code = r_tch_inv.json().get("teacher_invite_code")

        # Public Teacher items endpoint
        r_tch_items = client.get(f"/api/screen/teacher/{invite_code}/items")
        verify("GET /api/screen/teacher/{code}/items", r_tch_items.status_code == 200 and len(r_tch_items.json().get("items", [])) > 0, r_tch_items.text)
        tch_items = r_tch_items.json().get("items", [])

        # Submit Teacher Assessment
        tch_answers = {item["item_id"]: 1 for item in tch_items[:4]}
        r_tch_sub = client.post(
            f"/api/screen/teacher/{invite_code}/submit",
            json={"answers": tch_answers, "classroom_notes": "Good participation."},
        )
        verify("POST /api/screen/teacher/{code}/submit", r_tch_sub.status_code == 200 and "consistency_score" in r_tch_sub.json(), r_tch_sub.text)

        # ---------------------------------------------------------
        # 9. CLINICIAN SANDBOX / WHAT-IF SIMULATION
        # ---------------------------------------------------------
        print("\n--- 9. Clinician Sandbox / What-If Endpoints ---")
        r_sim = client.post(
            f"/api/sandbox/{session_a_id}/simulate",
            headers=clinician_headers,
            json={
                "corrected_age_months": 28.0,
                "answer_overrides": {"regression_flag": 1},
                "domain_scores": {"gross_motor": 40.0},
            },
        )
        verify("POST /api/sandbox/{session_id}/simulate", r_sim.status_code == 200 and r_sim.json().get("triage_tier") == "Tier 3: Direct Referral", r_sim.text)

        # ---------------------------------------------------------
        # 10. JOINT FAMILY SHARING & CONCORDANCE
        # ---------------------------------------------------------
        print("\n--- 10. Joint Family Sharing & Concordance Endpoints ---")
        # Create Invite
        r_inv = client.post(
            f"/api/share/session/{session_a_id}/invite",
            headers=parent_headers,
            json={"role_label": "Father", "expires_in_hours": 48},
        )
        verify("POST /api/share/session/{session_id}/invite", r_inv.status_code == 200 and "token" in r_inv.json(), r_inv.text)
        token = r_inv.json().get("token")

        # List Invites
        r_inv_list = client.get(f"/api/share/session/{session_a_id}/invites", headers=parent_headers)
        verify("GET /api/share/session/{session_id}/invites", r_inv_list.status_code == 200 and len(r_inv_list.json()) > 0, r_inv_list.text)

        # Public Token Intake
        r_pub = client.get(f"/api/share/invite/{token}")
        verify("GET /api/share/invite/{token}", r_pub.status_code == 200 and "items" in r_pub.json(), r_pub.text)
        share_questions = r_pub.json().get("items", [])

        # Submit Respondent Answers
        if share_questions:
            resp_answers = {q["item_id"]: 0 for q in share_questions[:3]}
            r_sub = client.post(
                f"/api/share/invite/{token}/respond",
                json={"answers": resp_answers, "role_label": "Father"},
            )
            verify("POST /api/share/invite/{token}/respond", r_sub.status_code == 200 and r_sub.json().get("status") == "received", r_sub.text)

        # Concordance Analysis
        r_conc = client.get(f"/api/share/session/{session_a_id}/concordance", headers=parent_headers)
        verify("GET /api/share/session/{session_id}/concordance", r_conc.status_code == 200 and "overall_concordance" in r_conc.json(), r_conc.text)

        # Combination Merge
        r_merge = client.post(
            f"/api/share/session/{session_a_id}/merge",
            headers=parent_headers,
            json={"apply_to_session": True},
        )
        verify("POST /api/share/session/{session_id}/merge", r_merge.status_code == 200 and "final_classification" in r_merge.json(), r_merge.text)

        # ---------------------------------------------------------
        # 11. WORKER DASHBOARD, REFERRALS & OFFLINE SYNC
        # ---------------------------------------------------------
        print("\n--- 11. CHW Dashboard, Referrals & Offline Sync ---")
        # Worker identity
        r_wme = client.get("/api/chw/workers/me", headers=chw_headers)
        verify("GET /api/chw/workers/me", r_wme.status_code == 200 and r_wme.json().get("role") == "chw", r_wme.text)

        r_wall = client.get("/api/chw/workers", headers=chw_headers)
        verify("GET /api/chw/workers", r_wall.status_code == 200 and len(r_wall.json()) > 0, r_wall.text)

        # Seed 200 children for acceptance criteria
        r_seed = client.post(
            "/api/chw/seed-children",
            headers=chw_headers,
            json={"count": 200, "area": "Ward 12", "clean_first": True},
        )
        verify("POST /api/chw/seed-children (200 records)", r_seed.status_code == 201 and r_seed.json().get("seeded_count") == 200, r_seed.text)

        # Tier Counts
        r_tc = client.get("/api/chw/tier-counts", headers=chw_headers)
        verify("GET /api/chw/tier-counts", r_tc.status_code == 200 and r_tc.json().get("total_children") == 200, r_tc.text)

        # List Children with filters
        r_ch_list = client.get("/api/chw/children?tier=Tier%203:%20Direct%20Referral&limit=5", headers=chw_headers)
        verify("GET /api/chw/children (filter by tier)", r_ch_list.status_code == 200 and len(r_ch_list.json()) > 0, r_ch_list.text)
        target_child = r_ch_list.json()[0]
        c_id = target_child["id"]

        # Quick Action 1: Mark Contacted
        r_cont = client.post(f"/api/chw/children/{c_id}/contact", headers=chw_headers)
        verify("POST /api/chw/children/{id}/contact", r_cont.status_code == 200 and r_cont.json().get("contact_count") is not None, r_cont.text)

        # Quick Action 2: One-Touch Referral
        r_otr = client.post(f"/api/chw/children/{c_id}/one-touch-referral", headers=chw_headers)
        verify("POST /api/chw/children/{id}/one-touch-referral", r_otr.status_code == 200 and "summary" in r_otr.json(), r_otr.text)
        ref_id = r_otr.json().get("referral", {}).get("id")

        # Referral Lifecycle: Get, Patch status (created -> sent -> seen)
        r_ref_get = client.get(f"/api/referrals/{ref_id}", headers=chw_headers)
        verify("GET /api/referrals/{id}", r_ref_get.status_code == 200 and r_ref_get.json().get("id") == ref_id, r_ref_get.text)

        r_ref_sent = client.patch(
            f"/api/referrals/{ref_id}",
            headers=chw_headers,
            json={"status": "sent"},
        )
        verify("PATCH /api/referrals/{id} -> sent", r_ref_sent.status_code == 200 and r_ref_sent.json().get("status") == "sent", r_ref_sent.text)

        r_ref_seen = client.patch(
            f"/api/referrals/{ref_id}",
            headers=chw_headers,
            json={"status": "seen", "outcome_notes": "Seen by pediatrician"},
        )
        verify("PATCH /api/referrals/{id} -> seen", r_ref_seen.status_code == 200 and r_ref_seen.json().get("status") == "seen", r_ref_seen.text)

        # Quick Action 3: Record Outcome (seen -> outcome recorded)
        r_out = client.post(
            f"/api/chw/children/{c_id}/outcome",
            headers=chw_headers,
            json={"outcome_notes": "Child visited Safdarjung DEIC; therapy initiated.", "close_referral": False},
        )
        verify("POST /api/chw/children/{id}/outcome", r_out.status_code == 200 and r_out.json().get("status") == "outcome recorded", r_out.text)

        # Referral 4-Field Minimal Summary (JSON, PDF, Text)
        r_sum_json = client.get(f"/api/referrals/{ref_id}/summary", headers=chw_headers)
        verify("GET /api/referrals/{id}/summary (JSON)", r_sum_json.status_code == 200 and "tier" in r_sum_json.json(), r_sum_json.text)

        r_sum_pdf = client.get(f"/api/referrals/{ref_id}/summary/pdf", headers=chw_headers)
        verify("GET /api/referrals/{id}/summary/pdf (PDF binary)", r_sum_pdf.status_code == 200 and r_sum_pdf.headers.get("content-type") == "application/pdf", r_sum_pdf.text[:100])

        r_sum_txt = client.get(f"/api/referrals/{ref_id}/summary/text", headers=chw_headers)
        verify("GET /api/referrals/{id}/summary/text (Shareable Text)", r_sum_txt.status_code == 200 and "NIRIXON REFERRAL SUMMARY" in r_sum_txt.text, r_sum_txt.text[:100])

        # Offline Batch Sync Queue & Conflict Handling
        import uuid as _uuid_mod
        sync_key_1 = f"offline-sync-key-{_uuid_mod.uuid4().hex[:8]}"
        sync_key_2 = f"offline-sync-key-{_uuid_mod.uuid4().hex[:8]}"
        sync_payload = {
            "operations": [
                {
                    "idempotency_key": sync_key_1,
                    "child_id": c_id,
                    "operation": "screening",
                    "payload": {
                        "module": "A",
                        "corrected_age_months": 28.0,
                        "tier": "Tier 3: Direct Referral",
                        "domains_flagged": ["gross_motor"],
                        "safety_rule_triggered": "Test offline trigger",
                    },
                },
                {
                    "idempotency_key": sync_key_2,
                    "child_id": c_id,
                    "operation": "contact",
                    "payload": {"note": "offline home visit"},
                },
            ]
        }
        r_sync_1 = client.post("/api/chw/sync", headers=chw_headers, json=sync_payload)
        verify("POST /api/chw/sync (initial)", r_sync_1.status_code == 200 and r_sync_1.json().get("created_count") >= 1, r_sync_1.text)

        # Idempotency re-test (send exact same batch again -> expect 0 created, all deduplicated)
        r_sync_2 = client.post("/api/chw/sync", headers=chw_headers, json=sync_payload)
        verify("POST /api/chw/sync (idempotent deduplication)", r_sync_2.status_code == 200 and r_sync_2.json().get("deduplicated_count") == 2, r_sync_2.text)

        # Check Conflicts
        r_conflicts = client.get("/api/chw/conflicts", headers=chw_headers)
        verify("GET /api/chw/conflicts", r_conflicts.status_code == 200, r_conflicts.text)

        # Right to Erasure / Deletion of shared session and child
        r_del_share = client.delete(f"/api/share/session/{session_a_id}", headers=parent_headers)
        verify("DELETE /api/share/session/{id} (cascading erasure)", r_del_share.status_code == 200 and r_del_share.json().get("status") == "deleted", r_del_share.text)

    print("\n" + "=" * 80)
    print(f"VERIFICATION SUMMARY: {passed} PASSED, {failed} FAILED")
    print("=" * 80)
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
        return False
    return True


if __name__ == "__main__":
    success = run_live_verification()
    sys.exit(0 if success else 1)
