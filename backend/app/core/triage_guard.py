"""Live Tiered Triage & Behavioral Guard Engine.
Integrates validated 3-tier clinical allocation and parental response guards
into the live production API and screening orchestration.
"""

from __future__ import annotations

import logging
from typing import Any

from data.generator.item_bank import ITEM_BANK

logger = logging.getLogger(__name__)

# Map item_id to typical age and domain
ITEM_METADATA: dict[str, dict[str, Any]] = {
    item.item_id: {
        "typical_age_months": float(item.typical_age_months),
        "domain": str(item.domain),
        "text": str(item.text),
    }
    for item in ITEM_BANK
}

# Calibrated triage probability thresholds from 5-seed validation
# Top 15% high-risk capacity for direct clinic referral
TAU_DIRECT_REFER = 0.111
# Borderline sensitivity cutoff catching >= 85% of true delayed children
TAU_REFLEX_MONITOR = 0.021


def evaluate_response_guards(
    age_months: float,
    answers: dict[str, int],
) -> tuple[dict[str, bool], list[str]]:
    """
    Evaluates parental response reliability during screening:
    1. Acquiescence Guard: Detects positive reporting halo on out-of-age items (>= age + 6m).
    2. Inconsistency Guard: Detects Guttman inversions (failing past basic items while passing advanced).

    Returns:
        (guard_flags, guard_advisories)
    """
    forward_total = 0
    forward_endorsed = 0
    inversions = 0

    # Group answers by domain to test ordinal progression
    domain_items: dict[str, list[tuple[float, int]]] = {}

    for item_id, ans_val in answers.items():
        if item_id not in ITEM_METADATA:
            continue
        try:
            val = int(ans_val)
        except (ValueError, TypeError):
            continue

        meta = ITEM_METADATA[item_id]
        typ_age = meta["typical_age_months"]
        dom = meta["domain"]

        # Check forward milestone ceiling endorsement (milestone is >= 6 months ahead)
        if typ_age >= age_months + 6.0:
            forward_total += 1
            if val >= 2:
                forward_endorsed += 1

        if dom not in domain_items:
            domain_items[dom] = []
        domain_items[dom].append((typ_age, val))

    # Evaluate Guttman scale consistency within each domain
    for dom, pairs in domain_items.items():
        if len(pairs) < 2:
            continue
        # Sort by typical milestone emergence age
        sorted_pairs = sorted(pairs, key=lambda x: x[0])
        for i in range(len(sorted_pairs) - 1):
            for j in range(i + 1, len(sorted_pairs)):
                earlier_age, earlier_score = sorted_pairs[i]
                later_age, later_score = sorted_pairs[j]
                # Inversion: earlier milestone is 0 (not yet), but later milestone is 2 (often/always)
                if (
                    earlier_score == 0
                    and later_score >= 2
                    and (later_age - earlier_age >= 4.0)
                ):
                    inversions += 1

    acquiescence_suspect = bool(
        forward_total >= 2 and (forward_endorsed / forward_total) >= 0.60
    )
    inconsistency_suspect = bool(inversions >= 2)

    guard_flags = {
        "acquiescence": acquiescence_suspect,
        "inconsistency": inconsistency_suspect,
    }

    guard_advisories: list[str] = []
    if acquiescence_suspect:
        guard_advisories.append(
            "Caregiver reporting pattern shows positive ceiling responses to advanced out-of-age milestones. "
            "Scores may reflect positive reporting halo; recommend visual activity verification."
        )
    if inconsistency_suspect:
        guard_advisories.append(
            "Caregiver responses contain inverted milestone attainments (failing foundational skills while passing advanced). "
            "Verification recommended to rule out survey misunderstanding."
        )

    return guard_flags, guard_advisories


def evaluate_live_tiered_triage(
    prob_refer: float,
    safety_override: bool = False,
    domain_scores: dict[str, float] | None = None,
) -> tuple[str, bool, list[str]]:
    """
    Evaluates 3-Tier Clinical Triage allocation:
      - Tier 3: Direct Referral (Immediate Clinic Specialist)
      - Tier 2: Reflex-Branch (Automated Module B micro-tests within app)
      - Tier 1: Routine Pass (Reassured & scheduled for standard milestone interval)

    Returns:
        (triage_tier, reflex_branch_recommended, target_reflex_domains)
    """
    target_domains: list[str] = []
    if domain_scores:
        # Identify domains with low or borderline scores
        # Domain scores are in [0, 1]
        sorted_domains = sorted(domain_scores.items(), key=lambda kv: kv[1])
        target_domains = [d for d, s in sorted_domains if s < 0.60]
        if not target_domains and sorted_domains:
            # If all are >= 0.60 but child is borderline, select the lowest scoring domain
            target_domains = [sorted_domains[0][0]]

    # 1. Direct Clinical Referral (Tier 3)
    # Triggered by deterministic clinical safety flags or high multivariate risk
    if safety_override or prob_refer >= TAU_DIRECT_REFER:
        return "Tier 3: Direct Referral", False, target_domains

    # 2. Reflex-Branch to Module B (Tier 2)
    # Triggered by ambiguous/borderline risk (tau_monitor) or isolated domain dips
    has_isolated_dip = bool(
        domain_scores and any(s <= 0.35 for s in domain_scores.values())
    )
    if prob_refer >= TAU_REFLEX_MONITOR or has_isolated_dip:
        return "Tier 2: Reflex-Branch", True, target_domains

    # 3. Routine Pass (Tier 1)
    return "Tier 1: Routine Pass", False, []
