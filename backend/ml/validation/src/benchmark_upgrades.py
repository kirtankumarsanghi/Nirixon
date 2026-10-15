"""Benchmark evaluating the 4 core enhancements:
1. 0/1/2 frequency scale IRT vs binary IRT
2. Empirical WHO age-varying pace vs fixed pace
3. 3-tier clinical triage vs single one-shot cut
4. Acquiescence & Inconsistency guards
"""

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

from config import SimConfig
from evaluate import refer_at, refer_auprc, threshold_for_recall
from sim_v2 import features, load_items, simulate
from stress import new_model
from tiered_triage import evaluate_tiered_triage


def run_benchmark():
    cfg_base = SimConfig()
    cfg_freq = SimConfig(
        response_scale="frequency", pace_mode="empirical", enable_guards=True
    )
    items = load_items("data/item_source.csv", cfg_base.domains)
    seeds = [10, 42, 100, 200, 300]

    base_auprcs = []
    freq_auprcs = []
    base_rec15 = []
    freq_rec15 = []
    base_flag85 = []
    freq_flag85 = []

    # Triage metrics
    triage_refer_share = []
    triage_reflex_share = []
    triage_total_recall = []
    triage_direct_recall = []
    triage_flood_reduction = []

    for s in seeds:
        # 1. Baseline Binary Model
        tr_b = simulate(cfg_base, items, 8000, s)
        va_b = simulate(cfg_base, items, 4000, s + 1)
        te_b = simulate(cfg_base, items, 5000, s + 2)

        m_b = new_model(seed=s).fit(features(tr_b), tr_b["status"])
        p_va_b = m_b.predict_proba(features(va_b))[:, 2]
        p_te_b = m_b.predict_proba(features(te_b))[:, 2]

        thr_b = threshold_for_recall(va_b["status"], p_va_b, 0.85)
        at_b = refer_at(te_b["status"], p_te_b, thr_b)

        base_auprcs.append(refer_auprc(te_b["status"], p_te_b))
        y_ref_b = te_b["status"] == 2
        top15_b = np.argsort(-p_te_b)[: int(0.15 * len(p_te_b))]
        base_rec15.append(y_ref_b[top15_b].sum() / y_ref_b.sum())
        base_flag85.append(at_b["flagged_share"])

        # 2. Upgraded 0/1/2 Frequency Scale + Empirical Pace Model
        tr_f = simulate(cfg_freq, items, 8000, s)
        va_f = simulate(cfg_freq, items, 4000, s + 1)
        te_f = simulate(cfg_freq, items, 5000, s + 2)

        m_f = new_model(seed=s).fit(features(tr_f), tr_f["status"])
        p_va_f = m_f.predict_proba(features(va_f))[:, 2]
        p_te_f = m_f.predict_proba(features(te_f))[:, 2]

        thr_f = threshold_for_recall(va_f["status"], p_va_f, 0.85)
        at_f = refer_at(te_f["status"], p_te_f, thr_f)

        freq_auprcs.append(refer_auprc(te_f["status"], p_te_f))
        y_ref_f = te_f["status"] == 2
        top15_f = np.argsort(-p_te_f)[: int(0.15 * len(p_te_f))]
        freq_rec15.append(y_ref_f[top15_f].sum() / y_ref_f.sum())
        freq_flag85.append(at_f["flagged_share"])

        # 3. Tiered Triage on the Upgraded Model
        tri = evaluate_tiered_triage(
            te_f["status"], p_te_f, direct_refer_target=0.15, total_recall_target=0.85
        )
        triage_refer_share.append(tri["direct_refer_share"])
        triage_reflex_share.append(tri["reflex_branch_share"])
        triage_direct_recall.append(tri["direct_refer_recall"])
        triage_total_recall.append(tri["total_refer_recall"])
        triage_flood_reduction.append(tri["clinic_flood_reduction"])

    # Summary
    print("\n=======================================================")
    print("      UPGRADE IMPACT BENCHMARK (5 SEEDS SUMMARY)")
    print("=======================================================")

    df_comp = pd.DataFrame(
        [
            {
                "Metric": "ML Refer AUPRC Mean",
                "Baseline (Binary 0/1, Fixed Pace)": f"{np.mean(base_auprcs):.3f}",
                "Upgraded (Frequency 0/1/2, Empirical Pace)": f"{np.mean(freq_auprcs):.3f}",
                "Impact": f"{np.mean(freq_auprcs) - np.mean(base_auprcs):+.3f}",
            },
            {
                "Metric": "Recall @ 15% Flagged Share",
                "Baseline (Binary 0/1, Fixed Pace)": f"{np.mean(base_rec15):.1%}",
                "Upgraded (Frequency 0/1/2, Empirical Pace)": f"{np.mean(freq_rec15):.1%}",
                "Impact": f"{np.mean(freq_rec15) - np.mean(base_rec15):+.1%}",
            },
            {
                "Metric": "Flagged Share Needed for 85% Recall",
                "Baseline (Binary 0/1, Fixed Pace)": f"{np.mean(base_flag85):.1%}",
                "Upgraded (Frequency 0/1/2, Empirical Pace)": f"{np.mean(freq_flag85):.1%}",
                "Impact": f"{np.mean(freq_flag85) - np.mean(base_flag85):+.1%}",
            },
        ]
    )
    print("\n--- 1. Information & Sensitivity Gain ---")
    print(df_comp.to_markdown(index=False))

    df_triage = pd.DataFrame(
        [
            {
                "Triage Tier": "Tier 3: Direct Referral (Immediate Clinic)",
                "Cohort Share": f"{np.mean(triage_refer_share):.1%}",
                "Refer Cases Caught": f"{np.mean(triage_direct_recall):.1%}",
            },
            {
                "Triage Tier": "Tier 2: Reflex-Branch (Automated Module B)",
                "Cohort Share": f"{np.mean(triage_reflex_share):.1%}",
                "Refer Cases Caught": f"{np.mean(triage_total_recall) - np.mean(triage_direct_recall):.1%}",
            },
            {
                "Triage Tier": "Combined Triage Sensitivity",
                "Cohort Share": f"{np.mean(triage_refer_share) + np.mean(triage_reflex_share):.1%}",
                "Refer Cases Caught": f"{np.mean(triage_total_recall):.1%}",
            },
            {
                "Triage Tier": "Tier 1: Routine Pass (Discharged)",
                "Cohort Share": f"{1.0 - (np.mean(triage_refer_share) + np.mean(triage_reflex_share)):.1%}",
                "Refer Cases Caught": f"{1.0 - np.mean(triage_total_recall):.1%}",
            },
        ]
    )
    print("\n--- 2. Formalized Tiered Triage Yield ---")
    print(df_triage.to_markdown(index=False))
    print(
        f"\nClinic Workload Reduction: {np.mean(triage_flood_reduction):.1%} of screened children spared from manual clinic visits."
    )


if __name__ == "__main__":
    run_benchmark()
