"""Module B regression + safety tests (engine / router unit tests).

Ported from nirixon_module_b/tests/test_regressions.py and adapted to
import from the backend package (app.core.module_b.*).

Run: pytest tests/test_regressions.py -v  (from backend/)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.module_b.api_map import to_api_domain
from app.core.module_b.engine_b import (
    HEARING_CONCEPTS,
    VISION_CONCEPTS,
    Engine,
)
from app.core.module_b.router_b import DomainRouter
from app.core.module_b.service import module_b_service

module_b_service.load()
router: DomainRouter = module_b_service.engine.router
eng: Engine = module_b_service.engine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def run(text: str, age: int, answer, seed: int = 1, cap: int = 40):
    s = eng.start(text, age, seed=seed)
    qs = []
    for _ in range(cap):
        a = eng.next_action(s)
        if a["type"] == "question":
            qs.append(a)
            eng.answer(s, a["item_id"], answer(a), a["track"])
        elif a["type"] in ("safety_notice", "recall_help"):
            if a["type"] == "recall_help":
                eng.apply_recall_choice(s, ["attention_work"])
        else:
            break
    return s, qs, eng.result(s)


def fine(a):
    return "No" if a["response_type"] == "yesno" else 1


def high_att(a):
    if a["track"] == "attention_work":
        return 5 if a["response_type"] == "likert5" else "Yes"
    return "No" if a["response_type"] == "yesno" else 1


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_safety_flagged_by_router():
    s, _, _ = run(
        "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana", 9, fine
    )
    assert s.safety, "safety flag not set for safety text"


def test_safety_summary_leads_with_helpline():
    _, _, res = run(
        "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana", 9, fine
    )
    assert "1800-599-0019" in res["summary"], (
        f"helpline missing from summary: {res['summary'][:120]}"
    )


def test_safety_summary_no_reassuring_phrase():
    _, _, res = run(
        "mera bachcha kehta hai ki main marna chahta hoon, school nahi jaana", 9, fine
    )
    assert "Nothing in the answers suggests" not in res["summary"]


def test_attention_refer_on_high_answers():
    _, _, res = run(
        "He cannot sit through homework and forgets everything", 9, high_att
    )
    d = res["domains"]["attention_work"]
    assert d["state"] == "Refer", f"attention not Refer: {d}"


def test_refer_threshold():
    """Refer requires >= 4 answers (or >= 3 strongly endorsed)."""
    _, _, res = run(
        "He cannot sit through homework and forgets everything", 9, high_att
    )
    d = res["domains"]["attention_work"]
    assert d["n"] >= 4 or d.get("endorsed", 0) >= 3, f"Refer threshold: {d}"


def test_api_domain_map_attention():
    assert to_api_domain("attention_work") == "attention"


def test_api_domain_map_emotion():
    assert to_api_domain("emotion_school") == "emotion_conduct"


def test_vision_ruleout_first():
    _s, qs, _ = run(
        "ye bachcha board pe likha dekhne ke liye aage aa jata hai aur aankhein ragadta rehta hai",
        9,
        lambda a: "No" if a["response_type"] == "yesno" else 1,
    )
    vision_qs = [q for q in qs if q["track"] == "vision_hearing"]
    assert vision_qs, "no vision_hearing questions found"
    concept = eng.bank.row(vision_qs[0]["item_id"])["concept_id"]
    assert concept in VISION_CONCEPTS, (
        f"vision text -> first ruleout concept: {concept}"
    )


def test_hearing_ruleout_first():
    _s, qs, _ = run(
        "he keeps saying what? and does not respond when I call him from behind, turns the tv volume up",
        9,
        lambda a: "No" if a["response_type"] == "yesno" else 1,
    )
    hearing_qs = [q for q in qs if q["track"] == "vision_hearing"]
    assert hearing_qs, "no vision_hearing questions found"
    concept = eng.bank.row(hearing_qs[0]["item_id"])["concept_id"]
    assert concept in HEARING_CONCEPTS, (
        f"hearing text -> first ruleout concept: {concept}"
    )


POS = [
    "he says he wants to die",
    "she told me she wants to kill herself",
    "my son keeps saying he wishes he was dead",
    "she has been cutting her arms",
    "he hurts himself when he is upset, hits his head on the wall on purpose",
    "my daughter said nobody would miss her if she was gone",
    "uncle touches her in a way she doesn't like and she is scared to go",
    "teacher beats him badly and he has marks on his back",
    "mera beta kehta hai main mar jaunga to accha hoga",
    "meri beti apne aap ko nuksan pahunchati hai, haath kaat leti hai",
    "bachcha bolta hai mujhe jeena nahi hai",
    "वह कहता है कि मैं मर जाना चाहता हूँ",
    "बच्ची खुद को चोट पहुँचाती है",
    "bachche ko ghar mein koi maarta hai aur woh darta hai",
]
NEG = [
    "he is dying to go to the cricket match",
    "she is scared of the dark and the dead leaves",
    "he cannot sit still in class",
    "reads slowly and mixes up b and d",
    "mera bachcha padhai mein kamzor hai",
    "uski likhai bahut kharab hai",
    "beats his friends at chess every time",
    "maths ke sawal ghalat ho jaate hain",
]


@pytest.mark.parametrize("text", POS)
def test_safety_recall_positive(text):
    result = router.route(text)
    assert result.safety, f"safety MISSED: {text}"


@pytest.mark.parametrize("text", NEG)
def test_no_false_safety_alarms(text):
    result = router.route(text)
    assert not result.safety, f"FALSE ALARM: {text}"


def test_first_5_questions_differ_by_note():
    """First 5 questions differ between attention and reading note (questions follow text)."""

    def first5(text: str):
        s = eng.start(text, 9, seed=3)
        out = []
        for _ in range(5):
            a = eng.next_action(s)
            if a["type"] != "question":
                break
            out.append(a["text"] if "text" in a else a.get("item_id"))
            eng.answer(s, a["item_id"], 1, a["track"])
        return out

    q_att = first5(
        "Mera beta homework ke time ek jagah baith hi nahi pata aur notebook bhool jata hai"
    )
    q_read = first5(
        "She reads very slowly, mixes up b and d and cries when asked to read aloud"
    )
    assert q_att != q_read, (
        "first-5 questions must differ between attention and reading notes"
    )
    assert len(q_att) == 5 and len(q_read) == 5, (
        f"expected 5 questions each, got {len(q_att)}, {len(q_read)}"
    )
