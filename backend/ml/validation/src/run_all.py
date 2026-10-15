"""Multi-seed validation runner. Writes results/*.csv, results.json and numbers_sheet.md."""
import argparse
from dataclasses import replace
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
from baseline import fit_norms, predict
from config import SimConfig
from evaluate import macro_auprc, refer_at, refer_auprc, threshold_for_recall, wilson
from sim_v2 import features, load_items, simulate
from stress import assert_distinct_seeds, new_model, run_loso, run_stress


def recall_at_fixed_flagged(y_status, risk, target_share):
    y = (y_status == 2)
    n_pos = int(y.sum())
    if n_pos == 0:
        return np.nan
    k = int(round(target_share * len(risk)))
    idx = np.argsort(-risk)[:k]
    return float(y[idx].sum() / n_pos)


ap = argparse.ArgumentParser()
ap.add_argument("--quick", action="store_true")
ap.add_argument("--items", default="data/item_source.csv")
ap.add_argument("--out_dir", default="results")
ap.add_argument(
    "--seeds", type=int, nargs="+", default=[10, 42, 100, 200, 300]
)
args = ap.parse_args()
os.makedirs(args.out_dir, exist_ok=True)

cfg = SimConfig()
items = load_items(args.items, cfg.domains)

# 1. Item bank status accounting
n_items = len(items)
age75_counts = items["age75_status"].value_counts().to_dict()
s_counts = items["s_status"].value_counts().to_dict()

status_rows = []
for s in ["SOURCED", "AUTHOR-SET", "UNVERIFIED"]:
    cnt = age75_counts.get(s, 0)
    status_rows.append({"Field": "age75_status", "Status": s, "Count": cnt, "Share": f"{(cnt / n_items):.1%}"})
for s in ["WHO-DERIVED", "AUTHOR-SET"]:
    cnt = s_counts.get(s, 0)
    status_rows.append({"Field": "s_status", "Status": s, "Count": cnt, "Share": f"{(cnt / n_items):.1%}"})
df_status = pd.DataFrame(status_rows)

# 2. Multi-seed base experiment: train(seed), val(seed+1), test(seed+2)
seed_records = []
for s in args.seeds:
    tr_s, va_s, te_s = s, s + 1, s + 2
    assert_distinct_seeds(tr_s, va_s, te_s)
    tr = simulate(cfg, items, 8000, tr_s)
    va = simulate(cfg, items, 4000, va_s)
    te = simulate(cfg, items, 5000, te_s)

    m = new_model(seed=tr_s).fit(features(tr), tr["status"])
    norms = fit_norms(tr["age"], tr["domain_scores"], tr["status"])

    p_va = m.predict_proba(features(va))[:, 2]
    p_te = m.predict_proba(features(te))
    _, rule_va = predict(va["age"], va["domain_scores"], norms)
    _, rule_te = predict(te["age"], te["domain_scores"], norms)

    ml_thr = threshold_for_recall(va["status"], p_va)
    rule_thr = threshold_for_recall(va["status"], rule_va)
    ml_at = refer_at(te["status"], p_te[:, 2], ml_thr)
    rule_at = refer_at(te["status"], rule_te, rule_thr)

    ml_auprc = refer_auprc(te["status"], p_te[:, 2])
    rule_auprc = refer_auprc(te["status"], rule_te)
    paired_diff = ml_auprc - rule_auprc
    ml_macro = macro_auprc(te["status"], p_te)

    y_ref = te["status"] == 2
    n_ref = int(y_ref.sum())
    k_ml_ref = int(round(ml_at["recall"] * n_ref))
    k_rule_ref = int(round(rule_at["recall"] * n_ref))

    w_low_ml, w_high_ml = wilson(k_ml_ref, n_ref)
    w_low_rule, w_high_rule = wilson(k_rule_ref, n_ref)

    # Fixed flagged share recalls (10, 15, 20, 30%)
    ml_rec_f10 = recall_at_fixed_flagged(te["status"], p_te[:, 2], 0.10)
    ml_rec_f15 = recall_at_fixed_flagged(te["status"], p_te[:, 2], 0.15)
    ml_rec_f20 = recall_at_fixed_flagged(te["status"], p_te[:, 2], 0.20)
    ml_rec_f30 = recall_at_fixed_flagged(te["status"], p_te[:, 2], 0.30)

    rule_rec_f10 = recall_at_fixed_flagged(te["status"], rule_te, 0.10)
    rule_rec_f15 = recall_at_fixed_flagged(te["status"], rule_te, 0.15)
    rule_rec_f20 = recall_at_fixed_flagged(te["status"], rule_te, 0.20)
    rule_rec_f30 = recall_at_fixed_flagged(te["status"], rule_te, 0.30)

    typ_share = float((te["status"] == 0).mean())
    mon_share = float((te["status"] == 1).mean())
    ref_share = float((te["status"] == 2).mean())

    seed_records.append(
        dict(
            seed=s,
            ml_refer_auprc=round(float(ml_auprc), 4),
            rule_refer_auprc=round(float(rule_auprc), 4),
            paired_diff=round(float(paired_diff), 4),
            ml_macro_auprc=round(float(ml_macro), 4),
            ml_recall=round(float(ml_at["recall"]), 4),
            ml_precision=round(float(ml_at["precision"]), 4),
            ml_flagged=round(float(ml_at["flagged_share"]), 4),
            ml_recall_wilson_low=round(float(w_low_ml), 4),
            ml_recall_wilson_high=round(float(w_high_ml), 4),
            rule_recall=round(float(rule_at["recall"]), 4),
            rule_precision=round(float(rule_at["precision"]), 4),
            rule_flagged=round(float(rule_at["flagged_share"]), 4),
            rule_recall_wilson_low=round(float(w_low_rule), 4),
            rule_recall_wilson_high=round(float(w_high_rule), 4),
            ml_rec_f10=round(ml_rec_f10, 4),
            ml_rec_f15=round(ml_rec_f15, 4),
            ml_rec_f20=round(ml_rec_f20, 4),
            ml_rec_f30=round(ml_rec_f30, 4),
            rule_rec_f10=round(rule_rec_f10, 4),
            rule_rec_f15=round(rule_rec_f15, 4),
            rule_rec_f20=round(rule_rec_f20, 4),
            rule_rec_f30=round(rule_rec_f30, 4),
            refer_prev=round(float(ref_share), 4),
            typical_prev=round(float(typ_share), 4),
            monitor_prev=round(float(mon_share), 4),
            n_refer=n_ref,
            k_ml_refer=k_ml_ref,
        )
    )

