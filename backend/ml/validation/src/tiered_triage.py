"""Tiered Clinical Triage Architecture (Pass / Reflex-Branch / Refer).
Eliminates clinic flooding by routing borderline cases into automated Module B reflex questions."""
import numpy as np
import pandas as pd


def evaluate_tiered_triage(y_status, risk_scores, direct_refer_target=0.15, total_recall_target=0.85):
    """
    Evaluates a 3-tier triage system:
      - Tier 0: Pass (Routine checkup)
      - Tier 1: Reflex-Branch to Module B (Borderline/Monitor)
      - Tier 2: Direct Clinical Referral (High Risk)
      
    Parameters:
      y_status: (n,) array of true labels (0=Typical, 1=Monitor, 2=Refer)
      risk_scores: (n,) array of continuous Refer risk probabilities
      direct_refer_target: Max fraction of total cohort allowed for direct clinic referral (e.g., 0.15)
      total_recall_target: Target combined recall (e.g., 0.85 of true Refer cases identified)
      
    Returns:
      Dictionary of triage thresholds and operational outcomes.
    """
    n = len(risk_scores)
    y_refer = (y_status == 2)
    n_refer = int(y_refer.sum())

    # 1. Direct Refer selection (sets direct clinic load to direct_refer_target even with ties)
    k_refer = int(round(direct_refer_target * n))
    order = np.argsort(-risk_scores)
    direct_refer_mask = np.zeros(n, dtype=bool)
    if k_refer > 0:
        direct_refer_mask[order[:k_refer]] = True
        tau_refer = float(risk_scores[order[k_refer - 1]])
    else:
        tau_refer = 1.0

    # 2. Monitor Threshold (catches total_recall_target of true Refer cases)
    pos_risk = np.sort(risk_scores[y_refer])
    k_mon = int(np.floor((1.0 - total_recall_target) * len(pos_risk)))
    tau_monitor = float(min(pos_risk[k_mon], tau_refer))

    # 3. Assign Tiers
    tier = np.zeros(n, dtype=int)
    tier[risk_scores >= tau_monitor] = 1   # Reflex-Branch
    tier[direct_refer_mask] = 2            # Direct Refer

    # 4. Compute Operational Yields
    direct_refer_share = float((tier == 2).mean())
    reflex_branch_share = float((tier == 1).mean())
    pass_share = float((tier == 0).mean())

    direct_refer_detected = int((y_refer & (tier == 2)).sum())
    reflex_detected = int((y_refer & (tier == 1)).sum())
    total_detected = direct_refer_detected + reflex_detected

    direct_refer_recall = direct_refer_detected / n_refer if n_refer > 0 else 0.0
    total_refer_recall = total_detected / n_refer if n_refer > 0 else 0.0
    direct_refer_precision = direct_refer_detected / (tier == 2).sum() if (tier == 2).sum() > 0 else 0.0

    # Clinic flood reduction: share of un-referred children spared from clinical visits
    clinic_flood_reduction = 1.0 - direct_refer_share

    return {
        "tau_refer": float(tau_refer),
        "tau_monitor": float(tau_monitor),
        "direct_refer_share": direct_refer_share,
        "reflex_branch_share": reflex_branch_share,
        "pass_share": pass_share,
        "direct_refer_recall": direct_refer_recall,
        "total_refer_recall": total_refer_recall,
        "direct_refer_precision": direct_refer_precision,
        "clinic_flood_reduction": clinic_flood_reduction,
        "tier_assignments": tier,
    }
