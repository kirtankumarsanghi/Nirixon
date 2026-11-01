"""Deterministic MUAC / weight-for-age screening flags."""

from __future__ import annotations

from typing import Any

# WHO weight-for-age reference approximation: (age_months, median_kg, sd_kg).
# Selected months only; linear interpolation keeps the table auditable.
_WEIGHT_FOR_AGE: dict[str, list[tuple[float, float, float]]] = {
    "male": [
        (0, 3.3, 0.5),
        (3, 6.4, 0.8),
        (6, 7.9, 0.9),
        (9, 8.9, 1.0),
        (12, 9.6, 1.1),
        (18, 10.9, 1.2),
        (24, 12.2, 1.4),
        (36, 14.3, 1.6),
        (48, 16.3, 1.8),
        (60, 18.3, 2.0),
    ],
    "female": [
        (0, 3.2, 0.5),
        (3, 5.8, 0.7),
        (6, 7.3, 0.8),
        (9, 8.2, 1.0),
        (12, 8.9, 1.1),
        (18, 10.2, 1.2),
        (24, 11.5, 1.4),
        (36, 13.9, 1.7),
        (48, 16.1, 1.9),
        (60, 18.2, 2.1),
    ],
}


def _interpolate(
    points: list[tuple[float, float, float]], age: float
) -> tuple[float, float]:
    if age <= points[0][0]:
        return points[0][1], points[0][2]
    if age >= points[-1][0]:
        return points[-1][1], points[-1][2]
    for (a0, m0, s0), (a1, m1, s1) in zip(points, points[1:]):
        if a0 <= age <= a1:
            span = a1 - a0 or 1.0
            t = (age - a0) / span
            return m0 + (m1 - m0) * t, s0 + (s1 - s0) * t
    return points[-1][1], points[-1][2]


def weight_for_age_z(age_months: float, sex: str, weight_kg: float) -> float | None:
    if (
        sex not in _WEIGHT_FOR_AGE
        or age_months < 0
        or age_months > 60
        or weight_kg <= 0
    ):
        return None
    median, sd = _interpolate(_WEIGHT_FOR_AGE[sex], age_months)
    if sd <= 0:
        return None
    return round((weight_kg - median) / sd, 2)


def muac_status(age_months: float, muac_cm: float | None) -> str | None:
    if muac_cm is None or muac_cm <= 0:
        return None
    if age_months < 60:
        # WHO / ICDS 6–59 month cut-offs.
        if muac_cm < 11.5:
            return "severe_acute_malnutrition"
        if muac_cm < 12.5:
            return "moderate_acute_malnutrition"
        return "normal"
    # 5–19 year provisional cut-offs.
    if muac_cm < 12.5:
        return "severe_acute_malnutrition"
    if muac_cm < 13.5:
        return "moderate_acute_malnutrition"
    return "normal"


def evaluate_nutrition(
    *,
    age_months: float | None,
    sex: str | None,
    weight_kg: float | None,
    muac_cm: float | None,
    known_anemia: bool | None = None,
) -> dict[str, Any]:
    flags: list[dict[str, str]] = []
    severity = "none"

    waz = None
    if age_months is not None and sex and weight_kg is not None:
        waz = weight_for_age_z(age_months, sex, weight_kg)
        if waz is not None:
            if waz < -3:
                flags.append(
                    {
                        "code": "severe_underweight",
                        "label": "Severe underweight",
                        "severity": "refer",
                        "detail": f"Weight-for-age z = {waz} (below -3 SD).",
                    }
                )
                severity = "refer"
            elif waz < -2:
                flags.append(
                    {
                        "code": "underweight",
                        "label": "Underweight",
                        "severity": "refer",
                        "detail": f"Weight-for-age z = {waz} (below -2 SD).",
                    }
                )
                severity = "refer"

    status = muac_status(age_months or 0, muac_cm)
    if status == "severe_acute_malnutrition":
        flags.append(
            {
                "code": "severe_acute_malnutrition",
                "label": "Severe acute malnutrition",
                "severity": "refer",
                "detail": f"MUAC {muac_cm} cm is below the severe cut-off.",
            }
        )
        severity = "refer"
    elif status == "moderate_acute_malnutrition":
        flags.append(
            {
                "code": "moderate_acute_malnutrition",
                "label": "Moderate acute malnutrition",
                "severity": "monitor",
                "detail": f"MUAC {muac_cm} cm is below the normal cut-off.",
            }
        )
        if severity == "none":
            severity = "monitor"

    if known_anemia:
        flags.append(
            {
                "code": "anemia_risk",
                "label": "Reported anemia / iron deficiency",
                "severity": "monitor",
                "detail": "Caregiver reported anemia, low weight or a vitamin deficiency.",
            }
        )
        if severity == "none":
            severity = "monitor"

    return {
        "age_months": int(age_months) if age_months is not None else None,
        "sex": sex,
        "weight_kg": weight_kg,
        "muac_cm": muac_cm,
        "weight_for_age_z": waz,
        "muac_status": status,
        "anemia_risk": "reported" if known_anemia else None,
        "flags": flags,
        "severity": severity,
        "disclaimer": (
            "Nutrition flags are screening prompts for a health worker, not a diagnosis."
        ),
    }
