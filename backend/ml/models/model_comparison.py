"""
Stage 2 — Model Comparison

Compares Logistic Regression, Random Forest, and XGBoost on the same
train/validation split, each tuned with a small GridSearchCV, and
returns the winner by macro AUPRC (not accuracy - see metrics.py for
why). Grids are kept intentionally small: this is a portfolio-scale
project on a 5,000-row synthetic dataset, not a production hyperparameter
search - a huge grid would burn time for very little real benefit here.
"""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from xgboost import XGBClassifier

from columns import LABEL_ORDER, AGE_COLUMN


def _label_to_int(y):
    mapping = {label: i for i, label in enumerate(LABEL_ORDER)}
    return np.array([mapping[v] for v in y])


def _int_to_label(y_int):
    return np.array([LABEL_ORDER[i] for i in y_int])


def build_preprocessor(feature_columns: list[str]) -> ColumnTransformer:
    """
    The 36 items are already small ordinal integers (0/1/2) - fine to
    pass through as-is. corrected_age_months has a much larger, continuous
    range, so it's standardized to keep Logistic Regression's coefficients
    (and its regularization) well-behaved. Tree-based models don't need
    this, but applying it uniformly keeps one preprocessing pipeline
    shared across all three candidates, which is simpler and safer than
    maintaining three slightly different ones.
    """
    scale_cols = [AGE_COLUMN] if AGE_COLUMN in feature_columns else []
    passthrough_cols = [c for c in feature_columns if c not in scale_cols]

    return ColumnTransformer(
        transformers=[
            ("scale_age", StandardScaler(), scale_cols),
            ("passthrough", "passthrough", passthrough_cols),
        ]
    )


def run_grid_search(X_train, y_train, feature_columns: list[str], class_weight="balanced"):
    """
    Runs GridSearchCV for all three model families and returns a dict of
    {name: fitted_best_pipeline}, plus the CV scores used to pick a winner.

    y_train is passed as string labels; converted internally where a
    given estimator needs integer classes (XGBoost).
    """
    y_train_int = _label_to_int(y_train)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = "f1_macro"  # cheap proxy during search; final model selection uses AUPRC on a held-out val set

    results = {}

    # --- Logistic Regression ---
    logreg_pipe = Pipeline([
        ("preprocess", build_preprocessor(feature_columns)),
        ("clf", LogisticRegression(class_weight=class_weight, max_iter=2000, random_state=42)),
    ])
    logreg_grid = {"clf__C": [0.01, 0.1, 1.0, 10.0]}
    logreg_search = GridSearchCV(logreg_pipe, logreg_grid, scoring=scoring, cv=cv, n_jobs=-1)
    logreg_search.fit(X_train, y_train)
    results["logistic_regression"] = logreg_search

    # --- Random Forest ---
    rf_pipe = Pipeline([
        ("preprocess", build_preprocessor(feature_columns)),
        ("clf", RandomForestClassifier(class_weight=class_weight, random_state=42)),
    ])
    rf_grid = {
        "clf__n_estimators": [200, 400],
        "clf__max_depth": [6, 10, None],
    }
    rf_search = GridSearchCV(rf_pipe, rf_grid, scoring=scoring, cv=cv, n_jobs=-1)
    rf_search.fit(X_train, y_train)
    results["random_forest"] = rf_search

    # --- XGBoost ---
    # XGBoost's built-in class_weight equivalent is sample_weight; simplest
    # robust approach for a small multi-class case is scale via
    # sample_weight computed from inverse class frequency, applied at fit time.
    class_counts = np.bincount(y_train_int)
    class_weights_arr = len(y_train_int) / (len(class_counts) * class_counts)
    sample_weight = class_weights_arr[y_train_int]

    xgb_pipe = Pipeline([
        ("preprocess", build_preprocessor(feature_columns)),
        ("clf", XGBClassifier(
            objective="multi:softprob",
            num_class=len(LABEL_ORDER),
            eval_metric="mlogloss",
            random_state=42,
        )),
    ])
    xgb_grid = {
        "clf__n_estimators": [200, 400],
        "clf__max_depth": [3, 5],
        "clf__learning_rate": [0.05, 0.1],
    }
    xgb_search = GridSearchCV(xgb_pipe, xgb_grid, scoring=scoring, cv=cv, n_jobs=-1)
    xgb_search.fit(X_train, y_train_int, clf__sample_weight=sample_weight)
    results["xgboost"] = xgb_search

    return results
