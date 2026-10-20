"""Pilot / test–retest analysis for Nirixon.

Reads a de-identified outcomes CSV and reports the protocol's endpoints with
confidence intervals. It never generates data: with no file it prints the template
path and exits non-zero.

Two supported shapes (columns):

  Accuracy study
      subject_id, app_tier, reference_tier
      tiers are Typical | Monitor | Refer (reference = blinded paediatric assessment)

  Test–retest study
      subject_id, tier_t1, tier_t2
      same child, two administrations

Usage (from backend/ml/validation/src):
    python pilot_analysis.py --data path/to/pilot.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[4] / "docs" / "pilot_data_TEMPLATE.csv"
TIERS = ("Typical", "Monitor", "Refer")


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / (1 + z * z / n)
    return (round(centre - half, 3), round(centre + half, 3))


def kappa(labels_a: list[str], labels_b: list[str]) -> float:
    n = len(labels_a)
    if n == 0:
        return float("nan")
    observed = sum(a == b for a, b in zip(labels_a, labels_b)) / n
    ca, cb = Counter(labels_a), Counter(labels_b)
    expected = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return round((observed - expected) / (1 - expected), 3) if expected < 1 else 1.0


def accuracy_report(rows: list[dict]) -> dict:
    app = [r["app_tier"].strip() for r in rows]
    ref = [r["reference_tier"].strip() for r in rows]
    app_ref = [a == "Refer" for a in app]
    true_ref = [r == "Refer" for r in ref]

    tp = sum(a and t for a, t in zip(app_ref, true_ref))
    fn = sum((not a) and t for a, t in zip(app_ref, true_ref))
    tn = sum((not a) and (not t) for a, t in zip(app_ref, true_ref))
    fp = sum(a and (not t) for a, t in zip(app_ref, true_ref))

    confusion = {r: {a: 0 for a in TIERS} for r in TIERS}
    for a, r in zip(app, ref):
        if r in confusion and a in confusion[r]:
            confusion[r][a] += 1

    return {
        "n": len(rows),
        "refer_prevalence": round(sum(true_ref) / max(len(rows), 1), 3),
        "sensitivity": round(tp / max(tp + fn, 1), 3),
        "sensitivity_ci": wilson(tp, tp + fn),
        "specificity": round(tn / max(tn + fp, 1), 3),
        "specificity_ci": wilson(tn, tn + fp),
        "ppv": round(tp / max(tp + fp, 1), 3),
        "ppv_ci": wilson(tp, tp + fp),
        "npv": round(tn / max(tn + fn, 1), 3),
        "npv_ci": wilson(tn, tn + fn),
        "missed_refer": fn,
        "false_referrals": fp,
        "confusion_rows_true_cols_pred": confusion,
        "kappa_3class": kappa(app, ref),
    }


def test_retest_report(rows: list[dict]) -> dict:
    t1 = [r["tier_t1"].strip() for r in rows]
    t2 = [r["tier_t2"].strip() for r in rows]
    agreement = sum(a == b for a, b in zip(t1, t2)) / max(len(rows), 1)
    return {
        "n": len(rows),
        "exact_agreement": round(agreement, 3),
        "kappa": kappa(t1, t2),
        "tier_shift": {
            f"{a}->{b}": c for (a, b), c in Counter(zip(t1, t2)).items() if a != b
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="De-identified outcomes CSV")
    ap.add_argument("--out", default="", help="Optional JSON output path")
    args = ap.parse_args()

    path = Path(args.data)
    if not path.exists():
        print(f"Data file not found: {path}", file=sys.stderr)
        print(f"Start from the template: {TEMPLATE}", file=sys.stderr)
        print(
            "Pilot data is a human step — this tool will not invent it.",
            file=sys.stderr,
        )
        return 2

    with open(path, newline="", encoding="utf-8") as f:
        rows = [
            r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())
        ]
    if not rows:
        print("No rows in the data file.", file=sys.stderr)
        return 2

    columns = set(rows[0].keys())
    if {"app_tier", "reference_tier"} <= columns:
        report = {"study": "accuracy", **accuracy_report(rows)}
    elif {"tier_t1", "tier_t2"} <= columns:
        report = {"study": "test_retest", **test_retest_report(rows)}
    else:
        print(
            "Unrecognised columns. Need app_tier+reference_tier or tier_t1+tier_t2.",
            file=sys.stderr,
        )
        return 2

    print(json.dumps(report, indent=2))
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
