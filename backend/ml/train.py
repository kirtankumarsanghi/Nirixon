"""
Stage 2 — Orchestrator

Loads the Stage 1 dataset, splits it, runs model comparison, calibrates
the winner, runs the full evaluation suite, fits the SHAP explainer, and
saves artifacts.

Run:
    cd backend/ml
    python3 train.py
"""

from __future__ import annotations

import os
import pickle
import sys

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

sys.path.insert(0, os.path.dirname(__file__))  # allow sibling-package imports when run directly

from columns import LABEL_ORDER, get_feature_columns, reorder_proba
from evaluation.ablation_study import print_ablation_comparison, run_ablation
from evaluation.fairness_check import print_fairness_result, run_fairness_check
from evaluation.metrics import compute_metrics, print_metrics
from evaluation.subgroup_sensitivity import (
    print_subgroup_tables,
    sensitivity_by_age_bin,
    sensitivity_by_family_history,
)
from explainability.shap_explainer import build_explainer, save_explainer
from models.calibration import calibrate_model
from models.model_comparison import run_grid_search

DATA_PATH = "../data/processed/screening_data_items.csv"
ARTIFACTS_DIR = "artifacts"

RANDOM_STATE = 42


def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    return df


def split_data(df: pd.DataFrame, feature_columns: list[str]):
    """
    3-way split: train (60%) / val (20%, used for model selection +
    calibration) / test (20%, touched only once, for final reporting).
    Stratified on risk_label so the rare Refer class doesn't get
    unevenly distributed across splits.
    """
    X = df[feature_columns]
    y = df["risk_label"]
    aux = df[["multilingual_home_flag", "age_months"]]  # carried alongside for fairness/subgroup checks

    X_train, X_temp, y_train, y_temp, aux_train, aux_temp = train_test_split(
        X, y, aux, test_size=0.4, stratify=y, random_state=RANDOM_STATE
    )
    X_val, X_test, y_val, y_test, aux_val, aux_test = train_test_split(
        X_temp, y_temp, aux_temp, test_size=0.5, stratify=y_temp, random_state=RANDOM_STATE
    )

    return {
        "train": (X_train, y_train, aux_train),
        "val": (X_val, y_val, aux_val),
        "test": (X_test, y_test, aux_test),
    }


def evaluate_candidate_on_val(search_result, X_val, y_val, feature_columns) -> float:
    """Returns macro AUPRC on validation set for a fitted GridSearchCV result."""
    best_estimator = search_result.best_estimator_
    proba = best_estimator.predict_proba(X_val)
    proba = reorder_proba(proba, best_estimator.classes_)
    preds_idx = proba.argmax(axis=1)
    preds = [LABEL_ORDER[i] for i in preds_idx]
    metrics = compute_metrics(y_val, preds, proba)
    return metrics["macro_auprc"]


