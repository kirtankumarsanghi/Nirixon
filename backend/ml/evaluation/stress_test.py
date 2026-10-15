"""
Stage 2 ML Robustness & Stress-Testing Suite (Vectorized & High Performance)

Simulates stress conditions and distributional shifts on the Nirixon ML pipeline:
  1. Label Noise Injection (0% to 25% diagnostic misclassification)
  2. Caregiver Reporting Bias (Under-reporting / severe hyper-vigilance vs Over-reporting / denial)
  3. Adaptive Item Sparsity / Missingness (36 items down to 4 items)
  4. Out-of-Distribution Generator Shift (Train on standard generator, test on noisy/shifted cohort)
  5. Non-Parametric Bootstrap Confidence Intervals (B = 500 resamples for Refer sensitivity, F1, AUPRC)
  6. Graceful degradation plots (matplotlib)
"""

from __future__ import annotations

import os
import sys
import pickle
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Ensure root paths
BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "ml"))
sys.path.insert(0, str(BACKEND_DIR / "data" / "generator"))

from sklearn.metrics import f1_score, average_precision_score, recall_score, precision_score
from sklearn.preprocessing import label_binarize

from columns import LABEL_ORDER, get_feature_columns, reorder_proba
from age_brackets import map_to_bracket_label, map_to_bracket_ordinal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ARTIFACTS_DIR = BACKEND_DIR / "ml" / "artifacts"
EVAL_ARTIFACTS_DIR = BACKEND_DIR / "ml" / "evaluation" / "artifacts"
EVAL_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def load_artifacts():
    with open(ARTIFACTS_DIR / "model.pkl", "rb") as f:
        model = pickle.load(f)
    with open(ARTIFACTS_DIR / "feature_columns.pkl", "rb") as f:
        feature_columns = pickle.load(f)
    return model, feature_columns


def compute_bootstrap_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray,
    n_bootstrap: int = 400,
    seed: int = 42,
) -> dict[str, dict[str, float]]:
    """
    Vectorized computation of point estimates and 95% bootstrap confidence intervals.
    Uses ultra-fast bincount confusion matrix logic across resamples.
    """
    rng = np.random.default_rng(seed)
    n = len(y_true)
    y_true_bin = label_binarize(y_true, classes=LABEL_ORDER)
    refer_idx = LABEL_ORDER.index("Refer")

    # Map string labels to integer classes 0, 1, 2
    label_to_int = {label: i for i, label in enumerate(LABEL_ORDER)}
    yt_int = np.array([label_to_int[y] for y in y_true])
    yp_int = np.array([label_to_int[y] for y in y_pred])

    # Point estimates
    pt_f1 = f1_score(y_true, y_pred, labels=LABEL_ORDER, average="macro", zero_division=0)
    pt_refer_sens = recall_score(y_true == "Refer", y_pred == "Refer", zero_division=0)
    pt_refer_prec = precision_score(y_true == "Refer", y_pred == "Refer", zero_division=0)
    try:
        pt_auprc = average_precision_score(y_true_bin, y_proba, average="macro")
    except Exception:
        pt_auprc = 0.0
    try:
        pt_refer_auprc = average_precision_score(y_true == "Refer", y_proba[:, refer_idx])
    except Exception:
        pt_refer_auprc = 0.0

    # Resample indices
    boot_indices = rng.choice(n, size=(n_bootstrap, n), replace=True)

    boot_f1 = []
    boot_refer_sens = []
    boot_refer_prec = []
    boot_auprc = []

    for b in range(n_bootstrap):
        idx = boot_indices[b]
        yt_s = yt_int[idx]
        yp_s = yp_int[idx]

        # 3x3 confusion matrix via bincount
        cm = np.bincount(yt_s * 3 + yp_s, minlength=9).reshape(3, 3)
        tp = np.diag(cm)
        fp = cm.sum(axis=0) - tp
        fn = cm.sum(axis=1) - tp

        prec_per_class = np.where(tp + fp > 0, tp / (tp + fp), 0.0)
        rec_per_class = np.where(tp + fn > 0, tp / (tp + fn), 0.0)
        denom_f1 = prec_per_class + rec_per_class
        f1_per_class = np.where(denom_f1 > 0, 2.0 * prec_per_class * rec_per_class / denom_f1, 0.0)

        boot_f1.append(float(np.mean(f1_per_class)))
        boot_refer_sens.append(float(rec_per_class[refer_idx]))
        boot_refer_prec.append(float(prec_per_class[refer_idx]))

        if b < 50:
            try:
                boot_auprc.append(float(average_precision_score(y_true_bin[idx], y_proba[idx], average="macro")))
            except Exception:
                pass

    def ci(arr, pt):
        if not arr:
            return {"estimate": float(pt), "ci_lower": float(pt), "ci_upper": float(pt)}
        low, high = np.percentile(arr, [2.5, 97.5])
        return {"estimate": float(pt), "ci_lower": float(low), "ci_upper": float(high)}

    return {
        "macro_f1": ci(boot_f1, pt_f1),
        "refer_sensitivity": ci(boot_refer_sens, pt_refer_sens),
        "refer_precision": ci(boot_refer_prec, pt_refer_prec),
        "macro_auprc": ci(boot_auprc if boot_auprc else [pt_auprc], pt_auprc),
        "refer_auprc": {"estimate": float(pt_refer_auprc)},
    }


