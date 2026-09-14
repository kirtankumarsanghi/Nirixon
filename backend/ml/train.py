"""
Stage 2 — Orchestrator

Loads the Stage 1 dataset, splits it, runs model comparison, calibrates
ALL THREE models (Logistic Regression, Random Forest, XGBoost), evaluates
them per bracket and per domain, selects the production winner, fits SHAP
for the winner, benchmarks inference latency, and saves named artifacts.

Artifact inventory after a successful run:
  artifacts/
    model_logistic_regression.pkl  - calibrated LR model
    model_random_forest.pkl        - calibrated RF model
    model_xgboost.pkl              - calibrated XGBoost model
    shap_explainer.pkl             - SHAP explainer for the production model
    feature_columns.pkl            - ordered feature column list
    preprocessor.pkl               - preprocessor from the production model pipeline
    production_model_name.txt      - name of the production model (e.g. "xgboost")
    latency_benchmark.json         - p50/p95/p99 inference latency per model (ms)
    MODEL_SELECTION.md             - structured decision document

PRODUCTION MODEL SELECTION CRITERIA (documented here and in MODEL_SELECTION.md):
  The production model is the one with the highest validation-set macro AUPRC
  among the three candidates. If XGBoost and Random Forest are within 0.005
  AUPRC of each other, prefer Random Forest (lower inference latency and memory).
  Logistic Regression is retained as interpretability baseline only.
  All three calibrated models are saved — the non-winners are available for
  fallback or ensemble use in the Clinician Sandbox (on-demand, not at startup).

Run:
    cd backend/ml
    python3 train.py
"""

from __future__ import annotations

import json
import os
import pickle
import sys
import time

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

sys.path.insert(
    0, os.path.dirname(__file__)
)  # allow sibling-package imports when run directly

from columns import AGE_COLUMN, LABEL_ORDER, get_feature_columns, reorder_proba
from evaluation.ablation_study import print_ablation_comparison, run_ablation
from evaluation.fairness_check import print_fairness_result, run_fairness_check
from evaluation.metrics import compute_metrics, print_metrics
from evaluation.subgroup_sensitivity import (
    print_subgroup_tables,
    sensitivity_by_age_bracket,
    sensitivity_by_domain,
    sensitivity_by_family_history,
)
from explainability.shap_explainer import build_explainer, save_explainer
from models.calibration import calibrate_model
from models.model_comparison import run_grid_search

DATA_PATH = "../data/processed/screening_data_items.csv"
ARTIFACTS_DIR = "artifacts"

RANDOM_STATE = 42

# Latency benchmark: how many single-row predictions to time per model.
# Sequential (not batched) to reflect Clinician Sandbox / What-If use case.
LATENCY_BENCHMARK_N = 1000


def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    return df


def split_data(df: pd.DataFrame, feature_columns: list[str]):
    """
    3-way split: train (60%) / val (20%, used for model selection +
    calibration) / test (20%, touched only once, for final reporting).
    Stratified on risk_label so the rare Refer class doesn't get
    unevenly distributed across splits.

    aux carries age_bracket (for 17-bracket subgroup analysis), age_months,
    and multilingual_home_flag alongside each split.
    """
    X = df[feature_columns]
    y = df["risk_label"]
    aux_cols = ["multilingual_home_flag", "age_months", "age_bracket"]
    aux_cols_present = [c for c in aux_cols if c in df.columns]
    aux = df[aux_cols_present]

    X_train, X_temp, y_train, y_temp, aux_train, aux_temp = train_test_split(
        X, y, aux, test_size=0.4, stratify=y, random_state=RANDOM_STATE
    )
    X_val, X_test, y_val, y_test, aux_val, aux_test = train_test_split(
        X_temp,
        y_temp,
        aux_temp,
        test_size=0.5,
        stratify=y_temp,
        random_state=RANDOM_STATE,
    )

    return {
        "train": (X_train, y_train, aux_train),
        "val": (X_val, y_val, aux_val),
        "test": (X_test, y_test, aux_test),
    }


def _y_for_model(name: str, y: pd.Series) -> np.ndarray | pd.Series:
    """
    XGBoost in this pipeline expects integer-encoded labels (0/1/2) while
    LR and RF use string labels. This helper ensures correct encoding for
    each model, including during calibration.
    """
    if name == "xgboost":
        return np.array([LABEL_ORDER.index(v) for v in y])
    return y