def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    print("Loading data...")
    df = load_data()
    feature_columns = get_feature_columns(df)
    print(f"Feature columns ({len(feature_columns)}): {feature_columns}")

    splits = split_data(df, feature_columns)
    X_train, y_train, _aux_train = splits["train"]
    X_val, y_val, _aux_val = splits["val"]
    X_test, y_test, aux_test = splits["test"]
    print(f"Split sizes -> train: {len(X_train)}, val: {len(X_val)}, test: {len(X_test)}")

    # --- Model comparison ---
    print("\nRunning model comparison (this may take a minute)...")
    search_results = run_grid_search(X_train, y_train, feature_columns)

    print("\nValidation macro AUPRC by candidate:")
    val_scores = {}
    for name, search in search_results.items():
        score = evaluate_candidate_on_val(search, X_val, y_val, feature_columns)
        val_scores[name] = score
        print(f"  {name:22s}: {score:.4f}  (best CV params: {search.best_params_})")

    winner_name = max(val_scores, key=val_scores.get)
    winner_pipeline = search_results[winner_name].best_estimator_
    print(f"\nWinner: {winner_name} (val macro AUPRC = {val_scores[winner_name]:.4f})")

    # --- Calibration (fit on validation set, never on train or test) ---
    print("\nCalibrating winning model...")
    y_val_for_calibration = y_val if winner_name != "xgboost" else np.array(
        [LABEL_ORDER.index(v) for v in y_val]
    )
    calibrated_model = calibrate_model(winner_pipeline, X_val, y_val_for_calibration)

    # --- Final evaluation on the untouched test set ---
    proba_test = calibrated_model.predict_proba(X_test)
    proba_test = reorder_proba(proba_test, calibrated_model.classes_)
    preds_test_idx = proba_test.argmax(axis=1)
    preds_test = [LABEL_ORDER[i] for i in preds_test_idx]

    test_metrics = compute_metrics(y_test, preds_test, proba_test)
    print_metrics(test_metrics, title=f"Final Test Set Evaluation ({winner_name}, calibrated)")

    # --- Ablation study (run on the UNCALIBRATED winner, using its own pipeline structure) ---
    y_train_for_ablation = y_train if winner_name != "xgboost" else np.array(
        [LABEL_ORDER.index(v) for v in y_train]
    )
    # compute_metrics inside ablation expects string labels
    ablation_result = run_ablation(
        winner_pipeline, X_train, y_train_for_ablation, X_test, y_test, feature_columns
    )
    print_ablation_comparison(test_metrics, ablation_result)

    # --- Fairness check ---
    fairness_result = run_fairness_check(calibrated_model, X_test, y_test, aux_test["multilingual_home_flag"])
    print_fairness_result(fairness_result)

    # --- Subgroup sensitivity ---
    age_table = sensitivity_by_age_bin(y_test, preds_test, aux_test["age_months"])
    fh_table = sensitivity_by_family_history(y_test, preds_test, X_test["family_history_flag"])
    print_subgroup_tables(age_table, fh_table)

    # --- SHAP explainability (fit on the raw, uncalibrated tree model) ---
    print("\nFitting SHAP explainer...")
    if winner_name in ("random_forest", "xgboost"):
        raw_tree_model = winner_pipeline.named_steps["clf"]
        # SHAP needs data in the same preprocessed form the tree model was trained on
        # SHAP needs data in the same preprocessed form the tree model was trained on
        explainer = build_explainer(raw_tree_model, feature_columns)
        save_explainer(explainer, os.path.join(ARTIFACTS_DIR, "shap_explainer.pkl"))
        print(f"SHAP explainer saved to {ARTIFACTS_DIR}/shap_explainer.pkl")
    else:
        print(
            f"Winner ({winner_name}) is not a tree model - shap_explainer.py is written for "
            "TreeExplainer only. Skipping SHAP artifact; would need LinearExplainer for "
            "Logistic Regression if that ever wins the comparison."
        )

    # --- Save final artifacts ---
    with open(os.path.join(ARTIFACTS_DIR, "model.pkl"), "wb") as f:
        pickle.dump(calibrated_model, f)
    with open(os.path.join(ARTIFACTS_DIR, "feature_columns.pkl"), "wb") as f:
        pickle.dump(feature_columns, f)
    # The preprocessor (StandardScaler on age + passthrough on items) is
    # saved SEPARATELY, fitted on the training split. Anything calling the
    # raw SHAP explainer at inference time (Stage 3/4) MUST transform raw
    # feature rows through this exact preprocessor first - the tree model's
    # split thresholds live in preprocessed (scaled-age) space, not raw
    # feature space. Feeding raw values directly into the explainer, as an
    # early version of this pipeline did, silently produces wrong
    # predictions and nonsensical SHAP magnitudes with no error raised.
    with open(os.path.join(ARTIFACTS_DIR, "preprocessor.pkl"), "wb") as f:
        pickle.dump(winner_pipeline.named_steps["preprocess"], f)

    print(f"\nSaved calibrated model to {ARTIFACTS_DIR}/model.pkl")
    print(f"Winner: {winner_name}")
    print(f"Final test macro AUPRC: {test_metrics['macro_auprc']:.4f}")
    print(f"Final test Refer AUPRC: {test_metrics['refer_auprc']:.4f}")


if __name__ == "__main__":
    main()
