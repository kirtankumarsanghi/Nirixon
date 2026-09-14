"""
Stage 1 — Synthetic Data Generator (orchestrator)

Produces:
  - screening_data_items.csv   (one row per synthetic child)
  - data_dictionary_items.md   (item metadata reference)

Run directly:  python generate_synthetic_data.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from age_brackets import BRACKET_LABELS, map_to_bracket_label, map_to_bracket_ordinal
from correlation_structure import (
    DOMAIN_INDEX,
    apply_regression_event,
    sample_domain_latents,
)
from item_bank import DOMAINS, ITEM_BANK
from label_derivation import (
    assign_labels_by_quantile,
    composite_risk_score,
    domain_percentiles,
)

RNG_SEED = 42

# Increased from 5,000 to 8,000 to ensure stable per-bracket sample sizes
# across all 17 ASQ-3 brackets. With 17 brackets spanning 0–60 months and
# a uniform age distribution, expected n per bracket ≈ 470 — enough for
# stable medians. Narrow brackets (2mo, 4mo, 6mo) span fewer months so will
# naturally attract slightly fewer children, but the adjacent-bracket
# borrowing fallback in imputation.py handles thin bins without requiring
# further data inflation.
N_CHILDREN = 8000

AGE_MIN, AGE_MAX = 0, 60  # months

# ---------------------------------------------------------------------------
# Bracket-specific item difficulty slopes
#
# DESIGN RATIONALE: developmental change is NOT uniform across age. The
# slope (months of age distance per SD of latent score) should reflect
# how fast children at each age are expected to change:
#
#   0–12 months (brackets 2mo, 4mo, 6mo, 9mo, 12mo):
#     slope = 3.0 months/SD — development is fastest and most
#     month-sensitive here. A child who is 3 months "late" on a 2mo
#     milestone is meaningfully behind; the item response should
#     reflect that sharpness.
#
#   12–24 months (brackets 15mo, 18mo, 21mo, 24mo):
#     slope = 4.5 months/SD — language explosion and walking refinement
#     still change quickly month-to-month, but slightly less sharply
#     than the first year.
#
#   24–36 months (brackets 27mo, 30mo, 33mo, 36mo):
#     slope = 6.0 months/SD — development is still meaningful but more
#     stable; the original 6.0 global slope was calibrated for this range.
#
#   36–60 months (brackets 42mo, 48mo, 54mo, 60mo):
#     slope = 8.0 months/SD — preschool-age development paces out;
#     month-to-month variance is less clinically sharp.
#
# These values are calibrated to produce realistic synthetic variation and
# MUST be reviewed alongside item_bank.py's typical_age_months values if
# item content changes. They are NOT empirically fitted to real data (this
# is synthetic data for a demo build); a real clinical tool would derive
# these from IRT calibration on collected screening data.
# ---------------------------------------------------------------------------
BRACKET_SLOPES: dict[str, float] = {
    # 0–12 months: fast development
    "2mo":  3.0,
    "4mo":  3.0,
    "6mo":  3.0,
    "9mo":  3.5,
    "12mo": 4.0,
    # 12–24 months: language + walking refinement
    "15mo": 4.5,
    "18mo": 4.5,
    "21mo": 5.0,
    "24mo": 5.0,
    # 24–36 months: still fast but more stable
    "27mo": 6.0,
    "30mo": 6.0,
    "33mo": 6.0,
    "36mo": 6.5,
    # 36–60 months: preschool, development paces out
    "42mo": 7.5,
    "48mo": 8.0,
    "54mo": 8.0,
    "60mo": 8.0,
}
assert set(BRACKET_SLOPES.keys()) == set(BRACKET_LABELS), (
    "BRACKET_SLOPES keys must match BRACKET_LABELS exactly — check age_brackets.py"
)

# Default slope for any age that falls outside a named bracket
# (should not occur in normal operation; this is a safety fallback)
_DEFAULT_SLOPE = 6.0

# Ordinal cut-points on the underlying continuous z-score, converting it
# into the 0 / 1 / 2 response scale (0 times / 1-2 times / 3+ times).
CUT_LOW, CUT_HIGH = -0.5, 0.6

MOTOR_CONFOUND_PENALTY_WEIGHT = 0.6


def sample_children(n: int, rng: np.random.Generator) -> pd.DataFrame:
    age_months = rng.uniform(AGE_MIN, AGE_MAX, size=n)

    # Prematurity: ~10% of children born premature (gestational age < 37 weeks).
    gestational_weeks = np.where(
        rng.random(n) < 0.10,
        rng.uniform(28, 36, size=n),
        rng.uniform(37, 41, size=n),
    )
    # Correction: subtract weeks-early, converted to months, from chronological age.
    weeks_early = np.clip(40 - gestational_weeks, 0, None)
    corrected_age_months = np.clip(age_months - weeks_early / 4.345, 0, None)

    family_history_flag = (rng.random(n) < 0.08).astype(int)
    multilingual_home_flag = (rng.random(n) < 0.40).astype(
        int
    )  # common in India; must NOT affect ability
    regression_flag = (rng.random(n) < 0.05).astype(int)

    # Derive bracket label and ordinal from corrected_age_months.
    # These become features in the ML model (age_bracket is ordinal-encoded)
    # and are also the grouping key for per-bracket analysis throughout the
    # evaluation pipeline.
    age_bracket = np.array([map_to_bracket_label(a) for a in corrected_age_months])
    age_bracket_ordinal = np.array([map_to_bracket_ordinal(a) for a in corrected_age_months])

    return pd.DataFrame(
        {
            "child_id": [f"C{i:06d}" for i in range(n)],
            "age_months": age_months,
            "corrected_age_months": corrected_age_months,
            "age_bracket": age_bracket,          # string label, e.g. "12mo"
            "age_bracket_ordinal": age_bracket_ordinal,  # integer 0–16 for ML
            "family_history_flag": family_history_flag,
            "multilingual_home_flag": multilingual_home_flag,
            "regression_flag": regression_flag,
        }
    )


def simulate_item_responses(
    children: pd.DataFrame,
    latents: np.ndarray,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """
    For every item, compute a continuous z-score per child from:
      (age relative to item's typical age) / bracket-specific-slope
      + (domain latent ability)
      - (motor-confound penalty, if applicable)
      + noise

    The bracket-specific slope replaces the old global AGE_SLOPE_MONTHS_PER_SD.
    Each child's age bracket determines the slope used when computing their
    item responses. Children in the 0–12 month range use a steeper slope
    (items "flip" faster with age) while preschool-age children use a shallower
    slope — reflecting the real developmental velocity at each life stage.
    """
    n = len(children)
    corrected_age = children["corrected_age_months"].to_numpy()
    age_brackets_col = children["age_bracket"].to_numpy()

    # Build a per-child slope vector from their age bracket
    child_slopes = np.array([
        BRACKET_SLOPES.get(b, _DEFAULT_SLOPE) for b in age_brackets_col
    ])

    # Precompute a combined "motor ability" latent (avg of gross+fine motor)
    # used for the motor_confound penalty, independent of an item's own domain.
    gm_idx = DOMAIN_INDEX["gross_motor"]
    fm_idx = DOMAIN_INDEX["fine_motor"]
    motor_ability = (latents[:, gm_idx] + latents[:, fm_idx]) / 2.0

    responses = {}
    for item in ITEM_BANK:
        domain_latent = latents[:, DOMAIN_INDEX[item.domain]]

        # Bracket-specific slope: each child's age bracket determines how
        # sharply the item difficulty curve rises near the typical age.
        age_effect = (corrected_age - item.typical_age_months) / child_slopes
        z = age_effect + domain_latent

        if item.motor_confound:
            # Extra penalty only kicks in when motor ability is below average,
            # so it doesn't uniformly shift everyone - just suppresses children
            # who are specifically behind on motor coordination.
            z = z - MOTOR_CONFOUND_PENALTY_WEIGHT * np.clip(-motor_ability, 0, None)

        z = z + rng.normal(0, 0.4, size=n)  # measurement noise

        response = np.where(z < CUT_LOW, 0, np.where(z < CUT_HIGH, 1, 2))
        responses[item.item_id] = response

    return pd.DataFrame(responses, index=children.index)


def compute_domain_scores(item_responses: pd.DataFrame) -> pd.DataFrame:
    """Mean item response per domain - DERIVED, for label computation and
    display only. The model itself trains on raw item columns, not these."""
    scores = {}
    for d in DOMAINS:
        cols = [item.item_id for item in ITEM_BANK if item.domain == d]
        scores[d] = item_responses[cols].mean(axis=1)
    return pd.DataFrame(scores, index=item_responses.index)


def write_data_dictionary(path: str) -> None:
    lines = [
        "# Data Dictionary — screening_data_items.csv\n",
        "## Child-level fields\n",
        "- `child_id`: synthetic identifier, no real-world meaning\n",
        "- `age_months`: chronological age at screening (0-60)\n",
        "- `corrected_age_months`: prematurity-adjusted age; used for ALL age-relative "
        + "logic (label derivation, imputation) instead of chronological age\n",
        "- `age_bracket`: ASQ-3-style bracket label (e.g. '12mo', '24mo') derived from "
        + "corrected_age_months. One of 17 values defined in age_brackets.py. "
        + "This is a MODEL FEATURE (ordinal-encoded as age_bracket_ordinal) as well "
        + "as the grouping key for per-bracket analysis.\n",
        "- `age_bracket_ordinal`: integer 0–16, ordinal encoding of age_bracket "
        + "(0 = youngest '2mo', 16 = oldest '60mo'). This is the feature column "
        + "that enters the ML model.\n",
        "- `family_history_flag`: 1 if family history of developmental delay\n",
        "- `multilingual_home_flag`: 1 if home is multilingual — CONTEXT, not a "
        + "penalty; must show no correlation with domain scores (checked in Stage 2)\n",
        "- `regression_flag`: 1 if child has lost a previously-acquired skill — a "
        + "high-weight red flag independent of the smooth age trend\n",
        "- `risk_label`: Typical / Monitor / Refer — derived label, NOT a model input\n",
        "\n## Item-level fields (36 columns, one per item, coded 0 / 1 / 2)\n",
        "Response scale: 0 = 0 times in the past week, 1 = 1-2 times, 2 = 3+ times\n\n",
        "| item_id | domain | motor_confound | live_elicitation_eligible | typical_age_months | "
        + "valid_brackets | bracket_assignment_unconfirmed | text |\n",
        "|---|---|---|---|---|---|---|---|\n",
    ]
    for item in ITEM_BANK:
        brackets_str = ", ".join(item.valid_brackets)
        unconfirmed_str = "NEEDS CLINICAL REVIEW" if item.bracket_assignment_unconfirmed else "confirmed"
        lines.append(
            f"| {item.item_id} | {item.domain} | {item.motor_confound} | "
            f"{item.live_elicitation_eligible} | {item.typical_age_months} | "
            f"{brackets_str} | {unconfirmed_str} | {item.text} |\n"
        )
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def generate(
    n_children: int = N_CHILDREN, seed: int = RNG_SEED
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)

    children = sample_children(n_children, rng)

    latents = sample_domain_latents(
        n_children, children["family_history_flag"].to_numpy(), rng
    )
    latents = apply_regression_event(
        latents, children["regression_flag"].to_numpy(), rng
    )

    item_responses = simulate_item_responses(children, latents, rng)
    domain_scores = compute_domain_scores(item_responses)  # derived, display-only

    pct_df = domain_percentiles(
        domain_scores, children["corrected_age_months"].to_numpy()
    )
    composite = composite_risk_score(
        pct_df, children["regression_flag"].to_numpy(), rng
    )
    labels = assign_labels_by_quantile(composite)

    full = pd.concat([children, item_responses], axis=1)
    full["risk_label"] = labels

    # domain_scores kept separate / clearly derived, so it's obvious these
    # are NOT meant to be fed to the model as features.
    derived = pd.concat([children[["child_id"]], domain_scores], axis=1)

    return full, derived


if __name__ == "__main__":
    full, derived = generate()

    out_csv = "../processed/screening_data_items.csv"
    out_dict = "../processed/data_dictionary_items.md"
    out_derived = "../processed/derived_domain_scores_DISPLAY_ONLY.csv"

    full.to_csv(out_csv, index=False)
    derived.to_csv(out_derived, index=False)
    write_data_dictionary(out_dict)

    print(f"Wrote {len(full)} rows to {out_csv}")
    print("\nClass balance:")
    print(full["risk_label"].value_counts(normalize=True).round(3))
    print(f"\nBracket distribution ({len(full['age_bracket'].unique())} brackets):")
    print(full["age_bracket"].value_counts().sort_index())
    print("\nSample rows:")
    print(full.head(3).to_string())
