"""
Stage 2 — SHAP Explainability

Builds a SHAP TreeExplainer on the final (uncalibrated) tree-based model
and provides both global and per-prediction explanations.

IMPORTANT CORRECTION TO THE ORIGINAL PLAN: TreeExplainer with the
default "tree_path_dependent" perturbation does NOT require a k-means
background summary dataset - that's only needed for
"interventional" perturbation or for KernelExplainer (used on non-tree
models). Building an unnecessary k-means background summary would add
complexity and a slower fit for no real benefit here. If a different
model family is chosen later (e.g. if Logistic Regression wins the
comparison instead of a tree model), this module would need to switch
to shap.LinearExplainer or shap.KernelExplainer instead - it's written
specifically for tree-based models.

The explainer must be fit on the UNCALIBRATED model's underlying tree
estimator, not the CalibratedClassifierCV wrapper - SHAP's TreeExplainer
needs direct access to the tree structure, which the calibration wrapper
does not expose in a way TreeExplainer can use.
"""

from __future__ import annotations

import pickle

import numpy as np
import pandas as pd
import shap
from columns import LABEL_ORDER


def build_explainer(tree_model, feature_columns: list[str]):
    """
    tree_model: the raw, uncalibrated tree-based estimator (e.g. the
                fitted XGBClassifier or RandomForestClassifier itself -
                NOT wrapped in a sklearn Pipeline or CalibratedClassifierCV).
    """
    explainer = shap.TreeExplainer(tree_model)
    return explainer


def explain_prediction(
    explainer,
    X_row_preprocessed,
    feature_columns: list[str],
    predicted_class: str,
    real_answer_mask: pd.Series | None = None,
) -> dict:
    """
    Returns the top contributing features for a single prediction, in
    plain terms.

    IMPORTANT: `X_row_preprocessed` must already be transformed through
    the SAME preprocessor the underlying tree model was trained on
    (see artifacts/preprocessor.pkl) - the tree's split thresholds live
    in preprocessed feature space (e.g. standardized age), not raw
    feature space. Passing raw values directly produces wrong SHAP
    magnitudes with no error raised - confirmed the hard way while
    building this.

    `predicted_class` must come from the actual served model's
    prediction (e.g. the calibrated model's predict()), NOT re-derived
    from SHAP values here - SHAP explains a given class's attribution,
    it is not itself a reliable classifier. An earlier version of this
    function inferred the predicted class from SHAP magnitude sums and
    got it wrong on a real test case.

    real_answer_mask (optional): a boolean Series aligned with
    feature_columns, True where the caregiver actually answered (vs. an
    imputed value) - when provided, imputed features are excluded from
    the returned list, per the design doc's rule that explanations must
    never present an assumption as an answer. Stage 1 doesn't generate
    imputation yet, so this is a hook for Stage 3 to use.
    """
    shap_values = explainer.shap_values(X_row_preprocessed)
    shap_values = np.asarray(shap_values)

    predicted_class_idx = LABEL_ORDER.index(predicted_class)

    if shap_values.ndim == 3 and shap_values.shape[0] == len(LABEL_ORDER):
        contributions = shap_values[predicted_class_idx, 0, :]
    elif shap_values.ndim == 3:
        contributions = shap_values[0, :, predicted_class_idx]
    else:
        contributions = shap_values[0]

    contrib_series = pd.Series(contributions, index=feature_columns)

    if real_answer_mask is not None:
        contrib_series = contrib_series[
            real_answer_mask.reindex(feature_columns, fill_value=True)
        ]

    top_features = (
        contrib_series.abs().sort_values(ascending=False).head(5).index.tolist()
    )

    return {
        "predicted_class": predicted_class,
        "top_contributing_features": [
            {"feature": f, "shap_value": float(contrib_series[f])} for f in top_features
        ],
    }


def save_explainer(explainer, path: str) -> None:
    with open(path, "wb") as f:
        pickle.dump(explainer, f)


def load_explainer(path: str):
    with open(path, "rb") as f:
        return pickle.load(f)
