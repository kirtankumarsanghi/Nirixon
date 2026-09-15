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
from collections import Counter

import pandas as pd

# Allow imports from the generator — use absolute path from this file
from data.generator.item_bank import DOMAINS, ITEM_BANK, Item
from data.generator.item_bank_b import (
    MODULE_B_DOMAINS,
    MODULE_B_ITEM_BANK,
    MODULE_B_ITEM_BY_ID,
    MODULE_B_ITEMS_BY_DOMAIN,
)

from .safety_floor import MIN_DOMAINS_COVERED, MIN_DOMAINS_COVERED_B, _domains_with_real_answer
from .session import MANDATORY_IDS, NextQuestion, ScreeningSession

DATA_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "../../data/processed/screening_data_items.csv"
    )
)
DATA_PATH_B = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__), "../../data/processed/screening_data_module_b.csv"
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
    Round-robin fallback: pick the item from the domain that has been
    answered the least so far.

    Works for both Module A (filters by age-appropriate domain items) and
    Module B (filters by detected-domain items). Returns item_id or None.
    """
    if session.module == "B":
        domain_list = session.detected_domains or MODULE_B_DOMAINS
        item_by_id = MODULE_B_ITEM_BY_ID
        items_by_domain = MODULE_B_ITEMS_BY_DOMAIN
    else:
        domain_list = DOMAINS
        item_by_id = ITEM_BY_ID
        items_by_domain = ITEMS_BY_DOMAIN

    # Count how many non-mandatory items have been answered per domain
    domain_answered_count: dict[str, int] = {d: 0 for d in domain_list}
    for item_id in session.answers:
        if item_id in item_by_id:
            dom = item_by_id[item_id].domain
            if dom in domain_answered_count:
                domain_answered_count[dom] += 1

    candidate_set = set(candidate_ids)
    candidate_items = [item_by_id[iid] for iid in candidate_ids if iid in item_by_id]

    # Sort domains by least answered, break ties by domain list order (stable)
    sorted_domains = sorted(domain_list, key=lambda d: domain_answered_count.get(d, 0))

    for domain in sorted_domains:
        domain_candidates = [
            item
            for item in candidate_items
            if item.domain == domain and item.item_id in candidate_set
        ]
        if not domain_candidates:
            continue
        # Module A: pick item closest to child's age.
        # Module B: all items are age-agnostic; pick first in stable order.
        if session.module == "A":
            best = min(
                domain_candidates,
                key=lambda item: abs(item.typical_age_months - session.corrected_age_months),
            )
        else:
            best = domain_candidates[0]
        return best.item_id

    return None


def _restrict_to_uncovered_domains(
    session: ScreeningSession, candidate_ids: list[str]
) -> list[str]:
    """
    While domain-coverage floor is unmet, only consider items from domains
    that do not yet have a real answer.

    Module A: uses ITEM_BY_ID (age-bracket items).
    Module B: uses MODULE_B_ITEM_BY_ID (domain-filtered items).
    """
    covered = _domains_with_real_answer(session)
    min_domains = MIN_DOMAINS_COVERED

    if len(covered) >= min_domains:
        return candidate_ids

    active_item_by_id = MODULE_B_ITEM_BY_ID if session.module == "B" else ITEM_BY_ID
    uncovered = [
        iid
        for iid in candidate_ids
        if iid in active_item_by_id and active_item_by_id[iid].domain not in covered
    ]
    return uncovered if uncovered else candidate_ids


def next_question(session: ScreeningSession, data_path: str = DATA_PATH) -> str | None:
    """
    Returns the item_id of the next question to ask, or None if the
    candidate pool is fully exhausted (all items answered).

    Module A: candidates are filtered by age bracket (existing logic).
    Module B: candidates are filtered by NLP-detected domains.
    Both modules then use the same MI scoring and domain-quota fallback.
    """
    if session.module == "B":
        return _next_question_b(session, data_path=DATA_PATH_B)

    # --- Module A (unchanged) ---
    all_item_ids = {item.item_id for item in ITEM_BANK}
    mandatory_set = set(MANDATORY_IDS)

    already_asked = set(session.answers.keys()) | set(session.mandatory_answered.keys())
    candidate_ids = [
        iid
        for iid in all_item_ids
        if iid not in already_asked
        and iid not in mandatory_set
        and session.age_bracket in ITEM_BY_ID[iid].valid_brackets
    ]

    if not candidate_ids:
        return None

    candidate_ids = _restrict_to_uncovered_domains(session, candidate_ids)

    df = pd.read_csv(data_path)

    for item_id, answer_val in session.answers.items():
        if item_id in df.columns:
            df = df[df[item_id] == answer_val]

    if len(df) < MIN_SUBPOP:
        return _domain_quota_fallback(session, candidate_ids)

    mi_scores: dict[str, float] = {}
    for item_id in candidate_ids:
        if item_id in df.columns:
            mi_scores[item_id] = _mutual_information(df[item_id], df["risk_label"])

    if not mi_scores or max(mi_scores.values()) == 0.0:
        return _domain_quota_fallback(session, candidate_ids)

    return max(mi_scores.keys(), key=lambda k: mi_scores[k])


def _next_question_b(session: ScreeningSession, data_path: str = DATA_PATH_B) -> str | None:
    """
    Module B item selection with answer-driven follow-ons.

    1. Limit candidates to NLP-detected domains (or all eight if none).
    2. Cap depth per domain from the answers so far:
         - high concern (any Often / high mean) → dig deeper (follow-ons)
         - moderate → a few more probes
         - low / all Never → one probe then move on
    3. Prefer uncovered domains until the coverage floor is met.
    4. Prefer domains that still need follow-ons after a concerning answer.
    5. If a Module B CSV exists, break ties with mutual information.
    """
    active_domains = (
        list(session.detected_domains)
        if session.detected_domains
        else list(MODULE_B_DOMAINS)
    )
    already_asked = set(session.answers.keys()) | set(session.mandatory_answered.keys())

    domain_answers: dict[str, list[int]] = {d: [] for d in active_domains}
    for iid, val in session.answers.items():
        if iid not in MODULE_B_ITEM_BY_ID:
            continue
        dom = MODULE_B_ITEM_BY_ID[iid].domain
        if dom in domain_answers:
            domain_answers[dom].append(val)

    def max_items_for_domain(domain: str) -> int:
        vals = domain_answers.get(domain, [])
        if not vals:
            return 2  # initial probe pair
        mean = sum(vals) / len(vals)
        peak = max(vals)
        # Concerning answers open follow-on depth in that domain
        if peak >= 2 or mean >= 1.25:
            return 5
        if mean >= 0.5 or peak >= 1:
            return 3
        return 1  # reassuring answers — do not keep asking the same area

    covered = {d for d, vals in domain_answers.items() if vals}
    floor_met = len(covered) >= MIN_DOMAINS_COVERED_B

    # Build remaining candidates that are still within their depth budget
    candidate_ids: list[str] = []
    for domain in active_domains:
        answered_n = len(domain_answers.get(domain, []))
        if answered_n >= max_items_for_domain(domain):
            continue
        for item in MODULE_B_ITEMS_BY_DOMAIN.get(domain, []):
            if item.item_id not in already_asked:
                candidate_ids.append(item.item_id)

    if not candidate_ids:
        # Depth caps exhausted but floor unmet — allow one more from uncovered
        if not floor_met:
            for domain in active_domains:
                if domain in covered:
                    continue
                for item in MODULE_B_ITEMS_BY_DOMAIN.get(domain, []):
                    if item.item_id not in already_asked:
                        return item.item_id
        return None

    # Priority: hot follow-ons after a concerning answer, then uncovered domains
    def domain_priority(domain: str) -> tuple[int, int, int]:
        vals = domain_answers.get(domain, [])
        hot_follow = 0
        # Only dig deeper when the latest answer in this domain was concerning
        if (
            vals
            and vals[-1] >= 2
            and len(vals) < max_items_for_domain(domain)
        ):
            hot_follow = -1
        uncovered = 0 if domain not in covered else 1
        return (hot_follow, uncovered, len(vals))

    sorted_domains = sorted(active_domains, key=domain_priority)

    # Prefer MI when CSV is available, but only among the top-priority domain pool
    priority_domain = None
    for domain in sorted_domains:
        domain_cands = [
            iid
            for iid in candidate_ids
            if MODULE_B_ITEM_BY_ID[iid].domain == domain
        ]
        if domain_cands:
            priority_domain = domain
            candidate_ids = domain_cands
            break

    if priority_domain is None:
        return None

    # Within the chosen domain, try MI if CSV exists
    import os as _os

    if _os.path.isfile(data_path):
        df = pd.read_csv(data_path)
        for item_id, answer_val in session.answers.items():
            if item_id in df.columns:
                df = df[df[item_id] == answer_val]
        if len(df) >= MIN_SUBPOP:
            mi_scores: dict[str, float] = {}
            for item_id in candidate_ids:
                if item_id in df.columns:
                    mi_scores[item_id] = _mutual_information(
                        df[item_id], df["risk_label"]
                    )
            if mi_scores and max(mi_scores.values()) > 0.0:
                return max(mi_scores.keys(), key=lambda k: mi_scores[k])

    # Deterministic follow-on: next unanswered item in stable bank order
    for item in MODULE_B_ITEMS_BY_DOMAIN.get(priority_domain, []):
        if item.item_id in candidate_ids:
            return item.item_id

    return candidate_ids[0] if candidate_ids else None


def build_next_question_response(
    session: ScreeningSession,
    item_id: str,
) -> NextQuestion:
    """Wraps a chosen item_id into a NextQuestion response object.

    Works for both modules: looks up the item in the appropriate bank.
    """
    if session.module == "B" and item_id in MODULE_B_ITEM_BY_ID:
        item = MODULE_B_ITEM_BY_ID[item_id]
    else:
        item = ITEM_BY_ID[item_id]
    return NextQuestion(
        item_id=item_id,
        question_text=item.text,
        domain=item.domain,
        question_number=session.real_answer_count + 1,
        question_cap=session.question_cap,
    )
