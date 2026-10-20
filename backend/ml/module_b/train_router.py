"""Train and honestly evaluate the Module B router.

Run: python src/train_router.py

Evaluation sets (never trained on):
  * test      : 3,000 generator texts whose clause paraphrase-groups were never seen in training
  * handwritten: 76 independent notes written by hand (the more trustworthy number)
Thresholds are tuned on `val` only.
"""

import json
import os
import random
import sys
import time

SEED = 42
os.environ["PYTHONHASHSEED"] = str(SEED)
random.seed(SEED)

import numpy as np

np.random.seed(SEED)
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import FeatureUnion

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "app", "core", "module_b")
    ),
)
from router_b import DOMAINS, LABELS, RULEOUTS, DomainRouter, rule_scan

DATA = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "artifacts", "module_b_router")
)
os.makedirs(ART, exist_ok=True)


def prf(y, p):
    tp = int(((y == 1) & (p == 1)).sum())
    fp = int(((y == 0) & (p == 1)).sum())
    fn = int(((y == 1) & (p == 0)).sum())
    pr = tp / (tp + fp) if tp + fp else 0.0
    rc = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
    return pr, rc, f1, int(y.sum())


def evaluate(name, df, router, mode):
    """mode: clf | rules | blend"""
    texts = df.text.tolist()
    Y = df[LABELS].values
    if mode == "clf":
        P = router.predict_proba(texts)
        pred = np.array(
            [
                [int(P[i, j] >= router.thr[l]) for j, l in enumerate(LABELS) if True]
                for i in range(len(texts))
            ]
        )
        pred = pred.copy()
        # safety by classifier threshold used at deployment
        sj = LABELS.index("safety")
        pred[:, sj] = (P[:, sj] >= router.safety_clf_thr).astype(int)
        unclear_pred = np.array(
            [
                int(
                    pred[
                        i, [LABELS.index(l) for l in DOMAINS + RULEOUTS + ["safety"]]
                    ].sum()
                    == 0
                )
                for i in range(len(texts))
            ]
        )
    elif mode == "rules":
        pred = np.zeros_like(Y)
        for i, t in enumerate(texts):
            hits, saf = rule_scan(t)
            for l in hits:
                pred[i, LABELS.index(l)] = 1
            if saf:
                pred[i, LABELS.index("safety")] = 1
        unclear_pred = np.array(
            [
                int(
                    pred[
                        i, [LABELS.index(l) for l in DOMAINS + RULEOUTS + ["safety"]]
                    ].sum()
                    == 0
                )
                for i in range(len(texts))
            ]
        )
    else:
        policy = "rules_primary" if mode == "rules_primary" else "blend"
        pred = np.zeros_like(Y)
        unclear_pred = np.zeros(len(texts), dtype=int)
        for i, t in enumerate(texts):
            r = router.route(t, policy=policy)
            for l in r.flagged:
                pred[i, LABELS.index(l)] = 1
            pred[i, LABELS.index("safety")] = int(r.safety)
            unclear_pred[i] = int(r.unclear)
    rows = {}
    for j, l in enumerate(LABELS):
        rows[l] = prf(Y[:, j], pred[:, j])
    dom_idx = [LABELS.index(l) for l in DOMAINS]
    # micro over the 8 functioning domains
    tp = int(((Y[:, dom_idx] == 1) & (pred[:, dom_idx] == 1)).sum())
    fp = int(((Y[:, dom_idx] == 0) & (pred[:, dom_idx] == 1)).sum())
    fn = int(((Y[:, dom_idx] == 1) & (pred[:, dom_idx] == 0)).sum())
    mp, mr = tp / max(1, tp + fp), tp / max(1, tp + fn)
    mf = 2 * mp * mr / max(1e-9, mp + mr)
    # "routing usefulness": share of rows with >=1 true domain where >=1 true domain is flagged
    has_true = Y[:, dom_idx].sum(1) > 0
    hit = ((Y[:, dom_idx] == 1) & (pred[:, dom_idx] == 1)).any(1)
    any_hit = float(hit[has_true].mean()) if has_true.any() else float("nan")
    uy = df.is_unclear.values
    up, ur, _uf, _ = prf(uy, unclear_pred)
    sp, sr, _sf, sn = rows["safety"]
    return {
        "name": name,
        "mode": mode,
        "n": len(df),
        "domain_micro_P": round(mp, 3),
        "domain_micro_R": round(mr, 3),
        "domain_micro_F1": round(mf, 3),
        "any_true_domain_flagged": round(any_hit, 3),
        "unclear_P": round(up, 3),
        "unclear_R": round(ur, 3),
        "n_unclear": int(uy.sum()),
        "safety_P": round(sp, 3),
        "safety_R": round(sr, 3),
        "n_safety": sn,
        "per_label": {
            l: {
                "P": round(v[0], 3),
                "R": round(v[1], 3),
                "F1": round(v[2], 3),
                "n": v[3],
            }
            for l, v in rows.items()
        },
    }