def evaluate_candidate_on_val(search_result, X_val, y_val) -> tuple[float, np.ndarray, list]:
    """Returns (macro_auprc, proba, preds) on validation set."""
    best_estimator = search_result.best_estimator_
    proba = best_estimator.predict_proba(X_val)
    proba = reorder_proba(proba, best_estimator.classes_)
    preds_idx = proba.argmax(axis=1)
    preds = [LABEL_ORDER[i] for i in preds_idx]
    metrics = compute_metrics(y_val, preds, proba)
    return metrics["macro_auprc"], proba, preds


def benchmark_latency(model, X_sample: pd.DataFrame, n: int = LATENCY_BENCHMARK_N) -> dict:
    """
    Times single-row predict_proba() calls sequentially (not batched).
    Returns p50, p95, p99 latency in milliseconds.

    Uses the first row of X_sample for all n calls to isolate inference cost
    from data loading cost. This reflects the Clinician Sandbox / What-If
    re-score use case: a single child's feature vector is re-scored each time.
    """
    row = X_sample.iloc[:1]  # single row, keep DataFrame shape for the pipeline
    latencies_ms = []
    for _ in range(n):
        t0 = time.perf_counter()
        model.predict_proba(row)
        t1 = time.perf_counter()
        latencies_ms.append((t1 - t0) * 1000)

    return {
        "p50_ms": float(np.percentile(latencies_ms, 50)),
        "p95_ms": float(np.percentile(latencies_ms, 95)),
        "p99_ms": float(np.percentile(latencies_ms, 99)),
        "n_samples": n,
    }


def _select_winner(val_scores: dict[str, float]) -> str:
    """
    Production model selection logic — documented in the module docstring
    and mirrored in MODEL_SELECTION.md.

    XGBoost vs Random Forest: if within 0.005 AUPRC, prefer RF (lower
    latency, lower memory). Otherwise take the higher scorer.
    Logistic Regression is an interpretability baseline; it wins the
    selection only if it strictly outperforms both tree models.
    """
    xgb_score = val_scores.get("xgboost", -1)
    rf_score = val_scores.get("random_forest", -1)
    lr_score = val_scores.get("logistic_regression", -1)

    best_tree_name = "xgboost" if xgb_score > rf_score else "random_forest"
    best_tree_score = max(xgb_score, rf_score)

    # If both tree models are within 0.005 AUPRC, prefer RF
    if abs(xgb_score - rf_score) <= 0.005:
        best_tree_name = "random_forest"
        best_tree_score = rf_score

    # LR wins only if it strictly beats both tree models
    if lr_score > best_tree_score:
        return "logistic_regression"
    return best_tree_name


