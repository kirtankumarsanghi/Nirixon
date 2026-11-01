"""Edinburgh Postnatal Depression Scale (EPDS) — caregiver wellbeing screening.

Kept deliberately separate from Module A/B child scoring. Wording and scoring
are pending clinical review; item 10 (self-harm) always triggers the urgent
helpline path regardless of the total.

Scoring: 10 items, each 0–3. Items 1, 2 and 4 are reverse-scored per the EPDS
key. Total range 0–30. Common thresholds: >=10 possible depression (monitor),
>=13 probable depression (refer). Screening only, never a diagnosis.
"""

from __future__ import annotations

from typing import Any

REVIEW_STATUS = "pending"

# Positive items are listed in symptom order: 0 = no difficulty, 3 = most.
_OPTIONS_POSITIVE = [
    (0, "As much as I always could"),
    (1, "Not quite so much now"),
    (2, "Definitely not so much now"),
    (3, "Not at all"),
]
_OPTIONS_NEGATIVE = [
    (0, "No, not at all"),
    (1, "Hardly ever"),
    (2, "Yes, sometimes"),
    (3, "Yes, very often"),
]
_OPTIONS_SELF_HARM = [
    (0, "Never"),
    (1, "Hardly ever"),
    (2, "Sometimes"),
    (3, "Yes, quite often"),
]

# (item_id, number, text, reverse_scored, options)
_QUESTIONS: list[tuple[str, int, str, bool, list[tuple[int, str]]]] = [
    (
        "epds_1",
        1,
        "I have been able to laugh and see the funny side of things.",
        False,
        _OPTIONS_POSITIVE,
    ),
    (
        "epds_2",
        2,
        "I have looked forward with enjoyment to things.",
        False,
        _OPTIONS_POSITIVE,
    ),
    (
        "epds_3",
        3,
        "I have blamed myself unnecessarily when things went wrong.",
        False,
        _OPTIONS_NEGATIVE,
    ),
    (
        "epds_4",
        4,
        "I have been anxious or worried for no very good reason.",
        False,
        _OPTIONS_NEGATIVE,
    ),
    (
        "epds_5",
        5,
        "I have felt scared or panicky for no very good reason.",
        False,
        _OPTIONS_NEGATIVE,
    ),
    ("epds_6", 6, "Things have been getting on top of me.", False, _OPTIONS_NEGATIVE),
    (
        "epds_7",
        7,
        "I have been so unhappy that I have had difficulty sleeping.",
        False,
        _OPTIONS_NEGATIVE,
    ),
    ("epds_8", 8, "I have felt sad or miserable.", False, _OPTIONS_NEGATIVE),
    (
        "epds_9",
        9,
        "I have been so unhappy that I have been crying.",
        False,
        _OPTIONS_NEGATIVE,
    ),
    (
        "epds_10",
        10,
        "The thought of harming myself has occurred to me.",
        False,
        _OPTIONS_SELF_HARM,
    ),
]

INSTRUCTIONS = (
    "Over the past 7 days, please choose the answer that comes closest to how you "
    "have felt. There are no right or wrong answers."
)

DISCLAIMER = (
    "This is a wellbeing screening, not a diagnosis. If you are struggling, please "
    "speak to your ASHA/ANM worker or a clinician. If you are in immediate danger, call 112."
)


def questions_payload() -> dict[str, Any]:
    return {
        "instrument": "EPDS",
        "instructions": INSTRUCTIONS,
        "review_status": REVIEW_STATUS,
        "disclaimer": DISCLAIMER,
        "questions": [
            {
                "item_id": item_id,
                "number": number,
                "text": text,
                "reverse_scored": reverse,
                "options": [
                    {"value": value, "label": label} for value, label in options
                ],
                "review_status": REVIEW_STATUS,
            }
            for item_id, number, text, reverse, options in _QUESTIONS
        ],
    }


def score_epds(answers: dict[str, int]) -> dict[str, Any]:
    """Return total, classification, safety flag and plain-language guidance."""
    expected = {item_id for item_id, *_ in _QUESTIONS}
    missing = expected - set(answers)
    if missing:
        raise ValueError(f"missing EPDS answers: {', '.join(sorted(missing))}")
    unexpected = set(answers) - expected
    if unexpected:
        raise ValueError(f"unknown EPDS answers: {', '.join(sorted(unexpected))}")
    for item_id, value in answers.items():
        if item_id in expected and (
            not isinstance(value, int) or value < 0 or value > 3
        ):
            raise ValueError(f"{item_id} must be an integer between 0 and 3")

    reverse = {item_id for item_id, _, _, rev, _ in _QUESTIONS if rev}
    total = sum(
        (3 - value) if item_id in reverse else value
        for item_id, value in answers.items()
    )
    safety = answers.get("epds_10", 0) > 0

    if safety or total >= 13:
        classification = "Refer"
    elif total >= 10:
        classification = "Monitor"
    else:
        classification = "Typical"

    if safety:
        interpretation = (
            "Some answers suggest you may be having thoughts of self-harm. Please "
            "reach out to a person now — you deserve support."
        )
    elif classification == "Refer":
        interpretation = (
            "Your answers suggest a high level of distress. A conversation with a "
            "health worker or clinician is strongly recommended."
        )
    elif classification == "Monitor":
        interpretation = (
            "Your answers suggest some distress. It is worth talking to someone and "
            "checking in again in a few weeks."
        )
    else:
        interpretation = (
            "Your answers do not suggest significant distress right now. Keep looking "
            "after yourself and reach out if things change."
        )

    return {
        "total_score": total,
        "classification": classification,
        "safety_flag": safety,
        "interpretation": interpretation,
        "recommendations": _recommendations(classification, safety),
        "helplines": _helplines(),
    }


def _recommendations(classification: str, safety: bool) -> list[str]:
    if safety:
        return [
            "Call Tele-MANAS 14416 or Kiran 1800-599-0019 now.",
            "Tell someone you trust how you are feeling.",
            "If you are in immediate danger, call 112.",
            "Ask your ASHA/ANM worker for a same-day appointment.",
        ]
    if classification == "Refer":
        return [
            "Book a visit with your ASHA/ANM worker, a counsellor or a clinician.",
            "Share this screening summary with them.",
            "Ask about local maternal mental health support.",
        ]
    if classification == "Monitor":
        return [
            "Talk to someone you trust about how you are feeling.",
            "Try to protect sleep, food and a short daily break.",
            "Check in again in 2–4 weeks.",
        ]
    return [
        "Keep looking after your sleep, food and support network.",
        "Check in again if things change or before the next visit.",
    ]


def _helplines() -> list[dict[str, str]]:
    return [
        {"name": "Tele-MANAS", "number": "14416", "available": "24×7, free"},
        {
            "name": "Kiran Mental Health Helpline",
            "number": "1800-599-0019",
            "available": "24×7, free",
        },
        {"name": "CHILDLINE", "number": "1098", "available": "24×7, free"},
        {"name": "Emergency", "number": "112", "available": "24×7"},
    ]