def main():
    t0 = time.time()
    d = pd.read_csv(os.path.join(DATA, "parent_text_dataset_full.csv"))
    hw = pd.read_csv(os.path.join(DATA, "handwritten_eval_b.csv"))
    tr, va, te = (
        d[d.split == s].reset_index(drop=True) for s in ("train", "val", "test")
    )
    print("train/val/test/hand:", len(tr), len(va), len(te), len(hw))

    vec = FeatureUnion(
        [
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(2, 5),
                    min_df=3,
                    sublinear_tf=True,
                    lowercase=True,
                    max_features=250000,
                ),
            ),
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=2,
                    sublinear_tf=True,
                    lowercase=True,
                    token_pattern=r"(?u)\b\w+\b",
                ),
            ),
        ]
    )
    Xtr = vec.fit_transform(tr.text)
    clf = OneVsRestClassifier(
        LogisticRegression(
            C=6.0,
            max_iter=3000,
            solver="liblinear",
            class_weight="balanced",
            random_state=SEED,
        ),
        n_jobs=1,
    )
    clf.fit(Xtr, tr[LABELS].values)
    print("fit done %.1fs" % (time.time() - t0))

    # thresholds tuned on val only
    Pv = clf.predict_proba(vec.transform(va.text))
    thr = {}
    for j, l in enumerate(LABELS):
        best, bt = -1, 0.5
        for t in np.arange(0.05, 0.86, 0.025):
            f = prf(va[l].values, (Pv[:, j] >= t).astype(int))[2]
            if f > best:
                best, bt = f, float(t)
        thr[l] = round(bt, 3)
    print("thresholds:", thr)

    router = DomainRouter(
        vec, clf, thr, safety_clf_thr=0.30, rule_boost=True, policy="rules_primary"
    )
    router.save(os.path.join(ART, "router_b.joblib"))

    results = []
    sets = [("val", va), ("test(all, unseen)", te)]
    for o in ("seed_gen", "bank_en", "lex_hr_hi"):
        sets.append((f"test:{o}", te[te.origin == o].reset_index(drop=True)))
    for lg in ("en", "hr", "hi"):
        sets.append((f"test:lang={lg}", te[te.lang == lg].reset_index(drop=True)))
    sets.append(("handwritten(independent)", hw))
    for nm, df in sets:
        for mode in ("rules", "clf", "blend", "rules_primary"):
            results.append(evaluate(nm, df, router, mode))

    print(
        "\n%-26s %-6s %6s %6s %6s %8s | unclear P/R | safety P/R"
        % ("set", "mode", "domP", "domR", "domF1", "anyHit")
    )
    for r in results:
        print(
            "%-26s %-6s %6.3f %6.3f %6.3f %8.3f | %.2f/%.2f (n=%d) | %.2f/%.2f (n=%d)"
            % (
                r["name"],
                r["mode"],
                r["domain_micro_P"],
                r["domain_micro_R"],
                r["domain_micro_F1"],
                r["any_true_domain_flagged"],
                r["unclear_P"],
                r["unclear_R"],
                r["n_unclear"],
                r["safety_P"],
                r["safety_R"],
                r["n_safety"],
            )
        )
    with open(os.path.join(ART, "router_metrics.json"), "w") as f:
        json.dump(results, f, indent=1)
    print("saved artifacts. total %.1fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