df_seeds = pd.DataFrame(seed_records)
df_seeds.to_csv(os.path.join(args.out_dir, "base_by_seed.csv"), index=False)

ml_auprcs = df_seeds["ml_refer_auprc"].to_numpy()
rule_auprcs = df_seeds["rule_refer_auprc"].to_numpy()
paired_diffs = df_seeds["paired_diff"].to_numpy()
macro_auprcs = df_seeds["ml_macro_auprc"].to_numpy()

ml_min, ml_max = float(np.min(ml_auprcs)), float(np.max(ml_auprcs))
rule_min, rule_max = float(np.min(rule_auprcs)), float(np.max(rule_auprcs))
overlap = not (ml_min > rule_max or rule_min > ml_max)
range_verdict = "ranges overlap" if overlap else "ranges do not overlap"

typ_mean = float(df_seeds["typical_prev"].mean())
mon_mean = float(df_seeds["monitor_prev"].mean())
ref_mean = float(df_seeds["refer_prev"].mean())

base_summary_rows = [
    {
        "Metric": "Hidden-status mix (typical / monitor / refer)",
        "Mean": f"{typ_mean:.3f} / {mon_mean:.3f} / {ref_mean:.3f}",
        "Range": "-",
    },
    {
        "Metric": "Refer prevalence = random-classifier AUPRC",
        "Mean": f"{ref_mean:.3f}",
        "Range": f"[{df_seeds['refer_prev'].min():.3f}, {df_seeds['refer_prev'].max():.3f}]",
    },
    {
        "Metric": "ML macro AUPRC",
        "Mean": f"{float(np.mean(macro_auprcs)):.3f}",
        "Range": f"[{float(np.min(macro_auprcs)):.3f}, {float(np.max(macro_auprcs)):.3f}]",
    },
    {
        "Metric": "ML Refer AUPRC",
        "Mean": f"{float(np.mean(ml_auprcs)):.3f}",
        "Range": f"[{ml_min:.3f}, {ml_max:.3f}]",
    },
    {
        "Metric": "Rule baseline Refer AUPRC",
        "Mean": f"{float(np.mean(rule_auprcs)):.3f}",
        "Range": f"[{rule_min:.3f}, {rule_max:.3f}]",
    },
    {
        "Metric": "Paired difference (ML - Rule)",
        "Mean": f"{float(np.mean(paired_diffs)):.3f}",
        "Range": f"[{float(np.min(paired_diffs)):.3f}, {float(np.max(paired_diffs)):.3f}]",
    },
    {
        "Metric": "Range comparison verdict",
        "Mean": range_verdict,
        "Range": "-",
    },
    {
        "Metric": "ML at recall target 0.85",
        "Mean": f"recall {df_seeds['ml_recall'].mean():.2f}, precision {df_seeds['ml_precision'].mean():.2f}, flagged {df_seeds['ml_flagged'].mean():.2f}",
        "Range": f"flagged range [{df_seeds['ml_flagged'].min():.2f}, {df_seeds['ml_flagged'].max():.2f}]",
    },
    {
        "Metric": "Rule at recall target 0.85",
        "Mean": f"recall {df_seeds['rule_recall'].mean():.2f}, precision {df_seeds['rule_precision'].mean():.2f}, flagged {df_seeds['rule_flagged'].mean():.2f}",
        "Range": f"flagged range [{df_seeds['rule_flagged'].min():.2f}, {df_seeds['rule_flagged'].max():.2f}]",
    },
    {
        "Metric": "ML Refer recall (per-seed at 0.85 target)",
        "Mean": f"{df_seeds['ml_recall'].mean():.3f}",
        "Range": f"[{df_seeds['ml_recall'].min():.3f}, {df_seeds['ml_recall'].max():.3f}]",
    },
    {
        "Metric": "Recall at 10% flagged share",
        "Mean": f"ML {df_seeds['ml_rec_f10'].mean():.3f}, Rule {df_seeds['rule_rec_f10'].mean():.3f}",
        "Range": f"ML [{df_seeds['ml_rec_f10'].min():.3f}, {df_seeds['ml_rec_f10'].max():.3f}], Rule [{df_seeds['rule_rec_f10'].min():.3f}, {df_seeds['rule_rec_f10'].max():.3f}]",
    },
    {
        "Metric": "Recall at 15% flagged share",
        "Mean": f"ML {df_seeds['ml_rec_f15'].mean():.3f}, Rule {df_seeds['rule_rec_f15'].mean():.3f}",
        "Range": f"ML [{df_seeds['ml_rec_f15'].min():.3f}, {df_seeds['ml_rec_f15'].max():.3f}], Rule [{df_seeds['rule_rec_f15'].min():.3f}, {df_seeds['rule_rec_f15'].max():.3f}]",
    },
    {
        "Metric": "Recall at 20% flagged share",
        "Mean": f"ML {df_seeds['ml_rec_f20'].mean():.3f}, Rule {df_seeds['rule_rec_f20'].mean():.3f}",
        "Range": f"ML [{df_seeds['ml_rec_f20'].min():.3f}, {df_seeds['ml_rec_f20'].max():.3f}], Rule [{df_seeds['rule_rec_f20'].min():.3f}, {df_seeds['rule_rec_f20'].max():.3f}]",
    },
    {
        "Metric": "Recall at 30% flagged share",
        "Mean": f"ML {df_seeds['ml_rec_f30'].mean():.3f}, Rule {df_seeds['rule_rec_f30'].mean():.3f}",
        "Range": f"ML [{df_seeds['ml_rec_f30'].min():.3f}, {df_seeds['ml_rec_f30'].max():.3f}], Rule [{df_seeds['rule_rec_f30'].min():.3f}, {df_seeds['rule_rec_f30'].max():.3f}]",
    },
    {
        "Metric": "ASQ-3 reference line",
        "Mean": "Published design targets: 12-16% identified in one area; 2-7% in two or more areas (targets, not observed; not directly comparable to flagged share at recall 0.85)",
        "Range": "-",
    },
]
df_base_summary = pd.DataFrame(base_summary_rows)

