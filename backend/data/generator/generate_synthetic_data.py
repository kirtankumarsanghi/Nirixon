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
from correlation_structure import (
    DOMAIN_INDEX,
    apply_regression_event,
    sample_domain_latents,
)
from data.generator.item_bank import DOMAINS, ITEM_BANK
from label_derivation import (
    assign_labels_by_quantile,
    composite_risk_score,
    domain_percentiles,
)

RNG_SEED = 42
N_CHILDREN = (
    5000  # scoped down from the design doc's 50,000 for a fast, iterable demo build
)

AGE_MIN, AGE_MAX = 0, 60  # months

# Response-scale item difficulty spread: how many months of age-vs-item-
# difficulty distance corresponds to one full standard deviation of the
# latent scale. Smaller = items become "easy" more sharply once a child
# passes the typical age for that item.
AGE_SLOPE_MONTHS_PER_SD = 6.0

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

    return pd.DataFrame(
        {
            "child_id": [f"C{i:06d}" for i in range(n)],
            "age_months": age_months,
            "corrected_age_months": corrected_age_months,
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
      (age relative to item's typical age) + (domain latent ability)
      - (motor-confound penalty, if applicable) + noise
    then bucket it into the 0/1/2 response scale.
    """
    n = len(children)
    corrected_age = children["corrected_age_months"].to_numpy()

    # Precompute a combined "motor ability" latent (avg of gross+fine motor)
    # used for the motor_confound penalty, independent of an item's own domain.
    gm_idx = DOMAIN_INDEX["gross_motor"]
    fm_idx = DOMAIN_INDEX["fine_motor"]
    motor_ability = (latents[:, gm_idx] + latents[:, fm_idx]) / 2.0

    responses = {}
    for item in ITEM_BANK:
        domain_latent = latents[:, DOMAIN_INDEX[item.domain]]

        age_effect = (corrected_age - item.typical_age_months) / AGE_SLOPE_MONTHS_PER_SD
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
        "- `family_history_flag`: 1 if family history of developmental delay\n",
        "- `multilingual_home_flag`: 1 if home is multilingual — CONTEXT, not a "
        + "penalty; must show no correlation with domain scores (checked in Stage 2)\n",
        "- `regression_flag`: 1 if child has lost a previously-acquired skill — a "
        + "high-weight red flag independent of the smooth age trend\n",
        "- `risk_label`: Typical / Monitor / Refer — derived label, NOT a model input\n",
        "\n## Item-level fields (36 columns, one per item, coded 0 / 1 / 2)\n",
        "Response scale: 0 = 0 times in the past week, 1 = 1-2 times, 2 = 3+ times\n\n",
        "| item_id | domain | motor_confound | live_elicitation_eligible | typical_age_months | text |\n",
        "|---|---|---|---|---|---|\n",
    ]
    for item in ITEM_BANK:
        lines.append(
            f"| {item.item_id} | {item.domain} | {item.motor_confound} | "
            f"{item.live_elicitation_eligible} | {item.typical_age_months} | {item.text} |\n"
        )
    with open(path, "w") as f:
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
    print("\nSample rows:")
    print(full.head(3).to_string())
