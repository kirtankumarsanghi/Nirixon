"""Demonstrate triage with the ML classifier disabled.

Three policies on the same held-out rows:

  A. ML only
  B. ASQ-style rule + safety floor (no model involved at all)
  C. ML + safety floor (what the product does today)

The point is not that B wins everything; it is that the product still catches
regression cases when the model is removed, and that the cost of removing it is
visible and bounded.

Usage (from backend/ml):
    python evaluation/model_disabled_demo.py
"""

from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
from columns import LABEL_ORDER, reorder_proba
from evaluation.rule_baseline import compute_domain_z_scores, predict_asq_rule
from sklearn.metrics import f1_score
from sklearn.model_selection import train_test_split

BASE = Path(__file__).resolve().parents[1]
DATA = BASE.parent / "data" / "processed" / "screening_data_items.csv"
ARTIFACTS = BASE / "artifacts"


def heldout_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Same split as train.py (same seed and sequence), so nothing is in-sample."""
    _, temp = train_test_split(
        df, test_size=0.4, stratify=df["risk_label"], random_state=42
    )
    _, test = train_test_split(
        temp, test_size=0.5, stratify=temp["risk_label"], random_state=42
    )
    return test


def policy_stats(name: str, y: np.ndarray, pred: np.ndarray, reg: np.ndarray) -> dict:
    refer = y == "Refer"
    predicted = pred == "Refer"
    tp = int((predicted & refer).sum())
    fn = int((~predicted & refer).sum())
    tn = int((~predicted & ~refer).sum())
    fp = int((predicted & ~refer).sum())
    return {
        "policy": name,
        "refer_sensitivity": round(tp / max(tp + fn, 1), 3),
        "refer_specificity": round(tn / max(tn + fp, 1), 3),
        "refer_precision": round(tp / max(tp + fp, 1), 3),
        "macro_f1": round(
            float(
                f1_score(y, pred, labels=LABEL_ORDER, average="macro", zero_division=0)
            ),
            3,
        ),
        "missed_refer": fn,
        "regression_cases": int(reg.sum()),
        "regression_caught": int((predicted & reg).sum()),
    }


def main() -> int:
    model = pickle.load(open(ARTIFACTS / "model.pkl", "rb"))
    feature_columns = pickle.load(open(ARTIFACTS / "feature_columns.pkl", "rb"))

    df = pd.read_csv(DATA)
    test = heldout_rows(df)
    y = test["risk_label"].to_numpy()
    reg = test["regression_flag"].to_numpy() == 1

    proba = reorder_proba(model.predict_proba(test[feature_columns]), model.classes_)
    ml_pred = np.array([LABEL_ORDER[i] for i in proba.argmax(axis=1)])

    z_df = compute_domain_z_scores(test)
    rule_pred = np.asarray(predict_asq_rule(test, z_df=z_df))  # includes the override

    floor_pred = ml_pred.copy()
    floor_pred[reg] = "Refer"

    rows = [
        policy_stats("A: ML only", y, ml_pred, reg),
        policy_stats("B: rule + safety floor (model disabled)", y, rule_pred, reg),
        policy_stats("C: ML + safety floor (current)", y, floor_pred, reg),
    ]

    print(f"\nHeld-out rows: {len(test)}  |  regression cases: {int(reg.sum())}\n")
    print(
        "| Policy | Refer sens | Refer spec | Refer prec | Macro F1 | Missed Refer | Regression caught |"
    )
    print("|---|---|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {r['policy']} | {r['refer_sensitivity']:.3f} | {r['refer_specificity']:.3f} | "
            f"{r['refer_precision']:.3f} | {r['macro_f1']:.3f} | {r['missed_refer']} | "
            f"{r['regression_caught']}/{r['regression_cases']} |"
        )

    out = ARTIFACTS / "model_disabled_demo.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"heldout_rows": len(test), "policies": rows}, f, indent=2)
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
