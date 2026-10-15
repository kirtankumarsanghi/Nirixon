"""Stress tests and leave-one-simulator-out (Module A plan, step 7; robustness steps 2-3)."""

import itertools
from dataclasses import replace

import numpy as np
import pandas as pd
from baseline import fit_norms, predict
from evaluate import refer_at, refer_auprc, threshold_for_recall
from sim_v2 import features, simulate
from xgboost import XGBClassifier

# (name, config override). Prevalence rows change the hidden-status mix, not the answers.
SCENARIOS = [
    ("base", {}),
    ("answer flip 5%", {"flip_rate": 0.05}),
    ("answer flip 10%", {"flip_rate": 0.10}),
    ("answer flip 20%", {"flip_rate": 0.20}),
    ("yes-sayers 20%", {"yes_bias_share": 0.20}),
    ("yes-sayers 30%", {"yes_bias_share": 0.30}),
    ("Refer 12%", {"target_mix": (0.68, 0.20, 0.12)}),
    ("Refer 15%", {"target_mix": (0.65, 0.20, 0.15)}),
    ("pace 0.08", {"pace": 0.08}),
    ("pace 0.25", {"pace": 0.25}),
    ("domain corr 0.4", {"g_weight": 0.4}),
    ("domain corr 0.8", {"g_weight": 0.8}),
    ("wrong age 10%", {"preterm_error_share": 0.10}),
]


def assert_distinct_seeds(tr_seed, va_seed, te_seed):
    if len({tr_seed, va_seed, te_seed}) != 3:
        raise ValueError(
            f"train ({tr_seed}), validation ({va_seed}), and test ({te_seed}) seeds must all be different"
        )


def test_distinct_seeds():
    assert_distinct_seeds(10, 11, 12)
    try:
        assert_distinct_seeds(10, 10, 12)
        raise AssertionError("Expected ValueError for duplicate seeds, none raised")
    except ValueError:
        pass


test_distinct_seeds()


def new_model(seed=0):
    return XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=400,
        max_depth=5,
        learning_rate=0.1,
        random_state=seed,
        eval_metric="mlogloss",
    )


def fit_all(cfg, items, n_train=8000, seed=0):
    assert_distinct_seeds(seed, seed + 1, seed + 2)
    tr = simulate(cfg, items, n_train, seed)
    model = new_model(seed=seed).fit(features(tr), tr["status"])
    norms = fit_norms(tr["age"], tr["domain_scores"], tr["status"])
    va = simulate(cfg, items, 4000, seed + 1)
    ml_thr = threshold_for_recall(va["status"], model.predict_proba(features(va))[:, 2])
    _, rule_va = predict(va["age"], va["domain_scores"], norms)
    rule_thr = threshold_for_recall(va["status"], rule_va)
    return model, norms, ml_thr, rule_thr


def run_stress(cfg, items, n_test=5000, seed=0):
    assert_distinct_seeds(seed, seed + 1, seed + 2)
    model, norms, ml_thr, rule_thr = fit_all(cfg, items, seed=seed)
    rows = []
    for name, over in SCENARIOS:
        c = replace(cfg, **over)
        te = simulate(c, items, n_test, seed + 2)
        ml = model.predict_proba(features(te))[:, 2]
        _, rule = predict(te["age"], te["domain_scores"], norms)
        a = refer_at(te["status"], ml, ml_thr)
        b = refer_at(te["status"], rule, rule_thr)
        rows.append(
            {
                "scenario": name,
                "refer_prevalence": (te["status"] == 2).mean(),
                "ml_auprc": refer_auprc(te["status"], ml),
                "rule_auprc": refer_auprc(te["status"], rule),
                "ml_recall": a["recall"],
                "ml_precision": a["precision"],
                "ml_flagged": a["flagged_share"],
                "rule_recall": b["recall"],
                "rule_precision": b["precision"],
                "rule_flagged": b["flagged_share"],
            }
        )
    return pd.DataFrame(rows)


# Leave-one-simulator-out: train on a mixture of simulators that EXCLUDES one setting, test on it.
FACTORS = {
    "pace": [0.08, 0.15, 0.25],
    "flip_rate": [0.0, 0.05, 0.10],
    "yes_bias_share": [0.05, 0.15, 0.25],
    "g_weight": [0.4, 0.6, 0.8],
}


def run_loso(cfg, items, rows_per_setting=1500, n_test=5000, seed=0):
    assert_distinct_seeds(seed, seed + 1, seed + 2)
    out = []
    for factor, values in FACTORS.items():
        for held in values:
            in_dist = (factor == "pace" and held == 0.15) or (
                factor == "flip_rate" and held == 0.0
            )
            allowed = {
                k: ([v for v in vs if not (k == factor and v == held)])
                for k, vs in FACTORS.items()
            }
            X, y = [], []
            for i, combo in enumerate(itertools.product(*allowed.values())):
                if i % 3:  # subsample combinations to keep runtime small
                    continue
                c = replace(cfg, **dict(zip(allowed.keys(), combo)))
                s = simulate(c, items, rows_per_setting, seed + 1000 + i)
                X.append(features(s))
                y.append(s["status"])
            rand_model = new_model(seed=seed).fit(np.vstack(X), np.concatenate(y))
            base = new_model(seed=seed).fit(
                *(lambda s: (features(s), s["status"]))(
                    simulate(cfg, items, 8000, seed)
                )
            )
            te = simulate(replace(cfg, **{factor: held}), items, n_test, seed + 2)
            out.append(
                {
                    "held_out": f"{factor}={held}",
                    "in_distribution": in_dist,
                    "single_simulator_auprc": refer_auprc(
                        te["status"], base.predict_proba(features(te))[:, 2]
                    ),
                    "randomized_auprc": refer_auprc(
                        te["status"], rand_model.predict_proba(features(te))[:, 2]
                    ),
                    "prevalence": (te["status"] == 2).mean(),
                }
            )
    return pd.DataFrame(out)
