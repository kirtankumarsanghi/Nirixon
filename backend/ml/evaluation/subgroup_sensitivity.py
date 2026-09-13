"""
Stage 2 — Subgroup Sensitivity

Breaks out Refer-class recall by age bin (1-year buckets) and by
family-history flag to check whether the model's performance is roughly
consistent across subgroups.

IMPORTANT CAVEAT (printed in output, not just here): each age bin in a
1,000-sample test set typically holds under 220 cases — far fewer for
Refer specifically. Apparent differences in recall between bins are very
plausibly small-sample noise rather than a real systematic weakness. This
check is worth running as a sanity check, but conclusions about specific
subgroups would need substantially more data per bin before being
trustworthy. Said here and repeated in the printed output, not glossed over.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sensitivity_by_age_bin(y_test, y_pred, age_months_series) -> pd.DataFrame:
    df = pd.DataFrame({
        "true_label": np.asarray(y_test),
        "pred_label": np.asarray(y_pred),
        "age_months": np.asarray(age_months_series)
    })
    
    df["age_bin"] = (df["age_months"] // 12).astype(int).astype(str) + " yr"
    
    rows = []
    for bin_val, group in df.groupby("age_bin"):
        refer_group = group[group["true_label"] == "Refer"]
        if len(refer_group) > 0:
            recall = (refer_group["pred_label"] == "Refer").mean()
            rows.append({"age_bin": bin_val, "refer_n": len(refer_group), "refer_recall": recall})
            
    return pd.DataFrame(rows)

def sensitivity_by_family_history(y_test, y_pred, fh_series) -> pd.DataFrame:
    df = pd.DataFrame({
        "true_label": np.asarray(y_test),
        "pred_label": np.asarray(y_pred),
        "family_history": np.asarray(fh_series)
    })
    
    rows = []
    for fh_val, group in df.groupby("family_history"):
        refer_group = group[group["true_label"] == "Refer"]
        if len(refer_group) > 0:
            recall = (refer_group["pred_label"] == "Refer").mean()
            rows.append({"family_history": fh_val, "refer_n": len(refer_group), "refer_recall": recall})
            
    return pd.DataFrame(rows)

def print_subgroup_tables(age_table: pd.DataFrame, fh_table: pd.DataFrame) -> None:
    print(f"\n{'='*60}\nSubgroup Sensitivity (Refer Class Recall)\n{'='*60}")
    print(
        "\nNOTE: each age bin holds a small number of Refer cases on a "
        "1,000-sample test set. Differences in recall between bins are "
        "very plausibly small-sample noise — not necessarily a real "
        "systematic weakness. More data per bin is needed before drawing "
        "subgroup-specific conclusions."
    )
    print("\nBy Age Bin:")
    if age_table.empty:
        print("  No Refer cases available to check.")
    else:
        for _, row in age_table.iterrows():
            print(f"  {row['age_bin']:<5s} : {row['refer_recall']:.1%}  (n={int(row['refer_n'])} Refer cases)")

    print("\nBy Family History:")
    if fh_table.empty:
        print("  No Refer cases available to check.")
    else:
        for _, row in fh_table.iterrows():
            print(f"  FH={row['family_history']} : {row['refer_recall']:.1%}  (n={int(row['refer_n'])} Refer cases)")