# 3. Sweep items asked per domain K in {2, 3, 4, 6, 7} across all seeds
max_k = min(len(items[items.domain == d]) for d in cfg.domains)
k_values = [k for k in [2, 3, 4, 6, 7] if k <= max_k]

k_table_rows = []
for k in k_values:
    k_auprcs, k_recs, k_flags = [], [], []
    k_ml_f10, k_ml_f15, k_ml_f20, k_ml_f30 = [], [], [], []
    k_rule_f10, k_rule_f15, k_rule_f20, k_rule_f30 = [], [], [], []
    for s in args.seeds:
        c_k = replace(cfg, items_asked_per_domain=k)
        tr_k = simulate(c_k, items, 8000, s)
        va_k = simulate(c_k, items, 4000, s + 1)
        te_k = simulate(c_k, items, 5000, s + 2)
        m_k = new_model(seed=s).fit(features(tr_k), tr_k["status"])
        norms_k = fit_norms(tr_k["age"], tr_k["domain_scores"], tr_k["status"])

        p_va = m_k.predict_proba(features(va_k))[:, 2]
        p_te = m_k.predict_proba(features(te_k))[:, 2]
        _, rule_te = predict(te_k["age"], te_k["domain_scores"], norms_k)

        thr = threshold_for_recall(va_k["status"], p_va)
        at_res = refer_at(te_k["status"], p_te, thr)
        k_auprcs.append(refer_auprc(te_k["status"], p_te))
        k_recs.append(at_res["recall"])
        k_flags.append(at_res["flagged_share"])

        k_ml_f10.append(recall_at_fixed_flagged(te_k["status"], p_te, 0.10))
        k_ml_f15.append(recall_at_fixed_flagged(te_k["status"], p_te, 0.15))
        k_ml_f20.append(recall_at_fixed_flagged(te_k["status"], p_te, 0.20))
        k_ml_f30.append(recall_at_fixed_flagged(te_k["status"], p_te, 0.30))

        k_rule_f10.append(recall_at_fixed_flagged(te_k["status"], rule_te, 0.10))
        k_rule_f15.append(recall_at_fixed_flagged(te_k["status"], rule_te, 0.15))
        k_rule_f20.append(recall_at_fixed_flagged(te_k["status"], rule_te, 0.20))
        k_rule_f30.append(recall_at_fixed_flagged(te_k["status"], rule_te, 0.30))

    k_table_rows.append({
        "Items/Domain (K)": k,
        "Total Items Asked": k * len(cfg.domains),
        "Refer AUPRC (Mean)": round(float(np.mean(k_auprcs)), 3),
        "Refer AUPRC (Range)": f"[{np.min(k_auprcs):.3f}, {np.max(k_auprcs):.3f}]",
        "ML Rec @ 10% Flagged": f"{np.mean(k_ml_f10):.3f} [{np.min(k_ml_f10):.3f}, {np.max(k_ml_f10):.3f}]",
        "ML Rec @ 15% Flagged": f"{np.mean(k_ml_f15):.3f} [{np.min(k_ml_f15):.3f}, {np.max(k_ml_f15):.3f}]",
        "ML Rec @ 20% Flagged": f"{np.mean(k_ml_f20):.3f} [{np.min(k_ml_f20):.3f}, {np.max(k_ml_f20):.3f}]",
        "ML Rec @ 30% Flagged": f"{np.mean(k_ml_f30):.3f} [{np.min(k_ml_f30):.3f}, {np.max(k_ml_f30):.3f}]",
        "Rule Rec @ 10% Flagged": f"{np.mean(k_rule_f10):.3f}",
        "Rule Rec @ 20% Flagged": f"{np.mean(k_rule_f20):.3f}",
        "Recall at 0.85 Target (Mean)": round(float(np.mean(k_recs)), 3),
        "Flagged Share (Mean)": round(float(np.mean(k_flags)), 3),
    })
