"""
Stage 2 — Bidirectional Fairness Check

multilingual_home_flag is deliberately excluded from the model's
features (see columns.py). This check verifies the model's PREDICTIONS
still don't correlate with it - i.e. that no combination of item
answers is quietly proxying for "multilingual home" and causing
different outcomes for otherwise-similar children.

This is "bidirectional" in the sense the design doc means it: it's not
enough to assume good intent ("we didn't feed it the flag, so we're
fine") - it's checked against what the trained model actually does on
held-out data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from columns import LABEL_ORDER


def run_fairness_check(model, X_test, y_test, multilingual_flag_test) -> dict:
    """
    X_test: feature-only test frame (does NOT include multilingual_home_flag)
    multilingual_flag_test: the held-out flag values, aligned with X_test's rows,
                             used only for grouping here - never fed to the model.
    """
    proba = model.predict_proba(X_test)
    from columns import reorder_proba

    proba = reorder_proba(proba, model.classes_)

    refer_idx = LABEL_ORDER.index("Refer")
    monitor_idx = LABEL_ORDER.index("Monitor")

    refer_prob = proba[:, refer_idx]
    monitor_or_refer_prob = proba[:, monitor_idx] + proba[:, refer_idx]

    df = pd.DataFrame(
        {
            "multilingual": multilingual_flag_test.to_numpy(),
            "refer_prob": refer_prob,
            "monitor_or_refer_prob": monitor_or_refer_prob,
            "true_label": np.asarray(y_test),
        }
    )

    group_means = df.groupby("multilingual")[
        ["refer_prob", "monitor_or_refer_prob"]
    ].mean()

    refer_gap = abs(group_means.loc[1, "refer_prob"] - group_means.loc[0, "refer_prob"])
    monitor_refer_gap = abs(
        group_means.loc[1, "monitor_or_refer_prob"]
        - group_means.loc[0, "monitor_or_refer_prob"]
    )

    # Also check actual Refer RATE in the true labels by group, as a sanity
    # check on the test split itself (should also be near-equal, since this
    # was already verified at the data-generation stage in Stage 1).
    true_refer_rate = df.groupby("multilingual")["true_label"].apply(
        lambda s: (s == "Refer").mean()
    )

    return {
        "group_means": group_means,
        "refer_prob_gap": refer_gap,
        "monitor_or_refer_prob_gap": monitor_refer_gap,
        "true_refer_rate_by_group": true_refer_rate,
    }


def print_fairness_result(result: dict, max_acceptable_gap: float = 0.05) -> None:
    print(f"\n{'='*60}\nFairness Check: multilingual_home_flag\n{'='*60}")
    print("Mean predicted probabilities by group:")
    print(result["group_means"].round(4))
    print(f"\nRefer-probability gap between groups: {result['refer_prob_gap']:.4f}")
    print(
        f"Monitor+Refer-probability gap:        {result['monitor_or_refer_prob_gap']:.4f}"
    )
    print(f"(threshold for concern: {max_acceptable_gap})")
    passed = (
        result["refer_prob_gap"] <= max_acceptable_gap
        and result["monitor_or_refer_prob_gap"] <= max_acceptable_gap
    )
    print(
        f"\nResult: {'PASS' if passed else 'FAIL - investigate proxying via item responses'}"
    )
