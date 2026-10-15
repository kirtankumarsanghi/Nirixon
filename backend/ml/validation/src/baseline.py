"""ASQ-style rule baseline (Module A plan, step 6).
Per age bracket and domain: mean and SD from simulated typical children; flag Refer below -2 SD and
Monitor between -1 and -2 SD; the child's tier is the worst domain. Do NOT copy ASQ-3's own cutoff
tables (copyrighted); these norms come from YOUR simulated or real typical children."""

import numpy as np


def fit_norms(age, scores, status, width=6.0):
    norms = {}
    for b in range(int(np.ceil(65 / width))):
        lo = b * width
        m = (age >= lo) & (age < lo + width) & (status == 0)
        if m.sum() >= 20:
            norms[b] = (scores[m].mean(0), scores[m].std(0) + 1e-6)
    return norms


def predict(age, scores, norms, width=6.0, refer_z=-2.0, monitor_z=-1.0):
    n = len(age)
    min_z = np.zeros(n)
    bins = np.clip((age // width).astype(int), 0, max(norms))
    for b in np.unique(bins):
        mu, sd = norms.get(b, norms[min(norms, key=lambda k: abs(k - b))])
        mk = bins == b
        min_z[mk] = ((scores[mk] - mu) / sd).min(1)
    tier = np.where(min_z < refer_z, 2, np.where(min_z < monitor_z, 1, 0))
    return tier, -min_z  # -min_z is a continuous risk score (higher = riskier)
