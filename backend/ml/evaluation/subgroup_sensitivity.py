"""
Stage 2 — Subgroup Sensitivity

Breaks out Refer-class recall by:
  1. ASQ-3 age bracket (17 brackets) — replaces the old 1-year bin approach.
     Narrower brackets reveal accuracy differences between models that broader
     bins masked. This is the primary validation instrument for the age bracket
     granularity change.
  2. Family-history flag
  3. Domain — for cross-model comparison (sensitivity_by_domain)

IMPORTANT CAVEAT (printed in output, not just here): each bracket in the
test set typically holds under 100 cases — far fewer for Refer specifically.
Apparent differences in recall between brackets are very plausibly small-sample
noise rather than a real systematic weakness. This check is worth running as a
sanity check, but conclusions about specific brackets would need substantially
more data per bracket before being trustworthy. Said here and repeated in the
printed output, not glossed over.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from columns import LABEL_ORDER

# Item prefix -> domain name mapping for sensitivity_by_domain()
_ITEM_PREFIX_TO_DOMAIN = {
    "GM": "gross_motor",
    "FM": "fine_motor",
    "CM": "communication",
    "CG": "cognitive",
    "PS": "personal_social",
    "SH": "self_help",
}


def sensitivity_by_age_bracket(
    y_test, y_pred, age_bracket_series
) -> pd.DataFrame:
    """
    Computes Refer-class recall and specificity (Monitor+Refer specificity)
    by ASQ-3 age bracket. Uses the age_bracket column from the test set
    (string labels like '12mo', '24mo').

    Returns a DataFrame with columns:
      bracket, refer_n, refer_recall, refer_specificity
    sorted in developmental order (youngest bracket first).
    """
    import sys
    import os
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    from data.generator.age_brackets import BRACKET_LABELS

    df = pd.DataFrame(
        {
            "true_label": np.asarray(y_test),
            "pred_label": np.asarray(y_pred),
            "bracket": np.asarray(age_bracket_series),
        }
    )

    rows = []
    for bracket in BRACKET_LABELS:  # ordered youngest-to-oldest
        group = df[df["bracket"] == bracket]
        if group.empty:
            continue
        refer_group = group[group["true_label"] == "Refer"]
        non_refer_group = group[group["true_label"] != "Refer"]

        recall = (
            (refer_group["pred_label"] == "Refer").mean()
            if len(refer_group) > 0
            else float("nan")
        )
        # Specificity: among non-Refer cases, how often does the model correctly
        # NOT predict Refer (i.e., not false-alarm).
        specificity = (
            (non_refer_group["pred_label"] != "Refer").mean()
            if len(non_refer_group) > 0
            else float("nan")
        )
        rows.append(
            {
                "bracket": bracket,
                "n_total": len(group),
                "refer_n": len(refer_group),
                "refer_recall": recall,
                "refer_specificity": specificity,
            }
        )

    return pd.DataFrame(rows)


def sensitivity_by_age_bin(
    y_test, y_pred, age_months_series
) -> pd.DataFrame:
    """
    Legacy 1-year-bin version — kept for backward compatibility with any
    callers not yet updated to the 17-bracket system.

    Prefer sensitivity_by_age_bracket() for any new analysis. This function
    will be removed in a future cleanup.
    """
    df = pd.DataFrame(
        {
            "true_label": np.asarray(y_test),
            "pred_label": np.asarray(y_pred),
            "age_months": np.asarray(age_months_series),
        }
    )

    df["age_bin"] = (df["age_months"] // 12).astype(int).astype(str) + " yr"

    rows = []
    for bin_val, group in df.groupby("age_bin"):
        refer_group = group[group["true_label"] == "Refer"]
        if len(refer_group) > 0:
            recall = (refer_group["pred_label"] == "Refer").mean()
            rows.append(
                {
                    "age_bin": bin_val,
                    "refer_n": len(refer_group),
                    "refer_recall": recall,
                }
            )

    return pd.DataFrame(rows)


def sensitivity_by_family_history(y_test, y_pred, fh_series) -> pd.DataFrame:
    df = pd.DataFrame(
        {
            "true_label": np.asarray(y_test),
            "pred_label": np.asarray(y_pred),
            "family_history": np.asarray(fh_series),
        }
    )

    rows = []
    for fh_val, group in df.groupby("family_history"):
        refer_group = group[group["true_label"] == "Refer"]
        if len(refer_group) > 0:
            recall = (refer_group["pred_label"] == "Refer").mean()
            rows.append(
                {
                    "family_history": fh_val,
                    "refer_n": len(refer_group),
                    "refer_recall": recall,
                }
            )

    return pd.DataFrame(rows)


def sensitivity_by_domain(
    y_test, y_pred, X_test: pd.DataFrame
) -> pd.DataFrame:
    """
    For each of the 6 developmental domains, computes Refer-class recall on
    the test set using only the items belonging to that domain. This enables
    cross-model comparison at domain level: one model may have higher overall
    AUPRC while another detects communication delays more reliably.

    Returns a DataFrame with columns: domain, refer_n, refer_recall.
    Note: ALL items in X_test are used for predictions (this is not a
    masked inference). The domain breakdown here is about which items drive
    the prediction — we're not re-running inference per domain. This function
    measures correlation between a child's per-domain performance and whether
    the model correctly classified them as Refer.
    """
    df = pd.DataFrame(
        {
            "true_label": np.asarray(y_test),
            "pred_label": np.asarray(y_pred),
        },
        index=X_test.index,
    )
    df = pd.concat([df, X_test], axis=1)

    rows = []
    for prefix, domain_name in _ITEM_PREFIX_TO_DOMAIN.items():
        domain_item_cols = [c for c in X_test.columns if c.startswith(prefix)]
        if not domain_item_cols:
            continue

        # A child is "domain-delayed" if their mean item score in this domain
        # is below the test-set median for this domain (simple operational definition).
        domain_mean = df[domain_item_cols].mean(axis=1)
        median_threshold = domain_mean.median()
        domain_delayed = df[domain_mean < median_threshold]

        refer_group = domain_delayed[domain_delayed["true_label"] == "Refer"]
        if len(refer_group) == 0:
            continue

        recall = (refer_group["pred_label"] == "Refer").mean()
        rows.append(
            {
                "domain": domain_name,
                "n_domain_delayed": len(domain_delayed),
                "refer_n": len(refer_group),
                "refer_recall_in_domain_delayed": recall,
            }
        )

    return pd.DataFrame(rows)


def print_subgroup_tables(
    age_bracket_table: pd.DataFrame,
    fh_table: pd.DataFrame,
    domain_table: pd.DataFrame | None = None,
) -> None:
    print(f"\n{'='*60}\nSubgroup Sensitivity (Refer Class Recall)\n{'='*60}")
    print(
        "\nNOTE: each bracket holds a small number of Refer cases. Differences "
        "in recall between brackets are very plausibly small-sample noise — "
        "not necessarily a real systematic weakness. More data per bracket "
        "is needed before drawing subgroup-specific conclusions."
    )
    print("\nBy ASQ-3 Age Bracket (youngest to oldest):")
    if age_bracket_table.empty:
        print("  No Refer cases available to check.")
    else:
        for _, row in age_bracket_table.iterrows():
            print(
                f"  {row['bracket']:<6s}: recall={row['refer_recall']:.1%}  "
                f"spec={row['refer_specificity']:.1%}  "
                f"(n_refer={int(row['refer_n'])}, n_total={int(row['n_total'])})"
            )

    print("\nBy Family History:")
    if fh_table.empty:
        print("  No Refer cases available to check.")
    else:
        for _, row in fh_table.iterrows():
            print(
                f"  FH={row['family_history']} : {row['refer_recall']:.1%}  (n={int(row['refer_n'])} Refer cases)"
            )

    if domain_table is not None:
        print("\nBy Domain (Refer recall among domain-delayed children):")
        if domain_table.empty:
            print("  No data available.")
        else:
            for _, row in domain_table.iterrows():
                print(
                    f"  {row['domain']:<18s}: recall={row['refer_recall_in_domain_delayed']:.1%}  "
                    f"(n_refer={int(row['refer_n'])}, n_domain_delayed={int(row['n_domain_delayed'])})"
                )
