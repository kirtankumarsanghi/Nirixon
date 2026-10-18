"""
Core growth trajectory and developmental velocity engine.

Defines the Plateau Rule:
A developmental plateau is flagged when the developmental-age gain is less than
0.5 x chronological-age gain across two consecutive visits.

Zero Personal Data Architecture:
Operates strictly on numerical ages, pseudonymous IDs, visit dates, domain scores,
and triage tiers.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def check_consecutive_plateau(
    prev_chronological_age: float,
    prev_developmental_age: float,
    curr_chronological_age: float,
    curr_developmental_age: float,
) -> tuple[bool, float | None]:
    """
    Check the plateau rule across two consecutive visits.

    A plateau is flagged when developmental-age gain is strictly less than 0.5 x
    chronological-age gain across two consecutive visits.

    Parameters
    ----------
    prev_chronological_age : float
        Chronological age at earlier visit (in months).
    prev_developmental_age : float
        Developmental age at earlier visit (in months).
    curr_chronological_age : float
        Chronological age at later visit (in months).
    curr_developmental_age : float
        Developmental age at later visit (in months).

    Returns
    -------
    tuple[bool, float | None]
        (is_plateau, gain_ratio)
        - is_plateau: True if flagged, False otherwise.
        - gain_ratio: delta_dev / delta_chron, or None if delta_chron <= 0.
    """
    delta_chron = float(curr_chronological_age) - float(prev_chronological_age)
    delta_dev = float(curr_developmental_age) - float(prev_developmental_age)

    # Edge case: equal-age or negative chronological progression
    if delta_chron <= 0:
        return False, None

    gain_ratio = delta_dev / delta_chron
    # Flag when developmental-age gain is strictly less than 0.5 * chronological-age gain
    is_plateau = delta_dev < (0.5 * delta_chron)

    return is_plateau, round(gain_ratio, 4)


def compute_developmental_age(
    chronological_age_months: float,
    tier: str,
    domain_scores: dict[str, Any] | None = None,
) -> float:
    """
    Compute an estimated developmental age in months from chronological age,
    triage tier, and domain performance when explicit developmental age is omitted.

    - Typical: ~1.00 x chronological age
    - Monitor: ~0.85 x chronological age
    - Refer:   ~0.70 x chronological age
    """
    chron = float(chronological_age_months)
    tier_clean = (tier or "Typical").strip().capitalize()

    if tier_clean == "Refer":
        factor = 0.70
    elif tier_clean == "Monitor":
        factor = 0.85
    else:
        factor = 1.00

    if domain_scores and isinstance(domain_scores, dict) and len(domain_scores) > 0:
        refer_count = sum(
            1 for v in domain_scores.values() if str(v).lower() in ("refer", "worth_discussing", "2")
        )
        monitor_count = sum(
            1 for v in domain_scores.values() if str(v).lower() in ("monitor", "keep_an_eye", "1")
        )
        total = len(domain_scores)
        deficit = (refer_count * 0.12 + monitor_count * 0.04) / total
        factor = max(0.40, min(1.15, factor - deficit))

    return round(chron * factor, 1)


def _get_val(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def evaluate_growth_trajectory(visits: list[Any]) -> dict[str, Any]:
    """
    Evaluate a sequence of visits for a child to compute velocity, trajectory,
    and detect whether any consecutive visits trigger the plateau rule.
    """
    if not visits:
        return {
            "is_plateau_detected": False,
            "total_visits": 0,
            "intervals": [],
            "plateau_summary": "No visits recorded yet.",
            "trajectory": [],
        }

    # Sort visits by visit_date and chronological_age_months
    def sort_key(v: Any):
        v_date = _get_val(v, "visit_date")
        if isinstance(v_date, str):
            try:
                v_date = datetime.fromisoformat(v_date)
            except Exception:
                v_date = datetime.min.replace(tzinfo=UTC)
        elif not isinstance(v_date, datetime):
            v_date = datetime.min.replace(tzinfo=UTC)

        chron = float(_get_val(v, "chronological_age_months", 0.0))
        return (v_date, chron)

    sorted_visits = sorted(visits, key=sort_key)

    trajectory = [
        {
            "chronological_age": float(_get_val(v, "chronological_age_months", 0.0)),
            "developmental_age": float(_get_val(v, "developmental_age_months", 0.0)),
            "visit_date": str(_get_val(v, "visit_date", "")),
            "tier": str(_get_val(v, "tier", "Typical")),
        }
        for v in sorted_visits
    ]

    # One visit edge case
    if len(sorted_visits) < 2:
        return {
            "is_plateau_detected": False,
            "total_visits": len(sorted_visits),
            "intervals": [],
            "plateau_summary": (
                "Only one visit recorded. At least two visits are required to calculate "
                "developmental velocity and evaluate the plateau rule."
            ),
            "trajectory": trajectory,
        }

    intervals = []
    any_plateau = False

    for i in range(1, len(sorted_visits)):
        prev = sorted_visits[i - 1]
        curr = sorted_visits[i]

        prev_chron = float(_get_val(prev, "chronological_age_months", 0.0))
        prev_dev = float(_get_val(prev, "developmental_age_months", 0.0))
        curr_chron = float(_get_val(curr, "chronological_age_months", 0.0))
        curr_dev = float(_get_val(curr, "developmental_age_months", 0.0))

        is_plateau, ratio = check_consecutive_plateau(
            prev_chron, prev_dev, curr_chron, curr_dev
        )
        delta_chron = curr_chron - prev_chron
        delta_dev = curr_dev - prev_dev

        if is_plateau:
            any_plateau = True
            msg = (
                f"Plateau flagged: gained {delta_dev:.1f}m developmental age over "
                f"{delta_chron:.1f}m chronological age (velocity {ratio:.2f}x, below 0.5x expected rate)."
            )
        elif delta_chron <= 0:
            msg = "Equal or inverted chronological age; developmental velocity cannot be computed."
        else:
            msg = (
                f"Normal developmental pace: gained {delta_dev:.1f}m developmental age over "
                f"{delta_chron:.1f}m chronological age (velocity {ratio:.2f}x expected rate)."
            )

        intervals.append(
            {
                "visit_index": i,
                "prev_chronological_age": prev_chron,
                "curr_chronological_age": curr_chron,
                "chronological_gain": round(delta_chron, 2),
                "developmental_gain": round(delta_dev, 2),
                "gain_ratio": ratio,
                "is_plateau": is_plateau,
                "message": msg,
            }
        )

    summary = (
        "Developmental plateau flagged: progress rate dropped below 0.5x expected pace "
        "across consecutive check-ins. Clinical assessment or early intervention review recommended."
        if any_plateau
        else "Developmental pace is within normal velocity (>= 0.5x expected gain across visits)."
    )

    return {
        "is_plateau_detected": any_plateau,
        "total_visits": len(sorted_visits),
        "intervals": intervals,
        "plateau_summary": summary,
        "trajectory": trajectory,
    }