df_k_summary = pd.DataFrame(k_table_rows)

# 4. Pace sensitivity (trained and tested at the same pace)
pace_values = [0.08, 0.12, 0.15, 0.18, 0.25]
pace_records = []
for p in pace_values:
    p_ml_auprcs, p_rule_auprcs, p_prevs = [], [], []
    for s in args.seeds:
        c_p = replace(cfg, pace=p)
        tr_p = simulate(c_p, items, 8000 if not args.quick else 3000, s)
        va_p = simulate(c_p, items, 4000 if not args.quick else 1500, s + 1)
        te_p = simulate(c_p, items, 5000 if not args.quick else 2000, s + 2)

        m_p = new_model(seed=s).fit(features(tr_p), tr_p["status"])
        norms_p = fit_norms(tr_p["age"], tr_p["domain_scores"], tr_p["status"])

        p_te_ml = m_p.predict_proba(features(te_p))[:, 2]
        _, rule_te_p = predict(te_p["age"], te_p["domain_scores"], norms_p)

        p_ml_auprcs.append(refer_auprc(te_p["status"], p_te_ml))
        p_rule_auprcs.append(refer_auprc(te_p["status"], rule_te_p))
        p_prevs.append((te_p["status"] == 2).mean())

    diffs_p = np.array(p_ml_auprcs) - np.array(p_rule_auprcs)
    pace_records.append({
        "Pace": p,
        "Prevalence (Mean)": f"{np.mean(p_prevs):.3f}",
        "ML Refer AUPRC (Mean)": f"{np.mean(p_ml_auprcs):.3f}",
        "ML Refer AUPRC (Range)": f"[{np.min(p_ml_auprcs):.3f}, {np.max(p_ml_auprcs):.3f}]",
        "Rule Refer AUPRC (Mean)": f"{np.mean(p_rule_auprcs):.3f}",
        "Rule Refer AUPRC (Range)": f"[{np.min(p_rule_auprcs):.3f}, {np.max(p_rule_auprcs):.3f}]",
        "Paired Diff Mean (ML - Rule)": f"{np.mean(diffs_p):.3f}",
        "Paired Diff Range": f"[{np.min(diffs_p):.3f}, {np.max(diffs_p):.3f}]",
    })
