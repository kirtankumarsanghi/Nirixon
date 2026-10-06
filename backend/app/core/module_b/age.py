"""Age helpers for Module B (engine expects whole-number years 5–12)."""

from __future__ import annotations


def months_to_module_b_age(corrected_age_months: float) -> int:
    """
    Convert corrected age in months to the whole-number age (5–12) the
    Module B engine / question bank expect.

    Routing into Module B remains `corrected_age_months >= 60` elsewhere;
    this helper only converts once that decision is already made.
    """
    years = int(corrected_age_months // 12)
    return max(5, min(12, years))