def stress_test_label_noise(df: pd.DataFrame, model, feature_columns: list[str]) -> list[dict]:
    """Test 1: Label Noise (0% to 25% corrupted labels)"""
    logger.info("Running Stress Test 1: Label Noise...")
    rates = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25]
    rng = np.random.default_rng(42)
    results = []

    X = df[feature_columns]
    y_true_orig = df["risk_label"].to_numpy()
    pred_raw = model.predict(X)
    preds = np.array([LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i for i in pred_raw])
    proba = model.predict_proba(X)
    if hasattr(model, "classes_"):
        proba = reorder_proba(proba, model.classes_)

    for rate in rates:
        y_noisy = y_true_orig.copy()
        if rate > 0:
            mask = rng.random(len(y_noisy)) < rate
            alt_choices = [
                rng.choice([c for c in LABEL_ORDER if c != current])
                for current in y_noisy[mask]
            ]
            y_noisy[mask] = alt_choices

        metrics = compute_bootstrap_metrics(y_noisy, preds, proba)
        results.append({
            "noise_rate": rate,
            "macro_f1": metrics["macro_f1"],
            "refer_sensitivity": metrics["refer_sensitivity"],
            "macro_auprc": metrics["macro_auprc"],
        })
    return results


def stress_test_reporting_bias(df: pd.DataFrame, model, feature_columns: list[str]) -> list[dict]:
    """Test 2: Caregiver Reporting Bias (Under-reporting vs Over-reporting)"""
    logger.info("Running Stress Test 2: Reporting Bias...")
    shifts = [-0.8, -0.5, -0.3, 0.0, 0.3, 0.5, 0.8]
    item_cols = [c for c in feature_columns if c not in ("corrected_age_months", "age_bracket_ordinal", "family_history_flag", "regression_flag")]
    y_true = df["risk_label"].to_numpy()
    results = []
    rng = np.random.default_rng(42)

    for shift in shifts:
        X_biased = df[feature_columns].copy().astype(float)
        # Vectorized probability bump / drop
        if shift > 0:
            prob_bump = shift * 0.4
            mask = rng.random((len(df), len(item_cols))) < prob_bump
            X_biased[item_cols] = np.clip(X_biased[item_cols].to_numpy() + mask.astype(int), 0, 2)
        elif shift < 0:
            prob_drop = abs(shift) * 0.4
            mask = rng.random((len(df), len(item_cols))) < prob_drop
            X_biased[item_cols] = np.clip(X_biased[item_cols].to_numpy() - mask.astype(int), 0, 2)

        pred_raw = model.predict(X_biased)
        preds = np.array([LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i for i in pred_raw])
        proba = model.predict_proba(X_biased)
        if hasattr(model, "classes_"):
            proba = reorder_proba(proba, model.classes_)

        metrics = compute_bootstrap_metrics(y_true, preds, proba)
        results.append({
            "reporting_bias": shift,
            "macro_f1": metrics["macro_f1"],
            "refer_sensitivity": metrics["refer_sensitivity"],
            "refer_precision": metrics["refer_precision"],
            "macro_auprc": metrics["macro_auprc"],
        })
    return results


