"""Item discrimination report for Module A.

The adaptive engine already picks the next item by mutual information with
`risk_label` inside the answered subpopulation (`app/core/adaptive_tree.py`).
This report measures the same quantity statically, per item, so weak items can
be identified and replaced with more discriminating ones — the part of the
instrument upgrade that needs clinical authoring rather than code.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from sklearn.metrics import mutual_info_score

from columns import ITEM_PREFIXES

BACKEND = Path(__file__).resolve().parents[2]
DATA_PATH = BACKEND / "data" / "processed" / "screening_data_items.csv"
OUT_PATH = BACKEND / "ml" / "artifacts" / "item_information.json"

MIN_BRACKET_N = 50
WEAK_MI = 0.01


def main() -> None:
    df = pd.read_csv(DATA_PATH)
    items = [c for c in df.columns if c.startswith(ITEM_PREFIXES)]

    rows = []
    for item in items:
        overall = float(mutual_info_score(df[item], df["risk_label"]))
        weighted, weight = 0.0, 0
        for _, group in df.groupby("age_bracket"):
            if len(group) < MIN_BRACKET_N:
                continue
            mi = float(mutual_info_score(group[item], group["risk_label"]))
            weighted += mi * len(group)
            weight += len(group)
        rows.append(
            {
                "item_id": item,
                "mutual_information": round(overall, 4),
                "bracket_weighted_mi": round(weighted / weight, 4) if weight else 0.0,
                "distinct_values": int(df[item].nunique()),
                "weak": (weighted / weight if weight else 0.0) < WEAK_MI,
            }
        )

    rows.sort(key=lambda r: r["bracket_weighted_mi"], reverse=True)
    summary = {
        "n_items": len(rows),
        "mean_bracket_weighted_mi": round(
            sum(r["bracket_weighted_mi"] for r in rows) / len(rows), 4
        ),
        "weak_item_count": sum(1 for r in rows if r["weak"]),
        "weak_threshold_mi": WEAK_MI,
        "selection": (
            "Production selection is adaptive and answer-conditioned: at each step "
            "the engine recomputes mutual information within the subpopulation "
            "matching the answers so far and asks the highest-MI uncovered item."
        ),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"summary": summary, "items": rows}, indent=2), encoding="utf-8"
    )

    print(f"Items: {summary['n_items']}  weak (<{WEAK_MI} MI): {summary['weak_item_count']}")
    print("\nStrongest items:")
    for r in rows[:8]:
        print(f"  {r['item_id']}  bracket-MI={r['bracket_weighted_mi']:.4f}")
    print("\nWeakest items:")
    for r in rows[-8:]:
        print(f"  {r['item_id']}  bracket-MI={r['bracket_weighted_mi']:.4f}")
    print(f"\nWrote {OUT_PATH}")


if __name__ == "__main__":
    main()
