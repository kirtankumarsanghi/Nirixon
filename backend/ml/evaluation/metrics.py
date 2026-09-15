"""
Stage 2 — Evaluation Metrics

AUPRC is treated as the PRIMARY metric, per the design doc, because
overall accuracy can look fine while quietly missing most real "Refer"
cases (the rarest, most important class at ~7% of the data). A model
that always predicts "Typical" would score ~73% accuracy while being
useless - AUPRC punishes that far more honestly.
"""

from __future__ import annotations

import numpy as np
from columns import LABEL_ORDER
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from sklearn.preprocessing import label_binarize


def compute_metrics(y_true, y_pred, y_proba) -> dict:
    """
    y_true, y_pred: string labels ("Typical"/"Monitor"/"Refer")
    y_proba: (n_samples, 3) array of predicted probabilities, columns
             ordered as LABEL_ORDER
    """
    y_true_bin = label_binarize(y_true, classes=LABEL_ORDER)

    # Per-class and macro AUPRC
    auprc_per_class = {}
    for i, label in enumerate(LABEL_ORDER):
        auprc_per_class[label] = average_precision_score(
            y_true_bin[:, i], y_proba[:, i]
        )
    macro_auprc = float(np.mean(list(auprc_per_class.values())))

    # AUPRC specifically for Refer - the metric that matters most, called
    # out on its own since it's easy for it to hide inside a macro average.
    refer_auprc = auprc_per_class["Refer"]
    macro_f1 = f1_score(y_true, y_pred, labels=LABEL_ORDER, average="macro")

    try:
        macro_auroc = roc_auc_score(
            y_true_bin, y_proba, average="macro", multi_class="ovr"
        )
    except ValueError:
        macro_auroc = float(
            "nan"
        )  # can happen if a class is missing from a small split

    cm = confusion_matrix(y_true, y_pred, labels=LABEL_ORDER)
    report = classification_report(y_true, y_pred, labels=LABEL_ORDER, zero_division=0)
    sens_spec = compute_sensitivity_specificity(y_true, y_pred, labels=LABEL_ORDER)

    return {
        "macro_auprc": macro_auprc,
        "auprc_per_class": auprc_per_class,
        "refer_auprc": refer_auprc,
        "macro_f1": macro_f1,
        "macro_auroc": macro_auroc,
        "confusion_matrix": cm,
        "confusion_matrix_labels": LABEL_ORDER,
        "classification_report": report,
        "sensitivity_specificity": sens_spec,
    }

def compute_sensitivity_specificity(y_true, y_pred, labels=LABEL_ORDER):
    """
    Computes sensitivity (recall/TPR) and specificity (TNR) per class.
    Returns a dictionary mapping class label to {'sensitivity': val, 'specificity': val}.
    """
    from sklearn.metrics import confusion_matrix
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    result = {}
    
    # Calculate for each class i
    for i, label in enumerate(labels):
        tp = cm[i, i]
        fn = np.sum(cm[i, :]) - tp
        fp = np.sum(cm[:, i]) - tp
        tn = np.sum(cm) - (tp + fn + fp)
        
        sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        
        result[label] = {
            "sensitivity": float(sensitivity),
            "specificity": float(specificity)
        }
        
    return result


def print_metrics(metrics: dict, title: str = "Evaluation") -> None:
    print(f"\n{'='*60}\n{title}\n{'='*60}")
    print(f"Macro AUPRC:        {metrics['macro_auprc']:.4f}")
    print(
        f"Refer-class AUPRC:  {metrics['refer_auprc']:.4f}  <-- primary metric to watch"
    )
    for label, val in metrics["auprc_per_class"].items():
        print(f"  AUPRC ({label:8s}): {val:.4f}")
    print(f"Macro F1:           {metrics['macro_f1']:.4f}")
    print(f"Macro AUROC:        {metrics['macro_auroc']:.4f}")
    print(
        f"\nConfusion matrix (rows=true, cols=pred), labels={metrics['confusion_matrix_labels']}:"
    )
    print(metrics["confusion_matrix"])
    print(f"\n{metrics['classification_report']}")
