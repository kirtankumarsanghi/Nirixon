"""
Stage 3 — Imputation

Fills unanswered item columns with the population median for the child's
3-month `corrected_age_months` bin, computed from the Stage 1 training CSV.

Design decisions, stated explicitly:
  - Per-request recompute: medians are recomputed from the CSV on every
    call, not cached at startup. This is intentional — it means the CSV
    can change between requests (e.g. in development, when the generator
    is re-run) without stale cached values silently producing different
    imputations from what the current dataset would produce. The
    performance cost is acceptable at demo/prototype scale on a 5,000-row
    CSV; if it becomes a bottleneck at larger scale, caching can be added
    without changing this function's interface.
  - 3-month bins: chosen because 1-month bins produce too few children
    per bin for stable medians (especially at the extremes of the age
    range), and 6-month bins lose too much developmental resolution.
  - Imputed values are returned separately and NEVER merged into
    `session.answers`. This is enforced by the orchestrator — any code
    that tries to present an imputed value as a caregiver answer is a bug.
  - Mandatory items (`regression_flag`, `family_history_flag`) are never
    imputed — they must be explicitly answered. This function raises if
    either is included in `missing_item_ids`.
"""

from __future__ import annotations

import os
import sys
import pandas as pd

_CORE_PATH = os.path.dirname(os.path.abspath(__file__))
if _CORE_PATH not in sys.path:
    sys.path.insert(0, _CORE_PATH)

from .session import MANDATORY_IDS

DATA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/processed/screening_data_items.csv"))
BIN_SIZE_MONTHS = 3


def _load_medians(corrected_age_months: float, data_path: str = DATA_PATH) -> dict[str, int]:
    """
    Computes per-item medians for the 3-month age bin containing
    `corrected_age_months`, from the Stage 1 CSV.

    Returns a dict of item_id -> median (int 0/1/2).
    """
    df = pd.read_csv(data_path)

    # Assign each row to its 3-month bin
    df["age_bin"] = (df["corrected_age_months"] // BIN_SIZE_MONTHS).astype(int)
    target_bin = int(corrected_age_months // BIN_SIZE_MONTHS)

    bin_df = df[df["age_bin"] == target_bin]

    if bin_df.empty:
        # Edge case: age outside the training range — fall back to the
        # nearest bin rather than crashing or returning nulls
        all_bins = df["age_bin"].unique()
        nearest_bin = min(all_bins, key=lambda b: abs(b - target_bin))
        bin_df = df[df["age_bin"] == nearest_bin]

    # Item columns: anything that's not metadata or the target
    non_item_cols = {
        "child_id", "age_months", "corrected_age_months",
        "family_history_flag", "multilingual_home_flag",
        "regression_flag", "risk_label", "age_bin",
    }
    item_cols = [c for c in bin_df.columns if c not in non_item_cols]

    medians = {}
    for col in item_cols:
        medians[col] = int(bin_df[col].median())

    return medians


def impute_missing(
    missing_item_ids: list[str],
    corrected_age_months: float,
    data_path: str = DATA_PATH,
) -> dict[str, int]:
    """
    Returns a dict of item_id -> imputed_value for every item in
    `missing_item_ids`. Only item-column IDs are accepted — mandatory
    items raise immediately so imputation can never be used as a workaround
    for skipping them.

    The returned dict is SEPARATE from session.answers and must stay that
    way — the orchestrator uses it only to complete the feature vector for
    the model, not to update session state.
    """
    for mid in MANDATORY_IDS:
        if mid in missing_item_ids:
            raise ValueError(
                f"Mandatory item {mid!r} cannot be imputed — it must be "
                "explicitly answered by the caregiver."
            )

    if not missing_item_ids:
        return {}

    medians = _load_medians(corrected_age_months, data_path)

    result = {}
    for item_id in missing_item_ids:
        if item_id not in medians:
            raise KeyError(
                f"Item {item_id!r} not found in the training CSV. "
                "Check that item_bank.py and the CSV column names match."
            )
        result[item_id] = medians[item_id]

    return result