df_pace_summary = pd.DataFrame(pace_records)
df_pace_summary.to_csv(os.path.join(args.out_dir, "pace_sensitivity.csv"), index=False)

# 5. Stress tests run across every seed (mean and range)
stress_frames = []
for s in args.seeds:
    df_s = run_stress(cfg, items, n_test=3000 if args.quick else 5000, seed=s)
    df_s["seed"] = s
    stress_frames.append(df_s)
df_all_stress = pd.concat(stress_frames, ignore_index=True)
df_all_stress.round(3).to_csv(os.path.join(args.out_dir, "stress_tests.csv"), index=False)

stress_summary = []
for scenario, grp in df_all_stress.groupby("scenario", sort=False):
    stress_summary.append({
        "Scenario": scenario,
        "Prevalence": f"{grp['refer_prevalence'].mean():.3f}",
        "ML AUPRC Mean": f"{grp['ml_auprc'].mean():.3f}",
        "ML AUPRC Range": f"[{grp['ml_auprc'].min():.3f}, {grp['ml_auprc'].max():.3f}]",
        "Rule AUPRC Mean": f"{grp['rule_auprc'].mean():.3f}",
        "Rule AUPRC Range": f"[{grp['rule_auprc'].min():.3f}, {grp['rule_auprc'].max():.3f}]",
        "ML Recall Mean": f"{grp['ml_recall'].mean():.3f}",
        "Rule Recall Mean": f"{grp['rule_recall'].mean():.3f}",
        "ML Flagged Mean": f"{grp['ml_flagged'].mean():.3f}",
        "Rule Flagged Mean": f"{grp['rule_flagged'].mean():.3f}",
        "ML Precision Mean": f"{grp['ml_precision'].mean():.3f}",
        "Rule Precision Mean": f"{grp['rule_precision'].mean():.3f}",
    })
df_stress_sheet = pd.DataFrame(stress_summary)

# 6. Leave-one-simulator-out across all seeds with in-distribution handling
loso_frames = []
for s in args.seeds:
    df_l = run_loso(cfg, items, rows_per_setting=800 if args.quick else 1500, n_test=3000 if args.quick else 5000, seed=s)
    df_l["seed"] = s
    df_l["diff"] = df_l["randomized_auprc"] - df_l["single_simulator_auprc"]
    loso_frames.append(df_l)
df_all_loso = pd.concat(loso_frames, ignore_index=True)
df_all_loso[["seed", "held_out", "in_distribution", "single_simulator_auprc", "randomized_auprc", "diff", "prevalence"]].round(3).to_csv(os.path.join(args.out_dir, "leave_one_simulator_out.csv"), index=False)

# Held-out summary table
loso_summary = []
for held, grp in df_all_loso.groupby("held_out", sort=False):
    in_dist = grp["in_distribution"].iloc[0]
    loso_summary.append({
        "Held Out": held,
        "In Distribution": bool(in_dist),
        "Single AUPRC Mean": f"{grp['single_simulator_auprc'].mean():.3f}",
        "Randomized AUPRC Mean": f"{grp['randomized_auprc'].mean():.3f}",
        "Diff Mean (Rand - Single)": f"{grp['diff'].mean():.3f}",
        "Diff Range": f"[{grp['diff'].min():.3f}, {grp['diff'].max():.3f}]",
        "Prevalence": f"{grp['prevalence'].mean():.3f}",
    })
df_loso_sheet = pd.DataFrame(loso_summary)