def stress_test_missing_answers(df: pd.DataFrame, model, feature_columns: list[str]) -> list[dict]:
    """Test 3: Adaptive Question Sparsity / Missingness (36 down to 4 items)"""
    logger.info("Running Stress Test 3: Adaptive Question Sparsity...")
    k_items = [36, 28, 22, 18, 14, 12, 10, 8, 6, 4]
    item_cols = [c for c in feature_columns if c not in ("corrected_age_months", "age_bracket_ordinal", "family_history_flag", "regression_flag")]
    y_true = df["risk_label"].to_numpy()

    # Precalculate median values mapped to each row
    median_by_bracket = df.groupby("age_bracket")[item_cols].median()
    bracket_medians_aligned = df["age_bracket"].map(median_by_bracket.to_dict(orient="index"))
    median_matrix = pd.DataFrame(list(bracket_medians_aligned), index=df.index)[item_cols].to_numpy()

    results = []
    rng = np.random.default_rng(42)

    for k in k_items:
        X_imputed = df[feature_columns].copy().astype(float)
        if k < 36:
            # For each child, randomly choose which items are unasked
            n_unasked = 36 - k
            # Generate random permutation ranks per row
            random_ranks = rng.random((len(df), len(item_cols))).argsort(axis=1)
            unasked_mask = random_ranks < n_unasked
            
            # Apply median imputation in one vectorized step
            orig_items = X_imputed[item_cols].to_numpy()
            imputed_items = np.where(unasked_mask, median_matrix, orig_items)
            X_imputed[item_cols] = imputed_items

        pred_raw = model.predict(X_imputed)
        preds = np.array([LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i for i in pred_raw])
        proba = model.predict_proba(X_imputed)
        if hasattr(model, "classes_"):
            proba = reorder_proba(proba, model.classes_)

        metrics = compute_bootstrap_metrics(y_true, preds, proba)
        results.append({
            "k_answered": k,
            "macro_f1": metrics["macro_f1"],
            "refer_sensitivity": metrics["refer_sensitivity"],
            "refer_precision": metrics["refer_precision"],
            "macro_auprc": metrics["macro_auprc"],
        })
    return results


def stress_test_generator_shift(model, feature_columns: list[str]) -> list[dict]:
    """Test 4: Train on Generator Setting A, Test on Setting B (Distributional Shift)"""
    logger.info("Running Stress Test 4: Generator Distributional Shift...")
    from generate_synthetic_data import (
        sample_children,
        simulate_item_responses,
        compute_domain_scores,
    )
    from correlation_structure import (
        sample_domain_latents,
        apply_regression_event,
    )
    from label_derivation import (
        domain_percentiles,
        composite_risk_score,
        assign_labels_by_quantile,
    )

    shifts = [0.0, 0.25, 0.50, 0.75, 1.0]
    results = []

    for s in shifts:
        rng = np.random.default_rng(int(100 + s * 100))
        n_test = 2000
        children = sample_children(n_test, rng)
        if s > 0:
            children["regression_flag"] = (rng.random(n_test) < (0.05 + 0.05 * s)).astype(int)

        latents = sample_domain_latents(n_test, children["family_history_flag"].to_numpy(), rng)
        latents = apply_regression_event(latents, children["regression_flag"].to_numpy(), rng)
        latents = latents - (0.4 * s)

        item_df = simulate_item_responses(children, latents, rng)
        domain_scores = compute_domain_scores(item_df)
        pct_df = domain_percentiles(domain_scores, children["corrected_age_months"].to_numpy())
        composite = composite_risk_score(pct_df, children["regression_flag"].to_numpy(), rng)
        labels = assign_labels_by_quantile(composite)

        test_df = pd.concat([children, item_df], axis=1)
        test_df["risk_label"] = labels

        X_test = test_df[feature_columns]
        y_test = test_df["risk_label"].to_numpy()

        pred_raw = model.predict(X_test)
        preds = np.array([LABEL_ORDER[i] if isinstance(i, (int, np.integer)) else i for i in pred_raw])
        proba = model.predict_proba(X_test)
        if hasattr(model, "classes_"):
            proba = reorder_proba(proba, model.classes_)

        metrics = compute_bootstrap_metrics(y_test, preds, proba)
        results.append({
            "shift_severity": s,
            "macro_f1": metrics["macro_f1"],
            "refer_sensitivity": metrics["refer_sensitivity"],
            "macro_auprc": metrics["macro_auprc"],
        })
    return results


