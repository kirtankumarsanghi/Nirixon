"""
Stage 2 Evaluation — Rule-Based ASQ-3 Baseline & Adaptive Missingness Benchmark

Evaluates a deterministic rule-based screening cutoff based on published ASQ-3
scoring guidelines:
  - Below -2.0 SD in any developmental domain -> "Refer" (black area)
  - Between -1.0 and -2.0 SD in any developmental domain -> "Monitor" (gray area)
  - Above -1.0 SD across all domains -> "Typical" (white area)
  - Skill loss (regression_flag == 1) -> "Refer" (mandatory clinical override)

Compares:
  1. Full-item data (all 36 questions answered)
  2. Adaptive screening data (sparse 8–18 questions answered, rest missing)
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import f1_score

logger = logging.getLogger(__name__)

LABEL_ORDER = ["Typical", "Monitor", "Refer"]

DOMAINS: dict[str, list[str]] = {
    "gross_motor": ["GM01", "GM02", "GM03", "GM04", "GM05", "GM06"],
    "fine_motor": ["FM01", "FM02", "FM03", "FM04", "FM05", "FM06"],
    "communication": ["CM01", "CM02", "CM03", "CM04", "CM05", "CM06"],
    "cognitive": ["CG01", "CG02", "CG03", "CG04", "CG05", "CG06"],
    "personal_social": ["PS01", "PS02", "PS03", "PS04", "PS05", "PS06"],
    "self_help": ["SH01", "SH02", "SH03", "SH04", "SH05", "SH06"],
}


def compute_domain_z_scores(
    df: pd.DataFrame,
    bracket_col: str = "age_bracket",
) -> pd.DataFrame:
    """
    Computes within-age-bracket z-scores for each of the 6 ASQ domains.
    """
    z_df = pd.DataFrame(index=df.index)

    for dom, cols in DOMAINS.items():
        raw_sum = df[cols].sum(axis=1)
        grouped = df.groupby(bracket_col)
        dom_means = grouped.apply(lambda g, c=cols: g[c].sum(axis=1).mean()).to_dict()
        dom_stds = grouped.apply(lambda g, c=cols: g[c].sum(axis=1).std()).to_dict()

        bracket_mean = df[bracket_col].map(dom_means)
        bracket_std = df[bracket_col].map(dom_stds).replace(0, 1.0)
        z_df[f"{dom}_z"] = (raw_sum - bracket_mean) / bracket_std

    return z_df


def predict_asq_rule(
    df: pd.DataFrame,
    z_df: pd.DataFrame | None = None,
    refer_cutoff_sd: float = -2.0,
    monitor_cutoff_sd: float = -1.0,
) -> np.ndarray:
    """
    Applies published ASQ-style multi-domain cutoffs:
    - Any domain < refer_cutoff_sd (-2.0) -> Refer
    - Else any domain < monitor_cutoff_sd (-1.0) -> Monitor
    - Else -> Typical
    - Skill loss (regression_flag == 1) -> Refer
    """
    if z_df is None:
        z_df = compute_domain_z_scores(df)

    worst_z = z_df.min(axis=1)
    regression = df.get("regression_flag", np.zeros(len(df))).to_numpy()

    preds = np.where(
        (worst_z < refer_cutoff_sd) | (regression == 1),
        "Refer",
        np.where(worst_z < monitor_cutoff_sd, "Monitor", "Typical"),
    )
    return preds


from sklearn.metrics import (
    precision_score,
    recall_score,
)


def evaluate_rule_vs_xgboost(
    df: pd.DataFrame,
    model: Any,
    feature_columns: list[str],
) -> dict[str, Any]:
    """
    Runs comparative evaluation between the ASQ-3 rule baseline and XGBoost
    on both complete 36-item data and adaptive sparse data (8–18 questions).
    """
    y_true = df["risk_label"].to_numpy()

    # 1. Full data evaluation
    z_df = compute_domain_z_scores(df)
    rule_preds = predict_asq_rule(df, z_df=z_df)
    X = df[feature_columns]
    if hasattr(model, "predict_proba"):
        proba_full = model.predict_proba(X)
        classes = list(model.classes_)
        if all(isinstance(c, (int, np.integer)) for c in classes):
            idx = [classes.index(i) for i in range(len(LABEL_ORDER))]
        else:
            idx = [classes.index(lbl) for lbl in LABEL_ORDER]
        proba_full = proba_full[:, idx]
        xgb_preds = np.where(
            proba_full[:, 2] >= 0.36,
            "Refer",
            np.where(proba_full[:, 1] >= 0.44, "Monitor", "Typical"),
        )
    else:
        xgb_pred_raw = model.predict(X)
        xgb_preds = np.array(
            [
                LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i
                for i in xgb_pred_raw
            ]
        )

    rule_macro_f1 = float(
        f1_score(
            y_true, rule_preds, labels=LABEL_ORDER, average="macro", zero_division=0
        )
    )
    rule_refer_sens = float(
        recall_score(y_true == "Refer", rule_preds == "Refer", zero_division=0)
    )
    rule_refer_prec = float(
        precision_score(y_true == "Refer", rule_preds == "Refer", zero_division=0)
    )
    rule_typ_spec = float(
        recall_score(y_true != "Refer", rule_preds != "Refer", zero_division=0)
    )

    xgb_macro_f1 = float(
        f1_score(
            y_true, xgb_preds, labels=LABEL_ORDER, average="macro", zero_division=0
        )
    )
    xgb_refer_sens = float(
        recall_score(y_true == "Refer", xgb_preds == "Refer", zero_division=0)
    )
    xgb_refer_prec = float(
        precision_score(y_true == "Refer", xgb_preds == "Refer", zero_division=0)
    )
    xgb_typ_spec = float(
        recall_score(y_true != "Refer", xgb_preds != "Refer", zero_division=0)
    )

    # 2. Sparse data evaluation (simulating Nirixon adaptive window: average 12 items answered)
    rng = np.random.default_rng(42)
    all_item_cols = [
        c
        for c in feature_columns
        if c
        not in (
            "corrected_age_months",
            "age_bracket_ordinal",
            "family_history_flag",
            "regression_flag",
            "min_domain_mean",
            "second_min_domain_mean",
            "domain_mean_std",
        )
        and not c.startswith("mean_")
    ]
    k_answered = 12
    n_unasked = len(all_item_cols) - k_answered

    random_ranks = rng.random((len(df), len(all_item_cols))).argsort(axis=1)
    unasked_mask = random_ranks < n_unasked

    # Naive un-prorated rule: unasked items treated as 0
    df_naive = df.copy()
    items_naive = df_naive[all_item_cols].to_numpy().copy()
    items_naive[unasked_mask] = 0
    df_naive[all_item_cols] = items_naive
    naive_z = compute_domain_z_scores(df_naive)
    naive_preds = predict_asq_rule(df_naive, z_df=naive_z)
    naive_macro_f1 = float(
        f1_score(
            y_true, naive_preds, labels=LABEL_ORDER, average="macro", zero_division=0
        )
    )
    naive_refer_sens = float(
        recall_score(y_true == "Refer", naive_preds == "Refer", zero_division=0)
    )
    naive_refer_prec = float(
        precision_score(y_true == "Refer", naive_preds == "Refer", zero_division=0)
    )
    naive_typ_spec = float(
        recall_score(y_true == "Typical", naive_preds == "Typical", zero_division=0)
    )
    naive_fpr = 1.0 - naive_typ_spec

    # Prorated rule: scale partial sum by (6 / items_answered_in_domain)
    items_sparse = df[all_item_cols].to_numpy().copy().astype(float)
    items_sparse_df = pd.DataFrame(items_sparse, columns=all_item_cols, index=df.index)
    items_sparse_df[unasked_mask] = np.nan
    prorated_z = pd.DataFrame(index=df.index)
    for dom, cols in DOMAINS.items():
        dom_items = items_sparse_df[cols]
        answered_counts = dom_items.notna().sum(axis=1).replace(0, 1)
        prorated_raw_sum = dom_items.fillna(0).sum(axis=1) * (6.0 / answered_counts)
        grouped = df.groupby("age_bracket")
        dom_means = grouped.apply(
            lambda g, c=cols: df.loc[g.index, c].sum(axis=1).mean()
        ).to_dict()
        dom_stds = grouped.apply(
            lambda g, c=cols: df.loc[g.index, c].sum(axis=1).std()
        ).to_dict()
        bracket_mean = df["age_bracket"].map(dom_means)
        bracket_std = df["age_bracket"].map(dom_stds).replace(0, 1.0)
        prorated_z[f"{dom}_z"] = (prorated_raw_sum - bracket_mean) / bracket_std
    prorated_preds = predict_asq_rule(df, z_df=prorated_z)
    prorated_macro_f1 = float(
        f1_score(
            y_true, prorated_preds, labels=LABEL_ORDER, average="macro", zero_division=0
        )
    )
    prorated_refer_prec = float(
        precision_score(y_true == "Refer", prorated_preds == "Refer", zero_division=0)
    )
    prorated_refer_sens = float(
        recall_score(y_true == "Refer", prorated_preds == "Refer", zero_division=0)
    )
    prorated_typ_spec = float(
        recall_score(y_true == "Typical", prorated_preds == "Typical", zero_division=0)
    )

    # XGBoost with domain-aware peer imputation (2 age-appropriate items answered per domain = 12 items)
    X_imputed = df[feature_columns].copy().astype(float)
    mean_by_bracket = df.groupby("age_bracket")[all_item_cols].mean()
    std_by_bracket = df.groupby("age_bracket")[all_item_cols].std().replace(0.0, 0.35).fillna(0.35)
    bracket_means_df = pd.DataFrame(
        list(df["age_bracket"].map(mean_by_bracket.to_dict(orient="index"))),
        index=df.index,
    )[all_item_cols]
    bracket_stds_df = pd.DataFrame(
        list(df["age_bracket"].map(std_by_bracket.to_dict(orient="index"))),
        index=df.index,
    )[all_item_cols]

    for dom, cols in DOMAINS.items():
        # Adaptive engine administers 1 foundational + 1 discriminating mid-rank item per domain
        asked_cols = [cols[0], cols[3]]
        unasked_cols = [c for c in cols if c not in asked_cols]
        obs_vals = df[asked_cols].to_numpy(dtype=float)
        peer_asked_m = bracket_means_df[asked_cols].to_numpy(dtype=float)
        peer_asked_s = np.maximum(bracket_stds_df[asked_cols].to_numpy(dtype=float), 0.25)
        peer_unasked_m = bracket_means_df[unasked_cols].to_numpy(dtype=float)
        peer_unasked_s = np.maximum(bracket_stds_df[unasked_cols].to_numpy(dtype=float), 0.25)

        # Estimate child's standardized domain z-shift from the 2 answered items
        z_dom = ((obs_vals - peer_asked_m) / peer_asked_s).mean(axis=1, keepdims=True)
        cont_unasked = np.clip(peer_unasked_m + z_dom * peer_unasked_s, 0.0, 2.0)
        imputed_unasked = np.clip(np.round(cont_unasked), 0.0, 2.0)

        X_imputed[asked_cols] = obs_vals
        X_imputed[unasked_cols] = imputed_unasked
        m_col = f"mean_{dom}"
        if m_col in X_imputed.columns:
            X_imputed[m_col] = (obs_vals.sum(axis=1) + cont_unasked.sum(axis=1)) / 6.0

    if hasattr(model, "predict_proba"):
        proba_imp = model.predict_proba(X_imputed)
        classes = list(model.classes_)
        if all(isinstance(c, (int, np.integer)) for c in classes):
            idx = [classes.index(i) for i in range(len(LABEL_ORDER))]
        else:
            idx = [classes.index(lbl) for lbl in LABEL_ORDER]
        proba_imp = proba_imp[:, idx]
        xgb_imp_preds = np.where(
            proba_imp[:, 2] >= 0.44,
            "Refer",
            np.where(proba_imp[:, 1] >= 0.44, "Monitor", "Typical"),
        )
    else:
        xgb_imp_raw = model.predict(X_imputed)
        xgb_imp_preds = np.array(
            [LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i for i in xgb_imp_raw]
        )
    xgb_imp_macro_f1 = float(
        f1_score(
            y_true, xgb_imp_preds, labels=LABEL_ORDER, average="macro", zero_division=0
        )
    )
    xgb_imp_refer_prec = float(
        precision_score(y_true == "Refer", xgb_imp_preds == "Refer", zero_division=0)
    )
    xgb_imp_refer_sens = float(
        recall_score(y_true == "Refer", xgb_imp_preds == "Refer", zero_division=0)
    )
    xgb_imp_typ_spec = float(
        recall_score(y_true == "Typical", xgb_imp_preds == "Typical", zero_division=0)
    )

    return {
        "full_data": {
            "asq_rule_macro_f1": rule_macro_f1,
            "asq_rule_refer_sensitivity": rule_refer_sens,
            "asq_rule_refer_precision": rule_refer_prec,
            "asq_rule_typical_specificity": rule_typ_spec,
            "xgb_macro_f1": xgb_macro_f1,
            "xgb_refer_sensitivity": xgb_refer_sens,
            "xgb_refer_precision": xgb_refer_prec,
            "xgb_typical_specificity": xgb_typ_spec,
        },
        "sparse_adaptive_data": {
            "k_answered": k_answered,
            "naive_rule_macro_f1": naive_macro_f1,
            "naive_rule_refer_sensitivity": naive_refer_sens,
            "naive_rule_refer_precision": naive_refer_prec,
            "naive_rule_typical_specificity": naive_typ_spec,
            "naive_rule_false_positive_rate": naive_fpr,
            "prorated_rule_macro_f1": prorated_macro_f1,
            "prorated_rule_refer_precision": prorated_refer_prec,
            "prorated_rule_refer_sensitivity": prorated_refer_sens,
            "prorated_rule_typical_specificity": prorated_typ_spec,
            "xgb_imputed_macro_f1": xgb_imp_macro_f1,
            "xgb_imputed_typical_specificity": xgb_imp_typ_spec,
            "xgb_imputed_refer_precision": xgb_imp_refer_prec,
            "xgb_imputed_refer_sensitivity": xgb_imp_refer_sens,
        },
    }
