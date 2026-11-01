"""Anthropometric nutrition screening (MUAC and weight-for-age).

Screening prompts only, never a diagnosis. The reference table is a compact
WHO 2006 weight-for-age approximation at selected ages, linearly interpolated;
replace it with the full LMS table before clinical deployment.
"""

from .flags import evaluate_nutrition

__all__ = ["evaluate_nutrition"]
