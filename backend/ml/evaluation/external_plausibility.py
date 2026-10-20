"""Compare synthetic label prevalence with external developmental estimates.

This is a plausibility check, not validation. Two kinds of anchor are supported:

  * ECDI-style "on track" percentages (metric=typical_pct)
  * published developmental-delay prevalence from Indian community studies
    (metric=refer_pct)

India does not publish an ECDI in NFHS-5 (the report has no ECDI chapter and the
UN SDG API returns no India rows), so the shipped template uses ASQ-3 community
studies instead. A screening "Refer" tier is not a diagnosis, so comparing it to
diagnosed global-delay prevalence is expected to show a gap; the useful question
is whether the synthetic rate is in the right neighbourhood of a screening study.

Usage (from backend/ml):
    python evaluation/external_plausibility.py
    python evaluation/external_plausibility.py --data path/to/filled_in.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

BACKEND = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND.parent
DATA_PATH = BACKEND / "data" / "processed" / "screening_data_items.csv"
DEFAULT_EXTERNAL = REPO_ROOT / "docs" / "external_plausibility_TEMPLATE.csv"
OUT_PATH = BACKEND / "ml" / "artifacts" / "external_plausibility.json"

PLAUSIBLE_GAP_PP = 10.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(DEFAULT_EXTERNAL))
    args = parser.parse_args()

    external = pd.read_csv(args.data)
    external = external[pd.to_numeric(external["value_pct"], errors="coerce").notna()]

    if external.empty:
        print(
            "No external values filled in.\n"
            f"Open {args.data}, add the published percentages to the value_pct column, "
            "then re-run. Values are deliberately left blank so nothing is invented."
        )
        return

    df = pd.read_csv(DATA_PATH)
    rows = []
    for _, row in external.iterrows():
        band = df[
            (df["age_months"] >= float(row["age_min_months"]))
            & (df["age_months"] <= float(row["age_max_months"]))
        ]
        if band.empty:
            continue
        metric = str(row.get("metric", "typical_pct"))
        tier = "Typical" if metric == "typical_pct" else "Refer"
        model_pct = float((band["risk_label"] == tier).mean() * 100)
        external_pct = float(row["value_pct"])
        gap = model_pct - external_pct
        rows.append(
            {
                "indicator": row["indicator"],
                "metric": metric,
                "age_min_months": int(row["age_min_months"]),
                "age_max_months": int(row["age_max_months"]),
                "external_pct": round(external_pct, 1),
                "model_tier_pct": round(model_pct, 1),
                "gap_pp": round(gap, 1),
                "source": row.get("source", ""),
                "verdict": "plausible" if abs(gap) <= PLAUSIBLE_GAP_PP else "investigate",
            }
        )

    print(f"{'indicator':28} {'band':>9} {'external':>9} {'model':>8} {'gap':>7}  verdict")
    for r in rows:
        band = f"{r['age_min_months']}-{r['age_max_months']}"
        print(
            f"{r['indicator']:28} {band:>9} {r['external_pct']:9.1f} "
            f"{r['model_tier_pct']:8.1f} {r['gap_pp']:+7.1f}  {r['verdict']}"
        )

    OUT_PATH.write_text(
        json.dumps(
            {"tolerance_pp": PLAUSIBLE_GAP_PP, "comparisons": rows}, indent=2
        ),
        encoding="utf-8",
    )
    print(f"\nWrote {OUT_PATH}")


if __name__ == "__main__":
    main()