# Per-factor summary table (excluding in_distribution rows)
factors = ["pace", "flip_rate", "yes_bias_share", "g_weight"]
factor_summary_rows = []
for f in factors:
    f_sub = df_all_loso[(df_all_loso["held_out"].str.startswith(f"{f}=")) & (~df_all_loso["in_distribution"])]
    factor_summary_rows.append({
        "Factor": f,
        "OOD Settings": len(f_sub["held_out"].unique()),
        "Single AUPRC Mean": f"{f_sub['single_simulator_auprc'].mean():.3f}",
        "Randomized AUPRC Mean": f"{f_sub['randomized_auprc'].mean():.3f}",
        "Diff Mean (Rand - Single)": f"{f_sub['diff'].mean():.3f}",
        "Diff Range": f"[{f_sub['diff'].min():.3f}, {f_sub['diff'].max():.3f}]",
    })
# Pooled OOD row
ood_all = df_all_loso[~df_all_loso["in_distribution"]]
factor_summary_rows.append({
    "Factor": "Pooled (All OOD)",
    "OOD Settings": len(ood_all["held_out"].unique()),
    "Single AUPRC Mean": f"{ood_all['single_simulator_auprc'].mean():.3f}",
    "Randomized AUPRC Mean": f"{ood_all['randomized_auprc'].mean():.3f}",
    "Diff Mean (Rand - Single)": f"{ood_all['diff'].mean():.3f}",
    "Diff Range": f"[{ood_all['diff'].min():.3f}, {ood_all['diff'].max():.3f}]",
})
df_loso_factor_summary = pd.DataFrame(factor_summary_rows)

# 7. Write results.json
res_json = {
    "n_items": n_items,
    "status_counts_age75": age75_counts,
    "status_counts_s": s_counts,
    "seeds": args.seeds,
    "ml_macro_auprc": {
        "mean": float(np.mean(macro_auprcs)),
        "min": float(np.min(macro_auprcs)),
        "max": float(np.max(macro_auprcs)),
    },
    "ml_refer_auprc": {
        "mean": float(np.mean(ml_auprcs)),
        "min": ml_min,
        "max": ml_max,
    },
    "rule_refer_auprc": {
        "mean": float(np.mean(rule_auprcs)),
        "min": rule_min,
        "max": rule_max,
    },
    "paired_diff": {
        "mean": float(np.mean(paired_diffs)),
        "min": float(np.min(paired_diffs)),
        "max": float(np.max(paired_diffs)),
    },
    "range_verdict": range_verdict,
    "items_per_domain_sweep": k_table_rows,
    "pace_sensitivity": pace_records,
}
with open(os.path.join(args.out_dir, "results.json"), "w", encoding="utf-8") as f:
    json.dump(res_json, f, indent=2)

# 8. Write numbers_sheet.md (STRICTLY TABLES, NO INTERPRETATION TEXT)
md_lines = [
    "# Numbers Sheet",
    "",
    "## 1. Item Bank Status Accounting",
    "",
    df_status.to_markdown(index=False),
    "",
    "## 2. Multi-Seed Base Performance Summary (5 Seeds)",
    "",
    df_base_summary.to_markdown(index=False),
    "",
    "## 3. Items Asked per Domain Sweep (5 Seeds)",
    "",
    df_k_summary.to_markdown(index=False),
    "",
    "## 4. Pace Sensitivity: Trained and Tested at Same Pace (5 Seeds)",
    "",
    df_pace_summary.to_markdown(index=False),
    "",
    "## 5. Stress Tests (5 Seeds: Mean and Range)",
    "",
    df_stress_sheet.to_markdown(index=False),
    "",
    "## 6. Leave-One-Simulator-Out Per-Factor Summary (Out-of-Distribution Only)",
    "",
    df_loso_factor_summary.to_markdown(index=False),
    "",
    "## 7. Leave-One-Simulator-Out Held-Out Summary (5 Seeds)",
    "",
    df_loso_sheet.to_markdown(index=False),
    "",
    "## 8. Full Leave-One-Simulator-Out Table (All Seeds)",
    "",
    df_all_loso[["seed", "held_out", "in_distribution", "single_simulator_auprc", "randomized_auprc", "diff", "prevalence"]].round(3).to_markdown(index=False),
]

sheet_content = "\n".join(md_lines)
with open(os.path.join(args.out_dir, "numbers_sheet.md"), "w", encoding="utf-8") as f:
    f.write(sheet_content)
print(sheet_content)
