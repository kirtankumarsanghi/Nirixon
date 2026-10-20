"""Content Validity Ratio (Lawshe) for the screening items.

The tooling is complete; the expert ratings are the part only humans can supply.
This script never invents a rating: with no ratings file it prints the template
path and exits non-zero.

Usage (from backend/ml):
    python evaluation/content_validity.py --ratings path/to/ratings.csv

Ratings CSV columns (one row per item x rater):
    item_id, item_text, domain, rater_id, essential
where `essential` is 1/0, or a 1-4 relevance rating (3 or 4 counts as essential).

CVR = (n_e - N/2) / (N/2). Items below Lawshe's critical value for the panel
size are flagged for revision or removal.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

# Lawshe (1975) one-tailed critical values at p < 0.05.
CRITICAL_CVR = {
    5: 0.99,
    6: 0.99,
    7: 0.99,
    8: 0.78,
    9: 0.78,
    10: 0.62,
    11: 0.59,
    12: 0.56,
    13: 0.54,
    14: 0.51,
    15: 0.49,
}

TEMPLATE = Path(__file__).resolve().parent / "content_validity_ratings_TEMPLATE.csv"


def _essential(raw: str) -> int | None:
    text = (raw or "").strip()
    if text == "":
        return None
    try:
        value = float(text)
    except ValueError:
        return {"yes": 1, "no": 0, "essential": 1}.get(text.lower())
    if value in (0.0, 1.0):
        return int(value)
    if 1.0 <= value <= 4.0:  # 4-point relevance scale
        return int(value >= 3.0)
    return None


def compute(rows: list[dict]) -> tuple[list[dict], dict]:
    per_item: dict[str, dict[str, int | None]] = defaultdict(dict)
    text: dict[str, str] = {}
    domain: dict[str, str] = {}
    for row in rows:
        item = (row.get("item_id") or "").strip()
        rater = (row.get("rater_id") or "").strip()
        if not item or not rater:
            continue
        per_item[item][rater] = _essential(row.get("essential", ""))
        text.setdefault(item, (row.get("item_text") or "").strip())
        domain.setdefault(item, (row.get("domain") or "").strip())

    results = []
    for item, ratings in sorted(per_item.items()):
        valid = [v for v in ratings.values() if v is not None]
        n = len(valid)
        n_essential = sum(valid)
        cvr = (n_essential - n / 2) / (n / 2) if n else float("nan")
        crit = CRITICAL_CVR.get(n)
        decision = (
            "insufficient panel"
            if crit is None
            else ("retain" if cvr >= crit else "revise/remove")
        )
        results.append(
            {
                "item_id": item,
                "item_text": text.get(item, ""),
                "domain": domain.get(item, ""),
                "n_raters": n,
                "n_essential": n_essential,
                "cvr": round(cvr, 3) if n else "",
                "critical_cvr": crit if crit is not None else "",
                "decision": decision,
            }
        )
    retained = sum(1 for r in results if r["decision"] == "retain")
    summary = {
        "items": len(results),
        "ratained": retained,
        "flagged": sum(1 for r in results if r["decision"] == "revise/remove"),
        "insufficient_panel": sum(
            1 for r in results if r["decision"] == "insufficient panel"
        ),
        "panel_sizes": sorted({r["n_raters"] for r in results}),
    }
    return results, summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ratings", required=True, help="CSV of expert ratings")
    ap.add_argument("--out", default="", help="Optional CSV output path")
    args = ap.parse_args()

    path = Path(args.ratings)
    if not path.exists():
        print(f"Ratings file not found: {path}", file=sys.stderr)
        print(f"Start from the template: {TEMPLATE}", file=sys.stderr)
        print(
            "Expert ratings are a human step — this tool will not invent them.",
            file=sys.stderr,
        )
        return 2

    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    results, summary = compute(rows)
    if not results:
        print(
            "No usable ratings found (need item_id, rater_id, essential).",
            file=sys.stderr,
        )
        return 2

    print("\nContent Validity Ratio (Lawshe)\n")
    print("| Item | Domain | N | Essential | CVR | Critical | Decision |")
    print("|---|---|---|---|---|---|---|")
    for r in results:
        print(
            f"| {r['item_id']} | {r['domain']} | {r['n_raters']} | {r['n_essential']} | "
            f"{r['cvr']} | {r['critical_cvr']} | {r['decision']} |"
        )
    print(
        f"\n{summary['items']} items · {summary['ratained']} retained · "
        f"{summary['flagged']} flagged · panel sizes {summary['panel_sizes']}"
    )

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
            writer.writeheader()
            writer.writerows(results)
        print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
