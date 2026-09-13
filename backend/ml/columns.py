"""
Shared column definitions for the Stage 2 ML pipeline.

Centralized here so every module (model comparison, ablation, fairness,
subgroup sensitivity, SHAP) agrees on exactly what a "feature" is,
instead of each file re-deriving its own column list and risking drift.

FEATURE COLUMNS (what the model is trained on):
  - 36 raw item columns (GM01..SH06)
  - corrected_age_months
  - family_history_flag
  - regression_flag

EXCLUDED FROM TRAINING:
  - child_id                 -> identifier, not a feature
  - age_months                -> superseded by corrected_age_months
  - multilingual_home_flag   -> held out deliberately; used ONLY as a
                                 grouping variable in the fairness check,
                                 never as a model input. See fairness_check.py
                                 for why this is a stronger test than
                                 including it and checking its coefficient.
  - risk_label                -> the target, not a feature
"""

ITEM_PREFIXES = ("GM", "FM", "CM", "CG", "PS", "SH")

NON_FEATURE_COLUMNS = {
    "child_id",
    "age_months",
    "multilingual_home_flag",
    "risk_label",
}

TARGET_COLUMN = "risk_label"
FAIRNESS_GROUP_COLUMN = "multilingual_home_flag"
AGE_COLUMN = "corrected_age_months"

LABEL_ORDER = ["Typical", "Monitor", "Refer"]  # canonical ordering used for reports/plots


def get_feature_columns(df) -> list[str]:
    """Given the full dataframe, return the exact list of columns to train on."""
    return [c for c in df.columns if c not in NON_FEATURE_COLUMNS and c != TARGET_COLUMN]


def reorder_proba(proba, model_classes) -> "np.ndarray":
    """
    sklearn sorts string classes alphabetically (Monitor, Refer, Typical),
    but XGBoost's integer-class output follows LABEL_ORDER (Typical=0,
    Monitor=1, Refer=2) by construction here. Every downstream metric
    assumes columns are in LABEL_ORDER - this reorders whatever an
    estimator produces into that fixed order, so a silent column swap
    can't quietly corrupt AUPRC/AUROC without erroring first.
    """
    import numpy as np

    model_classes = list(model_classes)
    # model_classes may be strings ("Monitor") or ints (0,1,2 matching LABEL_ORDER position)
    if all(isinstance(c, (int, np.integer)) for c in model_classes):
        class_to_label = {i: LABEL_ORDER[i] for i in range(len(LABEL_ORDER))}
        model_classes = [class_to_label[c] for c in model_classes]

    col_for_label = {label: model_classes.index(label) for label in LABEL_ORDER}
    idx = [col_for_label[label] for label in LABEL_ORDER]
    return proba[:, idx]
