"""Diagnostic: Compare K=1 nearest, K=3 nearest, and K=3 within-6-months item selection.
Validates K=3 nearest against results/base_by_seed.csv."""
import argparse
import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
from config import SimConfig
from sim_v2 import load_items, simulate, features
from baseline import fit_norms, predict
from evaluate import refer_auprc
from stress import new_model, assert_distinct_seeds


def run_diag(items_path="data/item_source.csv", base_path="results/base_by_seed.csv", seeds=None):
    if seeds is None:
        seeds = [10, 42, 100, 200, 300]

    cfg = SimConfig()
    items = load_items(items_path, cfg.domains)

    modes = [
        ("K=1 nearest", 1, "nearest"),
        ("K=3 nearest", 3, "nearest"),
        ("K=3 within6", 3, "within6"),
    ]

    results = {name: {"ml": [], "rule": []} for name, _, _ in modes}
    seed_details = {s: {} for s in seeds}

    for s in seeds:
        assert_distinct_seeds(s, s + 1, s + 2)
        for name, k, sel in modes:
            c = replace(cfg, items_asked_per_domain=k)
            tr = simulate(c, items, 8000, s, selection=sel)
            va = simulate(c, items, 4000, s + 1, selection=sel)
            te = simulate(c, items, 5000, s + 2, selection=sel)

            m = new_model(seed=s).fit(features(tr), tr["status"])
            norms = fit_norms(tr["age"], tr["domain_scores"], tr["status"])

            p_te = m.predict_proba(features(te))[:, 2]
            _, rule_te = predict(te["age"], te["domain_scores"], norms)

            ml_auprc = refer_auprc(te["status"], p_te)
            rule_auprc = refer_auprc(te["status"], rule_te)

            results[name]["ml"].append(ml_auprc)
            results[name]["rule"].append(rule_auprc)
            seed_details[s][name] = ml_auprc

    # Summary table
    summary_rows = []
    for name, _, _ in modes:
        mls = np.array(results[name]["ml"])
        rules = np.array(results[name]["rule"])
        summary_rows.append({
            "Configuration": name,
            "ML Refer AUPRC Mean": f"{mls.mean():.4f}",
            "ML Range": f"[{mls.min():.4f}, {mls.max():.4f}]",
            "Rule Refer AUPRC Mean": f"{rules.mean():.4f}",
            "Rule Range": f"[{rules.min():.4f}, {rules.max():.4f}]",
        })
    df_summary = pd.DataFrame(summary_rows)

    print("\n=== Item Selection Diagnostics (Refer AUPRC) ===")
    print(df_summary.to_markdown(index=False))

    # Base comparison check
    if os.path.exists(base_path):
        df_base = pd.read_csv(base_path)
        comp_rows = []
        diffs = []
        for s in seeds:
            match = df_base[df_base["seed"] == s]
            if not match.empty:
                base_ml = float(match["ml_refer_auprc"].values[0])
                diag_ml = seed_details[s]["K=3 nearest"]
                diff = abs(diag_ml - base_ml)
                diffs.append(diff)
                comp_rows.append({
                    "Seed": s,
                    "Diag K=3 Nearest": f"{diag_ml:.4f}",
                    "Base Run AUPRC": f"{base_ml:.4f}",
                    "Abs Diff": f"{diff:.6f}",
                })
        df_comp = pd.DataFrame(comp_rows)
        print("\n=== K=3 Nearest vs results/base_by_seed.csv ===")
        print(df_comp.to_markdown(index=False))

        max_diff = max(diffs) if diffs else 0.0
        verdict = "PASS" if max_diff <= 0.002 else "FAIL"
        print(f"\nMax Abs Difference: {max_diff:.6f}")
        print(f"Regression Check Status: {verdict} (threshold <= 0.002)")
        if verdict == "FAIL":
            sys.exit(1)
    else:
        print(f"\nNote: {base_path} not found. Skipping regression diff check.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--items", default="data/item_source.csv")
    parser.add_argument("--base", default="results/base_by_seed.csv")
    parser.add_argument("--seeds", type=int, nargs="+", default=[10, 42, 100, 200, 300])
    args = parser.parse_args()
    run_diag(items_path=args.items, base_path=args.base, seeds=args.seeds)
