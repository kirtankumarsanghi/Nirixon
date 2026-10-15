"""Information check: compare Refer AUPRC across feature representations and item counts.
Task 4: Prints the results and nothing else.
"""
import os
import sys
from dataclasses import replace
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from config import SimConfig
from sim_v2 import load_items, simulate, features
from evaluate import refer_auprc
from stress import new_model

def run_info_check():
    cfg = SimConfig()
    items = load_items("data/item_source.csv", cfg.domains)

    # Base experiment: train 8000, test 5000 (fixed seeds 10 and 12)
    tr = simulate(cfg, items, 8000, 10)
    te = simulate(cfg, items, 5000, 12)

    # (a) 7 domain-score features (age_used + 6 domain scores)
    m_domain = new_model(seed=0).fit(features(tr, "domain"), tr["status"])
    p_domain = m_domain.predict_proba(features(te, "domain"))[:, 2]
    auprc_domain = refer_auprc(te["status"], p_domain)

    # (b) raw item answers plus age (features(sim, "raw"): age_used + 18 binary answers)
    m_raw = new_model(seed=0).fit(features(tr, "raw"), tr["status"])
    p_raw = m_raw.predict_proba(features(te, "raw"))[:, 2]
    auprc_raw = refer_auprc(te["status"], p_raw)

    # (c) items asked per domain (K = 2, 3, 6; note: K=9 requires >= 9 items per domain in bank)
    k_results = {}
    for k in [2, 3, 6]:
        c_k = replace(cfg, items_asked_per_domain=k)
        tr_k = simulate(c_k, items, 8000, 10)
        te_k = simulate(c_k, items, 5000, 12)
        m_k = new_model(seed=0).fit(features(tr_k, "domain"), tr_k["status"])
        p_k = m_k.predict_proba(features(te_k, "domain"))[:, 2]
        k_results[k] = refer_auprc(te_k["status"], p_k)

    print(f"(a) 7 domain-score features Refer AUPRC: {auprc_domain:.4f}")
    print(f"(b) Raw item answers plus age Refer AUPRC: {auprc_raw:.4f}")
    print("(c) Items asked per domain (domain scores):")
    for k, score in k_results.items():
        print(f"    K={k} ({k*6} items): Refer AUPRC = {score:.4f}")

if __name__ == "__main__":
    run_info_check()
