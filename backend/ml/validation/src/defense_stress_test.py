"""Adversarial Distribution-Shift & Stress-Testing Defense.
Directly addresses faculty concerns regarding circular synthetic data training:
Trains ML model on standard data, then stress-tests it on 5 hostile, mismatched
real-world environments that violate the training generator's assumptions.
"""
import os
import sys
import numpy as np
import pandas as pd
from dataclasses import replace

sys.path.insert(0, os.path.dirname(__file__))

from config import SimConfig
from sim_v2 import load_items, simulate, features
from baseline import fit_norms, predict
from evaluate import refer_auprc, threshold_for_recall, refer_at
from tiered_triage import evaluate_tiered_triage
from stress import new_model


def run_defense_stress_tests(seeds=(10, 42, 100)):
    cfg_train = SimConfig(response_scale="frequency", pace_mode="empirical", enable_guards=True)
    items = load_items("data/item_source.csv", cfg_train.domains)

    # 5 Adversarial Evaluation Environments:
    test_environments = [
        {
            "name": "1. In-Distribution (Matched Baseline)",
            "cfg": cfg_train,
            "hypothesis": "Nominal operational environment with empirical WHO pace."
        },
        {
            "name": "2. High Parental Acquiescence (Over-reporting Halo)",
            "cfg": replace(cfg_train, yes_bias_share=0.35, flip_rate=0.20),
            "hypothesis": "Parents over-report capabilities and guess positively on 35% of children."
        },
        {
            "name": "3. Severe Caregiver Noise (5x Slip / Inattention)",
            "cfg": replace(cfg_train, slip=0.25),
            "hypothesis": "Low literacy, fatigue, or rushed survey filling creates 25% random noise."
        },
        {
            "name": "4. Domain Decoupling (Isolated Domain Deficits)",
            "cfg": replace(cfg_train, g_weight=0.05),
            "hypothesis": "Multi-domain correlation collapses to near zero; delays are purely isolated."
        },
        {
            "name": "5. Compressed Developmental Pacing (Slow Pace)",
            "cfg": replace(cfg_train, pace_mode="fixed", pace=0.08),
            "hypothesis": "Developmental differentiation between typical and delayed is severely compressed."
        }
    ]

    all_rows = []

    for env in test_environments:
        env_name = env["name"]
        cfg_env = env["cfg"]

        ml_auprcs = []
        asq_auprcs = []
        ml_rec15s = []
        asq_rec15s = []
        guard_acq_flags = []
        guard_incons_flags = []

        for s in seeds:
            # 1. Train ML model and ASQ-3 norms on STANDARD training data (never sees perturbed distribution during training!)
            tr = simulate(cfg_train, items, 8000, s)
            va = simulate(cfg_train, items, 4000, s + 1)
            clf = new_model(seed=s).fit(features(tr), tr["status"])
            norms = fit_norms(tr["age_used"], tr["domain_scores"], tr["status"])

            # 2. Test strictly on the PERTURBED, HOSTILE test environment
            te = simulate(cfg_env, items, 5000, s + 2)
            y_refer = (te["status"] == 2)
            n_refer = int(y_refer.sum())

            # ML Predictions
            p_ml = clf.predict_proba(features(te))[:, 2]
            auprc_ml = refer_auprc(te["status"], p_ml)
            ml_auprcs.append(auprc_ml)

            # ML Recall @ 15% Flagged Share
            top15_ml = np.argsort(-p_ml)[:int(0.15 * len(p_ml))]
            ml_rec15s.append(y_refer[top15_ml].sum() / n_refer if n_refer > 0 else 0.0)

            # ASQ-3 Baseline Predictions
            asq_tier, asq_risk = predict(te["age_used"], te["domain_scores"], norms)
            auprc_asq = refer_auprc(te["status"], asq_risk)
            asq_auprcs.append(auprc_asq)

            # ASQ-3 Recall @ 15% Flagged Share
            top15_asq = np.argsort(-asq_risk)[:int(0.15 * len(asq_risk))]
            asq_rec15s.append(y_refer[top15_asq].sum() / n_refer if n_refer > 0 else 0.0)

            # Guard detections
            if "guards" in te:
                guard_acq_flags.append(float(te["guards"]["acquiescence_suspect"].mean()))
                guard_incons_flags.append(float(te["guards"]["inconsistency_suspect"].mean()))
            else:
                guard_acq_flags.append(0.0)
                guard_incons_flags.append(0.0)

        mean_ml_auprc = np.mean(ml_auprcs)
        mean_asq_auprc = np.mean(asq_auprcs)
        delta_auprc = mean_ml_auprc - mean_asq_auprc
        mean_ml_rec = np.mean(ml_rec15s)
        mean_asq_rec = np.mean(asq_rec15s)
        delta_rec = mean_ml_rec - mean_asq_rec

        all_rows.append({
            "Perturbed Test Environment": env_name,
            "ML AUPRC": f"{mean_ml_auprc:.3f}",
            "ASQ-3 AUPRC": f"{mean_asq_auprc:.3f}",
            "AUPRC Advantage (Delta)": f"{delta_auprc:+.3f}",
            "ML Recall@15%": f"{mean_ml_rec * 100:.1f}%",
            "ASQ Recall@15%": f"{mean_asq_rec * 100:.1f}%",
            "Recall Advantage": f"{delta_rec * 100:+.1f}%",
            "Acquiescence Guard Flagged": f"{np.mean(guard_acq_flags) * 100:.1f}%"
        })

    df_out = pd.DataFrame(all_rows)
    print("\n" + "=" * 100)
    print("      ADVERSARIAL DISTRIBUTION-SHIFT DEFENSE (TRAINED ON CLEAN, TESTED ON HOSTILE)")
    print("=" * 100)
    print(df_out.to_string(index=False))
    print("=" * 100)
    return df_out


if __name__ == "__main__":
    run_defense_stress_tests()
