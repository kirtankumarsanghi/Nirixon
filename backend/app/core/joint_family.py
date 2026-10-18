"""
Joint family concordance analysis and combination rules.

Specifications:
- Up to 3 secondary respondents (single-use, expiring link, no account).
- Answers stored separately with role labels (NO personal names).
- Concordance index computed per item and overall, with a list of disagreements.
- Combination rule:
    * The most concerning answer across all respondents feeds the safety rule.
    * The primary caregiver's answers feed the statistical ML model.
- Disagreements and follow-up prompts are presented for clinician review.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from data.generator.item_bank import ITEM_BANK
from data.generator.item_bank_b import MODULE_B_ITEM_BANK, RULE_OUT_ITEMS

from app.core.session import ScreeningSession

# Fast lookup for item metadata
ALL_ITEMS_MAP: dict[str, Any] = {item.item_id: item for item in ITEM_BANK}
ALL_ITEMS_MAP.update({item.item_id: item for item in MODULE_B_ITEM_BANK})
ALL_ITEMS_MAP.update({item.item_id: item for item in RULE_OUT_ITEMS})

RULE_OUT_ITEM_IDS: frozenset[str] = frozenset(item.item_id for item in RULE_OUT_ITEMS)


def _get_item_scale_range(item_id: str) -> float:
    """Scale range for concordance normalization (max_val - min_val)."""
    if item_id in ("regression_flag", "family_history_flag"):
        return 1.0  # binary 0 or 1
    if item_id in RULE_OUT_ITEM_IDS:
        return 2.0  # 0, 1, 2
    item = ALL_ITEMS_MAP.get(item_id)
    if item is not None and getattr(item, "response_type", None) == "likert5":
        return 4.0  # 1 to 5 scale
    return 2.0  # Default ASQ-3 3-point scale (0, 1, 2)


def get_most_concerning_value(item_id: str, values: list[int]) -> tuple[int, int]:
    """
    Returns (most_concerning_value, index_in_values).

    Clinical concern direction:
    - regression_flag: 1 (lost skill) > 0 (no loss) -> higher is more concerning.
    - family_history_flag: 1 (positive) > 0 (negative) -> higher is more concerning.
    - milestone items (ASQ-3): 0 (Not yet) < 1 (Sometimes) < 2 (Consistently) -> lower is more concerning.
    - Module B symptoms & rule-out: higher values represent higher frequency / positive flag -> higher is more concerning.
    """
    if not values:
        return (0, 0)

    if item_id in ("regression_flag", "family_history_flag") or item_id in RULE_OUT_ITEM_IDS:
        max_val = max(values)
        idx = values.index(max_val)
        return (max_val, idx)

    # Standard developmental milestone: lower score indicates greater developmental delay
    min_val = min(values)
    idx = values.index(min_val)
    return (min_val, idx)


def generate_follow_up_prompt(item_id: str, domain: str, discrepancy_roles: list[str]) -> str:
    """Generates an actionable follow-up prompt for clinicians to probe during consultations."""
    roles_str = " and ".join(discrepancy_roles)
    if item_id == "regression_flag":
        return (
            f"CRITICAL SAFETY INQUIRY: Detailed developmental history required. Explore the exact "
            f"timeline and nature of any skill loss observed by {roles_str}."
        )

    domain_lower = domain.lower()
    if "communicat" in domain_lower or "language" in domain_lower:
        return (
            f"Inquire about communicative gestures and verbalization differences between settings "
            f"(e.g. quiet 1-on-1 interaction with {roles_str} vs noisy group environments)."
        )
    if "motor" in domain_lower:
        return (
            f"Clarify motor performance across varied surfaces and footwear reported by {roles_str} "
            f"(e.g. playground/running vs structured tasks at home)."
        )
    if "problem" in domain_lower or "cognit" in domain_lower:
        return (
            f"Ask what physical prompts or toy materials were used when {roles_str} observed the child."
        )
    if "social" in domain_lower or "personal" in domain_lower:
        return (
            f"Probe social engagement routines and stranger anxiety differences observed between {roles_str}."
        )

    return (
        f"Ask caregivers to compare routines and environmental factors that might account for "
        f"divergence between {roles_str}."
    )


@dataclass
class ItemDisagreement:
    item_id: str
    domain: str
    question_text: str
    primary_answer: int
    respondent_answers: list[dict[str, Any]]  # [{"role_label": str, "answer": int}]
    max_delta: int
    most_concerning_answer: int
    most_concerning_role: str
    follow_up_prompt: str


@dataclass
class ItemConcordance:
    item_id: str
    domain: str
    primary_answer: int
    secondary_answers: dict[str, int]
    is_concordant: bool
    concordance_score: float
    exact_match_ratio: float
    most_concerning_value: int


@dataclass
class ConcordanceAnalysis:
    overall_concordance: float
    exact_agreement_pct: float
    total_overlapping_items: int
    respondent_count: int
    roles: list[str]
    item_concordance: list[ItemConcordance]
    disagreements: list[ItemDisagreement]


def compute_joint_concordance(
    primary_answers: dict[str, int],
    respondent_submissions: list[dict[str, Any]],
) -> ConcordanceAnalysis:
    """
    Computes concordance statistics and disagreement items across respondents.

    Mathematical definition:
    - Item concordance = 1.0 - (MAD / scale_range)
    - Overall concordance = mean(item_concordances)
    - Exact agreement % = percentage of ratings identical to primary rating
    """
    if not respondent_submissions:
        return ConcordanceAnalysis(
            overall_concordance=1.0,
            exact_agreement_pct=100.0,
            total_overlapping_items=0,
            respondent_count=0,
            roles=[],
            item_concordance=[],
            disagreements=[],
        )

    roles = [str(r.get("role_label", f"Respondent {i+1}")) for i, r in enumerate(respondent_submissions)]
    item_records: list[ItemConcordance] = []
    disagreements: list[ItemDisagreement] = []

    # Find all items answered by primary and at least one secondary respondent
    all_respondent_keys: set[str] = set()
    for r in respondent_submissions:
        all_respondent_keys.update(r.get("answers", {}).keys())

    common_item_ids = [iid for iid in primary_answers if iid in all_respondent_keys]

    total_concordance_sum = 0.0
    total_exact_match_ratio_sum = 0.0

    for item_id in common_item_ids:
        p_val = primary_answers[item_id]
        sec_answers: dict[str, int] = {}
        sec_list: list[dict[str, Any]] = []
        r_vals: list[int] = []

        for r in respondent_submissions:
            role = str(r.get("role_label", "Secondary Caregiver"))
            ans_dict = r.get("answers", {})
            if item_id in ans_dict:
                val = int(ans_dict[item_id])
                sec_answers[role] = val
                sec_list.append({"role_label": role, "answer": val})
                r_vals.append(val)

        if not r_vals:
            continue

        scale = _get_item_scale_range(item_id)
        mad = sum(abs(p_val - rv) for rv in r_vals) / len(r_vals)
        item_score = max(0.0, min(1.0, 1.0 - (mad / scale)))
        exact_matches = sum(1 for rv in r_vals if rv == p_val)
        exact_ratio = exact_matches / len(r_vals)

        total_concordance_sum += item_score
        total_exact_match_ratio_sum += exact_ratio

        # Determine most concerning answer
        all_vals = [p_val] + r_vals
        all_roles = ["Primary Caregiver"] + [s["role_label"] for s in sec_list]
        most_conc_val, most_conc_idx = get_most_concerning_value(item_id, all_vals)
        most_conc_role = all_roles[most_conc_idx]

        is_concordant = all(rv == p_val for rv in r_vals)
        max_delta = max(abs(p_val - rv) for rv in r_vals)

        item_meta = ALL_ITEMS_MAP.get(item_id)
        domain = getattr(item_meta, "domain", "general")
        q_text = getattr(item_meta, "question_text", f"Question item: {item_id}")

        item_records.append(
            ItemConcordance(
                item_id=item_id,
                domain=domain,
                primary_answer=p_val,
                secondary_answers=sec_answers,
                is_concordant=is_concordant,
                concordance_score=round(item_score, 4),
                exact_match_ratio=round(exact_ratio, 4),
                most_concerning_value=most_conc_val,
            )
        )

        if not is_concordant:
            discrepancy_roles = ["Primary Caregiver"] + [
                s["role_label"] for s in sec_list if s["answer"] != p_val
            ]
            disagreements.append(
                ItemDisagreement(
                    item_id=item_id,
                    domain=domain,
                    question_text=q_text,
                    primary_answer=p_val,
                    respondent_answers=sec_list,
                    max_delta=max_delta,
                    most_concerning_answer=most_conc_val,
                    most_concerning_role=most_conc_role,
                    follow_up_prompt=generate_follow_up_prompt(item_id, domain, discrepancy_roles),
                )
            )

    n_items = len(item_records)
    overall_concordance = round(total_concordance_sum / n_items, 4) if n_items > 0 else 1.0
    exact_agreement_pct = round((total_exact_match_ratio_sum / n_items) * 100.0, 1) if n_items > 0 else 100.0

    return ConcordanceAnalysis(
        overall_concordance=overall_concordance,
        exact_agreement_pct=exact_agreement_pct,
        total_overlapping_items=n_items,
        respondent_count=len(respondent_submissions),
        roles=roles,
        item_concordance=item_records,
        disagreements=disagreements,
    )


def apply_joint_combination_rule(
    session: ScreeningSession,
    respondent_submissions: list[dict[str, Any]],
    ml_prediction: Any,
) -> tuple[bool, str | None, str, str | None]:
    """
    Applies the joint family combination rule:
    1. The primary caregiver's answers feed the statistical ML model.
       (Passed in via ml_prediction; ML output features reflect primary answers).
    2. The most concerning answer across ALL respondents feeds the safety rule.

    Returns:
    (safety_override_triggered, override_rule, final_classification, safety_source)
    """
    # Baseline from model run on primary caregiver
    safety_override = bool(ml_prediction.safety_override_triggered)
    override_rule = ml_prediction.override_rule
    final_classification = ml_prediction.final_classification
    safety_source: str | None = "primary_caregiver" if safety_override else None

    # Check all secondary respondents for safety-critical inputs
    for r in respondent_submissions:
        role = str(r.get("role_label", "Secondary Caregiver"))
        r_answers = r.get("answers", {})

        # Rule 1: Skill regression flag reported by any respondent
        if r_answers.get("regression_flag") == 1:
            safety_override = True
            override_rule = "regression_flag"
            final_classification = "Refer"
            safety_source = f"secondary_respondent ({role})"
            break

        # Rule 2: Module B rule-out positive flag reported by any respondent
        for ro_id in RULE_OUT_ITEM_IDS:
            if r_answers.get(ro_id) == 2:
                safety_override = True
                override_rule = f"rule_out ({ro_id})"
                final_classification = "Refer"
                safety_source = f"secondary_respondent ({role})"
                break
        if safety_override and safety_source != "primary_caregiver":
            break

    return (safety_override, override_rule, final_classification, safety_source)
