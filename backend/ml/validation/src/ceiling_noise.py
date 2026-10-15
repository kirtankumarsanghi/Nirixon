"""Evaluate Refer AUPRC under noise ablation scenarios. Prints only the table."""

import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
from config import SimConfig
from evaluate import refer_auprc
from sim_v2 import features, load_items, simulate
from stress import new_model


def main():
    cfg = SimConfig()
    items = load_items("data/item_source.csv", cfg.domains)
    scenarios = [
        ("(as configured)", {}),
        ("(yes_bias=0)", {"yes_bias_share": 0.0}),
        ("(slip=0)", {"slip": 0.0}),
        ("(both 0)", {"yes_bias_share": 0.0, "slip": 0.0}),
    ]
    rows = []
    for name, over in scenarios:
        c = replace(cfg, **over)
        tr = simulate(c, items, 8000, 10)
        te = simulate(c, items, 5000, 12)
        m = new_model(seed=10).fit(features(tr), tr["status"])
        p = m.predict_proba(features(te))[:, 2]
        rows.append(
            {
                "scenario": name,
                "refer_prevalence": round(float((te["status"] == 2).mean()), 3),
                "ml_refer_auprc": round(float(refer_auprc(te["status"], p)), 3),
            }
        )
    print(pd.DataFrame(rows).to_markdown(index=False))


if __name__ == "__main__":
    main()