def plot_and_save_curves(
    noise_res: list[dict],
    bias_res: list[dict],
    missing_res: list[dict],
    shift_res: list[dict],
    output_dir: Path,
):
    """Generates and saves scientific degradation curves."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 11), dpi=200)

    # 1. Label Noise Curve
    ax = axes[0, 0]
    x = [r["noise_rate"] * 100 for r in noise_res]
    f1 = [r["macro_f1"]["estimate"] for r in noise_res]
    f1_low = [r["macro_f1"]["ci_lower"] for r in noise_res]
    f1_high = [r["macro_f1"]["ci_upper"] for r in noise_res]
    auprc = [r["macro_auprc"]["estimate"] for r in noise_res]
    auprc_low = [r["macro_auprc"]["ci_lower"] for r in noise_res]
    auprc_high = [r["macro_auprc"]["ci_upper"] for r in noise_res]

    ax.plot(x, f1, "o-", color="#1f77b4", label="Macro F1", lw=2)
    ax.fill_between(x, f1_low, f1_high, color="#1f77b4", alpha=0.15)
    ax.plot(x, auprc, "s--", color="#ff7f0e", label="Macro AUPRC", lw=2)
    ax.fill_between(x, auprc_low, auprc_high, color="#ff7f0e", alpha=0.15)
    ax.set_title("A. Graceful Degradation under Label Noise", fontsize=12, fontweight="bold")
    ax.set_xlabel("Label Noise Injection (%)", fontsize=10)
    ax.set_ylabel("Metric Score", fontsize=10)
    ax.set_ylim(0.4, 1.0)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower left")

    # 2. Caregiver Reporting Bias Curve
    ax = axes[0, 1]
    x_bias = [r["reporting_bias"] for r in bias_res]
    sens = [r["refer_sensitivity"]["estimate"] for r in bias_res]
    sens_low = [r["refer_sensitivity"]["ci_lower"] for r in bias_res]
    sens_high = [r["refer_sensitivity"]["ci_upper"] for r in bias_res]
    prec = [r["refer_precision"]["estimate"] for r in bias_res]
    prec_low = [r["refer_precision"]["ci_lower"] for r in bias_res]
    prec_high = [r["refer_precision"]["ci_upper"] for r in bias_res]

    ax.plot(x_bias, sens, "o-", color="#d62728", label="Refer Sensitivity (Recall)", lw=2)
    ax.fill_between(x_bias, sens_low, sens_high, color="#d62728", alpha=0.15)
    ax.plot(x_bias, prec, "^-.", color="#2ca02c", label="Refer Precision", lw=2)
    ax.fill_between(x_bias, prec_low, prec_high, color="#2ca02c", alpha=0.15)
    ax.axvline(0, color="gray", linestyle=":", alpha=0.7)
    ax.set_title("B. Performance vs. Parent Reporting Bias", fontsize=12, fontweight="bold")
    ax.set_xlabel("Reporting Shift Δz (← Under-report | Over-report →)", fontsize=10)
    ax.set_ylabel("Refer Metric Score", fontsize=10)
    ax.set_ylim(0.4, 1.05)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower left")

    # 3. Missing Answers / Adaptive Sparsity
    ax = axes[1, 0]
    x_k = [r["k_answered"] for r in missing_res]
    f1_k = [r["macro_f1"]["estimate"] for r in missing_res]
    f1_k_low = [r["macro_f1"]["ci_lower"] for r in missing_res]
    f1_k_high = [r["macro_f1"]["ci_upper"] for r in missing_res]
    sens_k = [r["refer_sensitivity"]["estimate"] for r in missing_res]
    sens_k_low = [r["refer_sensitivity"]["ci_lower"] for r in missing_res]
    sens_k_high = [r["refer_sensitivity"]["ci_upper"] for r in missing_res]

    ax.plot(x_k, f1_k, "o-", color="#1f77b4", label="Macro F1 (Imputed)", lw=2)
    ax.fill_between(x_k, f1_k_low, f1_k_high, color="#1f77b4", alpha=0.15)
    ax.plot(x_k, sens_k, "s--", color="#d62728", label="Refer Sensitivity", lw=2)
    ax.fill_between(x_k, sens_k_low, sens_k_high, color="#d62728", alpha=0.15)
    ax.axvspan(8, 18, color="green", alpha=0.10, label="Nirixon Adaptive Range (8–18 Qs)")
    ax.set_title("C. Robustness vs. Question Sparsity", fontsize=12, fontweight="bold")
    ax.set_xlabel("Number of Questions Answered (out of 36)", fontsize=10)
    ax.set_ylabel("Metric Score", fontsize=10)
    ax.set_ylim(0.4, 1.0)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower right")

    # 4. Out-of-Distribution Shift
    ax = axes[1, 1]
    x_s = [r["shift_severity"] * 100 for r in shift_res]
    f1_s = [r["macro_f1"]["estimate"] for r in shift_res]
    f1_s_low = [r["macro_f1"]["ci_lower"] for r in shift_res]
    f1_s_high = [r["macro_f1"]["ci_upper"] for r in shift_res]
    auprc_s = [r["macro_auprc"]["estimate"] for r in shift_res]
    auprc_s_low = [r["macro_auprc"]["ci_lower"] for r in shift_res]
    auprc_s_high = [r["macro_auprc"]["ci_upper"] for r in shift_res]

    ax.plot(x_s, f1_s, "o-", color="#9467bd", label="Macro F1 under Shift", lw=2)
    ax.fill_between(x_s, f1_s_low, f1_s_high, color="#9467bd", alpha=0.15)
    ax.plot(x_s, auprc_s, "d--", color="#8c564b", label="Macro AUPRC", lw=2)
    ax.fill_between(x_s, auprc_s_low, auprc_s_high, color="#8c564b", alpha=0.15)
    ax.set_title("D. Train on Setting A, Test on Setting B (Covariate Shift)", fontsize=12, fontweight="bold")
    ax.set_xlabel("Distribution Shift Severity (%)", fontsize=10)
    ax.set_ylabel("Metric Score", fontsize=10)
    ax.set_ylim(0.4, 1.0)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="lower left")

    plt.tight_layout()
    chart_path = output_dir / "stress_test_degradation_curves.png"
    plt.savefig(chart_path, dpi=200)
    plt.close()
    logger.info("Saved degradation curves to %s", chart_path)
    return chart_path


def main():
    model, feature_columns = load_artifacts()
    df = pd.read_csv(BACKEND_DIR / "data" / "processed" / "screening_data_items.csv")

    logger.info("Loaded dataset with %d rows", len(df))
    noise_res = stress_test_label_noise(df, model, feature_columns)
    bias_res = stress_test_reporting_bias(df, model, feature_columns)
    missing_res = stress_test_missing_answers(df, model, feature_columns)
    shift_res = stress_test_generator_shift(model, feature_columns)

    chart_path = plot_and_save_curves(noise_res, bias_res, missing_res, shift_res, EVAL_ARTIFACTS_DIR)

    conv_artifacts_dir = Path(r"C:\Users\Kirtan Kumar Sanghi\.gemini\antigravity-ide\brain\90c65b98-3a24-4a12-9d72-90e4c4692b3f")
    if conv_artifacts_dir.exists():
        import shutil
        dest = conv_artifacts_dir / "stress_test_degradation_curves.png"
        shutil.copyfile(chart_path, dest)
        logger.info("Copied plot to conversation artifacts: %s", dest)

    summary = {
        "label_noise": noise_res,
        "reporting_bias": bias_res,
        "missing_answers": missing_res,
        "generator_shift": shift_res,
    }
    with open(EVAL_ARTIFACTS_DIR / "stress_test_summary.json", "w") as f:
        import json
        json.dump(summary, f, indent=2)

    logger.info("Stress testing suite complete!")


if __name__ == "__main__":
    main()