def _write_model_selection_report(
    val_scores: dict,
    test_metrics_by_model: dict,
    latency_by_model: dict,
    winner_name: str,
    out_path: str,
) -> None:
    lines = [
        "# Model Selection Report\n\n",
        "## Decision\n\n",
        f"**Production model: `{winner_name}`**\n\n",
        "Selection criteria: highest validation-set macro AUPRC. "
        "If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest "
        "(lower latency, lower memory). Logistic Regression wins only if it "
        "strictly outperforms both tree models.\n\n",
        "## Validation AUPRC (model selection set)\n\n",
        "| Model | Val Macro AUPRC |\n",
        "|---|---|\n",
    ]
    for name, score in sorted(val_scores.items(), key=lambda x: -x[1]):
        winner_marker = " **(SELECTED)**" if name == winner_name else ""
        lines.append(f"| {name} | {score:.4f}{winner_marker} |\n")

    lines.append("\n## Test Set Metrics (final holdout, touched once)\n\n")
    for name, metrics in test_metrics_by_model.items():
        winner_marker = " (production)" if name == winner_name else ""
        lines.append(f"### {name}{winner_marker}\n\n")
        lines.append(f"- Macro AUPRC: **{metrics['macro_auprc']:.4f}**\n")
        lines.append(f"- Refer AUPRC: **{metrics['refer_auprc']:.4f}** ← primary metric\n")
        lines.append(f"- Macro F1:    {metrics['macro_f1']:.4f}\n")
        lines.append(f"- Macro AUROC: {metrics['macro_auroc']:.4f}\n\n")

    lines.append("## Inference Latency (single-row, sequential)\n\n")
    lines.append("| Model | p50 (ms) | p95 (ms) | p99 (ms) |\n")
    lines.append("|---|---|---|---|\n")
    for name, lat in latency_by_model.items():
        lines.append(
            f"| {name} | {lat['p50_ms']:.2f} | {lat['p95_ms']:.2f} | {lat['p99_ms']:.2f} |\n"
        )

    lines.append(
        "\n> Latency is measured as sequential single-row `predict_proba()` calls, "
        "reflecting the Clinician Sandbox / What-If re-score use case, "
        f"not batch throughput. n={LATENCY_BENCHMARK_N} calls per model.\n"
    )

    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    print("Loading data...")
    df = load_data()
    feature_columns = get_feature_columns(df)
    print(f"Feature columns ({len(feature_columns)}): {feature_columns[:5]}...{feature_columns[-3:]}")

    splits = split_data(df, feature_columns)
    X_train, y_train, _aux_train = splits["train"]
    X_val, y_val, _aux_val = splits["val"]
    X_test, y_test, aux_test = splits["test"]
    print(
        f"Split sizes -> train: {len(X_train)}, val: {len(X_val)}, test: {len(X_test)}"
    )

    # --- Model comparison ---
    print("\nRunning model comparison (this may take a minute)...")
    search_results = run_grid_search(X_train, y_train, feature_columns)

    print("\nValidation macro AUPRC by candidate:")
    val_scores = {}
    for name, search in search_results.items():
        score, _, _ = evaluate_candidate_on_val(search, X_val, y_val)
        val_scores[name] = score
        print(f"  {name:22s}: {score:.4f}  (best CV params: {search.best_params_})")

    # --- Calibrate ALL THREE models (needed for fair comparison) ---
    print("\nCalibrating all three models...")
    calibrated_models: dict[str, object] = {}
    for name, search in search_results.items():
        print(f"  Calibrating {name}...")
        pipeline = search.best_estimator_
        y_val_enc = _y_for_model(name, y_val)
        calibrated_models[name] = calibrate_model(pipeline, X_val, y_val_enc)
        print(f"    Done: {name} calibrated.")

    # --- Save ALL THREE calibrated models (named pkls) ---
    print("\nSaving all three calibrated models...")
    for name, model in calibrated_models.items():
        pkl_path = os.path.join(ARTIFACTS_DIR, f"model_{name.replace(' ', '_')}.pkl")
        with open(pkl_path, "wb") as f:
            pickle.dump(model, f)
        print(f"  Saved: {pkl_path}")

    # --- Per-model test set evaluation ---
    print("\nEvaluating all models on final test set...")
    test_metrics_by_model: dict[str, dict] = {}
    test_preds_by_model: dict[str, list] = {}
    test_proba_by_model: dict[str, np.ndarray] = {}

    for name, model in calibrated_models.items():
        proba = model.predict_proba(X_test)
        proba = reorder_proba(proba, model.classes_)
        preds_idx = proba.argmax(axis=1)
        preds = [LABEL_ORDER[i] for i in preds_idx]
        metrics = compute_metrics(y_test, preds, proba)
        test_metrics_by_model[name] = metrics
        test_preds_by_model[name] = preds
        test_proba_by_model[name] = proba
        print_metrics(metrics, title=f"Test Set — {name} (calibrated)")

    # --- Production model selection ---
    winner_name = _select_winner(val_scores)
    winner_model = calibrated_models[winner_name]
    winner_pipeline = search_results[winner_name].best_estimator_
    print(f"\n{'='*60}")
    print(f"PRODUCTION MODEL SELECTED: {winner_name}")
    print(f"  Val macro AUPRC: {val_scores[winner_name]:.4f}")
    print(f"  Test macro AUPRC: {test_metrics_by_model[winner_name]['macro_auprc']:.4f}")
    print(f"  Test Refer AUPRC: {test_metrics_by_model[winner_name]['refer_auprc']:.4f}")
    print(f"{'='*60}")

    # --- Ablation study (on the production model's uncalibrated pipeline) ---
    y_train_for_ablation = _y_for_model(winner_name, y_train)
    ablation_result = run_ablation(
        winner_pipeline, X_train, y_train_for_ablation, X_test, y_test, feature_columns
    )
    print_ablation_comparison(test_metrics_by_model[winner_name], ablation_result)

    # --- Fairness check ---
    fairness_result = run_fairness_check(
        winner_model, X_test, y_test, aux_test["multilingual_home_flag"]
    )
    print_fairness_result(fairness_result)

    # --- Per-bracket subgroup sensitivity ---
    winner_preds = test_preds_by_model[winner_name]
    if "age_bracket" in aux_test.columns:
        bracket_table = sensitivity_by_age_bracket(
            y_test, winner_preds, aux_test["age_bracket"]
        )
    else:
        bracket_table = pd.DataFrame()
        print("WARNING: age_bracket not in aux_test — regenerate CSV to enable per-bracket analysis.")

    fh_table = sensitivity_by_family_history(
        y_test, winner_preds, X_test["family_history_flag"]
    )
    domain_table = sensitivity_by_domain(y_test, winner_preds, X_test)
    print_subgroup_tables(bracket_table, fh_table, domain_table)

    # --- SHAP explainability (production model only) ---
    print("\nFitting SHAP explainer...")
    if winner_name in ("random_forest", "xgboost"):
        raw_tree_model = winner_pipeline.named_steps["clf"]
        explainer = build_explainer(raw_tree_model, feature_columns, model_name=winner_name)
        save_explainer(explainer, os.path.join(ARTIFACTS_DIR, "shap_explainer.pkl"))
        print(f"SHAP explainer saved to {ARTIFACTS_DIR}/shap_explainer.pkl")
    else:
        print(
            f"Winner ({winner_name}) is not a tree model - skipping SHAP artifact. "
            "Would need LinearExplainer for Logistic Regression."
        )

    # --- Inference latency benchmark ---
    print(f"\nBenchmarking inference latency ({LATENCY_BENCHMARK_N} single-row calls per model)...")
    latency_by_model: dict[str, dict] = {}
    for name, model in calibrated_models.items():
        lat = benchmark_latency(model, X_test)
        latency_by_model[name] = lat
        p99_warn = " *** EXCEEDS 200ms THRESHOLD ***" if lat["p99_ms"] > 200 else ""
        print(
            f"  {name:22s}: p50={lat['p50_ms']:.2f}ms  "
            f"p95={lat['p95_ms']:.2f}ms  p99={lat['p99_ms']:.2f}ms{p99_warn}"
        )

    lat_path = os.path.join(ARTIFACTS_DIR, "latency_benchmark.json")
    with open(lat_path, "w", encoding="utf-8") as f:
        json.dump(latency_by_model, f, indent=2)
    print(f"Latency benchmark saved to {lat_path}")

    # --- Save production artifacts ---
    # The model.pkl (singular) remains as the production serving artifact
    # for InferenceService. It points to the winner.
    with open(os.path.join(ARTIFACTS_DIR, "model.pkl"), "wb") as f:
        pickle.dump(winner_model, f)
    with open(os.path.join(ARTIFACTS_DIR, "feature_columns.pkl"), "wb") as f:
        pickle.dump(feature_columns, f)
    # Preprocessor: the ColumnTransformer from the production pipeline.
    # See the design doc comment below — this MUST be kept in sync with model.pkl.
    # The preprocessor (StandardScaler on age + passthrough on items) is
    # saved SEPARATELY, fitted on the training split. Anything calling the
    # raw SHAP explainer at inference time (Stage 3/4) MUST transform raw
    # feature rows through this exact preprocessor first — the tree model's
    # split thresholds live in preprocessed (scaled-age) space, not raw
    # feature space. Feeding raw values directly into the explainer, as an
    # early version of this pipeline did, silently produces wrong
    # predictions and nonsensical SHAP magnitudes with no error raised.
    with open(os.path.join(ARTIFACTS_DIR, "preprocessor.pkl"), "wb") as f:
        pickle.dump(winner_pipeline.named_steps["preprocess"], f)

    # Write production_model_name.txt so InferenceService knows which model
    # is in production without parsing pkl filenames.
    with open(os.path.join(ARTIFACTS_DIR, "production_model_name.txt"), "w", encoding="utf-8") as f:
        f.write(winner_name)

    # --- Model selection report ---
    report_path = os.path.join(ARTIFACTS_DIR, "MODEL_SELECTION.md")
    _write_model_selection_report(
        val_scores, test_metrics_by_model, latency_by_model, winner_name, report_path
    )
    print(f"\nModel selection report saved to {report_path}")
    print(f"Production model: {winner_name}")
    print(f"Final test macro AUPRC: {test_metrics_by_model[winner_name]['macro_auprc']:.4f}")
    print(f"Final test Refer AUPRC: {test_metrics_by_model[winner_name]['refer_auprc']:.4f}")


if __name__ == "__main__":
    main()
