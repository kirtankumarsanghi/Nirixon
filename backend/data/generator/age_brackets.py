"""
ASQ-3-Style Age Bracket Definitions
====================================

Replaces the previous implicit 3-month floor-binning scheme with 17 named,
explicit brackets that match the ASQ-3 screening intervals.

DESIGN RATIONALE (preserve in all downstream comments):
  - Brackets are DENSER in the first year (2, 4, 6, 9, 12 months) because
    developmental change is fastest and most month-sensitive in the first
    12 months. A 2-month-old and a 4-month-old differ enormously on motor
    and communication milestones; grouping them into a single "0-6 month"
    bucket would smear signal that the model needs to see separately.
  - The 12–24 month range (15, 18, 21, 24 months) captures the language
    explosion and walking refinement period, where month-to-month change
    is still clinically meaningful.
  - 24–36 months (27, 30, 33, 36 months) — development is still fast but
    slightly more stable; 3-month granularity is appropriate.
  - 36–60 months (42, 48, 54, 60 months) — preschool-age development
    paces out; 6-month granularity is sufficient and avoids thin bins at
    a population scale where 5-year-olds are less common in screening.

This module is the SINGLE SOURCE OF TRUTH for all bracket logic.
Every module that needs bracket assignment imports from here — nothing
derives its own binning.

CLINICAL REVIEW DEPENDENCY:
  Item-to-bracket assignments in item_bank.py are engineering estimates
  for items whose `typical_age_months` falls near a bracket boundary.
  Items tagged `bracket_assignment_unconfirmed=True` MUST be reviewed
  by a licensed pediatrician or child-development specialist before the
  system is used in any clinical or near-clinical capacity (Stages 6–7:
  Live Elicitation and Touch Micro-Tasks depend on correct age placement).
  This is a named external dependency, not an engineering decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class AgeBracket:
    """
    Represents one of the 17 ASQ-3-style age brackets.

    min_months: inclusive lower bound (months)
    max_months: exclusive upper bound (months) — a child aged exactly
                `max_months` belongs to the NEXT bracket, except for
                the final bracket where it is inclusive.
    label:      short human-readable name used in CSV columns, DB rows,
                API responses, and report headings.
    is_final:   True only for the 60-month bracket — changes boundary
                semantics to inclusive at the upper end.
    """

    label: str
    min_months: float
    max_months: float  # exclusive, except when is_final=True
    is_final: bool = False


# ---------------------------------------------------------------------------
# The 17 brackets in order. Do NOT reorder — ordinal encoding in the ML
# pipeline depends on list position index (0 = youngest, 16 = oldest).
# ---------------------------------------------------------------------------
BRACKETS: list[AgeBracket] = [
    # --- 0–12 months: 5 brackets (densest — fastest developmental change) ---
    AgeBracket("2mo",  min_months=0,    max_months=3),
    AgeBracket("4mo",  min_months=3,    max_months=5),
    AgeBracket("6mo",  min_months=5,    max_months=7.5),
    AgeBracket("9mo",  min_months=7.5,  max_months=10.5),
    AgeBracket("12mo", min_months=10.5, max_months=13.5),
    # --- 12–24 months: 4 brackets (language explosion + walking refinement) ---
    AgeBracket("15mo", min_months=13.5, max_months=16.5),
    AgeBracket("18mo", min_months=16.5, max_months=19.5),
    AgeBracket("21mo", min_months=19.5, max_months=22.5),
    AgeBracket("24mo", min_months=22.5, max_months=25.5),
    # --- 24–36 months: 4 brackets (fast but more stable) ---
    AgeBracket("27mo", min_months=25.5, max_months=28.5),
    AgeBracket("30mo", min_months=28.5, max_months=31.5),
    AgeBracket("33mo", min_months=31.5, max_months=34.5),
    AgeBracket("36mo", min_months=34.5, max_months=39),
    # --- 36–60 months: 4 brackets (preschool, development paces out) ---
    AgeBracket("42mo", min_months=39,   max_months=45),
    AgeBracket("48mo", min_months=45,   max_months=51),
    AgeBracket("54mo", min_months=51,   max_months=57),
    AgeBracket("60mo", min_months=57,   max_months=60, is_final=True),
]

assert len(BRACKETS) == 17, f"Expected 17 brackets, got {len(BRACKETS)}"

# Ordered list of bracket labels — index == ordinal encoding used by the ML model.
BRACKET_LABELS: list[str] = [b.label for b in BRACKETS]

# Lookup by label for O(1) access
BRACKET_BY_LABEL: dict[str, AgeBracket] = {b.label: b for b in BRACKETS}

# Ordinal integer for each label — this is what goes into the feature matrix.
BRACKET_ORDINAL: dict[str, int] = {b.label: i for i, b in enumerate(BRACKETS)}


# ---------------------------------------------------------------------------
# Primary mapping function — used by every downstream module
# ---------------------------------------------------------------------------


def map_to_bracket(corrected_age_months: float) -> AgeBracket:
    """
    Maps a corrected age in months (float) to the appropriate AgeBracket.

    Boundary semantics:
      - Each bracket is [min_months, max_months) — a child at exactly the
        lower bound belongs to THAT bracket, not the previous one.
      - A child at exactly 12.0 months maps to the "12mo" bracket (min=10.5),
        NOT to the "9mo" bracket.
      - A child at exactly 60.0 months maps to the "60mo" bracket (is_final).

    Out-of-range inputs:
      - age < 0: returns the youngest bracket (2mo) and logs a warning.
        This should never happen in production — corrected_age_months is
        constrained at the API layer — but a silent crash here would be
        worse than a conservative fallback.
      - age > 60: returns the oldest bracket (60mo). Instrument is validated
        only to 60 months; values beyond this are clamped, not errored, so
        existing sessions can still complete.

    Returns the matching AgeBracket.
    """
    if corrected_age_months < 0:
        # Should not occur after API validation; return youngest bracket defensively
        return BRACKETS[0]

    for bracket in BRACKETS:
        if bracket.is_final:
            # Final bracket is inclusive at both ends
            if corrected_age_months >= bracket.min_months:
                return bracket
        else:
            if bracket.min_months <= corrected_age_months < bracket.max_months:
                return bracket

    # age > 60 — clamp to final bracket
    return BRACKETS[-1]


def map_to_bracket_label(corrected_age_months: float) -> str:
    """Convenience wrapper returning the label string."""
    return map_to_bracket(corrected_age_months).label


def map_to_bracket_ordinal(corrected_age_months: float) -> int:
    """
    Returns the integer ordinal (0–16) for the bracket, suitable for
    direct use as a model feature. Ordinal 0 = youngest (2mo),
    ordinal 16 = oldest (60mo).
    """
    label = map_to_bracket_label(corrected_age_months)
    return BRACKET_ORDINAL[label]


def adjacent_brackets(bracket: AgeBracket) -> list[AgeBracket]:
    """
    Returns the immediately adjacent brackets (up to 2: one younger, one older).
    Used by the imputation fallback when a bracket has too few samples to
    produce stable medians — the fallback borrows from neighbors.
    """
    idx = BRACKETS.index(bracket)
    neighbors: list[AgeBracket] = []
    if idx > 0:
        neighbors.append(BRACKETS[idx - 1])
    if idx < len(BRACKETS) - 1:
        neighbors.append(BRACKETS[idx + 1])
    return neighbors


# ---------------------------------------------------------------------------
# Validation: self-check the bracket definitions are consistent
# ---------------------------------------------------------------------------

def _validate_brackets() -> None:
    """Runs at import time. Raises AssertionError if bracket definitions are broken."""
    prev_max = 0.0
    for i, b in enumerate(BRACKETS):
        assert b.min_months == prev_max or i == 0, (
            f"Bracket {b.label}: min_months ({b.min_months}) does not align "
            f"with previous bracket's max_months ({prev_max}). Brackets must be contiguous."
        )
        assert b.max_months > b.min_months, (
            f"Bracket {b.label}: max_months ({b.max_months}) <= min_months ({b.min_months})"
        )
        prev_max = b.max_months

    # Spot-check canonical boundary ages
    assert map_to_bracket_label(0.0)   == "2mo",  "age=0 should map to 2mo bracket"
    assert map_to_bracket_label(2.0)   == "2mo",  "age=2 should map to 2mo bracket"
    assert map_to_bracket_label(3.0)   == "4mo",  "age=3 should map to 4mo bracket"
    assert map_to_bracket_label(10.5)  == "12mo", "age=10.5 should map to 12mo bracket"
    assert map_to_bracket_label(12.0)  == "12mo", "age=12 should map to 12mo bracket (NOT 9mo)"
    assert map_to_bracket_label(13.5)  == "15mo", "age=13.5 should map to 15mo bracket"
    assert map_to_bracket_label(22.5)  == "24mo", "age=22.5 should map to 24mo bracket"
    assert map_to_bracket_label(24.0)  == "24mo", "age=24 should map to 24mo bracket (NOT 27mo)"
    assert map_to_bracket_label(25.5)  == "27mo", "age=25.5 should map to 27mo bracket"
    assert map_to_bracket_label(34.5)  == "36mo", "age=34.5 should map to 36mo bracket"
    assert map_to_bracket_label(36.0)  == "36mo", "age=36 should map to 36mo bracket (NOT 42mo)"
    assert map_to_bracket_label(39.0)  == "42mo", "age=39 should map to 42mo bracket"
    assert map_to_bracket_label(57.0)  == "60mo", "age=57 should map to 60mo bracket"
    assert map_to_bracket_label(60.0)  == "60mo", "age=60 should map to 60mo bracket"
    assert map_to_bracket_label(65.0)  == "60mo", "age=65 (out of range) should clamp to 60mo"
    assert map_to_bracket_label(-1.0)  == "2mo",  "age=-1 (invalid) should clamp to 2mo"

    # Ordinal encoding must be 0-indexed and contiguous
    for i, b in enumerate(BRACKETS):
        assert BRACKET_ORDINAL[b.label] == i, (
            f"BRACKET_ORDINAL[{b.label}] == {BRACKET_ORDINAL[b.label]}, expected {i}"
        )


_validate_brackets()  # runs at import — hard fail if bracket definitions are broken
