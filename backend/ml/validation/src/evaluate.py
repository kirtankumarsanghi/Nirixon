"""Metrics with uncertainty (Module A plan, step 8)."""
import numpy as np
from sklearn.metrics import average_precision_score, precision_score, recall_score


def wilson(k, n, z=1.96):
    if n == 0:
        return (np.nan, np.nan)
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (c - h, c + h)


def bootstrap(fn, *arrays, B=300, seed=0):
    rng = np.random.default_rng(seed)
    n = len(arrays[0])
    est = fn(*arrays)
    vals = []
    for _ in range(B):
        i = rng.integers(0, n, n)
        try:
            vals.append(fn(*[a[i] for a in arrays]))
        except ValueError:
            pass
    return est, float(np.nanpercentile(vals, 2.5)), float(np.nanpercentile(vals, 97.5))


def refer_auprc(y_status, risk):
    return average_precision_score(y_status == 2, risk)


def threshold_for_recall(y_status, risk, target=0.85):
    """Highest threshold whose Refer recall on this (validation) set is >= target."""
    pos = np.sort(risk[y_status == 2])
    k = int(np.floor((1 - target) * len(pos)))
    return pos[k]


def refer_at(y_status, risk, thr):
    pred = risk >= thr
    y = y_status == 2
    return dict(recall=recall_score(y, pred), precision=precision_score(y, pred, zero_division=0),
                flagged_share=float(pred.mean()))


def macro_auprc(y_status, proba):
    return float(np.mean([average_precision_score(y_status == k, proba[:, k]) for k in range(3)]))
