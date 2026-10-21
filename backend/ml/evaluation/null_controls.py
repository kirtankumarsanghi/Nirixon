"""Null controls for the Module A pipeline.

These are the experiments that must FAIL. If the model still scores well after the
signal is destroyed, the pipeline is leaking and the headline number means nothing.

Reported in `artifacts/metrics.json -> null_controls` on every training run.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    f1_score,
)
from xgboost import XGBClassifier

LABEL_ORDER = ["Typical", "Monitor", "Refer"]


def _score(model, X, y_idx: np.ndarray) -> dict:
    proba = model.predict_proba(X)
    pred = proba.argmax(axis=1)
    return {
        "refer_auprc": round(
            float(average_precision_score(y_idx == 2, proba[:, 2])), 4
        ),
        "macro_f1": round(float(f1_score(y_idx, pred, average="macro")), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_idx, pred)), 4),
    }


def run_null_controls(
    preprocessor,
    X_train,
    y_train,
    X_test,
    y_test,
    seed: int = 42,
    n_estimators: int = 200,
) -> list[dict]:
    """Train four variants on the same split and score them on the same test set.

    Rows are directly comparable because only the training signal changes.
    """
    Xtr = preprocessor.transform(X_train) if preprocessor is not None else X_train
    Xte = preprocessor.transform(X_test) if preprocessor is not None else X_test
    if hasattr(Xtr, "toarray"):
        Xtr, Xte = Xtr.toarray(), Xte.toarray()

    ytr = np.array([LABEL_ORDER.index(v) for v in y_train])
    yte = np.array([LABEL_ORDER.index(v) for v in y_test])
    rng = np.random.default_rng(seed)

    def make_model() -> XGBClassifier:
        return XGBClassifier(
            objective="multi:softprob",
            num_class=3,
            n_estimators=n_estimators,
            max_depth=4,
            learning_rate=0.1,
            random_state=seed,
            eval_metric="mlogloss",
        )

    rows: list[dict] = []

    def fit_and_score(X_fit, y_fit, label: str, note: str) -> XGBClassifier:
        model = make_model().fit(X_fit, y_fit)
        rows.append({"control": label, **_score(model, Xte, yte), "note": note})
        return model

    # Reference: the real signal, through the same model class.
    reference = fit_and_score(
        Xtr,
        ytr,
        "signal intact (reference)",
        "same model class, real features and labels",
    )

    # (a) Labels permuted: no learnable relationship may remain.
    fit_and_score(
        Xtr,
        rng.permutation(ytr),
        "label shuffle",
        "training labels permuted; must collapse to chance",
    )

    # (b) Features replaced with noise.
    fit_and_score(
        rng.normal(size=Xtr.shape),
        ytr,
        "random features",
        "irrelevant noise replaces the inputs; must collapse",
    )

    # (c) Test-time permutation: keeps marginals, destroys the association.
    X_perm = Xte.copy()
    for j in range(X_perm.shape[1]):
        X_perm[:, j] = rng.permutation(X_perm[:, j])
    rows.append(
        {
            "control": "permuted test features",
            **_score(reference, X_perm, yte),
            "note": "associations destroyed; must collapse",
        }
    )

    # (d) No-information baseline: always the majority class.
    majority = int(np.bincount(ytr).argmax())
    majority_pred = np.full_like(yte, majority)
    rows.append(
        {
            "control": "majority class (no information)",
            "refer_auprc": round(float((yte == 2).mean()), 4),
            "macro_f1": round(float(f1_score(yte, majority_pred, average="macro")), 4),
            "balanced_accuracy": round(
                float(balanced_accuracy_score(yte, majority_pred)), 4
            ),
            "note": "chance-level AUPRC equals the Refer prevalence",
        }
    )

    return rows
