"""
Stage 3 — Adaptive Question Selection (Custom Information Gain)

Selects the next question to ask given the answers collected so far,
using a custom mutual-information calculator rather than sklearn's
DecisionTreeClassifier internals.

Why custom instead of sklearn tree reuse?
  sklearn's tree traversal encodes split thresholds fitted on the full
  training set; at inference time it would just follow a pre-baked path
  from the root regardless of which items have already been answered,
  which is not what "adaptive" means. The real requirement is: given the
  *current partial answer profile*, which unanswered item has the highest
  mutual information with risk_label *in the subpopulation that matches
  this child's answers so far*? That's a dynamic computation, not a
  fixed tree walk.

Algorithm:
  1. Load the Stage 1 CSV (per-request, as confirmed for Stage 3).
  2. Filter to rows that match the answers given so far (children who
     gave the same responses on the same items).
  3. Among the remaining (unanswered, non-mandatory) item columns, compute
     mutual information with risk_label for the filtered subpopulation.
  4. Return the highest-MI item as the next question.
  5. Fallback: if the filtered subpopulation is too small (< MIN_SUBPOP)
     or MI is uniformly zero (the tree has "run out of signal"), switch
     to the domain-quota fallback — pick the least-answered domain and
     return the age-appropriate item for that domain.

This is genuine adaptive branching, not sklearn tree traversal. The
performance cost of re-filtering 5,000 rows per question is negligible
at prototype scale.
"""

from __future__ import annotations

import math
import os
import sys
from collections import Counter

import pandas as pd

# Allow imports from the generator — use absolute path from this file
_GENERATOR_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/generator")
)
if _GENERATOR_PATH not in sys.path:
    sys.path.insert(0, _GENERATOR_PATH)
from item_bank import DOMAINS, ITEM_BANK, Item

from .session import MANDATORY_IDS, NextQuestion, ScreeningSession

DATA_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "../../data/processed/screening_data_items.csv"
    )
)

# Minimum subpopulation size to trust MI estimates; below this, fall back
# to domain-quota. Set low enough not to trigger too early on real data.
MIN_SUBPOP: int = 30

ITEM_BY_ID: dict[str, Item] = {item.item_id: item for item in ITEM_BANK}
ITEMS_BY_DOMAIN: dict[str, list[Item]] = {
    d: [item for item in ITEM_BANK if item.domain == d] for d in DOMAINS
}


def _mutual_information(series_x: pd.Series, series_y: pd.Series) -> float:
    """
    Computes mutual information I(X; Y) between two categorical series.
    Uses the standard formula: sum over (x,y) of P(x,y) * log(P(x,y) / P(x)P(y)).
    Returns 0.0 for uniform or constant distributions.
    """
    n = len(series_x)
    if n == 0:
        return 0.0

    joint = Counter(zip(series_x, series_y))
    px = Counter(series_x)
    py = Counter(series_y)

    mi = 0.0
    for (x, y), count in joint.items():
        p_xy = count / n
        p_x = px[x] / n
        p_y = py[y] / n
        if p_xy > 0 and p_x > 0 and p_y > 0:
            mi += p_xy * math.log(p_xy / (p_x * p_y))

    return mi


def _domain_quota_fallback(
    session: ScreeningSession, candidate_ids: list[str]
) -> str | None:
    """
    Round-robin fallback: pick the age-appropriate item from the domain
    that has been answered the least so far.

    Returns item_id of the chosen item, or None if all candidates are
    exhausted (should not happen under normal operation).
    """
    # Count how many non-mandatory, non-imputed items have been answered per domain
    domain_answered_count: dict[str, int] = {d: 0 for d in DOMAINS}
    for item_id in session.answers:
        if item_id in ITEM_BY_ID:
            domain_answered_count[ITEM_BY_ID[item_id].domain] += 1

    candidate_set = set(candidate_ids)
    candidate_items = [ITEM_BY_ID[iid] for iid in candidate_ids if iid in ITEM_BY_ID]

    # Sort domains by least answered, break ties by DOMAINS order (stable)
    sorted_domains = sorted(DOMAINS, key=lambda d: domain_answered_count[d])

    for domain in sorted_domains:
        domain_candidates = [
            item
            for item in candidate_items
            if item.domain == domain and item.item_id in candidate_set
        ]
        if not domain_candidates:
            continue
        # Within domain, pick item whose typical_age_months is closest to child's age
        best = min(
            domain_candidates,
            key=lambda item: abs(
                item.typical_age_months - session.corrected_age_months
            ),
        )
        return best.item_id

    return None


def next_question(session: ScreeningSession, data_path: str = DATA_PATH) -> str | None:
    """
    Returns the item_id of the next question to ask, or None if the
    candidate pool is fully exhausted (all items answered).

    Selection priority:
      1. Mandatory items (handled by mandatory_items.py — not this function)
      2. Highest MI item in the filtered subpopulation matching answers so far
      3. Domain-quota fallback if subpopulation too small or MI all zero
    """
    all_item_ids = {item.item_id for item in ITEM_BANK}
    mandatory_set = set(MANDATORY_IDS)

    already_asked = set(session.answers.keys()) | set(session.mandatory_answered.keys())
    candidate_ids = [
        iid
        for iid in all_item_ids
        if iid not in already_asked and iid not in mandatory_set
    ]

    if not candidate_ids:
        return None  # all items exhausted

    # Load Stage 1 data and filter to subpopulation matching current answers
    df = pd.read_csv(data_path)

    for item_id, answer_val in session.answers.items():
        if item_id in df.columns:
            df = df[df[item_id] == answer_val]

    if len(df) < MIN_SUBPOP:
        # Subpopulation too small — fall back to domain quota
        return _domain_quota_fallback(session, candidate_ids)

    # Compute MI for each candidate item against risk_label
    mi_scores: dict[str, float] = {}
    for item_id in candidate_ids:
        if item_id in df.columns:
            mi_scores[item_id] = _mutual_information(df[item_id], df["risk_label"])

    if not mi_scores or max(mi_scores.values()) == 0.0:
        # No information remaining — fall back to domain quota
        return _domain_quota_fallback(session, candidate_ids)

    return max(mi_scores, key=mi_scores.get)


def build_next_question_response(
    session: ScreeningSession,
    item_id: str,
) -> NextQuestion:
    """Wraps a chosen item_id into a NextQuestion response object."""
    item = ITEM_BY_ID[item_id]
    return NextQuestion(
        item_id=item_id,
        question_text=item.text,
        domain=item.domain,
        question_number=session.real_answer_count + 1,
        question_cap=session.question_cap,
    )
