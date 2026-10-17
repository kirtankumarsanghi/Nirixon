"""Provisional reference ranges configuration for exploratory touch micro-tasks.

APPLICABILITY:
- Module A, children 24 months and up (>= 24.0 months).
- Tasks:
  1. Target Tap (reaction time ms, spatial error px)
  2. Path Tracing (path accuracy %, jitter px, completion time ms)
  3. Drag to Goal (reaction time ms, accuracy %, jitter px)

IMPORTANT CLINICAL AND ETHICAL NOTICE:
- STATUS: PROVISIONAL / EXPLORATORY.
- These normative ranges are exploratory engineering baselines, NOT diagnostic criteria.
- Telemetry numbers are NEVER fed into the XGBoost screening model or safety floor rules.
- They appear exclusively in the clinician sandbox view as 'Exploratory, not used in the result'.
"""

from __future__ import annotations

from typing import Any

PROVISIONAL_TOUCH_CONFIG: dict[str, Any] = {
    "status": "provisional",
    "disclaimer": (
        "Exploratory research telemetry for children 24 months and older. "
        "Not clinically validated. Not used for screening triage or safety rules."
    ),
    "min_age_months": 24.0,
    "version": "2026.1-provisional",
    "brackets": {
        "24-36m": {
            "label": "24 to 36 months",
            "tap": {
                "reaction_time_ms": {"min": 400, "max": 1200, "typical_median": 750},
                "spatial_error_px": {"typical_median": 15.0, "max_acceptable": 35.0},
            },
            "trace": {
                "accuracy_pct": {"typical_median": 72.0, "min_expected": 50.0},
                "jitter_px": {"typical_median": 12.0, "max_acceptable": 25.0},
                "completion_time_ms": {"typical_median": 3500, "max": 8000},
            },
            "drag": {
                "reaction_time_ms": {"min": 350, "max": 1100, "typical_median": 650},
                "accuracy_pct": {"typical_median": 78.0, "min_expected": 55.0},
                "jitter_px": {"typical_median": 14.0, "max_acceptable": 28.0},
            },
        },
        "36-48m": {
            "label": "36 to 48 months",
            "tap": {
                "reaction_time_ms": {"min": 300, "max": 950, "typical_median": 580},
                "spatial_error_px": {"typical_median": 10.0, "max_acceptable": 25.0},
            },
            "trace": {
                "accuracy_pct": {"typical_median": 82.0, "min_expected": 65.0},
                "jitter_px": {"typical_median": 8.5, "max_acceptable": 18.0},
                "completion_time_ms": {"typical_median": 2800, "max": 6500},
            },
            "drag": {
                "reaction_time_ms": {"min": 280, "max": 900, "typical_median": 500},
                "accuracy_pct": {"typical_median": 85.0, "min_expected": 68.0},
                "jitter_px": {"typical_median": 10.0, "max_acceptable": 20.0},
            },
        },
        "48-60m": {
            "label": "48 to 60 months",
            "tap": {
                "reaction_time_ms": {"min": 250, "max": 800, "typical_median": 450},
                "spatial_error_px": {"typical_median": 8.0, "max_acceptable": 18.0},
            },
            "trace": {
                "accuracy_pct": {"typical_median": 90.0, "min_expected": 75.0},
                "jitter_px": {"typical_median": 5.0, "max_acceptable": 12.0},
                "completion_time_ms": {"typical_median": 2200, "max": 5000},
            },
            "drag": {
                "reaction_time_ms": {"min": 220, "max": 750, "typical_median": 400},
                "accuracy_pct": {"typical_median": 92.0, "min_expected": 78.0},
                "jitter_px": {"typical_median": 6.5, "max_acceptable": 15.0},
            },
        },
    },
}


def get_touch_bracket_key(age_months: float) -> str:
    if age_months < 36.0:
        return "24-36m"
    if age_months < 48.0:
        return "36-48m"
    return "48-60m"


def compare_touch_metric_to_reference(
    task_type: str,
    metric_name: str,
    value: float,
    age_months: float,
) -> dict[str, Any]:
    """Compare an observed scalar telemetry metric against provisional ranges."""
    b_key = get_touch_bracket_key(age_months)
    ranges = PROVISIONAL_TOUCH_CONFIG["brackets"].get(b_key, {}).get(task_type, {}).get(metric_name, {})
    if not ranges:
        return {"status": "unconfigured", "reference": None, "bracket": b_key}

    median = ranges.get("typical_median")
    is_typical = True
    if "min" in ranges and value < ranges["min"]:
        is_typical = False
    if "max" in ranges and value > ranges["max"]:
        is_typical = False
    if "min_expected" in ranges and value < ranges["min_expected"]:
        is_typical = False
    if "max_acceptable" in ranges and value > ranges["max_acceptable"]:
        is_typical = False

    return {
        "status": "typical" if is_typical else "divergent_from_median",
        "observed_value": value,
        "typical_median": median,
        "reference_range": ranges,
        "bracket": b_key,
        "provisional": True,
    }
