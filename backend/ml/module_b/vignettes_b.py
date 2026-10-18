"""Scripted Module B smoke check — NOT a validation of the NLP router.

CAREFUL: this is a plumbing check, not evidence of accuracy.

Each vignette's answers are chosen *from the vignette's own expected diagnosis*
(see the `ans` branch keyed on `v["id"]` below). The engine is therefore told the
answer that implies the label and then "correctly" reproduces that label. It also
cannot measure the NLP router, because the answers never depend on what the
router inferred from the note.

Do not cite this script's concordance as model quality. Router quality lives in
`ml/artifacts/module_b_router/router_metrics.json` (and `data/claims_register.json`),
and the honest independent set is `ml/module_b/handwritten_eval_b.csv`.
`tests/test_module_b_api.py` is the behavioural regression suite.

Run: python ml/module_b/vignettes_b.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.module_b.screen_bridge import build_result_payload
from app.core.module_b.service import module_b_service

VIGNETTES = [
    {
        "id": "V01",
        "name": "ADHD (Combined Type)",
        "age_years": 8,
        "note": "He cannot sit still for homework, gets up every 5 minutes, leaves his seat in class, interrupts others, and loses his pencils and notebook every week.",
        "primary_domain": "attention_work",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Refer",
    },
    {
        "id": "V02",
        "name": "Developmental Dyslexia",
        "age_years": 8,
        "note": "She reads very slowly, confuses letters b and d, guesses words from the first letter, and cries when asked to read aloud in front of the class.",
        "primary_domain": "reading",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Refer",
    },
    {
        "id": "V03",
        "name": "Developmental Dyscalculia",
        "age_years": 9,
        "note": "Maths is a complete nightmare. She still counts on fingers for 6+3, cannot remember 2-times multiplication tables, and cannot tell time on a clock.",
        "primary_domain": "numbers",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Refer",
    },
    {
        "id": "V04",
        "name": "DCD / Dyspraxia",
        "age_years": 9,
        "note": "He trips over his own feet, cannot catch a ball during PT class, still struggles to button his uniform shirt, and his pencil grip is awkward and tiring.",
        "primary_domain": "motor",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Refer",
    },
    {
        "id": "V05",
        "name": "Childhood Absence Epilepsy",
        "age_years": 7,
        "note": "Teacher says he blanks out in the middle of sentences for 10 seconds and does not respond when called. Doctor checked ears and hearing is normal.",
        "primary_domain": "listening_speaking",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Refer",
    },
    {
        "id": "V06",
        "name": "Pediatric Mental Health Crisis",
        "age_years": 10,
        "note": "My child keeps saying I want to die and don't want to wake up. She locks herself in the room and cries uncontrollably.",
        "primary_domain": "safety",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Safety Helpline",
    },
    {
        "id": "V07",
        "name": "Binocular Tracking Strain",
        "age_years": 8,
        "note": "He sits very close to the TV, rubs his eyes, and squints when copying words from the blackboard. Complains of frequent headaches after reading.",
        "primary_domain": "vision_hearing",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "Sensory Rule-Out",
    },
    {
        "id": "V08",
        "name": "High-Functioning ASD",
        "age_years": 7,
        "note": "She looks away when spoken to, lines up her toys in precise order, has severe meltdowns if daily routine changes, and talks exclusively about dinosaurs.",
        "primary_domain": "global_asd",
        "expected_tier": "Tier 3: Direct Referral",
        "expected_flag": "ASD Marker",
    },
    {
        "id": "V09",
        "name": "Situational School Anxiety",
        "age_years": 9,
        "note": "Fine during weekends and holidays, but gets severe stomach aches every Sunday evening and cries refusing to board the school bus due to exam fears.",
        "primary_domain": "emotion_school",
        "expected_tier": "Tier 2: Reflex-Branch",
        "expected_flag": "Monitor",
    },
    {
        "id": "V10",
        "name": "Healthy Typical Child",
        "age_years": 8,
        "note": "He loves playing football and has lots of friends. Occasionally forgets a pencil at school, but finishes homework fine and marks are good.",
        "primary_domain": "typical",
        "expected_tier": "Tier 1: Routine Pass",
        "expected_flag": "Typical",
    },
]


def audit_vignettes() -> None:
    print("\n" + "=" * 90)
    print("      MODULE B SCRIPTED SMOKE CHECK (answers are scripted — NOT validation)")
    print("=" * 90)
    print("Answers are chosen from each vignette's expected diagnosis, so a MATCH only")
    print("shows the engine reproduces the label it was given. It says nothing about")
    print("the NLP router or real-world accuracy. See router_metrics.json instead.")
    print("-" * 90)
    print(
        f"{'ID':<4} | {'Phenotype':<30} | {'Expected Tier':<22} | {'Engine Tier':<22} | {'Status'}"
    )
    print("-" * 90)

    # Use the app's singleton so the intake note really goes through the router.
    module_b_service.load()
    engine = module_b_service.engine
    passed = 0

    for v in VIGNETTES:
        # Start adaptive session with caregiver text
        session = engine.start(v["note"], v["age_years"], seed=42)

        # Drive adaptive questions according to vignette profile
        max_steps = 25
        for _ in range(max_steps):
            action = engine.next_action(session)
            atype = action.get("type")
            if atype == "question":
                iid = action["item_id"]
                track = action.get("track", "")
                row = engine.bank.row(iid)
                rt = row["response_type"]

                # Answer according to phenotype
                if v["id"] == "V10":
                    # Typical child answers clean
                    ans = "No" if rt == "yesno" else 1
                elif v["id"] == "V06":
                    # Safety crisis
                    ans = "Yes" if rt == "yesno" else 5
                elif track in (
                    v["primary_domain"],
                    "vision_hearing",
                    "global_asd",
                    "ruleout_global_asd",
                ) and v["id"] in ("V01", "V02", "V03", "V04", "V05", "V07", "V08"):
                    ans = "Yes" if rt == "yesno" else 5
                elif v["id"] == "V09" and track in (
                    "emotion_school",
                    "emotion_conduct",
                ):
                    ans = "Yes" if rt == "yesno" else 3
                else:
                    ans = "No" if rt == "yesno" else 1

                engine.answer(session, iid, ans)
            elif atype == "safety_notice":
                # Acknowledge safety helpline
                session.safety_shown = True
            elif atype == "recall_help":
                engine.apply_recall_choice(session, ["attention"])
            elif atype == "done":
                break

        # Compute final result through bridge
        raw_res = engine.result(session)
        payload = build_result_payload(raw_res)

        # Sensory rule-out forces Tier 3
        if raw_res.get("ruleout_flags") or payload.safety_override_triggered:
            payload.triage_tier = "Tier 3: Direct Referral"

        actual_tier = payload.triage_tier
        is_concordant = (actual_tier == v["expected_tier"]) or (
            v["expected_tier"] == "Tier 3: Direct Referral"
            and actual_tier in ("Tier 3: Direct Referral", "Refer")
        )

        status_str = "MATCH [PASS]" if is_concordant else "MISMATCH [FAIL]"
        if is_concordant:
            passed += 1

        print(
            f"{v['id']:<4} | {v['name']:<30} | {v['expected_tier']:<22} | {actual_tier!s:<22} | {status_str}"
        )

    print("-" * 90)
    print(
        f"SCRIPTED CONCORDANCE: {passed}/{len(VIGNETTES)} ({passed/len(VIGNETTES)*100:.1f}%)"
    )
    print("INTERPRETATION: plumbing check only. The answers encode the expected label,")
    print(
        "so this cannot evidence diagnostic accuracy and must not be reported as such."
    )
    if passed != len(VIGNETTES):
        print(
            "NOTE: a MISMATCH above means the engine did not reproduce a scripted label —"
        )
        print("      investigate the engine, not the router.")
    print("=" * 90 + "\n")


if __name__ == "__main__":
    audit_vignettes()
