"""Validation guards: Acquiescence (ceiling distortion) and Inconsistency (Guttman scale violations).
Protects against parental reporting distortion without washing out valid model training."""
import numpy as np
import pandas as pd


def compute_guards(age_used, answers, items, domains, K=3):
    """
    Computes acquiescence and inconsistency indices per child.
    
    Parameters:
      age_used: (n,) array of chronological age used by app
      answers: (n, D, K) array of item responses (binary 0/1 or frequency 0/1/2)
      items: DataFrame containing item metadata
      domains: list/tuple of domain names
      K: items per domain
      
    Returns:
      DataFrame with columns:
        - acquiescence_score: continuous fraction of advanced milestones endorsed
        - acquiescence_suspect: 1.0 if parent endorses out-of-age milestones at ceiling
        - inconsistency_score: count of inverted milestone responses
        - inconsistency_suspect: 1.0 if multiple Guttman scale violations detected
    """
    n = len(age_used)
    D = len(domains)
    is_frequency = (answers > 1.0).any()
    max_val = 2.0 if is_frequency else 1.0

    acquiescence_scores = np.zeros(n)
    acquiescence_flags = np.zeros(n)
    inconsistency_counts = np.zeros(n)
    inconsistency_flags = np.zeros(n)

    for i in range(n):
        a_i = age_used[i]
        forward_total = 0
        forward_endorsed = 0
        inversions = 0

        for j, d in enumerate(domains):
            it = items[items.domain == d]
            a75 = it.age75_months.to_numpy()
            diff = np.abs(a75 - a_i)
            # Find the indices of items presented to child i
            presented_idx = np.argsort(diff)[:K]
            presented_a75 = a75[presented_idx]
            presented_ans = answers[i, j, :len(presented_idx)]

            for k_idx, item_age in enumerate(presented_a75):
                if np.isnan(presented_ans[k_idx]):
                    continue
                # Forward item check: milestone is >= 6 months ahead of child's age
                if item_age >= a_i + 6.0:
                    forward_total += 1
                    if presented_ans[k_idx] >= max_val:
                        forward_endorsed += 1

            # Inconsistency check: child fails backward milestone (< a_i - 6mo) but passes forward milestone
            valid_mask = ~np.isnan(presented_ans)
            if valid_mask.sum() >= 2:
                valid_a75 = presented_a75[valid_mask]
                valid_ans = presented_ans[valid_mask]
                sorted_order = np.argsort(valid_a75)
                sorted_ans = valid_ans[sorted_order]
                # If an earlier milestone has lower score than a strictly later milestone by full step
                for step_a in range(len(sorted_ans) - 1):
                    for step_b in range(step_a + 1, len(sorted_ans)):
                        if sorted_ans[step_a] == 0 and sorted_ans[step_b] >= max_val:
                            inversions += 1

        acq_rate = (forward_endorsed / forward_total) if forward_total > 0 else 0.0
        acquiescence_scores[i] = acq_rate
        acquiescence_flags[i] = 1.0 if (forward_total >= 2 and acq_rate >= 0.60) else 0.0

        inconsistency_counts[i] = inversions
        inconsistency_flags[i] = 1.0 if inversions >= 2 else 0.0

    return pd.DataFrame({
        "acquiescence_score": acquiescence_scores,
        "acquiescence_suspect": acquiescence_flags,
        "inconsistency_score": inconsistency_counts,
        "inconsistency_suspect": inconsistency_flags,
    })
