"""
Stage 1 — Verification Check

Run this after generate_synthetic_data.py to confirm the dataset actually
does what it claims to do, instead of just trusting that the code ran
without errors. Every check below maps to a specific promise made in
STAGE1_README.md / the design doc — if a check fails, that promise is
currently broken somewhere in item_bank.py, correlation_structure.py, or
label_derivation.py.

Usage:
    cd generator
    python3 verify_stage1.py

Exit code is 0 if every check passes, 1 if any check fails — safe to wire
into a CI step or a pytest wrapper later (see the note at the bottom).
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd

CSV_PATH = "../processed/screening_data_items.csv"

# Tolerances - how far off a check is allowed to be before it's a real
# failure vs. normal random variation. Loosen only if you understand why
# a check is failing, not to make a red result go away.
CLASS_BALANCE_TARGET = {"Typical": 0.73, "Monitor": 0.20, "Refer": 0.07}
CLASS_BALANCE_TOLERANCE = 0.03  # +/- 3 percentage points

FAIRNESS_MAX_GAP = 0.08  # max allowed mean-score gap, multilingual vs not
REGRESSION_MIN_REFER_RATE = 0.60  # regression_flag=1 should mostly land in Refer...
REGRESSION_MAX_REFER_RATE = (
    0.95  # ...but must NOT be near-100% (that's a separability bug)
)

CORRELATION_MIN_BOOSTED = (
    0.35  # comm<->personal_social, age-residualized, should exceed baseline clearly
)
CORRELATION_MAX_BASELINE = (
    0.40  # comm<->gross_motor, age-residualized, should stay near baseline (~0.30)
)

AGE_REFER_RATE_MAX_SPREAD = 0.08  # Refer rate shouldn't swing wildly across age bins


results = []  # (check_name, passed: bool, detail: str)


def check(name, condition, detail):
    results.append((name, bool(condition), detail))
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}\n       {detail}")


def residualize(y: np.ndarray, age: np.ndarray) -> np.ndarray:
    coeffs = np.polyfit(age, y, deg=2)
    return y - np.polyval(coeffs, age)


def main() -> int:
    try:
        df = pd.read_csv(CSV_PATH)
    except FileNotFoundError:
        print(
            f"ERROR: could not find {CSV_PATH} — run generate_synthetic_data.py first."
        )
        return 1

    item_cols = [
        c
        for c in df.columns
        if c
        not in (
            "child_id",
            "age_months",
            "corrected_age_months",
            "family_history_flag",
            "multilingual_home_flag",
            "regression_flag",
            "risk_label",
        )
    ]

    # -----------------------------------------------------------------
    # 1. Basic shape / schema sanity
    # -----------------------------------------------------------------
    check(
        "Row count is non-trivial",
        len(df) >= 1000,
        f"{len(df)} rows found.",
    )
    check(
        "36 item columns present",
        len(item_cols) == 36,
        f"Found {len(item_cols)} item columns.",
    )
    check(
        "Item responses are only 0, 1, or 2",
        df[item_cols].isin([0, 1, 2]).all().all(),
        "Checked every item column for out-of-range values.",
    )
    check(
        "No missing values anywhere",
        not df.isnull().any().any(),
        "Checked entire dataframe for NaNs.",
    )
    check(
        "risk_label only contains Typical/Monitor/Refer",
        set(df["risk_label"].unique()) <= {"Typical", "Monitor", "Refer"},
        f"Unique values found: {sorted(df['risk_label'].unique())}",
    )

    # -----------------------------------------------------------------
    # 2. Class balance near target
    # -----------------------------------------------------------------
    balance = df["risk_label"].value_counts(normalize=True)
    for label, target in CLASS_BALANCE_TARGET.items():
        actual = balance.get(label, 0.0)
        check(
            f"Class balance for '{label}' near target ({target:.0%})",
            abs(actual - target) <= CLASS_BALANCE_TOLERANCE,
            f"Actual: {actual:.1%}, target: {target:.0%}, tolerance: +/-{CLASS_BALANCE_TOLERANCE:.0%}",
        )

    # -----------------------------------------------------------------
    # 3. Fairness: multilingual_home_flag must NOT affect communication score
    # -----------------------------------------------------------------
    comm_cols = [c for c in item_cols if c.startswith("CM")]
    df["_comm_score"] = df[comm_cols].mean(axis=1)
    means = df.groupby("multilingual_home_flag")["_comm_score"].mean()
    gap = abs(means.get(1, 0) - means.get(0, 0))
    check(
        "multilingual_home_flag shows no meaningful effect on communication score",
        gap <= FAIRNESS_MAX_GAP,
        f"Mean gap: {gap:.3f} (max allowed: {FAIRNESS_MAX_GAP}). "
        f"Means -> not multilingual: {means.get(0, float('nan')):.3f}, "
        f"multilingual: {means.get(1, float('nan')):.3f}",
    )

    # -----------------------------------------------------------------
    # 4. regression_flag: strong signal, but not perfectly separable
    # -----------------------------------------------------------------
    refer_rate_if_regression = (
        df.loc[df["regression_flag"] == 1, "risk_label"] == "Refer"
    ).mean()
    check(
        "regression_flag strongly predicts Refer, but isn't a 100%-deterministic shortcut",
        REGRESSION_MIN_REFER_RATE
        <= refer_rate_if_regression
        <= REGRESSION_MAX_REFER_RATE,
        f"Refer rate when regression_flag=1: {refer_rate_if_regression:.1%} "
        f"(expected between {REGRESSION_MIN_REFER_RATE:.0%} and {REGRESSION_MAX_REFER_RATE:.0%}). "
        f"Below range = flag too weak; above range = flag is a trivial shortcut, re-check the bump logic.",
    )

    # -----------------------------------------------------------------
    # 5. Correlation structure holds once age is controlled for
    # -----------------------------------------------------------------
    domain_map = {
        "communication": [c for c in item_cols if c.startswith("CM")],
        "personal_social": [c for c in item_cols if c.startswith("PS")],
        "gross_motor": [c for c in item_cols if c.startswith("GM")],
    }
    age = df["corrected_age_months"].to_numpy()
    resid = {}
    for domain, cols in domain_map.items():
        raw_score = df[cols].mean(axis=1).to_numpy()
        resid[domain] = residualize(raw_score, age)

    boosted_corr = np.corrcoef(resid["communication"], resid["personal_social"])[0, 1]
    baseline_corr = np.corrcoef(resid["communication"], resid["gross_motor"])[0, 1]

    check(
        "communication <-> personal_social correlation is clearly boosted (age-residualized)",
        boosted_corr >= CORRELATION_MIN_BOOSTED,
        f"Age-residualized correlation: {boosted_corr:.3f} (expected >= {CORRELATION_MIN_BOOSTED})",
    )
    check(
        "communication <-> gross_motor correlation stays near baseline (age-residualized)",
        baseline_corr <= CORRELATION_MAX_BASELINE,
        f"Age-residualized correlation: {baseline_corr:.3f} (expected <= {CORRELATION_MAX_BASELINE})",
    )
    check(
        "Boosted correlation is meaningfully higher than baseline correlation",
        boosted_corr - baseline_corr >= 0.05,
        f"Gap: {boosted_corr - baseline_corr:.3f} (expected >= 0.05) — "
        f"this is the actual evidence the correlation structure was built intentionally, not by accident.",
    )

    # -----------------------------------------------------------------
    # 6. Age-relative fairness: Refer rate shouldn't swing wildly by age
    # -----------------------------------------------------------------
    df["_age_bin_12mo"] = (df["corrected_age_months"] // 12).astype(int)
    refer_rate_by_age = df.groupby("_age_bin_12mo")["risk_label"].apply(
        lambda s: (s == "Refer").mean()
    )
    spread = refer_rate_by_age.max() - refer_rate_by_age.min()
    check(
        "Refer rate is reasonably stable across age groups (confirms age-relative scoring is working)",
        spread <= AGE_REFER_RATE_MAX_SPREAD,
        f"Spread across age bins: {spread:.1%} (max allowed: {AGE_REFER_RATE_MAX_SPREAD:.0%}). "
        f"By bin (years): {refer_rate_by_age.round(3).to_dict()}",
    )

    # -----------------------------------------------------------------
    # 7. Family history should raise risk modestly, not dominate it
    # -----------------------------------------------------------------
    refer_rate_by_fh = df.groupby("family_history_flag")["risk_label"].apply(
        lambda s: (s == "Refer").mean()
    )
    fh_effect = refer_rate_by_fh.get(1, 0) - refer_rate_by_fh.get(0, 0)
    check(
        "family_history_flag raises Refer rate modestly (not zero, not overwhelming)",
        0.0 < fh_effect < 0.15,
        f"Refer rate: no history {refer_rate_by_fh.get(0, 0):.1%}, "
        f"with history {refer_rate_by_fh.get(1, 0):.1%} (difference: {fh_effect:.1%}, expected between 0% and 15%)",
    )

    # -----------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------
    n_pass = sum(1 for _, ok, _ in results if ok)
    n_total = len(results)
    print(f"\n{'='*60}\n{n_pass}/{n_total} checks passed\n{'='*60}")

    if n_pass < n_total:
        print("\nFailed checks:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}\n    {detail}")
        return 1

    print("\nAll checks passed — dataset is ready to hand off to Stage 2.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
